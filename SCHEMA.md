# Registry schema (shared contract between research agents and frontend)

Each research agent writes a JSON array to `data/registry.<part>.json`. The frontend loads
all `data/registry.*.json` files listed in `data/index.json` (e.g. `["registry.eth.json","registry.multichain.json"]`).

One entry = one migration path (old token -> new asset) on one chain.

```json
{
  "id": "matic-to-pol",                       // kebab-case, unique
  "name": "MATIC → POL",
  "project": "Polygon",
  "chainId": 1,
  "oldToken": { "address": "0x…", "symbol": "MATIC", "decimals": 18 },
  "newToken": { "address": "0x…", "symbol": "POL",   "decimals": 18 },   // null if output is native ETH
  "migrator": "0x…",                           // contract the user calls (checksummed)
  "ratio": { "num": "1", "den": "1" },         // newAmount = oldAmount * num / den, in *whole-token* terms
  "steps": [                                   // executed in order by the user
    { "type": "approve", "token": "old", "spender": "0x…" },
    { "type": "call", "to": "0x…", "signature": "migrate(uint256)", "args": ["$amount"] }
  ],                                           // arg placeholders: "$amount" (old token raw amount), "$user"
  "status": "open",                            // "open" | "closed" | "deadline" | "unknown"
  "deadline": null,                            // ISO date if known
  "statusCheck": null,                         // optional: {"to":"0x…","signature":"paused()","expect":"0x…0"} or null
  "officialUi": "https://…",                   // official migration page, if any
  "sources": ["https://…"],                    // docs / announcements used
  "verification": {                            // REQUIRED: how you proved it works today
    "codeExists": true,
    "simulatedAt": 26074144,                   // L1/L2 block number of the simulation
    "holderUsed": "0x…",                       // real holder of the old token used in the simulation
    "simulatedIn": "1000000000000000000",      // raw old-token amount simulated
    "simulatedOut": "1000000000000000000",     // raw new-token amount received in the simulation
    "method": "eth_simulateV1 approve+call from holder, traceTransfers",
    "notes": "…"
  }
}
```

Only entries with `status: "open"` AND a successful simulation belong in the registry. Put
closed / unverifiable candidates in `data/rejected.<part>.json` as `{ "id", "reason" }`.
