# Holdings: positions that are not plain wallet balances

The checker originally read `oldToken.balanceOf(user)`. Registry entries can now describe a position
held inside a contract (staked, locked for voting, escrowed). Read `SCHEMA.md` first; this file only
covers the additions. A working example lives in `data/registry.multichain.json`
(`thales-staked-optimism`, `thales-unstaking-optimism`).

## What the engine supports today

```json
{
  "holding": {
    "contract": "0x…",                       // where the position lives
    "signature": "stakedBalanceOf(address)",   // view fn(user) -> uint256 amount of OLD token (raw units)
    "label": "staked"                          // shown as "you have X MKR <label>"
  },
  "steps": [
    { "type": "call", "to": "0x…", "signature": "free(uint256)", "args": ["$amount"], "contractLabel": "Maker governance (DSChief)" },
    { "type": "call", "to": "0x…", "signature": "unstake()", "args": [], "waitSeconds": 15 },
    { "type": "approve", "token": "old", "spender": "$migrator" },
    { "type": "call", "to": "$migrator", "signature": "…", "args": ["$amount"] }
  ],
  "status": "open" | "blocked"
}
```

- `holding.signature` must take exactly one `address` (the user) and return the old-token amount as
  the first 32-byte word. `$amount` in steps is that amount.
- `waitSeconds` on a step = the user must wait this long after the previous step. The simulator runs the
  steps as separate `eth_simulateV1` blocks with pinned timestamps, so a cooldown up to a few days
  simulates fine.
- `contractLabel` names the contract in the how-to ("Open the Maker governance (DSChief) contract…").
- `status: "blocked"`: the path does not work today for protocol reasons (e.g. the contract was drained).
  The card shows "Blocked for now" plus the entry's `warnings`, and it turns Ready automatically if
  the live simulation ever succeeds. Blocked entries don't count toward stats.
- Entries with `holding` are excluded from `data/stats.json` totals (they would double-count supply).

## What the engine does NOT support yet (report these, don't hack around them)

1. **NFT positions** (veNFTs): the user owns token IDs; the amount is per ID (`locked(tokenId)`).
2. **Lock expiries** measured in months/years (vote-escrow). A long `waitSeconds` would simulate, but
   the UI would tell users to "wait 126,230,400 seconds". We need an "unlocks on <date>" concept that
   reads the user's lock end.
3. **Positions keyed by a proxy address** rather than the user (e.g. Maker VoteProxy: the MKR is
   deposited under the proxy's address, and the user is the proxy's cold/hot wallet).
4. **Amounts that aren't old-token units** (LP tokens, share tokens that need a conversion rate).

For any of these, write in your report exactly what the engine would need: which view calls, in what
order, and how to turn them into an old-token amount and an unlock time. I'll build it.

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
