#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
. ./scripts/env.sh
mkdir -p test-results
node --input-type=module -e 'import fs from "node:fs"; fs.writeFileSync("test-results/music-preview.conf.json",JSON.stringify({productName:"ChatGPT Pulse",identifier:"io.github.chatgptpulse.musicpreview",bundle:{targets:["app"]}}))'
# Keep the music candidate identity stable so its settings and consent survive the restored display name.
node node_modules/@tauri-apps/cli/tauri.js build --target universal-apple-darwin --bundles app --config test-results/music-preview.conf.json "$@"
