#!/bin/sh
# Source from project root. Normal developer toolchains work without .tools.
if [ -d "$PWD/.tools/rustup/toolchains" ]; then
  export CARGO_HOME="$PWD/.tools/cargo"
  export RUSTUP_HOME="$PWD/.tools/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
if [ -d "$PWD/.tools/bin" ]; then
  export PATH="$PWD/.tools/bin:$PATH"
  export PNPM_HOME="$PWD/.tools/pnpm-home"
  export npm_config_state_dir="$PWD/.tools/pnpm-state"
fi
