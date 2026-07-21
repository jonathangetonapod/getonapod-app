#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_DIR="$ROOT_DIR/.tools/node"
BIN_DIR="$NODE_DIR/bin"
SHIM_DIR="$ROOT_DIR/scripts/local-node-bin"

if [[ ! -x "$BIN_DIR/node" ]]; then
  echo "Local Node.js runtime not found at $BIN_DIR/node" >&2
  echo "Run: python3 scripts/install-local-node.py" >&2
  exit 1
fi

node_version="$($BIN_DIR/node --version)"
npm_version="$($BIN_DIR/node "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" --version)"
if [[ "$node_version" != 'v22.22.2' || "$npm_version" != '10.9.7' ]]; then
  echo "Local toolchain must be Node.js v22.22.2 with npm 10.9.7; found ${node_version}/${npm_version}." >&2
  echo "Run: python3 scripts/install-local-node.py" >&2
  exit 1
fi

export PATH="$SHIM_DIR:$BIN_DIR:$PATH"

if [[ $# -eq 0 ]]; then
  echo "Usage: ./scripts/with-local-node.sh <command> [args...]" >&2
  exit 1
fi

case "$1" in
  npm)
    shift
    exec "$BIN_DIR/node" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" "$@"
    ;;
  npx)
    shift
    exec "$BIN_DIR/node" "$NODE_DIR/lib/node_modules/npm/bin/npx-cli.js" "$@"
    ;;
  corepack)
    shift
    exec "$BIN_DIR/node" "$NODE_DIR/lib/node_modules/corepack/dist/corepack.js" "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
