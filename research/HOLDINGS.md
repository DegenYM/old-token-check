# Holdings: positions that are not plain wallet balances

The checker originally read `oldToken.balanceOf(user)`. Registry entries can now describe a position
held inside a contract (staked, locked for voting, escrowed). Read `SCHEMA.md` first; this file only
covers the additions. A working example lives in `data/registry.multichain.json`
(`thales-staked-optimism`, `thales-unstaking-optimism`).

## What the engine supports today

### Simple form: one view keyed by the user

```json
"holding": {
  "contract": "0x…",                       // where the position lives
  "signature": "stakedBalanceOf(address)",   // view fn(user) -> uint256 amount of OLD token (raw units)
  "label": "staked"                          // shown as "you have X MKR <label>"
}
```

### General form: a read program (`holding.reads`)

Runs for every user, batched through Multicall3 one stage at a time. Each op either calls a view or
reshapes the rows. A reverted call (or one to an address without code) drops that row: nothing there.

| Op | Example | Effect |
|---|---|---|
| call | `{ "call": "0x…" \| "$proxy", "signature": "locked(uint256)", "args": ["$tokenId"], "out": { "amount": "int256@0", "unlock": 1 } }` | View call. `out` maps variables to return words: a number (uint256 at that word), `"type"` (word 0) or `"type@word"`. Types: uint*, int*, address, bool, bytes32, `uint256[]`/`address[]` (dynamic, offset at that word). `"out": "amount"` = word 0 as uint256. |
| each | `{ "each": "index", "range": "$n" }` · `{ "each": "delegate", "in": ["0x…", …] }` · `{ "each": "grant", "in": "$ids" }` | One row per item. `range` and variable lists are capped at 100; literal lists aren't. The item joins the card id. |
| require | `{ "require": "$owner", "is": "$user" }` · `"is": "nonzero"` · `"is": "zero"` | Drops rows that don't match. |
| set | `{ "set": "total", "sum": ["$wallet", "$amount"] }` · `"mul"` · `"sub"` (stops at 0) · `"div"` (0 if dividing by 0) · `"mulDiv": [a, b, c]` (a·b/c) · `"sqrt": "$k"` · `"min"` · `"max"` · `"value"` | Integer arithmetic on variables. `registry.holdings-lp.json` uses it to replay Uniswap v2's protocol-fee mint before a burn, so the computed share matches what the pool pays. |
| collect | `{ "collect": { "ids": "$index" }, "sum": ["amount"] }` | Merges the rows of the last `each` back into one: lists and sums. |

The program must leave `$amount` (raw units of the held token). Special variables:
- `$unlock` (unix seconds): when it's in the future the card says **"Unlocks <date>"** and the steps are simulated in
  blocks pinned just after that date. Past dates simulate normally.
- Every variable is also a step placeholder: `"to": "$proxy"`, `"args": ["$ids"]` (arrays are encoded and shown as
  `[1,2,3]`, which is what Etherscan expects), `"spender": "$delegate"`, `"amount": "$total"`.
- `$user`, `$oldToken`, `$newToken`, `$migrator` are always set.

Other holding fields:
- `label` may interpolate variables: `"locked in v1 veNFT #$tokenId"` (addresses are shortened).
- `unit: "new"`: `$amount` is already in new-token units (e.g. SNX waiting to be claimed). Expected output = amount.
- `sweepsWallet: "$wallet"`: the flow also converts what's already in the wallet (e.g. KWENTA `lockAndConvert()`).
  Read the wallet balance into that variable; the card subtracts that part (it has its own wallet card).
- `amountVars: { "$shares": { "symbol": "dQUICK", "decimals": 18 } }` (or `"old"`/`"new"`): other placeholders that are
  token amounts, so the how-to shows "= 51.46 dQUICK" under the raw number.

Steps:
- `"if": "$voted"` / `"if": "!$voted"` includes a step only when that variable is (not) set/non-zero.
- `waitSeconds`: the user must wait this long after the previous step. The simulator runs the steps as separate
  `eth_simulateV1` blocks with pinned timestamps (60 days is fine). The how-to says "Wait at least 60 days".
