#!/usr/bin/env bash
# Builds ./dist, exactly what the deploy publishes (the tests run against it too).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
cp index.html dist/
cp static/* dist/
cp -r js dist/
# Cache-busting: each src="js/NAME.js" gets ?v=<hash of that file>, so a phone never mixes a new index.html with old
# scripts (or the reverse) after a deploy.
for f in js/*.js; do
  v=$(shasum -a 256 "$f" | cut -c1-10)
  perl -pi -e "s|src=\"\Q$f\E\"|src=\"$f?v=$v\"|" dist/index.html
done
if grep -q 'src="js/[^"?]*"' dist/index.html; then echo "build.sh: a js/ script in index.html has no ?v= (not in js/?)" >&2; exit 1; fi
