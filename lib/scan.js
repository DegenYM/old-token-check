// Scanning logic, DOM-free so it can be tested under Node.
// Flow: loadRegistry -> scanChain (balances) -> analyzeFinding (status check + simulation + how-to)

import { CHAINS, rpcsFor } from '../chains.js';
import {
  RpcClient, readBalances, simulate, transfersFrom, encodeCall, parseSignature,
  isAddress, toChecksumAddress, sameAddress, hexToBigInt, strip0x, parseFraction, toHex,
  NATIVE_PSEUDO, simulateWithOverride, balanceOfData, hexToBytes, multicallRaw, decodeValue,
} from './evm.js';

/* ------------------------------------------------------------ registry */

const SAMPLE_FILE = 'registry.sample.json';

function validateEntry(e) {
  if (!e || typeof e !== 'object') return 'not an object';
  if (!e.id) return 'missing id';
  if (!CHAINS[e.chainId]) return `unknown chainId ${e.chainId}`;
  if (!e.oldToken || !isAddress(e.oldToken.address)) return 'invalid oldToken.address';
  if (!Number.isInteger(e.oldToken.decimals)) return 'invalid oldToken.decimals';
  if (e.newToken && (!isAddress(e.newToken.address) || !Number.isInteger(e.newToken.decimals))) return 'invalid newToken';
  if (!isAddress(e.migrator)) return 'invalid migrator';
  if (!Array.isArray(e.steps) || !e.steps.length) return 'missing steps';
  if (!e.ratio || e.ratio.num == null || e.ratio.den == null) return 'missing ratio';
  if (e.holding) {
    const h = e.holding;
    if (Array.isArray(h.reads)) { if (!h.reads.length) return 'holding.reads is empty'; }
    else if (!isAddress(h.contract) || !h.signature) return 'holding needs contract + signature, or reads';
    if (h.unit && h.unit !== 'old' && h.unit !== 'new') return 'holding.unit must be "old" or "new"';
    if (h.unit === 'new' && !e.newToken) return 'holding.unit "new" needs a newToken';
  }
  return null;
}

function normalizeEntry(e) {
  const cs = (a) => (isAddress(a) ? toChecksumAddress(a) : a);
  return {
    ...e,
    oldToken: { ...e.oldToken, address: cs(e.oldToken.address) },
    newToken: e.newToken ? { ...e.newToken, address: cs(e.newToken.address) } : null,
    migrator: cs(e.migrator),
    steps: e.steps.map((s) => ({ ...s, spender: s.spender && cs(s.spender), to: s.to && cs(s.to) })),
    holding: e.holding ? { ...e.holding, contract: e.holding.contract ? cs(e.holding.contract) : undefined } : null,
  };
}

/**
 * Load all registry files listed in data/index.json. Missing / broken files are tolerated.
 * If nothing loads, falls back to data/registry.sample.json (flagged usedSample).
 */
export async function loadRegistry(baseUrl = 'data/', fetchFn = fetch) {
  const files = [];
  let list = [];
  try {
    const res = await fetchFn(baseUrl + 'index.json', { cache: 'no-cache' });
    if (res.ok) {
      const idx = await res.json();
      list = Array.isArray(idx) ? idx : Array.isArray(idx.files) ? idx.files : [];
    }
  } catch { /* no index */ }

  const entries = [];
  const skipped = [];
  const seen = new Set();
  const addFrom = (file, arr) => {
    let n = 0;
    for (const raw of arr) {
      const err = validateEntry(raw);
      if (err) { skipped.push({ file, id: raw && raw.id, reason: err }); continue; }
      const e = normalizeEntry(raw);
      // de-duplicate by id and by (chain, old token, migrator)
      const where = !e.holding ? 'wallet'
        : e.holding.reads ? JSON.stringify(e.holding.reads).toLowerCase()
          : `${e.holding.contract.toLowerCase()}:${e.holding.signature}`;
      const key2 = `${e.chainId}:${e.oldToken.address.toLowerCase()}:${e.migrator.toLowerCase()}:${where}`;
      if (seen.has(e.id) || seen.has(key2)) { skipped.push({ file, id: e.id, reason: 'duplicate entry' }); continue; }
      seen.add(e.id); seen.add(key2);
      entries.push({ ...e, _file: file });
      n++;
    }
    return n;
  };

  const loadFile = async (file) => {
    try {
      const res = await fetchFn(baseUrl + file, { cache: 'no-cache' });
      if (!res.ok) return { file, ok: false, error: `HTTP ${res.status}` };
      const json = await res.json();
      const arr = Array.isArray(json) ? json : Array.isArray(json.entries) ? json.entries : null;
      if (!arr) return { file, ok: false, error: 'file is not a JSON array' };
      return { file, ok: true, arr };
    } catch (e) {
      return { file, ok: false, error: e.message };
    }
  };

  const loaded = await Promise.all(list.map(loadFile));
  for (const r of loaded) {
    if (r.ok) files.push({ file: r.file, ok: true, count: addFrom(r.file, r.arr) });
    else files.push({ file: r.file, ok: false, error: r.error });
  }

  let usedSample = false;
  if (!entries.length) {
    const r = await loadFile(SAMPLE_FILE);
    if (r.ok) {
      files.push({ file: SAMPLE_FILE, ok: true, count: addFrom(SAMPLE_FILE, r.arr) });
      usedSample = true;
    }
  }
  return { entries, files, skipped, usedSample };
}

