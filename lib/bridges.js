// Withdrawals that were started on an L2 but never claimed on Ethereum. Polygon PoS for now.
//
// A Polygon PoS withdrawal starts as a burn on Polygon (a bridged token sent to 0x0) and ends with
// RootChainManager.exit(proof) on Ethereum. Finding a wallet's old burns needs a full-history index,
// so this asks Alchemy's transfers API (the only call that needs ALCHEMY_KEY). For every burn of a
// bridged token it computes the exit hash RootChainManager records once a withdrawal is claimed
// (Polygon block, transaction index, log position) and reads processedExits for all of them in one
// multicall. Only unclaimed burns go further: their exit proof comes from Polygon's official proof
// service, and the usual simulation then proves exit() pays out from the user's address.

import { keccak256Bytes } from './keccak.js';
import { encodeCall, decodeValue, multicallRaw, toChecksumAddress, hexToBigInt, TRANSFER_TOPIC } from './evm.js';
import { readTokenMeta } from './scan.js';

export const POLYGON_POS = {
  rootChainManager: '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77',
  proofApi: 'https://proof-generator.polygon.technology/api/v1/matic/exit-payload/',
  ether: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  explorer: 'https://polygonscan.com',
};
const ZERO = '0x0000000000000000000000000000000000000000';
const ZERO_TOPIC = `0x${'0'.repeat(64)}`;
const MAX_PAGES = 5; // up to 5,000 burns per wallet

async function mapLimit(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); }
  }));
}

async function alchemyRpc(key, body, fetchFn) {
  const res = await fetchFn(`https://polygon-mainnet.g.alchemy.com/v2/${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Alchemy answered HTTP ${res.status}`);
  return res.json();
}

/** Every ERC-20 transfer from `user` to 0x0 on Polygon, oldest first */
async function burnsOf(key, user, fetchFn) {
  const out = [];
  let pageKey;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = {
      fromBlock: '0x0', toBlock: 'latest', fromAddress: user, toAddress: ZERO, category: ['erc20'],
      excludeZeroValue: true, withMetadata: true, maxCount: '0x3e8', ...(pageKey ? { pageKey } : {}),
    };
    const j = await alchemyRpc(key, { jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }, fetchFn);
    if (j.error) throw new Error(j.error.message || 'Alchemy error');
    out.push(...(j.result.transfers || []));
    pageKey = j.result.pageKey;
    if (!pageKey) break;
  }
  return out;
}

/** One JSON-RPC batch per 100 requests; results aligned with `reqs` (null on error) */
async function alchemyBatch(key, reqs, fetchFn) {
  const out = new Array(reqs.length).fill(null);
  for (let s = 0; s < reqs.length; s += 100) {
    const part = reqs.slice(s, s + 100);
    const j = await alchemyRpc(key, part.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params })), fetchFn);
    for (const item of Array.isArray(j) ? j : []) if (item && item.result) out[s + item.id] = item.result;
  }
  return out;
}

const rlpInt = (n) => {
  if (n === 0) return [0x80];
  if (n < 128) return [n];
  const b = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x % 256);
  return [0x80 + b.length, ...b];
};

/**
 * keccak256(abi.encodePacked(blockNumber, nibbles(rlp(txIndex)), logPosition)): the key
 * RootChainManager.exit() marks in processedExits (the receipt-trie path is rlp(txIndex)).
 */
