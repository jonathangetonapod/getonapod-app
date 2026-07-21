#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' \
  'Refused: this legacy blog-only deployment helper is retired.' \
  'It is not bound to a reviewed commit or an explicit non-production project.' \
  'Use docs/invite-only-edge-manifest.json and the phased staging procedure in README.md.' \
  >&2
exit 1