/* ---------------------------------------------------------- amounts */

/** newRaw = oldRaw * num/den * 10^newDec / 10^oldDec (ratio in whole-token terms).
 *  A holding measured in new-token units (`holding.unit: "new"`) is already the output. */
export function expectedOut(entry, oldRaw) {
  if (entry.holding && entry.holding.unit === 'new') return oldRaw;
  const num = parseFraction(entry.ratio.num);
  const den = parseFraction(entry.ratio.den);
  const newDec = entry.newToken ? entry.newToken.decimals : 18;
  const n = oldRaw * num.n * den.d * 10n ** BigInt(newDec);
  const d = num.d * den.n * 10n ** BigInt(entry.oldToken.decimals);
  return d === 0n ? 0n : n / d;
}

export const outSymbol = (entry) => (entry.newToken ? entry.newToken.symbol : CHAINS[entry.chainId].native);
export const outDecimals = (entry) => (entry.newToken ? entry.newToken.decimals : 18);
/** The token a finding's balance is measured in (the old token, unless the holding says otherwise) */
export const heldToken = (entry) => (entry.holding && entry.holding.unit === 'new' ? entry.newToken : entry.oldToken);

/** "locked in veNFT #$tokenId" -> "locked in veNFT #1234" */
export function holdingLabel(entry, vars = {}) {
  const label = (entry.holding && entry.holding.label) || '';
  return label.replace(/\$([A-Za-z_]\w*)/g, (m, k) => (vars[k] != null && !Array.isArray(vars[k]) ? String(vars[k]) : m));
}

/* ------------------------------------------------------------ holdings */
//
// A holding describes where a position lives when it isn't a plain wallet balance. The simple
// form is one view call keyed by the user ({contract, signature}). The general form is a small
// read program (`holding.reads`) run for every user, batched through Multicall3 stage by stage:
//
//   { "call": "0x…" | "$var", "signature": "fn(types)", "args": ["$user", 3, "$proxy"],
//     "out": "amount" | { "amount": "int256@0", "unlock": 1 } }        view call -> variables
//   { "each": "index", "range": "$n" | 5 }                              one row per i < n
//   { "each": "delegate", "in": ["0x…", …] | "$ids" }                  one row per item
//   { "require": "$owner", "is": "$user" | "nonzero" | "zero" | value } drop rows that don't match
//   { "set": "total", "sum": ["$wallet", "$amount"] }                   arithmetic (sum | min | max | value)
//   { "collect": { "ids": "$index" }, "sum": ["amount"] }              merge the rows of the last "each"
//
// A reverted call drops the row (no position there). The program must end with `$amount`
// (raw units of the held token). Optional `$unlock` (unix seconds) marks a lock end date.
// Every variable is available to the steps as a placeholder.

const MAX_ROWS = 100; // fan-out cap per user and entry

export function holdingProgram(h) {
  if (Array.isArray(h.reads)) return h.reads;
  return [{ call: h.contract, signature: h.signature, args: ['$user'], out: 'amount' }];
}

function outSpec(out) {
  if (typeof out === 'string') return [{ name: out, word: 0, type: 'uint256' }];
  return Object.entries(out || {}).map(([name, v]) => {
    if (typeof v === 'number') return { name, word: v, type: 'uint256' };
    if (typeof v === 'string') { const [type, w] = v.split('@'); return { name, type: type || 'uint256', word: w ? Number(w) : 0 }; }
    return { name, word: v.word || 0, type: v.type || 'uint256' };
  });
}

