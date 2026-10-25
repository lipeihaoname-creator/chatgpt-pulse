#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
. ./scripts/env.sh
if ! command -v node >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "缺少项目构建工具，请参阅 README.md。" >&2
  exit 1
fi
node node_modules/@tauri-apps/cli/tauri.js build "$@"
