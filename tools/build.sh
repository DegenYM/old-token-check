#!/bin/sh
# Build the public site into dist/ (only what visitors need; no dev files).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html style.css app.js config.js chains.js _headers og.png dist/
cp -R lib data dist/
# Inject the Alchemy key from .env (never committed) into the deployed config only
python3 - <<'PY'
import re, pathlib
env = pathlib.Path('.env')
key = ''
if env.exists():
    m = re.search(r'^\s*ALCHEMY_API\s*=\s*["\']?([A-Za-z0-9_-]+)', env.read_text(), re.M)
    key = m.group(1) if m else ''
cfg = pathlib.Path('dist/config.js')
cfg.write_text(cfg.read_text().replace("export const ALCHEMY_KEY = '';", f"export const ALCHEMY_KEY = '{key}';"))
print('Alchemy key:', 'injected' if key else 'not set (withdrawal check off)')
PY
echo "Built dist/ ($(find dist -type f | wc -l | tr -d ' ') files)"