/** "$x" -> vars.x (throws if unset); arrays resolve item by item; anything else is a literal */
export function resolveVar(v, vars) {
  if (Array.isArray(v)) return v.map((x) => resolveVar(x, vars));
  if (typeof v === 'string' && v.startsWith('$')) {
    const k = v.slice(1);
    if (vars[k] === undefined) throw new Error(`unknown placeholder ${v}`);
    return vars[k];
  }
  return v;
}

export const truthy = (v) => (typeof v === 'bigint' ? v !== 0n
  : typeof v === 'boolean' ? v
    : Array.isArray(v) ? v.length > 0
      : isAddress(v) ? !/^0x0{40}$/i.test(v)
        : v != null && v !== '' && v !== 0 && v !== '0');

function sameValue(a, b) {
  if (isAddress(a) || isAddress(b)) return sameAddress(String(a), String(b));
  try { return BigInt(a) === BigInt(b); } catch { return String(a) === String(b); }
}

const big = (v) => (typeof v === 'bigint' ? v : BigInt(v));

/** Apply one synchronous op to a row; returns the rows that continue. */
function applySync(row, op, nextGroup) {
  const vars = row.vars;
  if (op.each) {
    let items;
    if (op.range != null) {
      const n = Number(big(resolveVar(op.range, vars)));
      items = Array.from({ length: Math.max(0, Math.min(n, MAX_ROWS)) }, (_, i) => BigInt(i));
    } else {
      items = resolveVar(op.in, vars);
      if (!Array.isArray(items)) throw new Error(`each.in is not a list`);
      if (typeof op.in === 'string') items = items.slice(0, MAX_ROWS); // registry lists are bounded by the registry itself
    }
    const group = nextGroup();
    return items.map((it) => ({
      ...row, pc: row.pc + 1, vars: { ...vars, [op.each]: it }, keyParts: [...row.keyParts, String(it)],
      group, groups: [...row.groups, row.group],
    }));
  }
  if (op.require) {
    const v = resolveVar(op.require, vars);
    const want = op.is;
    const pass = want === 'nonzero' ? truthy(v) : want === 'zero' ? !truthy(v) : sameValue(v, resolveVar(want, vars));
    return pass ? [{ ...row, pc: row.pc + 1 }] : [];
  }
  if (op.set) {
    let v;
    if (op.sum) v = op.sum.map((x) => big(resolveVar(x, vars))).reduce((a, b) => a + b, 0n);
    else if (op.min) v = op.min.map((x) => big(resolveVar(x, vars))).reduce((a, b) => (b < a ? b : a));
    else if (op.max) v = op.max.map((x) => big(resolveVar(x, vars))).reduce((a, b) => (b > a ? b : a));
    else v = resolveVar(op.value, vars);
    return [{ ...row, pc: row.pc + 1, vars: { ...vars, [op.set]: v } }];
  }
  throw new Error(`unknown holding op: ${JSON.stringify(op)}`);
}

/** Merge the rows produced by the last "each" back into one row per parent. */
function applyCollect(rows) {
  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  const out = [];
  for (const list of byGroup.values()) {
    const first = list[0];
    const op = first.prog[first.pc];
    const vars = { ...first.vars };
    for (const [name, src] of Object.entries(op.collect || {})) vars[name] = list.map((r) => resolveVar(src, r.vars));
    for (const name of op.sum || []) vars[name] = list.reduce((a, r) => a + big(r.vars[name]), 0n);
    out.push({
      ...first, pc: first.pc + 1, vars,
      keyParts: first.keyParts.slice(0, -1), group: first.groups[first.groups.length - 1], groups: first.groups.slice(0, -1),
    });
  }
  return out;
}

/**
 * Run every row's read program. rows: [{ user, entry }]. Returns { done: [{user, entry, vars, key}], unknown }
 * where `unknown` counts rows whose reads failed at the RPC level (not reverts).
 */