- `contractLabel`, `title`, `tokenMeta` (for approving a third token such as the chief IOU, or an LP token) as before.
- `hints: { "6": "Any future unix time works" }` replaces the hint under that field (by argument index) in the how-to.
- An argument can be a literal list (`["$user", ["0x…"]]` for `getReward(address,address[])`).

Entry-level: `minAmount` (raw) hides balances below what the migrator accepts (the KEEP/NU vending machines floor
to 0.001 and revert on zero).

Worked examples: `registry.holdings-mkr.json` (vote proxy: address hop; LockStake: count + index; vote delegates:
contract list), `registry.holdings-ve.json` (veOCEAN unlock date; VELO veNFT enumeration with a conditional reset),
`registry.holdings-misc.json` (KWENTA escrow ID arrays and `sweepsWallet`; OGV `collect`; TRIBE per-pool list;
dQUICK shares), `registry.holdings-keep.json` (operator-keyed stakes, grants, managed grants).

`status: "blocked"`: the path doesn't work today for protocol reasons (e.g. the contract was drained). The card shows
"Blocked for now" plus the entry's `warnings`, and turns Ready by itself if the live simulation ever succeeds.
Entries with `holding` are excluded from `data/stats.json` totals (they would double-count supply).

## Still not expressible

- Grant-backed KEEP stakes (owner is a `TokenGrantStake` contract): the grantee undelegates/recovers through TokenGrant,
  then withdraws the grant. Needs a grant → stake contract → operator walk.
- Velodrome v1 veNFTs attached to a gauge (need `Gauge.withdrawToken` on the right gauge first; they are skipped).
- Vote-proxy **hot** wallets (the MKR goes to the cold wallet; check that address instead).
- L2 → L1 withdrawals on Arbitrum (outbox) and Linea (message claims). Polygon PoS exits are covered by
  `lib/bridges.js` (Alchemy transfers API for the burns; public Blockscout lacks 2021-era Polygon logs and public RPCs
  cap log ranges at ~10k blocks).
- LP tokens staked in a farm (Sushi MasterChef etc.), index tokens (DPI), Uniswap v3/v4 positions.

## Verification bar (same as the wallet registry)

- Contract addresses from official docs/repos AND on-chain (`eth_getCode`, and the view function works).
- A real current holder of the position. Simulate the full exit + migration from that holder at
  `latest` with `eth_simulateV1` (`traceTransfers: true, validation: false`). Record in/out amounts.
- If it reverts, find out why (drained contract, paused, lock not expired, governance-only…). A clean
  "why" is as valuable as a success; that becomes a `blocked` entry or a rejected note.
- Size it: roughly how much old token sits in that contract today (and in USD via DefiLlama
  `https://coins.llama.fi/prices/current/<chain>:<addr>`).

## Tooling notes (hard-won)

- No foundry. `python3` with `from eth_hash.auto import keccak`, `coincurve`, `eth_keys` available; Node 22.
- RPCs: `https://<chain>.drpc.org` for eth_call/eth_simulateV1 (eth_getLogs limited to <10k blocks;
  drpc sometimes returns "method handler crashed" or 429, so retry, or fall back to
  `https://<chain>-rpc.publicnode.com` / `https://ethereum-rpc.publicnode.com`). publicnode refuses
  archive/large log queries. drpc rejects `eth_call` with a state override (HTTP 400); publicnode accepts it.
- Multi-block `eth_simulateV1`: pin `blockOverrides.time` on EVERY block (an unpinned first block drifts ~12s).
- Blockscout (`https://eth.blockscout.com`, `optimism.blockscout.com`, …) `module=logs&action=getLogs`
  handles big ranges but rate-limits hard: one request at a time, sleep between them. Event args are often
  non-indexed (read them from `data`). Holder lists for old tokens are stale, so always confirm with `balanceOf`.
- To prove a path would work if a precondition changed (e.g. contract refilled), simulate with
  `stateOverrides` on the token's balance slot (find the mapping slot by probing `keccak(pad(addr)+pad(i))`).
- Never print or store private keys; you won't need any.
