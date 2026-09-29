# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Crypto holders (often long-time DeFi users) who may still hold legacy tokens that have an official on-chain migration or redemption path (e.g. MATIC→POL, MKR→SKY, GNT→GLM, AEB tokens on Avalanche). They paste one or more EVM addresses to find out whether anything is still claimable, then perform the migration themselves in their own wallet.

## Product Purpose
Old Token Check finds forgotten legacy-token balances that can still be migrated through official contracts, proves each result by simulating the exact migration from the user's address, and gives step-by-step instructions (Etherscan fields, official UI link). Success = a user discovers value they didn't know they had and migrates it safely without trusting the site with their wallet.

## Positioning
Read-only and verifiable: no wallet connection, no signatures. Every "ready" result is backed by an on-chain simulation (eth_simulateV1, or eth_call with state override where unsupported) at a stated block, and every contract address is from a researched, simulation-verified registry. Covers official migrations that portfolio trackers typically don't surface.

## Operating Context
Users arrive after hearing about forgotten funds (similar to "stuck bridge funds" checkers). They compare results against Etherscan and their wallet's confirmation screen. Scams impersonating migration contracts exist (e.g. a widely copied fake "ASI migrator" EOA), so users must be taught to verify addresses.

## Capabilities and Constraints
- Static site (index.html, style.css, app.js, lib/*.js, chains.js, data/registry.*.json); no build step, no backend.
- Scans 8 chains in parallel over public RPCs (drpc/publicnode); `RPC_OVERRIDES` in chains.js for paid endpoints later.
- Registry: 44 verified open migration paths; entries carry warnings (info/warn/danger), payoutReserve (first-come-first-served capacity), deadlines.
- Never connects a wallet or requests signatures. Approvals are only ever to the listed official migrator.
- USD values come from DefiLlama's public price API; values it can't price are shown without USD, never estimated.
- Tip jar: accepts tips on any EVM chain at one address (`TIP_ADDRESS` in config.js). Tips are sent by the user from their own wallet — the page only shows the address (copy + QR).

## Brand Commitments
- Name: Old Token Check.
- UI language: English.
- Visual reference explicitly chosen by the owner: the "stuck bridge funds" checker — dark minimal UI, centered address search with a Check button, read-only lock line, 4-column stats row, summary card, result cards with status pill and dashed divider, footer safety line.

## Evidence on Hand
Registry stats (data/registry.eth.json, data/registry.multichain.json, data/rejected.*.json): 44 open paths, 8 chains, 49 rejected candidates, every accepted path simulated from a real holder. No user counts, testimonials, or recovered-value totals exist — do not fabricate them.

## Product Principles
1. Prove, don't claim: nothing is "ready" without a successful simulation.
2. The user acts, the site never does: no wallet connection, ever.
3. Teach verification: every step names the exact contract to check in the wallet popup.
4. Be honest about risk: surface deadlines, capacity limits, and uncertainty prominently.