export async function runHoldings(client, rows, { block = 'latest', multicall } = {}) {
  let gid = 0;
  const nextGroup = () => ++gid;
  let active = rows.map((r) => ({
    user: r.user, entry: r.entry, prog: holdingProgram(r.entry.holding), pc: 0, keyParts: [], group: 0, groups: [],
    vars: {
      user: toChecksumAddress(r.user), oldToken: r.entry.oldToken.address, migrator: r.entry.migrator,
      newToken: r.entry.newToken ? r.entry.newToken.address : undefined,
    },
  }));
  const done = [];
  const unknownRows = new Set();
  for (let round = 0; active.length && round < 24; round++) {
    // 1) advance every row through its synchronous ops until it needs a view call
    const atCall = [];
    let queue = active;
    let parked = []; // rows waiting at a "collect"
    while (queue.length || parked.length) {
      const next = [];
      for (const row of queue) {
        if (row.pc >= row.prog.length) { done.push(row); continue; }
        const op = row.prog[row.pc];
        if (op.call) atCall.push(row);
        else if (op.collect) parked.push(row);
        else {
          try { next.push(...applySync(row, op, nextGroup)); } catch { /* malformed data for this row: skip it */ }
        }
      }
      if (next.length) { queue = next; continue; }
      // Rows of one group run the same ops in lockstep, so once nothing else moves every
      // surviving sibling has reached the collect
      queue = parked.length ? applyCollect(parked) : [];
      parked = [];
    }
    if (!atCall.length) break;
    // 2) one batched round of view calls
    const calls = [];
    for (const row of atCall) {
      const op = row.prog[row.pc];
      try {
        const to = resolveVar(op.call, row.vars);
        if (!isAddress(String(to)) || /^0x0{40}$/i.test(to)) continue;
        const args = (op.args || []).map((a) => resolveVar(a, row.vars)).map((a) => (typeof a === 'bigint' ? a.toString() : a));
        calls.push({ row, target: String(to), callData: encodeCall(op.signature, args) });
      } catch { /* unresolvable row: skip */ }
    }
    let res;
    try { res = await multicallRaw(client, calls, { block, multicall }); }
    catch {
      for (const c of calls) unknownRows.add(`${c.row.user}:${c.row.entry.id}`);
      active = [];
      continue;
    }
    active = [];
    calls.forEach((c, i) => {
      const r = res[i];
      if (!r || !r.success) return; // reverted: nothing at this position
      const row = c.row;
      const vars = { ...row.vars };
      try {
        for (const o of outSpec(row.prog[row.pc].out)) vars[o.name] = decodeValue(r.returnData, o.word, o.type);
      } catch { return; } // no code or short return data
      active.push({ ...row, pc: row.pc + 1, vars });
    });
  }
  return {
    done: done.map((r) => ({ user: r.user, entry: r.entry, vars: r.vars, key: r.keyParts.join('-') })),
    unknown: unknownRows.size,
  };
}

/* ------------------------------------------------------- step builder */

/**
 * Turn registry steps into concrete transactions + human instructions for one user/amount.
 * Each step: { kind, to, fnName, signature, fields: [{label, type, value}], data, value, note }
 * `value` in fields is always the exact string to paste. `vars` are the holding's read results
 * (placeholders such as $proxy, $ids, $tokenId). A step with `"if": "$x"` / `"if": "!$x"` is
 * only included when that variable is (not) set/non-zero.
 */
