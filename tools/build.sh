#!/usr/bin/env bash
# Builds ./dist, exactly what the deploy publishes (the tests run against it too).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html dist/
cp static/* dist/
