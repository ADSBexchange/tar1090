#!/usr/bin/env bash
# Unit tests for the vanilla-JS frontend logic (Node's built-in runner — no deps, no package.json).
# Dev/CI only: install.sh deploys html/ only, so test/ never ships to the Pi.
# Requires Node >= 18 (uses node:test). Run from anywhere: ./test.sh
set -euo pipefail
cd "$(dirname "$0")"
# ./test.sh            -> run tests
# ./test.sh --coverage -> run tests with line/branch/function coverage
if [[ "${1:-}" == "--coverage" ]]; then
    exec node --test --experimental-test-coverage
fi
exec node --test
