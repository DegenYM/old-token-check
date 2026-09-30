"""Render a KWENTA -> SNX deadline countdown card for X (2400x1350 PNG) from live Optimism data.
Usage: python3 tools/make_kwenta_card.py [--now 2026-11-01T12:00]   -> promo/kwenta-countdown-<days>d.png"""
import datetime as dt, json, os, subprocess, sys, tempfile, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RPCS = ["https://optimism-rpc.publicnode.com", "https://optimism.drpc.org"]
SNX = "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4"
KWENTA = "0x920Cf626a271321C151D027030D5d08aF699456b"
CONVERSION = "0x20231C8e25fc751bb72F795Fe58cCa6e45A75eC8"
HOLDINGS = [  # KWENTA a plain wallet check misses
    "0x6e56A5D49F775BA08041e28030bc7826b13489e0",  # StakingRewards v1
    "0x61294940CE7cD1BDA10e349adC5B538B722CeB88",  # StakingRewards v2
    "0x1066A8eB3d90Af0Ad3F89839b974658577e75BE2",  # RewardEscrow v1
    "0xb2A20fCdc506a685122847b21E34536359E94C56",  # RewardEscrow v2
]
RATIO = 17
OPEN = dt.datetime(2024, 11, 15, tzinfo=dt.timezone.utc)      # Conversion.VESTING_START_TIME
DEADLINE = dt.datetime(2026, 11, 15, tzinfo=dt.timezone.utc)  # + WITHDRAW_START: treasury may sweep


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
    return int(rpc("eth_call", [{"to": to, "data": data}, "latest"]), 16) / 1e18


bal = lambda token, who: call(token, "0x70a08231" + who[2:].lower().rjust(64, "0"))

now = dt.datetime.now(dt.timezone.utc)
if "--now" in sys.argv:
    now = dt.datetime.fromisoformat(sys.argv[sys.argv.index("--now") + 1]).replace(tzinfo=dt.timezone.utc)
days = (DEADLINE - now).days
if days < 0:
    raise SystemExit("The deadline has passed.")

supply = call(KWENTA, "0x18160ddd")
unconverted = supply - bal(KWENTA, CONVERSION)
owed = bal(SNX, CONVERSION) - RATIO * unconverted            # converted, not yet claimed
in_contracts = sum(bal(KWENTA, a) for a in HOLDINGS)
price = json.load(urllib.request.urlopen(urllib.request.Request(
    f"https://coins.llama.fi/prices/current/optimism:{SNX}", headers={"user-agent": "oldtokencheck"}), timeout=30))["coins"][f"optimism:{SNX}"]["price"]
usd_owed, usd_unconv = owed * price, unconverted * RATIO * price
total = usd_owed + usd_unconv

k = lambda v: f"{v/1e3:,.0f}K" if v >= 1e5 else f"{v/1e3:,.1f}K"
usd = lambda v: f"${v/1e3:,.0f}K"
elapsed = (now - OPEN) / (DEADLINE - OPEN)
print(f"{days} days · owed {owed:,.0f} SNX · unconverted {unconverted:,.0f} KWENTA ({in_contracts:,.0f} in staking/escrow) · SNX ${price:.4f} · total {usd(total)}")

html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:675px;background:#0b0d13;color:#f2f4f7;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  padding:52px 64px 50px;display:flex;flex-direction:column;justify-content:space-between;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}}
.top{{display:flex;justify-content:space-between;align-items:center}}
.brand{{display:flex;align-items:center;gap:12px;font-size:25px;font-weight:650;letter-spacing:-.01em}}
.brand svg{{color:#2dd4bf}}
.tag{{font-size:20px;font-weight:600;color:#b3bbc6;border:1px solid #2a313b;border-radius:999px;padding:8px 18px}}
.hero{{display:flex;align-items:flex-end;gap:44px}}
.days{{display:flex;align-items:baseline;gap:14px}}
.days b{{font-size:168px;font-weight:760;letter-spacing:-.05em;line-height:.8;color:#f3b75f}}
.days span{{font-size:34px;font-weight:650;color:#f3b75f;line-height:1.1}}
.head{{padding-bottom:6px}}
.head h1{{font-size:46px;font-weight:700;letter-spacing:-.025em;line-height:1.08}}
.head p{{margin-top:12px;font-size:23px;color:#b3bbc6;line-height:1.4}}
.rows{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.cell{{background:#10151c;border:1px solid #1e242c;border-radius:18px;padding:20px 24px}}
.cell .n{{font-size:34px;font-weight:700;letter-spacing:-.02em}}
.cell .n small{{font-size:21px;font-weight:600;color:#8a94a1;margin-left:10px;letter-spacing:0}}
.cell .d{{margin-top:6px;font-size:20px;color:#b3bbc6;line-height:1.4}}
.line{{position:relative;height:8px;border-radius:99px;background:#1e242c;margin-top:4px}}
.line i{{position:absolute;left:0;top:0;bottom:0;width:{elapsed*100:.2f}%;border-radius:99px;background:#2a313b}}
.line em{{position:absolute;left:{elapsed*100:.2f}%;right:0;top:0;bottom:0;border-radius:0 99px 99px 0;background:#f3b75f}}
.ends{{display:flex;justify-content:space-between;margin-top:12px;font-size:19px;color:#8a94a1}}
.ends b{{color:#f2f4f7;font-weight:600}}
.foot{{display:flex;justify-content:space-between;align-items:center;font-size:21px;color:#8a94a1}}
.foot b{{color:#5eead4;font-weight:650;font-size:24px}}
</style></head><body>
<div class="top">
  <div class="brand"><svg viewBox="0 0 24 24" width="30" height="30"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 10.5h5m-2-2l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Old Token Check</div>
  <div class="tag">KWENTA → SNX · Optimism</div>
</div>
<div class="hero">
  <div class="days"><b>{days}</b><span>day{'' if days == 1 else 's'}<br>left</span></div>
  <div class="head">
    <h1>~{usd(total)} of SNX still<br>waiting for KWENTA holders</h1>
    <p>At zero, the Synthetix treasury can sweep what's left.</p>
  </div>
</div>
<div class="rows">
  <div class="cell"><div class="n">{k(owed)} SNX<small>≈ {usd(usd_owed)}</small></div><div class="d">Converted, never claimed. One vest() call away.</div></div>
  <div class="cell"><div class="n">{k(unconverted)} KWENTA<small>≈ {usd(usd_unconv)} as SNX</small></div><div class="d">Never converted. {k(in_contracts)} of it is staked or in escrow.</div></div>
</div>
<div>
  <div class="line"><i></i><em></em></div>
  <div class="ends"><span>Conversion opened · Nov 15, 2024</span><span><b>Sweep allowed · Nov 15, 2026 00:00 UTC</b></span></div>
</div>
<div class="foot"><span>Check any address · read-only, no wallet connection</span><b>oldtokencheck.com</b></div>
</body></html>"""

os.makedirs(os.path.join(root, "promo"), exist_ok=True)
out = os.path.join(root, "promo", f"kwenta-countdown-{days}d.png")
with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
    f.write(html)
    src = f.name
subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--hide-scrollbars",
                "--force-device-scale-factor=2", "--window-size=1200,675", f"--screenshot={out}", f"file://{src}"],
               check=True, capture_output=True)
os.unlink(src)
print("wrote", out)
