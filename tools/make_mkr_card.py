"""Render the "forgotten MKR" card for X (2400x1350 PNG) from live Ethereum data.
Usage: python3 tools/make_mkr_card.py   -> promo/mkr-forgotten.png (and prints the figures)"""
import json, os, subprocess, tempfile, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPCS = ["https://eth.drpc.org", "https://ethereum-rpc.publicnode.com"]
MKR = "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2"
OLD_MKR = "0xC66eA802717bFb9833400264Dd12c2bCeAa34a6d"
REDEEMER = "0x642AE78FAfBB8032Da552D619aD43F1D81E4DD7C"
MKR_SKY = "0xA1Ea1bA18E88C381C724a75F23a130420C403f9a"
GOVERNANCE = [  # retired MKR-era chiefs (direct locks, vote proxies, vote delegates) and LockStake v1
    "0x8E2a84D6adE1E7ffFEe039A35EF5F19F13057152",
    "0x9eF05f7F6deB616fd37aC3c959a2dDD25A54E4F5",
    "0x0a3f6849f78076aefaDf113F5BED87720274dDC0",
    "0x2b16C07D5fD5cC701a0a871eae2aad6DA5fc8f12",
]
AAVE = ["0xc713e5E149D5D0715DcD1c156a020976e7E56B88", "0x8A458A9dc9048e005d22849F470891b840296619"]
UNI_V2 = "0xC2aDdA861F89bBB333c90c492cB837741916A225"
BURN = ["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dEaD"]


def rpc(method, params):
    for url in RPCS:
        try:
            req = urllib.request.Request(url, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
                                         headers={"content-type": "application/json", "user-agent": "oldtokencheck"})
            r = json.load(urllib.request.urlopen(req, timeout=30))
            if "result" in r:
                return r["result"]
        except Exception:
            pass
    raise SystemExit(f"RPC failed: {method}")


def call(to, data):
    return int(rpc("eth_call", [{"to": to, "data": data}, "latest"]), 16)


def bal(token, who):
    return call(token, "0x70a08231" + who[2:].lower().rjust(64, "0")) / 1e18


old = call(OLD_MKR, "0x18160ddd") / 1e18 - bal(OLD_MKR, REDEEMER) - sum(bal(OLD_MKR, a) for a in BURN)  # never redeemed
gov = sum(bal(MKR, a) for a in GOVERNANCE)
aave = sum(bal(MKR, a) for a in AAVE)
lp = bal(MKR, UNI_V2)
supply = call(MKR, "0x18160ddd") / 1e18
fee = call(MKR_SKY, "0xddca3f43") / 1e18          # fee()
rate = call(MKR_SKY, "0x2c4e722e")                 # rate(): SKY per MKR before the fee
price = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://coins.llama.fi/prices/current/ethereum:{MKR}", headers={"user-agent": "oldtokencheck"}), timeout=30))["coins"][f"ethereum:{MKR}"]["price"]
total = old + gov + aave + lp
sky_per_mkr = rate * (1 - fee)

def usd(v):
    v *= price
    return f"${v/1e6:.1f}M" if v >= 1e6 else f"${v/1e3:,.0f}K"

n = lambda v: f"{v:,.0f}"
print(f"old {old:,.2f} | governance {gov:,.2f} | Aave {aave:,.2f} | Uniswap v2 {lp:,.2f} | total {total:,.0f} MKR = {usd(total)} "
      f"({total / supply * 100:.1f}% of supply) | MKR ${price:,.2f} | {sky_per_mkr:,.0f} SKY per MKR ({fee * 100:.0f}% fee)")

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:675px;background:#0b0d13;color:#f2f4f7;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  padding:52px 64px 50px;display:flex;flex-direction:column;justify-content:space-between;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}}
.top{{display:flex;justify-content:space-between;align-items:center}}
.brand{{display:flex;align-items:center;gap:12px;font-size:25px;font-weight:650;letter-spacing:-.01em}}
.brand svg{{color:#2dd4bf}}
.tag{{font-size:20px;font-weight:600;color:#b3bbc6;border:1px solid #2a313b;border-radius:999px;padding:8px 18px}}
.hero h1{{font-size:112px;font-weight:760;letter-spacing:-.045em;line-height:.95}}
.hero h1 small{{font-size:44px;font-weight:700;letter-spacing:-.02em;color:#b3bbc6;margin-left:18px}}
.hero p{{margin-top:16px;font-size:30px;font-weight:600;letter-spacing:-.015em;line-height:1.25}}
.hero p span{{color:#b3bbc6;font-weight:500}}
.rows{{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}}
.cell{{background:#10151c;border:1px solid #1e242c;border-radius:16px;padding:16px 22px;display:flex;align-items:baseline;gap:14px}}
.cell .n{{font-size:30px;font-weight:700;letter-spacing:-.02em;white-space:nowrap}}
.cell .n small{{font-size:19px;font-weight:600;color:#8a94a1;margin-left:8px;letter-spacing:0}}
.cell .d{{font-size:19px;color:#b3bbc6;line-height:1.3}}
.foot{{display:flex;justify-content:space-between;align-items:center;font-size:21px;color:#8a94a1}}
.foot b{{color:#5eead4;font-weight:650;font-size:24px}}
</style></head><body>
<div class="top">
  <div class="brand"><svg viewBox="0 0 24 24" width="30" height="30"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 10.5h5m-2-2l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Old Token Check</div>
  <div class="tag">MKR → SKY · Ethereum</div>
</div>
<div class="hero">
  <h1>{n(total)} MKR<small>≈ {usd(total)}</small></h1>
  <p>sitting where most holders forgot it <span>· {total / supply * 100:.0f}% of all MKR</span></p>
</div>
<div class="rows">
  <div class="cell"><div class="n">{n(old)}<small>{usd(old)}</small></div><div class="d">Original MKR token (before Nov 2017), never redeemed</div></div>
  <div class="cell"><div class="n">{n(gov)}<small>{usd(gov)}</small></div><div class="d">Locked in retired Maker governance contracts</div></div>
  <div class="cell"><div class="n">{n(lp)}<small>{usd(lp)}</small></div><div class="d">In old Uniswap v2 MKR/ETH positions</div></div>
  <div class="cell"><div class="n">{n(aave)}<small>{usd(aave)}</small></div><div class="d">Supplied on Aave, never upgraded</div></div>
</div>
<div class="foot"><span>Each path simulated from your address · read-only, no wallet connection</span><b>oldtokencheck.com</b></div>
</body></html>"""

os.makedirs(os.path.join(root, "promo"), exist_ok=True)
out = os.path.join(root, "promo", "mkr-forgotten.png")
with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
    f.write(html)
    src = f.name
subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--hide-scrollbars",
                "--force-device-scale-factor=2", "--window-size=1200,675", f"--screenshot={out}", f"file://{src}"],
               check=True, capture_output=True)
os.unlink(src)
print("wrote", out)