export function polygonExitHash(blockNumber, txIndex, logPosition) {
  const nibbles = rlpInt(txIndex).flatMap((x) => [x >> 4, x & 0xf]);
  const buf = new Uint8Array(64 + nibbles.length);
  const put = (off, v) => { let b = BigInt(v); for (let i = 31; i >= 0; i--) { buf[off + i] = Number(b & 0xffn); b >>= 8n; } };
  put(0, blockNumber);
  buf.set(nibbles, 32);
  put(32 + nibbles.length, logPosition);
  return `0x${[...keccak256Bytes(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const fmtDay = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;
};

/** A registry-shaped entry for one unclaimed burn, so the normal simulation and card code apply */
function exitEntry(b, rootMeta) {
  const isEther = b.root.toLowerCase() === POLYGON_POS.ether;
  const symbol = isEther ? 'ETH' : rootMeta.symbol;
  const decimals = isEther ? 18 : rootMeta.decimals;
  const day = fmtDay(b.time);
  return {
    id: `polygon-exit-${b.hash.slice(2, 14)}-${b.position}`,
    name: `${symbol} withdrawn from Polygon, never claimed`,
    project: 'Polygon PoS bridge',
    chainId: 1,
    oldToken: { address: toChecksumAddress(b.child), symbol, decimals },
    newToken: isEther ? null : { address: toChecksumAddress(b.root), symbol, decimals },
    migrator: POLYGON_POS.rootChainManager,
    ratio: { num: '1', den: '1' },
    holding: { label: `withdrawn from Polygon${day ? ` on ${day}` : ''}, not yet claimed on Ethereum` },
    steps: [{
      type: 'call', to: POLYGON_POS.rootChainManager, signature: 'exit(bytes inputData)', args: ['$payload'],
      contractLabel: 'Polygon PoS bridge (RootChainManager)', title: 'Claim your withdrawal on Ethereum',
      hints: { 0: "The exit proof from Polygon's official proof service. It's long: use Copy." },
    }],
    status: 'open',
    deadline: null,
    statusCheck: null,
    officialUi: 'https://portal.polygon.technology/bridge',
    sources: ['https://docs.polygon.technology/pos/how-to/bridging/ethereum-polygon/'],
    warnings: [{
      level: 'info',
      text: `You started this withdrawal on Polygon${day ? ` on ${day}` : ''}, but the last step on Ethereum was never sent, so the bridge is still holding it for you. Claiming costs only gas.`,
    }],
    bridge: { kind: 'polygon-pos', route: 'Polygon → Ethereum', burnTx: b.hash, burnUrl: `${POLYGON_POS.explorer}/tx/${b.hash}` },
  };
}

/**
 * Unclaimed Polygon PoS withdrawals for `users`.
 * Returns { findings: [{ user, entry, balance, vars: { payload }, rowKey }], waiting, burns }
 * where `waiting` counts burns too recent to prove (no checkpoint yet).
 */
export async function findPolygonExits({ key, users, ethClient, fetchFn = fetch }) {
  // 1) every burn by these wallets
  const burns = [];
  await mapLimit(users, 4, async (user) => {
    for (const t of await burnsOf(key, user, fetchFn)) {
      if (!t.rawContract || !t.rawContract.address || !t.rawContract.value) continue;
      const logIndex = Number(String(t.uniqueId || '').split(':').pop());
      burns.push({
        user, hash: t.hash, child: t.rawContract.address.toLowerCase(), raw: hexToBigInt(t.rawContract.value),
        logIndex, block: Number(hexToBigInt(t.blockNum)), time: t.metadata && t.metadata.blockTimestamp,
      });
    }
  });
  if (!burns.length) return { findings: [], waiting: 0, burns: 0 };

  // 2) only tokens the PoS bridge maps to an Ethereum token
  const RCM = POLYGON_POS.rootChainManager;
  const children = [...new Set(burns.map((b) => b.child))];
  const mapped = await multicallRaw(ethClient, children.map((c) => ({ target: RCM, callData: encodeCall('childToRootToken(address)', [c]) })));
  const rootOf = new Map();
  children.forEach((c, i) => {
    const r = mapped[i] && mapped[i].success ? decodeValue(mapped[i].returnData, 0, 'address') : null;
    if (r && !/^0x0{40}$/i.test(r)) rootOf.set(c, r);
  });
  const bridged = burns.filter((b) => rootOf.has(b.child)).map((b) => ({ ...b, root: rootOf.get(b.child) }));
  if (!bridged.length) return { findings: [], waiting: 0, burns: burns.length };

  // 3) exit hashes from the burn receipts, then which ones Ethereum has already paid out
  const txs = [...new Set(bridged.map((b) => b.hash))];
  const receipts = await alchemyBatch(key, txs.map((h) => ({ method: 'eth_getTransactionReceipt', params: [h] })), fetchFn);
  const receiptOf = new Map(txs.map((h, i) => [h, receipts[i]]));
  for (const b of bridged) {
    const r = receiptOf.get(b.hash);
    if (!r) continue;
    const logs = r.logs || [];
    const pos = logs.findIndex((l) => Number(hexToBigInt(l.logIndex)) === b.logIndex);
    if (pos < 0) continue;
    // the proof service picks a burn by its order among the receipt's burns of any token
    const burnLogs = logs.filter((l) => l.topics && l.topics[0] === TRANSFER_TOPIC && l.topics[2] === ZERO_TOPIC);
    b.position = burnLogs.findIndex((l) => l === logs[pos]);
    b.exitHash = polygonExitHash(Number(hexToBigInt(r.blockNumber)), Number(hexToBigInt(r.transactionIndex)), pos);
  }
  const hashed = bridged.filter((b) => b.exitHash && b.position >= 0);
  const done = await multicallRaw(ethClient, hashed.map((b) => ({ target: RCM, callData: encodeCall('processedExits(bytes32)', [b.exitHash]) })));
  let open = hashed.filter((b, i) => done[i] && done[i].success && decodeValue(done[i].returnData, 0, 'bool') === false);
  if (!open.length) return { findings: [], waiting: 0, burns: burns.length };

  // Tokens that moved to another bridge (USDT -> USDT0) only exit burns up to a cutoff block;
  // later burns belong to the new bridge and are not stuck here
  const rootsOpen = [...new Set(open.map((b) => b.root.toLowerCase()))];
  const status = await multicallRaw(ethClient, rootsOpen.map((r) => ({ target: RCM, callData: encodeCall('migrationStatus(address)', [r]) })));
  const cutoff = new Map();
  rootsOpen.forEach((r, i) => {
    if (!status[i] || !status[i].success) return;
    if (decodeValue(status[i].returnData, 1, 'bool')) cutoff.set(r, Number(decodeValue(status[i].returnData, 2, 'uint256')));
  });
  open = open.filter((b) => !cutoff.has(b.root.toLowerCase()) || b.block <= cutoff.get(b.root.toLowerCase()));
  if (!open.length) return { findings: [], waiting: 0, burns: burns.length };

  // 4) exit proofs for the unclaimed ones
  let waiting = 0;
  const roots = [...new Set(open.map((b) => b.root).filter((r) => r.toLowerCase() !== POLYGON_POS.ether))];
  const meta = roots.length ? await readTokenMeta(ethClient, roots) : {};
  const findings = [];
  await mapLimit(open, 3, async (b) => {
    const url = `${POLYGON_POS.proofApi}${b.hash}?eventSignature=${TRANSFER_TOPIC}${b.position ? `&tokenIndex=${b.position}` : ''}`;
    let payload = null;
    try {
      const res = await fetchFn(url);
      const j = await res.json().catch(() => ({}));
      if (res.ok && typeof j.result === 'string' && /^0x[0-9a-f]+$/i.test(j.result)) payload = j.result;
      else if (/checkpoint/i.test(JSON.stringify(j))) waiting++;
    } catch { /* proof service unreachable: skip this one */ }
    if (!payload) return;
    const entry = exitEntry(b, meta[b.root.toLowerCase()] || { symbol: 'tokens', decimals: 18 });
    findings.push({ user: b.user, entry, balance: b.raw, vars: { payload }, rowKey: `${b.hash.slice(2, 12)}-${b.position}` });
  });
  findings.sort((a, b) => (a.user < b.user ? -1 : a.user > b.user ? 1 : 0));
  return { findings, waiting, burns: burns.length };
}
