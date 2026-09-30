"""Render og.png (1200x630 share card) from data/stats.json with headless Chrome.
Usage: python3 tools/make_og.py"""
import json, os, subprocess, tempfile
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = json.load(open(os.path.join(root, "data/stats.json")))
usd = s["unmigratedUsd"]
# same count the site shows: every open path in the registry files the site loads (wallet + holdings)
files = json.load(open(os.path.join(root, "data/index.json")))
paths = sum(1 for f in files for e in json.load(open(os.path.join(root, "data", f))) if e.get("status", "open") == "open")
big = f"${usd/1e9:.1f}B" if usd >= 1e9 else f"${usd/1e6:.0f}M"
html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#0b0d13;color:#f2f4f7;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between;-webkit-font-smoothing:antialiased}}
.brand{{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:650;letter-spacing:-.01em}}
.brand svg{{color:#2dd4bf}}
.big{{font-size:150px;font-weight:750;letter-spacing:-.045em;line-height:.95;font-variant-numeric:tabular-nums}}
.label{{font-size:40px;font-weight:600;letter-spacing:-.02em;margin-top:18px}}
.sub{{font-size:27px;color:#b3bbc6;margin-top:14px}}
.row{{display:flex;justify-content:space-between;align-items:flex-end}}
.search{{display:flex;align-items:center;gap:14px;padding:14px 14px 14px 24px;background:#10151c;border:1px solid #1e242c;border-radius:18px;width:640px}}
.search .ph{{flex:1;font:500 22px ui-monospace,"SF Mono",Menlo,monospace;color:#8a94a1}}
.search .btn{{background:#eceff3;color:#0b0d13;font-weight:650;font-size:22px;padding:14px 26px;border-radius:12px}}
.meta{{text-align:right;color:#8a94a1;font-size:22px;line-height:1.5}}
.meta b{{color:#5eead4;font-weight:600}}
.pill{{display:inline-block;background:#0e2b29;color:#5eead4;font-weight:600;font-size:22px;padding:8px 18px;border-radius:999px;margin-left:18px;vertical-align:middle}}
</style></head><body>
<div class="brand"><svg viewBox="0 0 24 24" width="34" height="34"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M8 10.5h5m-2-2l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Old Token Check</div>
<div>
  <div class="big">{big}</div>
  <div class="label">in old tokens not yet migrated</div>
  <div class="sub">MATIC → POL · MKR → SKY · GNT → GLM · SAI → WETH · {paths} official paths</div>
</div>
<div class="row">
  <div class="search"><span class="ph">0x… your wallet address</span><span class="btn">Check</span></div>
  <div class="meta">Read-only · no wallet connection<br><b>oldtokencheck.com</b></div>
</div>
</body></html>"""
with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
    f.write(html); src = f.name
out = os.path.join(root, "og.png")
subprocess.run(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--headless=new", "--hide-scrollbars",
                "--force-device-scale-factor=1", "--window-size=1200,630", f"--screenshot={out}", f"file://{src}"],
               check=True, capture_output=True)
os.unlink(src)
print("wrote", out)

# Link previews (X, Telegram, Discord…) cache the image by URL: point the meta tags at a
# content-hashed URL so a redrawn card is fetched again instead of showing the old number
import hashlib, re
ver = hashlib.sha256(open(out, "rb").read()).hexdigest()[:8]
ip = os.path.join(root, "index.html")
page = open(ip).read()
page = re.sub(r'(https://oldtokencheck\.com/og\.png)(\?v=[0-9a-f]+)?', rf'\1?v={ver}', page)
page = re.sub(r'(<meta property="og:image:alt" content="Old Token Check: )\$[0-9.]+[MB]', rf'\g<1>{big}', page)
open(ip, "w").write(page)
print("og:image ->", f"og.png?v={ver}")
