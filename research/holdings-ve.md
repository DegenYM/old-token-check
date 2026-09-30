# Vote-escrowed old tokens: VELO v1 veNFTs (Optimism) and veOCEAN (Ethereum)

Researched 2026-09-30. Optimism base block 157,570,832 (ts 1790740441); Ethereum base block 26,087,755.
All sims: `eth_simulateV1`, `traceTransfers: true`, `validation: false`, time pinned on every block.
Prices (DefiLlama, today): VELO v1 = VELO v2 = $0.0345; OCEAN $0.158; FET $0.220.

## Summary

| Position | Old token locked | ≈USD | Share already unlocked | Exit works today? | Simulated result |
|---|---|---|---|---|---|
| Velodrome v1 veNFTs, user-owned (excl. SinkManager and Beefy) | 2,875,837 VELO v1 in 9,368 NFTs | ~$99k | **79%** (2,279,195 in 7,113 NFTs, 4,925 owners) | Yes. Expired: `withdraw` → `convertVELO`. Unexpired: `convertVe` → v2 veNFT with the same end date | 41,274.37 VELO v1 → 41,274.37 VELO v2 (1:1). Unexpired: 104,680.94 v1 veNFT → v2 veNFT #34374 with the same amount and end |
| Beefy beVELO veNFT #11346 (protocol wrapper) | 26,948,728 VELO v1 | ~$930k | 0% (ends 2028-01-27) | Only Beefy can act. Out of scope | not simulated |
| SinkManager veNFT #26637 (protocol-owned sink) | 1,717,623,245 VELO v1 | n/a | n/a (it's the converted supply) | n/a. Not user funds | n/a |
| veOCEAN locks | 26,572,646 OCEAN in 386 locks | ~$4.2M (≈$2.5M as FET) | **4.3%** (1,136,715 OCEAN, 120 locks) | Yes for expired locks: `withdraw()` → `migrateTokens` | 209,528 OCEAN → 90,772.98 FET (0.433226) |

**Registry output:** one entry, `veocean-locked-to-fet`, in `data/registry.holdings-ve.json`. It fits the
current holding shape: `locked(address)` takes one address and returns the amount as word 0. The engine
can't express VELO v1 veNFTs because they're NFT positions (spec below).

---

## 1. Velodrome v1 VotingEscrow (Optimism)

Contracts. All have code, and all are tagged "Velodrome Finance" on the Optimism explorer. The v2 SinkManager returns the same addresses on-chain:
- VotingEscrow v1 (veNFT): `0x9c7305eb78a432ced5C4D14Cac27E8Ed569A2e26` (`SinkManager.ve()`)
- Voter v1: `0x09236cff45047dbee6b921e00704bed6d6b8cf7e` (`SinkManager.voter()`)
- RewardsDistributor v1: `0x5d5Bea9f0Fc13d967511668a60a3369fD53F784F` (`SinkManager.rewardsDistributor()`)
- SinkManager (v2 converter): `0x5aeE5F0E6C2055EbD776DB25F48f6c9A68ABcdaE`. `ownedTokenId()` = 26637; `veV2()` = `0xFAf8FD17D9840595845582fCB047DF13f006787d`
- Source: github.com/velodrome-finance/contracts `v2-optimism` → `contracts/v1/sink/SinkManager.sol`

