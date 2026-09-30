// Scanning logic, DOM-free so it can be tested under Node.
// Flow: loadRegistry -> scanChain (balances) -> analyzeFinding (status check + simulation + how-to)

import { CHAINS, rpcsFor } from '../chains.js';
import {
  RpcClient, readBalances, simulate, transfersFrom, encodeCall, parseSignature,
  isAddress, toChecksumAddress, sameAddress, hexToBigInt, strip0x, parseFraction, toHex,
  NATIVE_PSEUDO, simulateWithOverride, balanceOfData, hexToBytes,
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
    holding: e.holding ? { ...e.holding, contract: cs(e.holding.contract) } : null,
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
      const where = e.holding ? `${e.holding.contract.toLowerCase()}:${e.holding.signature}` : 'wallet';
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

/** newRaw = oldRaw * num/den * 10^newDec / 10^oldDec (ratio in whole-token terms) */
export function expectedOut(entry, oldRaw) {
  const num = parseFraction(entry.ratio.num);
  const den = parseFraction(entry.ratio.den);
  const newDec = entry.newToken ? entry.newToken.decimals : 18;
  const n = oldRaw * num.n * den.d * 10n ** BigInt(newDec);
  const d = num.d * den.n * 10n ** BigInt(entry.oldToken.decimals);
  return d === 0n ? 0n : n / d;
}

export const outSymbol = (entry) => (entry.newToken ? entry.newToken.symbol : CHAINS[entry.chainId].native);
export const outDecimals = (entry) => (entry.newToken ? entry.newToken.decimals : 18);

/* ------------------------------------------------------- step builder */

/**
 * Turn registry steps into concrete transactions + human instructions for one user/amount.
 * Each step: { kind, to, fnName, signature, fields: [{label, type, value}], data, value, note }
 * `value` in fields is always the exact string to paste.
 */
export function buildSteps(entry, user, amount) {
  const ctx = {
    $amount: amount.toString(),
    $user: toChecksumAddress(user),
    $migrator: entry.migrator,
    $oldToken: entry.oldToken.address,
    $newToken: entry.newToken ? entry.newToken.address : null,
  };
  const resolve = (v) => (typeof v === 'string' && v.startsWith('$') ? ctx[v] ?? (() => { throw new Error(`unknown argument placeholder ${v}`); })() : v);
  const tokenAddr = (which) => (which === 'new' ? entry.newToken && entry.newToken.address : which === 'old' || !which ? entry.oldToken.address : which);

  return entry.steps.map((s, i) => {
    if (s.type === 'approve') {
      const to = toChecksumAddress(tokenAddr(s.token));
      const spender = toChecksumAddress(resolve(s.spender || '$migrator'));
      const amt = String(resolve(s.amount ?? '$amount'));
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
        const isAmt = s.args && s.args[k] === '$amount';
        return {
          label: (names && names[k]) || `arg ${k + 1}`,
          type: t,
          value: String(t === 'address' && isAddress(String(args[k])) ? toChecksumAddress(String(args[k])) : args[k]),
          raw: isAmt, decimals: isAmt ? entry.oldToken.decimals : undefined, symbol: isAmt ? entry.oldToken.symbol : undefined,
          hint: isAmt ? 'in raw units' : s.args && s.args[k] === '$user' ? 'Your own address' : '',
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
    const pairs = [];
    for (const user of users) for (const entry of entries) {
      pairs.push(entry.holding
        ? { token: entry.holding.contract, data: encodeCall(entry.holding.signature, [user]), holder: user, user, entry }
        : { token: entry.oldToken.address, holder: user, user, entry });
    }
    const { balances, via } = await readBalances(client, pairs, { block: blockHex, multicall: chain.multicall });
    const findings = [];
    let unknown = 0;
    balances.forEach((b, i) => {
      if (b === null) unknown++;
      else if (b > 0n) findings.push({ user: pairs[i].user, entry: pairs[i].entry, balance: b });
    });
    return { chainId, ok: true, block: Number(block), blockHex, via, findings, unknown, client };
  } catch (e) {
    return { chainId, ok: false, error: e.message, findings: [], client };
  }
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
    out.steps = buildSteps(entry, user, balance);
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
  const needsTime = calls.some((c) => c._wait);

  // 1) eth_simulateV1 with traceTransfers
  let sim = await simulate(client, calls, scan.blockHex);
  if (!sim.ok && sim.supported && !sim.calls.length) sim = await simulate(client, calls, 'latest'); // pruned-state retry
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
  else out.status = 'ready';
  return out;
}