export function buildSteps(entry, user, amount, vars = {}) {
  const ctx = {
    ...vars,
    amount, user: toChecksumAddress(user), migrator: entry.migrator, oldToken: entry.oldToken.address,
    newToken: entry.newToken ? entry.newToken.address : undefined,
  };
  const show = (v) => (Array.isArray(v) ? `[${v.map(show).join(',')}]` : typeof v === 'bigint' ? v.toString() : String(v));
  const resolve = (v) => {
    const r = resolveVar(v, ctx);
    return typeof r === 'bigint' ? r.toString() : Array.isArray(r) ? r.map((x) => (typeof x === 'bigint' ? x.toString() : x)) : r;
  };
  const tokenAddr = (which) => (which === 'new' ? entry.newToken && entry.newToken.address : which === 'old' || !which ? entry.oldToken.address : resolve(which));
  const held = heldToken(entry);
  // placeholders that are token amounts, and the token they are measured in
  // (holding.amountVars adds more: { "$shares": { "symbol": "dQUICK", "decimals": 18 } } or "old" / "new")
  const unitOf = (t) => (t === 'new' ? entry.newToken : t === 'old' ? entry.oldToken : t);
  const amountVars = { $amount: held, $total: entry.oldToken, ...(entry.holding && entry.holding.amountVars ? Object.fromEntries(Object.entries(entry.holding.amountVars).map(([k, t]) => [k, unitOf(t)])) : {}) };
  const include = (s) => {
    if (!s.if) return true;
    const neg = s.if.startsWith('!');
    const v = ctx[s.if.replace(/^!?\$/, '')];
    return neg ? !truthy(v) : truthy(v);
  };

  return entry.steps.filter(include).map((s, i) => {
    if (s.type === 'approve') {
      const to = toChecksumAddress(tokenAddr(s.token));
      const spender = toChecksumAddress(resolve(s.spender || '$migrator'));
      const amtSrc = s.amount ?? '$amount';
      const amt = String(resolve(amtSrc));
      const tokenMeta = s.tokenMeta || (sameAddress(to, entry.oldToken.address) ? entry.oldToken : entry.newToken);
      return {
        index: i, kind: 'approve', to, toLabel: `${tokenMeta ? tokenMeta.symbol : ''} token`,
        fnName: 'approve', signature: 'approve(address,uint256)',
        fields: [
          { label: 'spender', type: 'address', value: spender, hint: 'The contract you are approving (the official migrator)' },
          { label: 'amount', type: 'uint256', value: amt, hint: 'in raw units', raw: true, decimals: tokenMeta && tokenMeta.decimals, symbol: tokenMeta && tokenMeta.symbol },
        ],
        spenderIsMigrator: sameAddress(spender, entry.migrator),
        data: encodeCall('approve(address,uint256)', [spender, amt]),
        value: null,
        waitSeconds: s.waitSeconds || 0,
        contractLabel: s.contractLabel || null,
        title: s.title || null,
        tokenSymbol: tokenMeta ? tokenMeta.symbol : null,
      };
    }
    if (s.type === 'call') {
      const to = toChecksumAddress(resolve(s.to || '$migrator'));
      const sig = parseSignature(s.signature);
      const args = (s.args || []).map(resolve);
      const names = s.argNames || sig.names;
      const fields = sig.types.map((t, k) => {
        const src = s.args && s.args[k];
        const unit = typeof src === 'string' ? amountVars[src] : null;
        return {
          label: (names && names[k]) || `arg ${k + 1}`,
          type: t,
          value: t === 'address' && isAddress(String(args[k])) ? toChecksumAddress(String(args[k])) : show(args[k]),
          raw: !!unit, decimals: unit ? unit.decimals : undefined, symbol: unit ? unit.symbol : undefined,
          hint: unit ? 'in raw units' : src === '$user' ? 'Your own address' : t.endsWith('[]') ? 'A list: paste it exactly as shown, brackets included' : '',
        };
      });
      const value = s.value != null ? String(resolve(s.value)) : null;
      return {
        index: i, kind: 'call', to, toLabel: sameAddress(to, entry.migrator) ? 'migrator' : 'contract',
        fnName: sig.name, signature: sig.canonical, fields,
        data: encodeCall(sig.canonical, args),
        value,
        waitSeconds: s.waitSeconds || 0,
        contractLabel: s.contractLabel || null,
        title: s.title || null,
      };
    }
    throw new Error(`unsupported step type: ${s.type}`);
  });
}

/* ------------------------------------------------------------- scanning */

export function makeClient(chainId) {
  const c = CHAINS[chainId];
  return new RpcClient(rpcsFor(chainId), { batchSize: c.batchSize || 3 });
}

/**
 * Scan one chain for non-zero balances of every registry old token, for every user.
 * Returns { chainId, ok, error?, block, via, findings: [{user, entry, balance}], unknown: n }
 */