### How much is locked
I enumerated every token ID from 1 to 26,905 (the highest ID with `user_point_epoch > 0`) with Multicall3: `locked`, `ownerOf`, `voted` and `attachments`.
The sum of all `locked(id).amount` values is 1,747,447,810 VELO v1. That exactly equals `VELO_v1.balanceOf(VE)`, so the enumeration is complete.
(`VE.supply()` reports 2.57B. That figure is inflated by the known Solidly `merge` bug, which never subtracts from `supply`, so don't use it.)

| Holder | VELO v1 |
|---|---|
| SinkManager veNFT #26637 (all converted v1, relocked to 2030-09-19) | 1,717,623,245 |
| Beefy "beVELO" (`0xfdeffc7a…c265`, contract) NFT #11346, end 2028-01-27, voted | 26,948,728 |
| All other veNFTs (9,368 NFTs) | 2,875,837 |

Lock-end distribution for the 2,875,837 VELO v1 in other veNFTs:
- already expired: 2,279,195 (79.3%). Of this, 1,320,874 has `voted=true` and 235,381 is attached to a gauge.
- 2026 H2: 176,212 · 2027 H1: 404,875 · 2027 H2: 12,478 · 2028 H1: ~1,800 · later: ~1,300

### Exit paths (all simulated)
1. **Expired, not voted, not attached**: holder `0x12311fe6…446e`, NFT #10216 (41,274.37 VELO, ended 2026-08-19).
   `VE.withdraw(10216)` → `VELOv1.approve(SinkManager, amt)` → `SinkManager.convertVELO(amt)`.
   Result: 41,274.371721387369181590 VELO v1 in → the same amount of VELO v2 minted to the holder. ✅
2. **Expired + voted**: holder `0x9609bab9…eefb7`, NFT #6220 (37,653.33 VELO). `withdraw` alone reverts with `attached`.
   `Voter.reset(6220)` → `withdraw` → approve → `convertVELO`. All succeed: 37,653.33 VELO v2 out. ✅
   (`reset` has an `onlyNewEpoch` guard. It fails only if the NFT voted in the current epoch, which is irrelevant for dormant v1 NFTs.)
3. **Expired + attached to a gauge**: holder `0xecca5382…a9020`, NFT #4764 (45,956.95 VELO), attached in gauge `0x0299d40e…214c`.
   `Gauge.withdrawToken(0, 4764)` (detaches without moving LP) → `Voter.reset` → `withdraw` → approve → `convertVELO`. Result: 45,956.95 VELO v2 out. ✅
4. **Unexpired: convert the veNFT today**: holder `0xe16c0e1b…ccd`, NFT #16117 (104,680.94 VELO, ends 2027-01-21, voted).
   `Voter.reset(16117)` → `VE.approve(SinkManager, 16117)` → `SinkManager.convertVe(16117)`. This returns v2 veNFT #34374, and `veV2.locked(34374)` shows the same amount and end 1800489600 (same as v1).
   A later block pinned at end+60s ran `veV2.withdraw(34374)` → 104,680.94 VELO v2 to the holder. ✅
   Without `reset`: `convertVe` reverts `attached`. On an expired NFT, `convertVe` reverts `0xf7b679fe` (`NFTExpired()`).
5. **Unexpired: wait in v1 (time override)**: same NFT. `reset` now, then in a block pinned to end+60s: `withdraw` → approve → `convertVELO`. Result: 104,680.94 VELO v2. ✅
   A 113-day time jump simulates fine. Today, `withdraw` reverts `The lock didn't expire`.

**Is veNFT v1→v2 conversion shipped and open?** Yes. The Velodrome v2 announcement (paragraph.com/@velodrome/v2) says v1 veNFTs convert "with the same vesting time and underlying locked token balance."
The code has no deadline and no pause. The only guards are `ownedTokenId != 0`, not already converted, approval, and not expired.

### Rebases (v1 RewardsDistributor): trap for expired locks
- `RD.claimable(id)` over all user NFTs: Beefy 1,233,889; unexpired user NFTs 59,579; expired user NFTs 164,851.
- For **expired** NFTs, `claim(id)` reverts `Cannot add to expired lock. Withdraw`, because v1 RD deposits into the lock. That ~165k VELO v1 (~$5.7k) is permanently stuck. Simulated on #10216, which has 5,378 claimable.
- For **unexpired** NFTs, `claim(id)` works and adds to the lock (simulated on #16117: +10,809 VELO into the lock). Claim **before** `convertVe` or expiry, or the rebase is lost.
- RD holds 239,972,342 VELO v1 in total (`token_last_balance`), but per-NFT `claimable` only accounts for ~1.46M. The rest isn't attributable to users through the view. It's the sink/protocol's backlog.

### Other VELO v1 belonging to users (not engine-expressible today)
- 401 v1 gauges (excl. sink gauge `0x987E…95d6`) hold 2,788,876 VELO v1 as unclaimed/streaming LP rewards. Claim: `Gauge.getReward(user, [VELOv1])`. View: `earned(VELOv1, user)`, which takes two arguments.
- v1 internal/external bribes hold 103,264 VELO v1 (claimable per tokenId via `getReward(tokenId, tokens[])`).
- Voter v1 holds 52,849 (undistributed).

---

## 2. veOCEAN (Ethereum)

- veOCEAN: `0xE86Bf3B0D3a20444DE7c78932ACe6e5EfFE92379`. Verified Vyper `VotingEscrow`, Curve-style (one lock per address), `token()` = OCEAN. `transfersEnabled()` is irrelevant.
- Ocean docs (docs.oceanprotocol.com/data-farming): veOCEAN, Passive DF and Active DF were retired **3 May 2024**. Holders got an airdrop, and locked OCEAN "unlock[s] according to its schedule (up to 4 years)". Holders claim the airdrop and past rewards at df.oceandao.org/rewards.
- ASI docs/FAQ say nothing specific about veOCEAN. Ocean Protocol Foundation left the alliance on 2025-10-09. The OCEAN→FET migrator `0x664D…E663` (existing `ocean-to-fet` entry) is still unpaused.

### How much is locked
I collected 2,135 `Deposit` logs from Blockscout, giving 1,100 providers, then read `locked(address)` for each.
Result: 386 non-zero locks = **26,572,646 OCEAN**. That equals both `supply()` and `OCEAN.balanceOf(veOCEAN)` exactly.
- expired: 1,136,715 OCEAN (4.3%, 120 locks)
- 2026 Q4: 1,066,072 · 2027 Q1: 846,454 · Q2: 101,184 · Q3: 507,473 · Q4: 2,761,568 · **2028 Q1: 20,153,180** (the last lock ends 2028-03-23)
- Largest: `0xa7d4…9da3` 5.77M, `0xc1b8…5f63` 2.71M and `0xac51…03f9` 2.71M (all end 2028-02-10, all EOAs).

### Exit (simulated)
- Expired: holder `0xa911ccf5…c8fae5` (EOA, 209,528 OCEAN, ended 2026-07-30). `veOCEAN.withdraw()` → `OCEAN.approve(migrator)` → `migrateTokens(209528e18)`.
  Result: 209,528 OCEAN → 0xdead, and **90,772.977328 FET** to the holder. ✅
- Unexpired: `0xc1b8…5f63` (2,714,573 OCEAN, end 2028-02-10). `withdraw()` today reverts `The lock didn't expire`.
  With a block pinned to end+60s (a ~497-day jump), the same three steps give **1,176,023.6 FET**. ✅
- **Capacity:** the migrator holds 5,595,726 FET, which covers ~12.9M OCEAN. That's less than half of what's locked in veOCEAN. The first-come-first-served warning applies even more strongly here.
- Value note: 0.433226 FET × $0.22 ≈ $0.095 per OCEAN, versus OCEAN's market price of ~$0.158. Migrating currently loses value versus selling OCEAN, if a market exists for the user.

### Other OCEAN belonging to users
- veOCEAN FeeDistributor `0x256c54219816603BB8327F9019533B020a76e936` (Curve Vyper; `is_killed()=false`) holds 43,870 OCEAN.
  Simulating `claim(address)` for all 1,100 ever-lockers pays out 36,205 OCEAN across 524 addresses. `claim(address)` works for expired and unexpired alike, and anyone can call it for the user.
- DFRewards `0xFe27534EA0c016634b2DaA97Ae3eF43fEe71EEB0` holds 321,205 OCEAN. All of it is `claimable(user, OCEAN)` by 193 ve-depositors (DF rewards and the retirement airdrop). Claim: `claimFor(user, OCEAN)`, callable by anyone.
- Neither can go in the registry today: DFRewards' view takes two arguments, and FeeDistributor has no view (`claim(address)` only returns the amount via `eth_call`).

---

## 3. The registry entry I added (and its caveat)

`veocean-locked-to-fet`: holding `{contract: veOCEAN, signature: "locked(address)", label: "locked in veOCEAN"}`, then steps `withdraw()` → approve → `migrateTokens($amount)`. It reuses `statusCheck` and `payoutReserve` from `ocean-to-fet`.
Caveat: 96% of the locked OCEAN is unexpired. Those users will see **"Simulation failed: The lock didn't expire"** (bad tone) until their date. A `warn` note explains this.
Drop the entry if you'd rather wait for the unlock-date feature below. With that feature it becomes a clean "Unlocks on <date>" card.

---

## 4. Engine spec needed

### A. Unlock-time concept (serves both)
Add an optional `holding.unlock` to the holding:
```json
"unlock": { "signature": "locked(address)", "word": 1 }          // veOCEAN: end = word 1 of the same call
"unlock": { "signature": "locked__end(address)", "word": 0 }     // equivalent
```
Engine behaviour:
- If `end > now`, status is `locked-until` with the text "Unlocks on <date>". The engine then simulates the steps in a block with `blockOverrides.time = end + 60`, pinned on every block. This proves the path works at unlock (both chains handled 100–500-day jumps fine).
- If `end <= now`, it simulates normally.
- Payout-reserve checks still apply at simulation time.

### B. NFT positions (VELO v1 veNFT)
```json
"holding": {
  "type": "erc721-ve",
  "contract": "0x9c7305eb78a432ced5C4D14Cac27E8Ed569A2e26",
  "label": "locked in a v1 veNFT"
}
```
**Enumerate the user's NFTs:**
1. `balanceOf(user)` → n
2. `tokenOfOwnerByIndex(user, i)` for i < n. The Solidly/Velodrome v1 VE source has this function, but I didn't get to call it live (tooling hiccup), so confirm it on-chain. As a fallback, index `Transfer` events.

**Per tokenId, read:**
- `locked(tokenId)` → `(int128 amount, uint256 end)`. `amount` is raw VELO v1; `end` is the unix unlock time.
- `voted(tokenId)` (bool) → adds a reset step.
- `attachments(tokenId)` (uint) → adds a detach step. To find the gauge, loop `Voter.length()`, then `pools(i)` → `gauges(pool)` → `gauge.tokenIds(user) == tokenId`: 402 gauges, 3 multicalls. Or ship a static gauge list.
- `RewardsDistributor.claimable(tokenId)` → rebases to claim first (only when unexpired).

**One card per tokenId**, with `$tokenId` and `$amount` placeholders. Steps are conditional:
- **Expired:**
  - [if attached] `Gauge.withdrawToken(0, $tokenId)`
  - [if voted] `Voter(0x09236c…).reset($tokenId)`
  - `VE.withdraw($tokenId)`
  - approve VELO v1 → SinkManager
  - `SinkManager.convertVELO($amount)`

  The output is liquid VELO v2 at 1:1. The unclaimed rebase is lost (it can't be claimed on an expired lock); show it as an info note.
- **Unexpired:** offer two options.
  - **(a) Convert now:**
    - [if RD.claimable > 0] `RD(0x5d5B…).claim($tokenId)`
    - [if attached] detach
    - [if voted] `reset`
    - `VE.approve(SinkManager, $tokenId)`
    - `SinkManager.convertVe($tokenId)`

    The output is a v2 veNFT, not liquid VELO. The simulation's success check must look for an ERC-721 Transfer of veV2 `0xFAf8…787d` to the user (or read the `convertVe` return value) instead of an ERC-20 inflow. Optionally add a second pinned block at `end+60` with `veV2.withdraw(newId)` to show the final VELO v2.
  - **(b) Wait:** "Unlocks on <end>". Simulate `reset` now, then in a block at end+60: `withdraw` → `convertVELO`.

**Needs a new signature arg type:** `$tokenId`, plus conditional steps (`"if": "voted" | "attached" | "claimable"`).

### C. Also useful (lower value)
- **Two-argument holding views** (`earned(token, user)`, `claimable(user, token)`): these unlock v1 gauge rewards (2.79M VELO v1 across 401 gauges, ~$96k) and DFRewards (321k OCEAN, ~$51k).
- **"Claim-as-view" holdings** (non-view `claim(address)` read via `eth_call`): these unlock the veOCEAN FeeDistributor (36k OCEAN).

## Rejected / not listed
- Beefy beVELO (26.9M VELO v1 in veNFT #11346): Beefy owns the lock, and users hold beVELO. There's no official path for a user.
- VELO v1 rebases on expired veNFTs (~165k): permanently unclaimable. `claim` reverts `Cannot add to expired lock`.
- SinkManager veNFT and RD backlog: protocol-owned, not user funds.
