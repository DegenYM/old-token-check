# Staked and escrowed positions for the smaller legacy tokens

Researched 2026-09-30. Base blocks: Ethereum ~26,087,840–26,087,995; Optimism ~157,572,000–157,572,411;
Arbitrum ~510,241,868; Base ~51,976,716; Polygon 94,691,301.
All sims use `eth_simulateV1` with `traceTransfers: true` and `validation: false`, time pinned, run from a real current holder.
The 9 registry entries were then run again through the site's own engine (`lib/scan.js` `scanChain` + `analyzeFinding`)
from the recorded holders. The 6 open entries came back `ready` with received = expected. The 3 THALES escrow entries
came back `sim-failed`, which is correct for `blocked`.

Prices (DefiLlama, today): KNC $0.138, NU $0.0175 (T $0.00545 → $0.0178 per NU as T), KEEP $0.0262,
THALES $0.211 / OVER $0.213, QUICK(new) $0.01028, SNX $0.254 (KWENTA = 17 SNX = $4.33), AEVO $0.0255,
GLM $0.125, OGN $0.0201, TRIBE $0.409. USD below is the value of the asset received.

## Summary

| Token / position | Contract | Old token in it (users) | ≈USD | Expressible today? | Simulated result |
|---|---|---|---|---|---|
| THALES escrow (OP) | EscrowThales `0xa258…f056` | 190,768 (accounting) | $40.6k | yes → `blocked` | `vest` reverts "SafeERC20: low-level call failed" (escrow drained 2026-06-01). With the balance overridden: 83.99 THALES → 83.99 OVER |
| THALES escrow (ARB) | `0x391a…D50d` | 49,030 | $10.4k | yes → `blocked` | same revert. Override: 8,752.8 → 8,752.8 OVER |
| THALES escrow (Base) | `0x29df…939A` | 4,874 | $1.0k | yes → `blocked` | same revert. Override: 1,360.0 → 1,360.0 OVER |
| KNCL in old KyberDAO staking | KyberStaking `0xECf0…aea3` | 712,590 (1,487 stakers) | $98k | **yes, open** | withdraw → mintWithOldKnc: 84,524.4 KNCL → 84,524.4 KNC |
| NU in NuCypher StakingEscrow | `0xbbD3…b2e2` | 27.30M (232 stakers) | $486k | **yes, open** | withdraw → wrap: 5,000,000 NU → 16,296,212 T |
| RBN in veRBN (all locks expired, `is_unlocked` = true) | `0x1985…B5f7` | 426,290 (203 locks) | $10.9k | **yes, open** | withdraw → migrate: 46,738 RBN → 46,738 AEVO |
| GNT wrapped as GNTb | `0xA7df…211c` | 93,357 | $11.7k | **yes, open** | withdraw → migrate: 936.4 GNT → 936.4 GLM |
| KWENTA staked, v1 (liquid) | StakingRewards `0x6e56…89e0` | 2,395 | $10.4k | **yes, open** (deadline 2026-11-15) | unstake → lockAndConvert → vest: 137.6 KWENTA → 2,340.0 SNX |
| KWENTA staked, v2 (liquid) | StakingRewardsV2 `0x6129…eB88` | 9,852 | $42.6k | **yes, open** (deadline 2026-11-15) | 794.5 KWENTA → 13,507.0 SNX |
| KWENTA escrow v1 (incl. staked escrow) | RewardEscrow `0x1066…5BE2` | 4,238 | $18.3k | no (entry-ID array) | vest(43 ids) → convert: 128.06 KWENTA → 2,177.1 SNX ✓ |
| KWENTA escrow v2 (ERC-721 entries) | RewardEscrowV2 `0xb2a2…4C56` | 10,096 | $43.7k | no (NFT / ID array) | vest(7 ids) → convert: 324.06 KWENTA → 5,509.1 SNX ✓ |
| KWENTA already locked, SNX not yet vested | Conversion `0x2023…eC8` | 333,386 **SNX** owed (228 addrs) | $84.8k | no (amount is in new-token units) | vest(): 67,894.4 SNX ✓ |
| KEEP delegated, direct owner | TokenStaking v1.3 `0x1293…5458` | 4.19M (25 delegations) | $110k | no (keyed by operator + 60-day undelegation) | undelegate → +60d → recoverStake → wrap: 700,000 KEEP → 3,348,232 T ✓ |
| KEEP delegated from grants | TokenStaking v1.3 + old `0x6D11…7600` | 9.72M | $254k | no (grant contracts) | recoverStake returns KEEP to TokenGrantStake ✓ |
| KEEP unlocked in token grants | TokenGrant `0x1759…88B7` | 32.06M withdrawable (224 grants) | $839k | no (grant ID; most grantees are ManagedGrant proxies) | withdraw(77) → wrap: 5,000,000 KEEP → 23,915,943 T ✓ |
| Old dQUICK (Dragon's Lair v1) | `0xf281…16B1` | 11,184 old QUICK (6,401 dQUICK) | $115k | no (share units) | leave → quickToQuickX: 51.46 dQUICK → 89.92 old QUICK → 89,917 QUICK ✓ |
| OGV staked (veOGV lockups) | OgvStaking `0x0C45…66D9` | 44.80M in lockups (816 users) | $82k | no (lockup-ID array) | unstake(ids) → migrate: 2,142,107 OGV (+302,384 OGV rewards) → 195,724 OGN ✓ |
| TRIBE rewards pending in TribalChief | `0x9e10…6f7f` | 137,582 TRIBE (101 user×pool) | $56k | no (view takes pid + user) | harvest → redeem: 5,585 TRIBE → 399.7 DAI + 0.70 stETH + 13.4 LQTY + 186.4 FOX ✓ |

✓ = the full exit and migration succeeds in simulation (live state, no overrides).

## Registry output: `data/registry.holdings-misc.json` (9 entries)

- `thales-escrowed-optimism`, `thales-escrowed-arbitrum`, `thales-escrowed-base`: `blocked`. Same style as the existing THALES staking entries.
- `knc-legacy-staked-kyberdao`: open.
- `nu-staked-to-t`: open.
- `rbn-verbn-to-aevo`: open.
- `gntb-to-glm`: open. GNTb is a wrapper token held in the wallet; the `holding` shape fits it exactly.
- `kwenta-staked-v1-optimism`, `kwenta-staked-v2-optimism`: open, with deadline 2026-11-15.

---

## 1. THALES EscrowThales (Optimism, Arbitrum, Base): blocked

**Contracts.** Optimism escrow `0xa25816b9…f056` is listed in `thales-markets/contracts-og/scripts/deployments.json`
as `EscrowThales`. For Arbitrum (`0x391a45F3…D50d`) and Base (`0x29dfc5fe…939A`), each escrow's `iStakingThales()` returns
the staking contract that's already in our registry, and each staking contract's `iEscrowThales()` returns that escrow.
`vestingToken()` is THALES on every chain. The source is `contracts/EscrowAndStaking/EscrowThales.sol`. The current
implementations aren't verified on the explorers, but `claimable`, `vest`, `totalAccountEscrowedAmount` and
`currentVestingPeriod` behave exactly as in that source.

**What happened.** On 2026-06-01, a Safe `execTransaction` on each chain upgraded the escrow proxy (`Upgraded` event),
then moved the whole THALES balance to the EOA `0x1777C6d588fd931751762836811529c0073D6376`:
- OP: 190,767.87 THALES, tx `0xec413675…2a01b`
- ARB: 49,029.54, tx `0x505dff5f…8aac`
- Base: 4,873.84, tx `0x60f88ea9…ae4d`

Those amounts equal `totalEscrowedRewards()`. Today the escrows hold 0.027, 0.316 and 0 THALES: only dust that
`startUnstake` still adds when it auto-claims rewards. A 0.0068 THALES `vest` succeeded on 2026-09-14, so `vest` itself
still works whenever the balance covers the amount. This drain is three days after the 2026-05-28 staking drain.

**The accounting stays with users.**
- `totalEscrowedRewards`: OP 190,767.9, ARB 49,029.9, Base 4,873.8. Total **244,672 THALES ≈ $52k**.
- `StakingThales.closePeriod` still runs weekly (last run 2026-09-28; periods OP 242, ARB 200, Base 158), so
  `currentVestingPeriod` keeps moving and not-yet-vested entries keep maturing into `claimable()`.

**Holders and simulations** (holding view = `claimable(address)`):
- OP `0x0F45156F…5D5A`, 83.99 THALES. Live: `vest` reverts "SafeERC20: low-level call failed". With the escrow's THALES
  balance slot overridden (THALES mapping slot 0), `vest` pays 83.99 and `migrateThalesToOver` pays 83.99 OVER.
- ARB `0x45BF64fC…7100`, 8,752.83 claimable. The same address also has 78,825 THALES stuck in unstaking. Live: same
  revert. With the slot overridden (slot 51): 8,752.83 → 8,752.83 OVER.
- Base `0xBb1e599e…cC4C`, 1,360.02. Live: same revert. With the slot overridden (slot 0): 1,360.02 → 1,360.02 OVER.

Even if the team refills the escrows, the OP migrator only holds ~83.6k OVER.

## 2. KNC legacy: old KyberDAO staking → works

- `KyberStaking` `0xECf0bdB7…aea3`: verified, Etherscan label "Kyber: Staking", `kncToken()` = KNCL.
- The current KyberSwap docs list a newer KyberStaking for KNC v2. This one is the legacy one.
- `withdraw(uint256)` has no lock or epoch restriction. It checks `stakerLatestData.stake >= amount` and transfers KNCL out.
- **Size:** 1,487 addresses still hold 712,590 KNCL; the contract holds 715,131. Largest stake 84,524 (EOA).
- **Result:** `withdraw` → `approve` → `mintWithOldKnc`: 84,524.40 KNCL → 84,524.40 KNC, with no reserve limit.

## 3. KEEP / NU

### NU: NuCypher StakingEscrow → works

- Dispatcher `0xbbD3C0C7…b2e2` → implementation `StakingEscrow` `0x939f82a1…5698` (solc 0.8.23, verified).
- The latest implementation removed sub-stakes and locks. `withdraw(uint256)` only requires `value >= amount`.
- `getAllTokens(address)` returns `stakerInfo.value`.
- **Size:** `getStakersLength()` = 2,155; 232 stakers still hold **27.30M NU (~$486k)**.
- The other ~2.50B NU in the contract is the unminted reward reserve, not user funds.
- **Results:**
  - `withdraw` → `approve` → `wrap` from EOA `0x15a7…4485`: 5,000,000 NU → 16,296,212 T.
  - Also OK from the largest staker `0x7fff…c934` (a contract, 6.99M NU).
  - Also OK from `0x0467…9ba0`, which has a T staking provider set (1.5M NU → 4,888,864 T).
- **Capacity:** the NU vending machine holds 629.3M T, worth 193.09M NU. NU outside the escrow and the machine is 165.8M;
  add these 27.3M stakes and you get 193.09M. It's fully covered.
- **Correction for `nu-to-t`:** its note ("~2.70B NU outside the machine … partially covered") counts the escrow's unminted
  reserve. The payout isn't actually short.

### KEEP: can exit, but the engine can't express it

- `TokenStaking` v1.3 `0x1293a54e…5458` holds 11.56M KEEP in 32 live delegations.
  - Old `TokenStaking` `0x6D1140a8…7600` holds 2.35M in 8 delegations.
  - `undelegationPeriod()` = 5,184,000 s (60 days) on both.
  - Positions are keyed by the **operator** address. `ownerOf(operator)` gives the owner, and there is no owner→operators view.
- **Direct stakes** (owner is an EOA or Safe): 4.19M KEEP in 25 delegations, 10 of them already undelegated.
  - Already undelegated: `recoverStake(op)` → `approve` → `wrap`. From owner `0x85f0…4658`: 317,133 KEEP → 1,516,907 T.
  - Not undelegated: `undelegate(op)`, wait 60 days, then `recoverStake`. From owner `0xdd08…2c93`: 700,000 KEEP → 3,348,232 T.
- **Grant-backed stakes** (owner is a `TokenGrantStake` contract): 7.37M (v1.3) + 2.35M (old) KEEP.
  - `recoverStake` returns the KEEP to the TokenGrantStake / TokenGrant (simulated: 1,000,000 KEEP back to `0xa031…3f68`).
  - The grantee then withdraws from TokenGrant.
- **TokenGrant** `0x175989c7…88B7`: 224 grants, **32.06M KEEP withdrawable now**, all fully unlocked.
  - Grantees are mostly `ManagedGrant` contracts. Their real owner is `ManagedGrant.grantee()`, who calls `ManagedGrant.withdraw()`.
  - Grant #77's grantee is an EOA: `withdraw(77)` → `wrap`: 5,000,000 KEEP → 23,915,943 T.

## 4. QUICK: old dQUICK (Dragon's Lair v1)

- `DragonLair` `0xf28164A4…16B1` (verified; `quick()` = old QUICK) holds 11,184.4 old QUICK against 6,401.3 dQUICK
  (1 dQUICK = 1.7472 old QUICK). That's about **$115k** after `quickToQuickX`.
- **No direct conversion exists.** The TokenSwap `0x3330…bf5a` only has `quickToQuickX`, and the new Lair has only `enter` and `leave`.
- **Exit:** `leave(dQuickShares)` → `approve` → `quickToQuickX(quickAmount)`.
  - EOA `0x7Ba7…3520`: 51.46 dQUICK → 89.92 old QUICK → 89,917 new QUICK.
- Can't be expressed: `leave` takes shares, while migration and display need old-QUICK units.
- **Time-sensitive:** reported rate cut after 2026-11-04; converter closes 2027-02-05. Holder lists are stale; the top live
  holders are mostly contracts (vaults).

## 5. KWENTA (Optimism). The deadline, 2026-11-15, matters most here

The existing `kwenta-to-snx-optimism` flow does **not** cover staked or escrowed KWENTA. `lockAndConvert()` only pulls
`KWENTA.balanceOf(msg.sender)`. Addresses come from docs.kwenta.io "Deployed Contracts".

- **Liquid stake (added):**
  - v1: `nonEscrowedBalanceOf` → `unstake(amount)`. No cooldown, not paused.
  - v2: same, plus a 7-day cooldown from the last stake; staking ended 2024-11-15, so everyone is past it.
  - Size: v1 2,395 + v2 9,852 = **12,247 KWENTA (~$53k)**.
  - The Staked-event scan found 467 / 354 holders; the contract balances are the better size figure.
- **Problem:** a holder who also has wallet KWENTA fails at `lockAndConvert` ("transfer amount exceeds allowance"),
  because the approve covers only `$amount`. Simulated with `0x0b0e…07e7` (830.9 staked + 52.1 in wallet). There's a
  warning on the entries; an engine fix is in point 6 below.
- **Escrowed:** RewardEscrow v1 holds 4,238 and RewardEscrowV2 holds 10,096 KWENTA (**~$62k**). Every entry is past
  its vesting end, so the early-vest fee is 0.
  - `vest(uint256[] ids)` auto-unstakes escrow that's still staked, then pays KWENTA.
  - The EscrowMigrator (v1→v2) isn't needed: v1 `vest` still works.
- **Locked but not vested:** 228 addresses have **333,386 SNX** `vestableAmount` in Conversion. `vest()` works (largest:
  67,894 SNX). After 2026-11-15, `withdrawSNX()` lets the treasury sweep the SNX.
- **Funding:** Conversion's SNX (1,058,529) equals owed SNX plus 17× all KWENTA not yet converted (42,656): it's fully funded.

## 6. Others in the registry

- **TRIBE:** TribalChief (proxy → TribalChief) is unpaused and holds 171,844 TRIBE.
  - Users' `pendingRewards(pid, user)` add up to 137,582 TRIBE across 101 user/pool pairs. The largest (85k, pool 0) is a contract.
  - `harvest(pid, to)` works, then `redeem` works (numbers in the summary table).
  - The staked tokens themselves are FEI-TRIBE LP: out of scope.
- **FEI:** no official staking.
- **OGV:** OgvStaking was upgraded so `unstake(uint256[] lockupIds)` ignores lock end.
  - 816 users hold 44.80M OGV in open lockups; the contract's 59.18M also includes the rewards pool.
  - Unstaking also pays collected OGV rewards.
  - The Migrator also has `migrate(uint256[] lockupIds, …)` straight to OGN staking.
- **GNT:** GNTb added (above). GNTDeposit holds only 151.8 GNTb.
- **RPL v1, ANT v1, MLN v1, ADX legacy, xDATA, MFT, GAL:** no official staking or escrow holds the legacy token.
  - Staking for these uses the new token, or never existed.
- **Covered by other reports:** veOCEAN and VELO v1 (`holdings-ve.md`), MKR (`holdings-mkr.md`).
- **Not covered:** Polygon MATIC staking.
- **NU WorkLock** (78,400 NU): residual bids. Not investigated further.

---

## Engine features needed (exact specs)

1. **ID-array positions**: KWENTA escrow v1/v2, OGV lockups. Add `holding.ids` (a view returning `uint256[]`), a
   `holding.amount` view that takes the ids, and a `$ids` placeholder encoded as a dynamic `uint256[]`.
   - **KWENTA v2:**
     - `n = RewardEscrowV2.balanceOf(user)` (ERC-721 count)
     - `ids = getAccountVestingEntryIDs(user, 0, n)`
     - `(amount, fee) = getVestingQuantity(ids)` (word0 = KWENTA received, word1 = fee; warn if fee > 0)
     - Steps: `vest($ids)` → approve → `lockAndConvert()` → `vest()`.
   - **KWENTA v1:**
     - `n = numVestingEntries(user)`
     - `ids = getAccountVestingEntryIDs(user, 0, n)`
     - `(amount, fee) = getVestingQuantity(user, ids)`
     - Steps: same as v2.
   - **OGV:**
     - No count view. Read `lockups(user, i)` for i = 0, 1, … until it reverts; keep the i where word0 (amount) > 0 (word1 = end).
     - `amount = Σ amount`. Unstake also pays rewards (`previewRewards(user)`).
     - Steps: `unstake($ids)` → approve `amount` → `Migrator.migrate(amount)`.
2. **Per-ID repeated steps**: KEEP TokenGrant.
   - `ids = getGrants(user)`; per id `withdrawable(id)`; the step `withdraw($id)` is repeated for each id; then `wrap(Σ)`.
   - ManagedGrant: see point 3.
3. **Positions keyed by another address**: KEEP TokenStaking, ManagedGrant.
   - **TokenStaking:** there's no on-chain owner→operator index. Ship a static map built from `StakeDelegated(owner indexed, operator indexed)` logs.
     - v1.3: 247 operators, 32 live. Old contract: `Staked(operator)`, 8 live.
     - Check `ownerOf(op) == user`.
     - `(amount, createdAt, undelegatedAt) = getDelegationInfo(op)`.
     - If `undelegatedAt == 0`: step `undelegate(op)`; it unlocks at now + 60 days.
     - Otherwise it unlocks at `undelegatedAt + undelegationPeriod()`, then `recoverStake(op)` → approve → `wrap`.
   - **Grant-backed operators** (owner is `TokenGrantStake`): the grantee calls `TokenGrant.undelegate(op)` / `TokenGrant.recoverStake(op)`, then `TokenGrant.withdraw(id)`.
   - **ManagedGrant:** index grantee = `ManagedGrant.grantee()`; the user calls `ManagedGrant.withdraw()`.
4. **"Unlocks on <date>"**: KEEP's 60-day undelegation. The UI needs a time taken from a view (`undelegatedAt + 5,184,000`), not `waitSeconds`.
5. **Share units**: dQUICK.
   - `holding.signature = QUICKBalance(address)` gives the old-QUICK amount for display and ratio.
   - A second `holding.exitSignature = balanceOf(address)` fills a `$shares` placeholder.
   - Steps: `leave($shares)` → approve `$amount` → `quickToQuickX($amount)`. Leave and approve must be in separate blocks,
     or `$amount` recomputed after leave; they're equal today because the share price is fixed.
6. **Approve = wallet + position**: KWENTA. Add a `$walletPlusAmount` placeholder
   (`oldToken.balanceOf(user) + $amount`) for approve steps before `lockAndConvert()`.
7. **Extra fixed args on the holding view**: TribalChief. `holding.args: [pid, "$user"]` for `pendingRewards(uint256,address)`,
   one entry per pid (pools 0–17). Steps: `harvest(pid, $user)` → approve → `redeem($user, $amount)`.
8. **Positions measured in new-token units**: Kwenta Conversion.
   - `holding.unit: "new"` so the card shows SNX and expected = `vestableAmount(user)`. Single step: `vest()`.
   - Time-critical: 333k SNX (≈$85k) is sweepable after 2026-11-15.