export async function scanChain(chainId, entries, users, client = makeClient(chainId)) {
  const chain = CHAINS[chainId];
  try {
    const block = hexToBigInt(await client.request('eth_blockNumber'));
    const blockHex = toHex(block);
    const wallet = entries.filter((e) => !e.holding);
    const held = entries.filter((e) => e.holding);
    const pairs = [];
    for (const user of users) for (const entry of wallet) pairs.push({ token: entry.oldToken.address, holder: user, user, entry });
    const rows = [];
    for (const user of users) for (const entry of held) rows.push({ user, entry });

    const [walletRes, heldRes] = await Promise.all([
      pairs.length ? readBalances(client, pairs, { block: blockHex, multicall: chain.multicall }) : { balances: [], via: null },
      rows.length ? runHoldings(client, rows, { block: blockHex, multicall: chain.multicall }) : { done: [], unknown: 0 },
    ]);
    const findings = [];
    let unknown = heldRes.unknown;
    // Ignore dust below one millionth of a token: it would only produce "Ready: 0.00" cards
    // (or below the entry's own minimum, e.g. a converter that floors small amounts to zero)
    const notDust = (b, entry) => b > 0n && b >= 10n ** BigInt(Math.max(0, heldToken(entry).decimals - 6)) && (!entry.minAmount || b >= BigInt(entry.minAmount));
    walletRes.balances.forEach((b, i) => {
      if (b === null) unknown++;
      else if (notDust(b, pairs[i].entry)) findings.push({ user: pairs[i].user, entry: pairs[i].entry, balance: b });
    });
    for (const r of heldRes.done) {
      const b = r.vars.amount;
      if (typeof b === 'bigint' && notDust(b, r.entry)) findings.push({ user: r.user, entry: r.entry, balance: b, vars: r.vars, rowKey: r.key });
    }
    return { chainId, ok: true, block: Number(block), blockHex, via: walletRes.via || 'multicall', findings, unknown, client };
  } catch (e) {
    return { chainId, ok: false, error: e.message, findings: [], client };
  }
}

/** Timestamp of the scanned block (cached on the scan) */
function scanTime(scan) {
  if (!scan._time) {
    scan._time = scan.client.request('eth_getBlockByNumber', [scan.blockHex, false])
      .then((b) => Number(hexToBigInt(b.timestamp)))
      .catch(() => Math.floor(Date.now() / 1000));
  }
  return scan._time;
}

const EIP1967_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EIP1967_BEACON = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50';
const OZ_LEGACY_IMPL = '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

/** true if the address stores a proxy implementation/beacon in a well-known slot */
export async function isProxy(client, address, block = 'latest') {
  const res = await client.batch([EIP1967_IMPL, EIP1967_BEACON, OZ_LEGACY_IMPL].map((slot) => ({ method: 'eth_getStorageAt', params: [address, slot, block] })));
  return res.some((r) => r.result && hexToBigInt(r.result) !== 0n);
}

async function runStatusCheck(client, entry, user, blockHex) {
  const sc = entry.statusCheck;
  if (!sc) return null;
  try {
    const args = (sc.args || []).map((a) => (a === '$user' ? user : a));
    const data = encodeCall(sc.signature, args);
    const ret = await client.request('eth_call', [{ to: sc.to || entry.migrator, data }, blockHex]);
    const exp = sc.expect;
    const pass = exp == null ? true : /^0x[0-9a-f]*$/i.test(exp) && strip0x(ret).length ? hexToBigInt(ret) === hexToBigInt(exp) : String(ret).toLowerCase() === String(exp).toLowerCase();
    return { ok: true, pass, returned: ret, expect: exp, signature: sc.signature };
  } catch (e) {
    return { ok: false, pass: false, error: e.message, signature: sc.signature };
  }
}

/** true if a and b agree within 1 ppm (+1 wei) — covers ratio rounding */
export function amountsMatch(a, b) {
  if (a == null || b == null) return false;
  const diff = a > b ? a - b : b - a;
  const big = a > b ? a : b;
  return diff <= 1n + big / 1000000n;
}

function decodeStringOrBytes32(hex) {
  const d = strip0x(hex || '');
  if (!d) return null;
  try {
    if (d.length >= 128 && hexToBigInt(d.slice(0, 64)) === 32n) {
      const len = Number(hexToBigInt(d.slice(64, 128)));
      return new TextDecoder().decode(hexToBytes(d.slice(128, 128 + len * 2)));
    }
    return new TextDecoder().decode(hexToBytes(d.slice(0, 64))).replace(/\0+$/, '') || null;
  } catch { return null; }
}

