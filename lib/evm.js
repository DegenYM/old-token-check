// Small, dependency-free EVM helpers: hex, addresses, ABI encoding for simple
// signatures, a fail-over JSON-RPC client, Multicall3 and eth_simulateV1.
// Read-only by construction: the client only ever issues eth_* read methods.

import { keccak256, keccak256Bytes } from './keccak.js';

/* ------------------------------------------------------------------ hex */

export const strip0x = (h) => (h.startsWith('0x') || h.startsWith('0X') ? h.slice(2) : h);
export const pad32 = (hexNo0x) => hexNo0x.padStart(64, '0');
export const toHex = (n) => '0x' + BigInt(n).toString(16);

export function hexToBigInt(h) {
  if (h == null) return 0n;
  const s = strip0x(String(h));
  return s === '' ? 0n : BigInt('0x' + s);
}

export function hexToBytes(h) {
  const s = strip0x(h);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(2 * i, 2), 16);
  return out;
}

/* ------------------------------------------------------------ addresses */

export const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const sameAddress = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function toChecksumAddress(addr) {
  const lower = strip0x(addr).toLowerCase();
  const hash = strip0x(keccak256(lower));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

/** 'ok' | 'invalid' (not hex40) | 'bad-checksum' (mixed case that doesn't match EIP-55) */
export function checkAddress(a) {
  if (!isAddress(a)) return 'invalid';
  const body = a.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return 'ok';
  return toChecksumAddress(a) === a ? 'ok' : 'bad-checksum';
}

/* --------------------------------------------------------- ABI encoding */

const canon = (t) => (t === 'uint' ? 'uint256' : t === 'int' ? 'int256' : t);

/** 'migrate(uint256)' -> { name: 'migrate', types: ['uint256'], canonical } */
export function parseSignature(sig) {
  const m = /^\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*$/.exec(sig || '');
  if (!m) throw new Error(`Cannot parse function signature: ${sig}`);
  const inner = m[2].trim();
  if (inner.includes('(')) throw new Error(`Tuple parameters are not supported yet: ${sig}`);
  // tolerate "migrate(uint256 amount)" style
  const params = inner ? inner.split(',').map((p) => p.trim().split(/\s+/)) : [];
  const types = params.map((p) => canon(p[0]));
  const names = params.map((p) => p[1] || null);
  return { name: m[1], types, names, canonical: `${m[1]}(${types.join(',')})` };
}

export const selector = (canonicalSig) => keccak256(canonicalSig).slice(0, 10);

function encodeStatic(type, v) {
  if (type === 'address') {
    if (!isAddress(String(v))) throw new Error(`Not a valid address: ${v}`);
    return pad32(strip0x(String(v)).toLowerCase());
  }
  if (type === 'bool') return pad32(v === true || v === 'true' || v === 1 || v === '1' ? '1' : '0');
  let m = /^uint(\d*)$/.exec(type);
  if (m) {
    const n = BigInt(v);
    if (n < 0n) throw new Error(`uint cannot be negative: ${v}`);
    return pad32(n.toString(16));
  }
  m = /^int(\d*)$/.exec(type);
  if (m) {
    let n = BigInt(v);
    if (n < 0n) n = (1n << 256n) + n;
    return pad32(n.toString(16));
  }
  m = /^bytes(\d+)$/.exec(type);
  if (m) {
    const b = strip0x(String(v));
    if (b.length > Number(m[1]) * 2) throw new Error(`${type} has the wrong length`);
    return b.padEnd(64, '0');
  }
  return null; // not static
}

/** ABI-encode a flat list of static types plus bytes/string. Returns hex without 0x. */
export function encodeArgs(types, values) {
  const head = [];
  const tail = [];
  let tailLen = 0;
  const headSize = 32 * types.length;
  types.forEach((t, i) => {
    if (t.endsWith(']')) throw new Error(`Array parameters are not supported yet: ${t}`);
    const s = encodeStatic(t, values[i]);
    if (s !== null) return head.push(s);
    if (t !== 'bytes' && t !== 'string') throw new Error(`Unsupported parameter type: ${t}`);
    const data = t === 'string' ? [...new TextEncoder().encode(String(values[i]))].map((b) => b.toString(16).padStart(2, '0')).join('') : strip0x(String(values[i]));
    head.push(pad32((headSize + tailLen).toString(16)));
    const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0');
    tail.push(pad32((data.length / 2).toString(16)) + padded);
    tailLen += 32 + padded.length / 2;
  });
  return head.join('') + tail.join('');
}

export function encodeCall(sig, values = []) {
  const p = parseSignature(sig);
  if (values.length !== p.types.length) throw new Error(`${sig} takes ${p.types.length} arguments, the registry gives ${values.length}`);
  return selector(p.canonical) + encodeArgs(p.types, values);
}

/** Decode an Error(string) / Panic(uint256) revert payload into readable text. */
export function decodeRevert(data) {
  if (!data || typeof data !== 'string' || data.length < 10) return null;
  const sel = data.slice(0, 10).toLowerCase();
  const body = data.slice(10);
  try {
    if (sel === '0x08c379a0') {
      const len = Number(hexToBigInt(body.slice(64, 128)));
      const bytes = hexToBytes(body.slice(128, 128 + len * 2));
      return new TextDecoder().decode(bytes);
    }
    if (sel === '0x4e487b71') return `Panic(0x${hexToBigInt(body.slice(0, 64)).toString(16)})`;
  } catch { /* fall through */ }
  return `custom error ${sel}`;
}

/* ---------------------------------------------------------- JSON-RPC */

export class RpcError extends Error {
  constructor(message, { code, data, url, transport } = {}) {
    super(message);
    this.code = code;
    this.data = data;
    this.url = url;
    this.transport = !!transport;
  }
}

let rpcId = 1;

async function postJson(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Many providers put a JSON-RPC error body on 4xx/5xx; surface it if present.
      let body = null;
      try { body = await res.json(); } catch { /* not JSON */ }
      if (body && (body.error || Array.isArray(body))) return body;
      throw new RpcError(`HTTP ${res.status}`, { url, transport: true });
    }
    return await res.json();
  } catch (e) {
    if (e instanceof RpcError) throw e;
    throw new RpcError(e.name === 'AbortError' ? 'Request timed out' : `Connection failed: ${e.message}`, { url, transport: true });
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic EVM errors (reverts) are returned as-is instead of failing over. */
const isRevert = (err) => err && (err.code === 3 || /revert/i.test(err.message || ''));

export class RpcClient {
  /** @param {string[]} urls in priority order */
  constructor(urls, { batchSize = 3, timeoutMs = 15000 } = {}) {
    if (!urls || !urls.length) throw new Error('No RPC endpoint configured');
    this.urls = [...urls];
    this.batchSize = batchSize;
    this.timeoutMs = timeoutMs;
  }

  _promote(url) {
    const i = this.urls.indexOf(url);
    if (i > 0) { this.urls.splice(i, 1); this.urls.unshift(url); }
  }

  /** Single request with fail-over across URLs. Reverts throw immediately. */
  async request(method, params = [], { timeoutMs } = {}) {
    let last;
    const errors = [];
    for (const url of [...this.urls]) {
      try {
        const json = await postJson(url, { jsonrpc: '2.0', id: rpcId++, method, params }, timeoutMs || this.timeoutMs);
        if (json.error) {
          const err = new RpcError(json.error.message || 'RPC error', { code: json.error.code, data: json.error.data, url });
          if (isRevert(json.error)) throw err;
          last = err;
          errors.push(err);
          continue;
        }
        this._promote(url);
        return json.result;
      } catch (e) {
        if (e instanceof RpcError && !e.transport && isRevert(e)) throw e;
        if (e !== last) errors.push(e);
        last = e;
      }
    }
    const err = last || new RpcError('Every RPC endpoint failed');
    err.all = errors;
    throw err;
  }

  /**
   * JSON-RPC batch, chunked to `batchSize`. Returns [{result}|{error}] aligned with `reqs`.
   * Falls back to individual requests when a provider rejects batching.
   */
  async batch(reqs) {
    const out = new Array(reqs.length);
    for (let start = 0; start < reqs.length; start += this.batchSize) {
      const chunk = reqs.slice(start, start + this.batchSize);
      let done = false;
      for (const url of [...this.urls]) {
        try {
          const body = chunk.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params || [] }));
          const json = await postJson(url, body, this.timeoutMs);
          if (!Array.isArray(json)) continue;
          const byId = new Map(json.map((r) => [r.id, r]));
          const items = chunk.map((_, i) => byId.get(i));
          // Provider-level rejection (e.g. batch limits, rate limits): every item errored with a non-revert error
          if (items.some((r) => !r) || items.every((r) => r.error && !isRevert(r.error))) continue;
          items.forEach((r, i) => { out[start + i] = r.error ? { error: r.error } : { result: r.result }; });
          this._promote(url);
          done = true;
          break;
        } catch { /* try next url */ }
      }
      if (!done) {
        // Last resort: one by one
        for (let i = 0; i < chunk.length; i++) {
          try { out[start + i] = { result: await this.request(chunk[i].method, chunk[i].params) }; }
          catch (e) { out[start + i] = { error: { message: e.message, code: e.code } }; }
        }
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------ Multicall3 */

export const MULTICALL3_DEFAULT = '0xcA11bde05977b3631167028862bE2a173976CA11';
const AGGREGATE3 = '0x82ad56cb'; // aggregate3((address,bool,bytes)[])

/** calls: [{ target, callData, allowFailure? }] -> calldata hex */
export function encodeAggregate3(calls) {
  const n = calls.length;
  const tuples = calls.map((c) => {
    const data = strip0x(c.callData);
    const padded = data.padEnd(Math.ceil(data.length / 64) * 64, '0');
    return pad32(strip0x(c.target).toLowerCase()) + pad32(c.allowFailure === false ? '0' : '1') + pad32('60') +
      pad32((data.length / 2).toString(16)) + padded;
  });
  let offsets = '';
  let off = 32 * n;
  for (const t of tuples) { offsets += pad32(off.toString(16)); off += t.length / 2; }
  return AGGREGATE3 + pad32('20') + pad32(n.toString(16)) + offsets + tuples.join('');
}

/** returns [{ success, returnData }] */
export function decodeAggregate3(hex) {
  const d = strip0x(hex);
  const word = (byteOff) => hexToBigInt(d.slice(byteOff * 2, byteOff * 2 + 64));
  const arr = Number(word(0));
  const n = Number(word(arr));
  const base = arr + 32;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = base + Number(word(base + 32 * i));
    const success = word(t) !== 0n;
    const bOff = t + Number(word(t + 32));
    const len = Number(word(bOff));
    out.push({ success, returnData: '0x' + d.slice((bOff + 32) * 2, (bOff + 32 + len) * 2) });
  }
  return out;
}

export const balanceOfData = (holder) => '0x70a08231' + pad32(strip0x(holder).toLowerCase());

/**
 * Read many (token, holder) balances. Uses Multicall3 if deployed, otherwise JSON-RPC batch.
 * Returns { balances: (bigint|null)[], via: 'multicall'|'batch' }
 */
export async function readBalances(client, pairs, { block = 'latest', multicall = MULTICALL3_DEFAULT, chunk = 150 } = {}) {
  let hasMulticall = false;
  if (multicall) {
    try { hasMulticall = strip0x(await client.request('eth_getCode', [multicall, block])).length > 0; }
    catch { hasMulticall = false; }
  }
  const balances = new Array(pairs.length).fill(null);
  const parse = (ret) => (ret && strip0x(ret).length >= 64 ? hexToBigInt(strip0x(ret).slice(0, 64)) : null);

  if (hasMulticall) {
    try {
      for (let s = 0; s < pairs.length; s += chunk) {
        const part = pairs.slice(s, s + chunk);
        const data = encodeAggregate3(part.map((p) => ({ target: p.token, callData: balanceOfData(p.holder) })));
        const res = decodeAggregate3(await client.request('eth_call', [{ to: multicall, data }, block]));
        res.forEach((r, i) => { balances[s + i] = r.success ? parse(r.returnData) : null; });
      }
      return { balances, via: 'multicall' };
    } catch { /* fall back to batch */ }
  }
  const res = await client.batch(pairs.map((p) => ({ method: 'eth_call', params: [{ to: p.token, data: balanceOfData(p.holder) }, block] })));
  res.forEach((r, i) => { balances[i] = r.result ? parse(r.result) : null; });
  if (balances.every((b) => b === null) && pairs.length) throw new Error('Could not read balances');
  return { balances, via: 'batch' };
}

/* ------------------------------------------------------- eth_simulateV1 */

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const NATIVE_PSEUDO = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'; // traceTransfers native ETH logs

const topicAddr = (t) => '0x' + strip0x(t).slice(24).toLowerCase();

/** Flatten Transfer logs from a simulateV1 result. */
export function transfersFrom(simResult) {
  const out = [];
  for (const blk of simResult || []) for (const call of blk.calls || []) for (const l of call.logs || []) {
    if (l.topics && l.topics[0] && l.topics[0].toLowerCase() === TRANSFER_TOPIC && l.topics.length >= 3) {
      out.push({ token: l.address.toLowerCase(), from: topicAddr(l.topics[1]), to: topicAddr(l.topics[2]), value: hexToBigInt(l.data) });
    }
  }
  return out;
}

const UNSUPPORTED = /method not found|not supported|does not exist|not available|unsupported|unknown method|invalid method|not allowed|whitelist|plan/i;
const isUnsupported = (e) => e && (e.code === -32601 || UNSUPPORTED.test(e.message || ''));

/**
 * Run calls through eth_simulateV1. Returns
 *  { supported: bool, ok: bool, calls: [{status, error}], result, error }
 */
export async function simulate(client, calls, block = 'latest') {
  const params = [{ blockStateCalls: [{ calls }], traceTransfers: true, validation: false }, block];
  let result;
  try {
    result = await client.request('eth_simulateV1', params, { timeoutMs: 25000 });
  } catch (e) {
    const errs = e.all && e.all.length ? e.all : [e];
    // "unsupported" only if no provider failed for some other (possibly transient) reason
    const unsupported = errs.some(isUnsupported) && errs.every((x) => isUnsupported(x) || x.transport || x.code === 19);
    const shown = errs.find(isUnsupported) || e;
    return { supported: !unsupported, ok: false, error: shown.message, calls: [] };
  }
  const callRes = ((result && result[0] && result[0].calls) || []).map((c) => ({
    status: c.status,
    ok: c.status === '0x1',
    error: c.error ? (decodeRevert(c.error.data) || c.error.message) : c.status !== '0x1' ? (decodeRevert(c.returnData) || 'reverted') : null,
  }));
  return {
    supported: true,
    ok: callRes.length === calls.length && callRes.every((c) => c.ok),
    calls: callRes,
    result,
    simulatedBlock: result && result[0] ? Number(hexToBigInt(result[0].number)) : null,
  };
}

/* -------------------------------------------------------------- units */

export function formatUnits(raw, decimals, maxFrac = 6) {
  const neg = raw < 0n;
  let v = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let s = frac ? `${wholeStr}.${frac}` : wholeStr;
  if (s === '0' && v > 0n) s = `< 0.${'0'.repeat(maxFrac - 1)}1`;
  return (neg ? '-' : '') + s;
}

/** "1.5" -> { n: 15n, d: 10n } */
export function parseFraction(str) {
  const s = String(str).trim();
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Invalid ratio number: ${str}`);
  const frac = m[2] || '';
  return { n: BigInt(m[1] + frac), d: 10n ** BigInt(frac.length) };
}

export { keccak256, keccak256Bytes };

/* ----------------------------------------- state-override step runner */
//
// Fallback for chains whose public RPCs lack eth_simulateV1 (e.g. Avalanche).
// eth_call with a stateOverride that puts this tiny contract at the USER's address,
// so every inner CALL it makes has msg.sender == user (exactly like the user sending
// the transactions). Calldata is a list of records, each:
//   word to | word value | word len | data (padded to 32 bytes)
// It executes them in order; for each it keeps the first 32 bytes of return data and
// finally returns them all. If any call fails it reverts with
//   word (index*32) | original revert data
// Hand-assembled (see scratch asm), 140 bytes:
//   loop: if ptr >= calldatasize -> end
//         calldatacopy(0x8000, ptr+96, len); ok = call(gas, to, value, 0x8000, len, 0, 0)
//         if !ok: mstore(0, out); returndatacopy(32, 0, rds); revert(0, 32+rds)
//         if rds >= 32: returndatacopy(out, 0, 32)
//         out += 32; ptr += 96 + ceil32(len)
//   end:  return(0, out)
// (ptr lives at mem 0x7000, out at mem 0x7020; outputs are written from mem 0)
export const RUNNER_CODE = '0x5b617000513611156100845761700051604001358061700051606001618000376000600082618000617000516020013561700051355af161004f57617020516000523d600060203e3d6020016000fd5b60203d106100615760206000617020513e5b6170205160200161702052601f01601f1916606001617000510161700052610000565b617020516000f3';

export function encodeRunnerCalls(calls) {
  return '0x' + calls.map((c) => {
    const data = strip0x(c.data || '0x');
    return pad32(strip0x(c.to).toLowerCase()) + pad32(BigInt(c.value || 0).toString(16)) +
      pad32((data.length / 2).toString(16)) + data.padEnd(Math.ceil(data.length / 64) * 64, '0');
  }).join('');
}

/**
 * Execute `steps` ([{to, data, value}]) as `user` via state override, reading
 * balanceOf(user) of `tokens` before and after.
 * Returns { supported, ok, before: bigint[], after: bigint[], failedStep, error }
 */
export async function simulateWithOverride(client, user, steps, tokens, block = 'latest') {
  const bal = tokens.map((t) => ({ to: t, data: balanceOfData(user) }));
  const records = [...bal, ...steps, ...bal];
  const call = { from: user, to: user, data: encodeRunnerCalls(records), gas: '0x1c9c380' }; // 30M gas
  const override = { [user]: { code: RUNNER_CODE } };
  let ret;
  try {
    ret = await client.request('eth_call', [call, block, override], { timeoutMs: 25000 });
  } catch (e) {
    if (e.code === 3 || /revert/i.test(e.message || '')) {
      const data = typeof e.data === 'string' ? e.data : e.data && e.data.data;
      if (data && strip0x(data).length >= 64) {
        const idx = Number(hexToBigInt(strip0x(data).slice(0, 64)) / 32n);
        const reason = decodeRevert('0x' + strip0x(data).slice(64)) || 'reverted';
        const failedStep = idx - tokens.length;
        return { supported: true, ok: false, failedStep, error: failedStep >= 0 && failedStep < steps.length ? reason : `Balance read failed: ${reason}` };
      }
      return { supported: true, ok: false, failedStep: -1, error: e.message };
    }
    const unsupported = /state ?override|too many|invalid (argument|params)|unsupported|not supported|method not found/i.test(e.message || '') || e.code === -32602 || e.code === -32601;
    return { supported: !unsupported, ok: false, error: e.message };
  }
  const d = strip0x(ret || '');
  if (d.length !== records.length * 64) {
    // override ignored by the node (returned empty / wrong shape)
    return { supported: false, ok: false, error: 'This RPC does not support eth_call state overrides' };
  }
  const word = (i) => hexToBigInt(d.slice(i * 64, i * 64 + 64));
  const k = tokens.length;
  return {
    supported: true, ok: true,
    before: tokens.map((_, i) => word(i)),
    after: tokens.map((_, i) => word(k + steps.length + i)),
  };
}
