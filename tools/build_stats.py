"""Build data/stats.json: headline numbers for the page, computed from chain state + DefiLlama prices.

unmigratedUsd = sum over open migration paths of
  min(outstanding old supply * ratio, payout reserve if the path pays from a reserve) * new-token price
where outstanding = totalSupply - balance(migrator) - balance(0x..dEaD) - balance(0x0).
Tokens that may be lost or locked in contracts are included, so this is "not yet migrated", not "claimable".
"""
import json, time, urllib.request, datetime
from fractions import Fraction

RPC = {1: "https://eth.drpc.org", 10: "https://optimism.drpc.org", 100: "https://gnosis.drpc.org",
       137: "https://polygon.drpc.org", 56: "https://bsc-rpc.publicnode.com", 42161: "https://arbitrum.drpc.org",
       8453: "https://base.drpc.org", 43114: "https://api.avax.network/ext/bc/C/rpc"}
LLAMA = {1: "ethereum", 10: "optimism", 100: "xdai", 137: "polygon", 56: "bsc", 42161: "arbitrum", 8453: "base", 43114: "avax"}
BURN = ["0x000000000000000000000000000000000000dEaD", "0x0000000000000000000000000000000000000000"]

def rpc(chain, method, params):
    for _ in range(4):
        try:
            req = urllib.request.Request(RPC[chain], data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                         headers={"content-type": "application/json", "user-agent": "curl/8"})
            r = json.load(urllib.request.urlopen(req, timeout=40))
            if "result" in r: return r["result"]
        except Exception: pass
        time.sleep(1.5)
    raise RuntimeError(f"rpc failed {chain} {method}")

def call_uint(chain, to, data):
    r = rpc(chain, "eth_call", [{"to": to, "data": data}, "latest"])
    return int(r, 16) if r and r != "0x" else 0

bal = lambda chain, tok, who: call_uint(chain, tok, "0x70a08231" + who[2:].lower().rjust(64, "0"))

entries = [e for f in ["registry.eth.json", "registry.multichain.json"] for e in json.load(open(f"data/{f}"))]
rejected = sum(len(json.load(open(f"data/{f}"))) for f in ["rejected.eth.json", "rejected.multichain.json"])

keys = sorted({f"{LLAMA[e['chainId']]}:{e['newToken']['address']}" for e in entries if e.get("newToken")})
prices = json.load(urllib.request.urlopen(urllib.request.Request(
    "https://coins.llama.fi/prices/current/" + ",".join(keys), headers={"user-agent": "curl/8"}), timeout=60))["coins"]
prices = {k.lower(): v["price"] for k, v in prices.items()}

total = 0.0; unpriced = []; rows = []
for e in entries:
    c = e["chainId"]; ot = e["oldToken"]; nt = e["newToken"]
    sup = call_uint(c, ot["address"], "0x18160ddd")
    out_old = sup - bal(c, ot["address"], e["migrator"]) - sum(bal(c, ot["address"], b) for b in BURN)
    out_old = max(out_old, 0)
    ratio = Fraction(e["ratio"]["num"]) / Fraction(e["ratio"]["den"])
    new_whole = Fraction(out_old, 10 ** ot["decimals"]) * ratio
    pr = e.get("payoutReserve")
    if pr and pr.get("holder"):
        reserve = Fraction(bal(c, nt["address"], pr["holder"]), 10 ** nt["decimals"])
        new_whole = min(new_whole, reserve)
    price = prices.get(f"{LLAMA[c]}:{nt['address']}".lower())
    if price is None: unpriced.append(e["id"]); continue
    usd = float(new_whole) * price
    total += usd; rows.append((e["id"], round(usd)))

head = int(rpc(1, "eth_blockNumber", []), 16)
stats = {
    "unmigratedUsd": round(total),
    "paths": len(entries),
    "chains": sorted({e["chainId"] for e in entries}),
    "rejected": rejected,
    "unpriced": unpriced,
    "asOf": datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d"),
    "ethBlock": head,
    "method": "Per path: min(outstanding old supply x ratio, payout reserve) x DefiLlama price. Outstanding = totalSupply minus migrator and burn-address balances.",
}
json.dump(stats, open("data/stats.json", "w"), indent=1)
print(json.dumps(stats, indent=1))
for r in sorted(rows, key=lambda x: -x[1])[:12]: print(f"  {r[0]:34} ${r[1]:,}")
