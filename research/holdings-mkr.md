# MKR held outside the wallet: where it sits and whether it can reach SKY

Research date 2026-09-30. Chain state around block 26,087,800. MKR is $1,867.89 and SKY is $0.08195 (DefiLlama).
MKR total supply is 84,410. The MkrSky converter (`0xA1Ea…3f9a`) has `fee()` = 5% (0.05e18), so every path
below pays out **22,800 SKY per MKR**. That matches the `mkr-to-sky` entry and its statusCheck, which still holds.
The fee will probably step to 6% around 2026-12-22.

Output file: `data/registry.holdings-mkr.json` (5 entries). I did **not** add it to `data/index.json`.
Every entry was run through the site's own engine (`lib/scan.js` `scanChain` → `analyzeFinding`, from Node) using a
real holder, and each one returned `status: ready` with received = expected.

## Summary

| Position | Contract | MKR | ≈USD | Engine today? | Simulated (exit + mkrToSky) |
|---|---|---:|---:|---|---|
| 2017 chief (SAI_ADM), direct | `0x8E2a84D6…7152` | 1,805.6 | $3.37M | **yes** `mkr-chief-2017-to-sky` | 1,500 MKR → 34,200,000 SKY (0x7c5f…e7c0). Also 300 → 6,840,000 (0xb08e…fb38) |
| 2019 chief (MCD_ADM 1.0.0), direct | `0x9eF05f7F…54F5` | ~37.1 | $69k | **yes** `mkr-chief-2019-to-sky` | 6.6165 → 150,856.2 SKY (0xb522…758d) |
| 2019 chief via VoteProxy (factory `0x868ba9…F2bC`) | same | 40.56 (23 proxies) | $76k | no, proxy-keyed | cold wallet `free` → 22.406 → 510,866.6 SKY (0x7345…2be2) |
| 2020 chief (MCD_ADM 1.2–1.19), direct | `0x0a3f6849…dDC0` | ~7.6 | $14k | **yes** `mkr-chief-2020-to-sky` | 0.54 → 12,312 SKY (0x7eec…0410) |
| 2020 chief via VoteProxy (factory `0x6FCD258a…Ec408`) | same | 372.53 (1 proxy) | $696k | no, proxy-keyed | cold 0xf591…ab03: `free` 372.5265 → 8,493,604.26 SKY |
| 2020 chief via VoteDelegate v1 (factory `0xD897F1…F272`) | 139 delegate contracts | 42.05 | $79k | only with one entry per delegate | IOU approve + `free` 26.0098 → 593,023.58 SKY (0xbf7f…798f) |
| 2020 chief via VoteDelegate v2 (factory `0xc3d809…f5a0`) | 7 delegates | 9.95 | $19k | n/a: the only staker is LSE v1 | covered by the LSE row |
| LockstakeEngine v1 (MKR) | `0x2b16c07d…8f12` | 11.46 (18 urns) | $21k | no, urn-keyed | `free(owner,0,to,ink)` 8.8131 → 200,939.56 SKY; 1.0361 → 23,622.71 SKY |
| Aave v2 aMKR | `0xc713e5E1…6B88` | 60.24 | $113k | **yes** `aave-v2-mkr-to-sky` | 19.745 → 450,187.36 SKY (0x8b97…b105) |
| Aave v3 aEthMKR | `0x8A458A9d…6619` | 124.27 | $232k | **yes** `aave-v3-mkr-to-sky` | 0.2017 → 4,599.39 SKY. The 107 MKR holder (with debt) reverts on HealthFactor |
| Old MKR Redeemer (wallet token, not a holding) | `0x642AE78F…DD7C` | 8,910 | $16.6M | yes, as a wallet entry (not written, see below) | 1,563.62 OMKR → 1,563.62 MKR → 35,650,517.2 SKY (0x8826…dd48) |

The SKY chief (`0x929d…a6f9`) and LockstakeEngine v2 (`0xCe01…a6a3`) hold **0 MKR** (SKY only), so they are out of scope.
The MKR vest contracts hold 0 MKR. The pause proxy holds 49.6 MKR, which is treasury, not user funds.

## Details per position

### DSChief (3 versions). Expressible today, entries written

- Where the addresses come from: `SAI_ADM` in dai.js `contracts/addresses/mainnet.json` (2017 chief), `MCD_ADM` in changelog
  release 1.0.0 (2019 chief), and `MCD_ADM` in changelog 1.2.0 → chainlog 1.19.0 (2020 chief). On chain, `GOV()` = MKR and `IOU()` =
  `0x9AeD…727b` / `0x496C…8E355` / `0xA618…17F7`.
