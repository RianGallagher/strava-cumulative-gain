#!/bin/sh
# Build the Chrome Web Store upload: only the files the extension needs at
# runtime (the manifest, the bundle and the icons; no sources, tests, scripts
# or store assets). Output: dist/<name>-<version>.zip
set -eu
cd "$(dirname "$0")/.."

npm run check
# A clean build, so nothing stale ends up in the zip.
rm -rf build
npm run build

version=$(node -p 'require("./manifest.json").version')
out="dist/cumulative-elevation-for-strava-$version.zip"

# Every file the manifest references must exist, or the store rejects it.
node -e '
const manifest = require("./manifest.json");
const fileSystem = require("fs");
const files = [...Object.values(manifest.icons), ...manifest.content_scripts.flatMap((script) => script.js)];
const missing = files.filter((file) => !fileSystem.existsSync(file));
if (missing.length) { console.error("missing:", missing.join(", ")); process.exit(1); }
'

mkdir -p dist
rm -f "$out"
zip -q -r -D -X "$out" manifest.json build icons -x '*.DS_Store'
echo "$out"
unzip -l "$out" | tail -n +4 | sed '$d' | sed '$d'
