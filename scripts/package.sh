#!/bin/sh
# Build the Chrome Web Store upload: only the files the extension needs at
# runtime (no tests, scripts or store assets). Output: dist/<name>-<version>.zip
set -eu
cd "$(dirname "$0")/.."

version=$(node -p 'require("./manifest.json").version')
out="dist/cumulative-elevation-for-strava-$version.zip"

# Every file the manifest references must exist, or the store rejects it.
node -e '
const m = require("./manifest.json");
const fs = require("fs");
const files = [...Object.values(m.icons), ...m.content_scripts.flatMap((c) => c.js)];
const missing = files.filter((f) => !fs.existsSync(f));
if (missing.length) { console.error("missing:", missing.join(", ")); process.exit(1); }
'

mkdir -p dist
rm -f "$out"
zip -q -r -X "$out" manifest.json src icons -x '*.DS_Store'
echo "$out"
unzip -l "$out" | tail -n +4 | sed '$d' | sed '$d'