- Holding: `deposits(address)` returns MKR (raw).
- Exit: **you must approve the IOU first.** `free(wad)` calls `IOU.burn(msg.sender, wad)`, and DSToken burn by an authorized non-owner
  consumes allowance. Without the approval, `free` reverts (I simulated this). The IOU is 18 decimals and 1:1 with MKR.
  Steps are: `IOU.approve(chief,$amount)` → `chief.free($amount)` → `MKR.approve(MkrSky)` → `mkrToSky($user,$amount)`.
  There is no fee and no delay. The 2019 and 2020 chiefs need `block.number > last[user]`, which is always true for old locks.
- Failure case: the user moved their IOU tokens elsewhere. `free` then reverts, and the warning explains why.
- UI note: I encoded the IOU approval as a `call` step (`approve(address guy, uint256 wad)`) and not an `approve` step,
  because `buildSteps` labels any non-old token approve with the **new** token's symbol ("= 1500 SKY") and the title
  says "Approve the official migrator to use your MKR". Both would be wrong here. The trade-off is that the card title reads
  "Migrate: call approve". A per-step `title` field would fix this (see features).

### Vote proxies. Not expressible (holding keyed by a proxy)

- There are 2 factories. `0x6FCD258a…Ec408` (chainlog `VOTE_PROXY_FACTORY`, `chief()` = 2020 chief) has 42 proxies, 3 with MKR, and
  in practice one: `0x07294967…a84e` with 372.53 MKR (cold `0xf591…ab03`, hot `0xfbf4…6cb6`). `0x868ba9ae…F2bC`
  (`chief()` = 2019 chief) has 248 proxies, 23 with MKR, 40.56 MKR in total.
- The proxy approved the IOU to the chief in its constructor, so the user needs **no IOU step**.
- Engine needs these view calls, in order:
  1. `proxy = factory.coldMap(user)`, and separately `factory.hotMap(user)`. Both return `address`; 0 means none. I verified both on chain.
  2. `amount = chief.deposits(proxy)`. Optionally add `MKR.balanceOf(proxy)` (stray MKR that `freeAll` also pushes).
  3. If the user is the cold wallet, steps are `proxy.free($amount)` (or `freeAll()`), then `approve` + `mkrToSky($user,$amount)`, all
     sent from the user. MKR always goes to **cold**.
  4. If the user is only the hot wallet: they can call `free` or `freeAll` (simulated OK), but the MKR lands in the cold wallet. Show
     "your cold wallet 0x… receives the MKR", and run the migration from cold (or just link to the cold-wallet check).
- New placeholder needed: `$proxy` (resolved address) as a step `to`.

### Vote delegates v1. Expressible only one delegate at a time

- Factory `0xD897F108…F272`: 351 delegates, 139 still with MKR (42.05 in total). The largest are
  `0x0f4be9f2…beaa` 26.16, `0xafaff1a6…8989` 3.83, `0xb056e45f…9886` 1.69, `0x84b05b0a…1b96` 1.51, `0x14a4ed20…98e4` 1.10,
  `0xa346c2ee…d14c` 1.06, `0x5c86fa06…7f7f` 1.05.
- Holding: `delegate.stake(user)`, keyed by the user, so each delegate *could* be its own entry. I didn't write 139 entries
  (7 would cover 36 MKR). A list form is better (see features).
- Exit: `iou.approve(delegate,$amount)` → `delegate.free($amount)` → approve + `mkrToSky`. v1's `free` does
  `iou.pull(msg.sender)`, so it needs IOU approval **to the delegate**, not to the chief. Delegate expiry only blocks `lock`, not `free`.
- The staker can't be looked up per user on chain (`delegates(owner)` maps the delegate owner to its contract). Build the list from
  `CreateVoteDelegate(address indexed delegate, address indexed voteDelegate)` logs on the factory
  (topic0 `0x2187b96b…3644`).
- v2 delegates (factory `0xc3d809…f5a0`, chainlog `VOTE_DELEGATE_FACTORY_LEGACY`) hold 9.95 MKR. It is all staked by LSE v1
  (plus about 0.005 MKR from EOAs), so users reach it through the LSE exit.

### LockstakeEngine v1 (MKR). Not expressible (urn-keyed)

