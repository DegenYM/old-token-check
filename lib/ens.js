// ENS name -> address, read-only. Uses the ENS Universal Resolver on Ethereum, plus CCIP-read
// (EIP-3668) for names whose records live offchain or on an L2 (e.g. *.base.eth, uni.eth subnames).
// Only plain lowercase-able ASCII names are accepted; names with emoji or accents need full
// ENSIP-15 normalization, which this file doesn't ship.

import { keccak256Bytes } from './keccak.js';
import { encodeCall, encodeArgs, hexToBytes, hexToBigInt, isAddress, strip0x, toChecksumAddress } from './evm.js';

// Newest first; the older one is a fallback if the first misbehaves
export const UNIVERSAL_RESOLVERS = ['0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe', '0xce01f8eee7E479C928F8919abD53E553a36CeF67'];
const OFFCHAIN_LOOKUP = '0x556f1830'; // OffchainLookup(address,string[],bytes,bytes4,bytes)
const MAX_HOPS = 4;

const enc = new TextEncoder();
const toHexStr = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/** "Vitalik.ETH" -> "vitalik.eth"; null for anything this resolver can't handle safely */
export function normalizeName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)*\.eth$/.test(n)) return null;
  if (n.split('.').some((l) => l.length > 255)) return null;
  return n;
}

export function namehash(name) {
  let node = new Uint8Array(32);
  if (!name) return `0x${toHexStr(node)}`;
  for (const label of name.split('.').reverse()) {
    const buf = new Uint8Array(64);
    buf.set(node);
    buf.set(keccak256Bytes(enc.encode(label)), 32);
    node = keccak256Bytes(buf);
  }
  return `0x${toHexStr(node)}`;
}

/** DNS wire format: each label prefixed by its length, then a zero byte */
export function dnsEncode(name) {
  const labels = name.split('.').map((l) => enc.encode(l));
  const out = new Uint8Array(labels.reduce((a, l) => a + l.length + 1, 1));
  let i = 0;
  for (const l of labels) {
    out[i++] = l.length;
    out.set(l, i);
    i += l.length;
  }
  return `0x${toHexStr(out)}`;
}

/* ---- tiny ABI reader over hex without 0x; offsets in bytes */
const word = (d, off) => hexToBigInt(d.slice(off * 2, off * 2 + 64) || '0');
const bytesAt = (d, off) => {
  const len = Number(word(d, off));
  return `0x${d.slice((off + 32) * 2, (off + 32 + len) * 2)}`;
};
const stringAt = (d, off) => new TextDecoder().decode(hexToBytes(bytesAt(d, off)));

function decodeOffchainLookup(errHex) {
  const d = strip0x(errHex).slice(8);
  const urlsOff = Number(word(d, 32));
  const n = Math.min(Number(word(d, urlsOff)), 8);
  const urls = Array.from({ length: n }, (_, i) => stringAt(d, urlsOff + 32 + Number(word(d, urlsOff + 32 + 32 * i))));
  return {
    sender: `0x${d.slice(24, 64)}`,
    urls,
    callData: bytesAt(d, Number(word(d, 64))),
    callback: `0x${d.slice(192, 200)}`,
    extraData: bytesAt(d, Number(word(d, 128))),
  };
}

const revertData = (e) => (typeof e.data === 'string' ? e.data : e.data && typeof e.data.data === 'string' ? e.data.data : null);

/** EIP-3668 gateway request: GET when the URL template has {data}, POST otherwise */
async function ccipRead(lookup, fetchFn) {
  const sender = lookup.sender.toLowerCase();
  const data = lookup.callData.toLowerCase();
  let lastError = 'no usable gateway';
  for (const url of lookup.urls) {
    if (!/^https:\/\//i.test(url)) continue; // e.g. "x-batch-gateway:true" is for clients that batch locally
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    try {
      const href = url.replace('{sender}', sender).replace('{data}', data);
      const res = url.includes('{data}')
        ? await fetchFn(href, { signal: ctl.signal })
        : await fetchFn(href, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data, sender }), signal: ctl.signal });
      if (res.status >= 400 && res.status < 500) { lastError = `gateway answered HTTP ${res.status}`; break; }
      if (!res.ok) { lastError = `gateway answered HTTP ${res.status}`; continue; }
      const json = await res.json();
      if (typeof json.data === 'string' && /^0x[0-9a-f]*$/i.test(json.data)) return json.data;
      lastError = 'gateway returned no data';
    } catch (e) {
      lastError = e.name === 'AbortError' ? 'gateway timed out' : `gateway unreachable (${e.message})`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

/** resolve(bytes,bytes) returns (bytes result, address resolver); result is the abi-encoded addr() */
function decodeResolved(ret) {
  const d = strip0x(ret);
  const result = strip0x(bytesAt(d, Number(word(d, 0))));
  if (result.length < 64) return null;
  const addr = `0x${result.slice(24, 64)}`;
  return /^0x0{40}$/.test(addr) ? null : toChecksumAddress(addr);
}

async function resolveWith(client, ur, name, fetchFn) {
  let to = ur;
  let data = encodeCall('resolve(bytes,bytes)', [dnsEncode(name), encodeCall('addr(bytes32)', [namehash(name)])]);
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    try {
      const ret = await client.request('eth_call', [{ to, data }, 'latest']);
      return { address: decodeResolved(ret) };
    } catch (e) {
      const err = revertData(e);
      if (!err) throw e; // network trouble, not an answer
      if (!err.toLowerCase().startsWith(OFFCHAIN_LOOKUP)) return { address: null }; // no resolver / no record
      const lookup = decodeOffchainLookup(err);
      // EIP-3668: the lookup must come from the contract we called
      if (lookup.sender.toLowerCase() !== to.toLowerCase()) return { address: null, error: 'unexpected offchain lookup' };
      const response = await ccipRead(lookup, fetchFn);
      data = lookup.callback + encodeArgs(['bytes', 'bytes'], [response, lookup.extraData]);
    }
  }
  return { address: null, error: 'too many offchain lookups' };
}

/**
 * Resolve ENS names on Ethereum. Returns [{ name, address|null, error? }] in input order.
 * `client` is an RpcClient for chain 1.
 */
export async function resolveNames(client, names, { fetchFn = fetch, concurrency = 4 } = {}) {
  const out = new Array(names.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, async () => {
    while (next < names.length) {
      const i = next++;
      const name = normalizeName(names[i]);
      if (!name) { out[i] = { name: names[i], address: null, error: 'unsupported name' }; continue; }
      let r = null;
      let lastError = null;
      for (const ur of UNIVERSAL_RESOLVERS) {
        try { r = await resolveWith(client, ur, name, fetchFn); break; } catch (e) { lastError = e.message; }
      }
      out[i] = r ? { name, ...r } : { name, address: null, error: lastError || 'could not reach Ethereum' };
      if (out[i].address && !isAddress(out[i].address)) out[i] = { name, address: null, error: 'bad address record' };
    }
  }));
  return out;
}