/** { [lowercaseAddr]: {symbol, decimals} } for tokens not described by the registry */
export async function readTokenMeta(client, addrs, block = 'latest') {
  const out = {};
  if (!addrs.length) return out;
  const reqs = [];
  for (const a of addrs) {
    reqs.push({ method: 'eth_call', params: [{ to: a, data: '0x95d89b41' }, block] }); // symbol()
    reqs.push({ method: 'eth_call', params: [{ to: a, data: '0x313ce567' }, block] }); // decimals()
  }
  const res = await client.batch(reqs);
  addrs.forEach((a, i) => {
    const sym = res[2 * i].result ? decodeStringOrBytes32(res[2 * i].result) : null;
    const dec = res[2 * i + 1].result && strip0x(res[2 * i + 1].result) ? Number(hexToBigInt(res[2 * i + 1].result)) : null;
    out[a.toLowerCase()] = { symbol: sym || short(a), decimals: dec != null && dec <= 36 ? dec : 18 };
  });
  return out;
}
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Status codes for a finding:
 *  ready          simulation succeeded and the user received the new asset
 *  locked         same, but simulated at the lock's end date (the position unlocks later)
 *                 (state-override path additionally requires the delta to match the expected output)
 *  sim-failed     simulation ran and a step reverted
 *  sim-no-output  simulation succeeded but no new tokens arrived
 *  sim-mismatch   state-override simulation succeeded but the balance delta != expected
 *  sim-unavailable neither eth_simulateV1 nor eth_call stateOverride worked
 *  reserve-low    payoutReserve holds less than the expected output (first come, first served)
 *  check-failed   statusCheck says not open (or couldn't be read)
 *  build-error    registry steps couldn't be encoded
 */
export async function analyzeFinding(finding, scan) {
  const { entry, user, balance } = finding;
  const client = scan.client;
  const out = { ...finding, expected: null, steps: null, statusCheck: null, sim: null, status: 'pending', proxies: {}, receivedAll: [], method: null };
  try { out.expected = expectedOut(entry, balance); } catch (e) { out.expectedError = e.message; }
  try {
    out.steps = buildSteps(entry, user, balance, finding.vars);
  } catch (e) {
    out.status = 'build-error';
    out.error = e.message;
    return out;
  }

  // Proxy detection per unique target -> decides Etherscan "Write as Proxy" tab
  const targets = [...new Set(out.steps.map((s) => s.to))];
  const reserveP = (async () => {
    const pr = entry.payoutReserve;
    if (!pr || !isAddress(pr.holder) || !entry.newToken) return null;
    try {
      const ret = await client.request('eth_call', [{ to: entry.newToken.address, data: balanceOfData(pr.holder) }, scan.blockHex]);
      return { holder: toChecksumAddress(pr.holder), amount: hexToBigInt(strip0x(ret).slice(0, 64)) };
    } catch (e) {
      return { holder: toChecksumAddress(pr.holder), amount: null, error: e.message };
    }
  })();
  await Promise.all(targets.map(async (t) => {
    try { out.proxies[t] = await isProxy(client, t, scan.blockHex); } catch { out.proxies[t] = null; }
  }));

  out.statusCheck = await runStatusCheck(client, entry, user, scan.blockHex);
  out.reserve = await reserveP;
  out.reserveLow = !!(out.reserve && out.reserve.amount != null && out.expected != null && out.expected > out.reserve.amount);

  const calls = out.steps.map((s) => {
    const c = { from: user, to: s.to, data: s.data };
    if (s.value) c.value = toHex(BigInt(s.value));
    if (s.waitSeconds) c._wait = s.waitSeconds;
    return c;
  });
  // A lock that ends in the future: simulate the exit just after it ends, so the card can say
  // "unlocks on <date>" and still prove the path works then
  const unlock = finding.vars && finding.vars.unlock != null ? Number(finding.vars.unlock) : null;
  const now = unlock ? await scanTime(scan) : null;
  const startTime = unlock && unlock > now ? unlock + 60 : null;
  if (startTime) out.lockedUntil = unlock;
  const needsTime = calls.some((c) => c._wait) || !!startTime;

  // 1) eth_simulateV1 with traceTransfers
  let sim = await simulate(client, calls, scan.blockHex, { startTime });
  if (!sim.ok && sim.supported && !sim.calls.length) sim = await simulate(client, calls, 'latest', { startTime }); // pruned-state retry
  const u = user.toLowerCase();
  const oldAddr = entry.oldToken.address.toLowerCase();
  const outToken = (entry.newToken ? entry.newToken.address : NATIVE_PSEUDO).toLowerCase();

  if (sim.supported && sim.calls.length) {
    out.method = 'simulateV1';
    out.sim = sim;
    out.simBlock = sim.simulatedBlock != null ? sim.simulatedBlock - 1 : scan.block; // base state block
    if (sim.ok) {
      const transfers = transfersFrom(sim.result);
      // every asset that arrived at the user, aggregated per token (old-token refunds excluded)
      // Net change per token, so intermediate hops (e.g. old MKR -> MKR -> SKY) don't show as received
      // Tokens the user approves in a later step are spent inside the flow (some are burned without a
      // Transfer event), so they're intermediates, not something the user ends up with
      const spentTokens = new Set(out.steps.filter((s) => s.kind === 'approve').map((s) => s.to.toLowerCase()));
      const net = new Map();
      for (const t of transfers) {
        if (t.token === oldAddr || t.to === t.from || spentTokens.has(t.token)) continue;
        if (t.to === u) net.set(t.token, (net.get(t.token) || 0n) + t.value);
        if (t.from === u) net.set(t.token, (net.get(t.token) || 0n) - t.value);
      }
      const byToken = new Map([...net].filter(([, v]) => v > 0n));
      // Flows like KWENTA's lockAndConvert() also convert what's already in the wallet. That part
      // has its own wallet card, so this card only counts its own position.
      const sweep = entry.holding && entry.holding.sweepsWallet;
      if (sweep && byToken.has(outToken)) {
        let extra = 0n;
        try { extra = expectedOut(entry, big(resolveVar(sweep, finding.vars || {}))); } catch { extra = 0n; }
        const got = byToken.get(outToken);
        if (extra > 0n && got > extra) { byToken.set(outToken, got - extra); out.sweptExtra = extra; }
      }
      out.received = byToken.get(outToken) || 0n;
      out.spent = transfers.filter((t) => t.token === oldAddr && t.from === u).reduce((a, t) => a + t.value, 0n);
      const known = {};
      known[oldAddr] = entry.oldToken;
      if (entry.newToken) known[entry.newToken.address.toLowerCase()] = entry.newToken;
      known[NATIVE_PSEUDO] = { symbol: CHAINS[entry.chainId].native, decimals: 18 };
      const unknown = [...byToken.keys()].filter((a) => !known[a]);
      let meta = {};
      try { meta = await readTokenMeta(client, unknown, scan.blockHex); } catch { /* fall back to address */ }
      out.receivedAll = [...byToken].map(([token, amount]) => {
        const m = known[token] || meta[token] || { symbol: short(token), decimals: 18 };
        return { token: token === NATIVE_PSEUDO ? null : toChecksumAddress(token), symbol: m.symbol, decimals: m.decimals, amount, primary: token === outToken };
      }).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
      delete sim.result; // large; not needed after parsing
    }
  } else if (entry.newToken && !needsTime) {
    // 2) Fallback: eth_call + stateOverride runner at the user's address, balance delta
    const ov = await simulateWithOverride(client, user, calls.map((c) => ({ to: c.to, data: c.data, value: c.value })), [entry.newToken.address, entry.oldToken.address], scan.blockHex);
    out.method = 'override';
    out.sim = {
      supported: ov.supported,
      ok: ov.ok,
      error: ov.error || (sim.error && !ov.supported ? sim.error : null),
      v1Error: sim.error,
      calls: ov.ok ? calls.map(() => ({ ok: true })) : ov.failedStep != null && ov.failedStep >= 0
        ? calls.map((_, i) => (i < ov.failedStep ? { ok: true } : i === ov.failedStep ? { ok: false, error: ov.error } : { ok: false, error: 'not run' }))
        : [],
    };
    out.simBlock = scan.block;
    if (ov.ok) {
      out.received = ov.after[0] > ov.before[0] ? ov.after[0] - ov.before[0] : 0n;
      out.spent = ov.before[1] > ov.after[1] ? ov.before[1] - ov.after[1] : 0n;
      out.receivedAll = out.received ? [{ token: entry.newToken.address, symbol: entry.newToken.symbol, decimals: entry.newToken.decimals, amount: out.received, primary: true }] : [];
    }
  } else {
    out.method = null;
    out.sim = { supported: false, ok: false, error: sim.error || 'Simulation is not available on this chain', calls: [] };
  }

  const s2 = out.sim;
  if (out.statusCheck && !out.statusCheck.pass) out.status = 'check-failed';
  else if (!s2.supported || (!s2.ok && !s2.calls.length)) out.status = 'sim-unavailable';
  else if (out.reserveLow) out.status = 'reserve-low';
  else if (!s2.ok) out.status = 'sim-failed';
  else if (!out.received) out.status = 'sim-no-output';
  else if (out.method === 'override' && !amountsMatch(out.received, out.expected)) out.status = 'sim-mismatch';
  else out.status = out.lockedUntil ? 'locked' : 'ready';
  return out;
}