- Chainlog `LOCKSTAKE_ENGINE_OLD_V1`. 153 urns were ever opened, and 18 still have ink (11.46 MKR = `lsMKR.totalSupply`). All have `art = 0`
  (no debt). `fee()` = **0**. 1.93 MKR sits in the engine itself (urns without a delegate). The rest sits in v2 delegates.
- `lsMKR.balanceOf(urn)` is 0 when the urn is staked in the farm (`REWARDS_LSMKR_USDS_LEGACY`), so use vat ink.
- Engine needs these view calls, in order:
  1. `n = engine.ownerUrnsCount(user)`
  2. for `i < n`: `urn = engine.ownerUrns(user, i)`
  3. `ink = vat.urns(ilk, urn)` → word 0. vat is `0x35D1b3F3…492B`, `ilk = engine.ilk()` = `"LSE-MKR-A"`. Word 1 = art must be 0,
     otherwise the user has to repay first.
  4. Step: `engine.free(address owner, uint256 index, address to, uint256 wad)` with `($user, $index, $user, $amount)`. It
     withdraws from the farm and the delegate automatically (see trace). Then approve + `mkrToSky`.
     Out = ink × (1 − fee) (fee is 0 now). Do **not** use `freeSky`: it routes through the old MkrSky `0xBDcF…470B`, which reverts.
- New placeholder needed: `$index`.

### Aave. Expressible, entries written

- Addresses are from the bgd-labs aave-address-book (`MKR_A_TOKEN`, `POOL`). Holding: `aToken.balanceOf(user)`, which is 1:1 MKR and rebasing.
- Step: `pool.withdraw(MKR, $amount, $user)`, then approve + `mkrToSky`.
- Aave v2: about 52 of the top-30 holders' 57.5 MKR has no debt. Aave v3: about 123 of 125.6 MKR backs loans. The top holder's simulation
  fails with `HealthFactorLowerThanLiquidationThreshold()` (0x6679996d), and the engine reports `sim-failed`. The warning tells them to repay first.
  **Drop these two entries if Aave is out of scope for the product.** They're the only non-Maker contracts in the file.

### Old MKR (pre-2017 token). A wallet lead, not a holding

`Redeemer 0x642AE78F…DD7C` (owner = MCD_PAUSE_PROXY, `stopped()` = 0) holds **8,909.98 MKR**. 8,899.18 of the 1,000,000 old
MKR `0xC66eA802…6d0` are still unredeemed, which is 10.5% of MKR supply. This path isn't in any registry file. Steps:
`OMKR.approve(redeemer, $amount)` → `redeemer.redeem()` (redeems the whole balance) → `MKR.approve(MkrSky)` → `mkrToSky($user,$amount)`.
The simulation succeeded. It fits the current wallet engine (the approve step with `token: <MKR address>` gets mislabeled; use a call step).
Risk: governance could `stop()` it and `reclaim()`. Recommend adding it to the wallet registry (`registry.eth.json`).

### Other large MKR balances (not individual positions)

These are LP and index shares, which are feature #4 (non-old-token units): Uniswap v2 MKR/ETH 417, Uniswap v3 pools 147 + 124,
Balancer 254, Bancor 95, Uniswap v1 79, Uniswap v4 85, DPI SetToken 712, Polygon PoS bridge 73 (bridged MKR on Polygon).
The rest are multisigs and Safes, which are plain wallets that the engine already covers.

## Engine features needed

1. **Two-hop holding** (`holding.via`): first `factory.coldMap(user)` → address, then `chief.deposits(thatAddress)` → amount, with a
   `$proxy` placeholder for step targets. It should also check `hotMap` and say who receives the MKR. This unlocks 413 MKR (≈$771k), mostly one proxy.
2. **Indexed positions** (`holding.enumerate`): `ownerUrnsCount(user)` → loop `ownerUrns(user,i)` → `vat.urns(ilk,urn)` word 0,
   with a `$index` placeholder. Needed for LSE v1 (11.5 MKR). The same shape fits the Sky Staking Engine later.
3. **Contract lists** (`holding.contracts: [...]` with `$holding` as a step target): one entry that covers all 139 v1 VoteDelegates
   via `stake(user)` (42 MKR). It could also carry `holding.min`/`max`.
4. **Holding amount capped by a second balance** (optional): for chiefs, `min(deposits(user), IOU.balanceOf(user))`, so users whose IOU moved
   get a clear "your IOU is at another address" message instead of a raw revert.
5. **Per-step `title` / token symbol** for approvals of a third token (the IOU), so the how-to doesn't read "Migrate: call approve" or
   show SKY units.
