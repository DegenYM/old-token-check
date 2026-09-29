#!/bin/sh
# Build the public site into dist/ (only what visitors need; no dev files).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html style.css app.js config.js chains.js _headers og.png dist/
cp -R lib data dist/
echo "Built dist/ ($(find dist -type f | wc -l | tr -d ' ') files)"
