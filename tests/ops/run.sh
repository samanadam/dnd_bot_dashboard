#!/bin/sh
# Runs every tests/ops/*.test.sh with docker/curl/git stubbed on PATH.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
failed=0
for test in "$ROOT"/tests/ops/*.test.sh; do
  work=$(mktemp -d)
  mkdir -p "$work/stubs"
  if ROOT="$ROOT" WORK="$work" STUBS="$work/stubs" CALLS="$work/calls" sh "$test" >"$work/out" 2>&1; then
    echo "ok   $(basename "$test")"
  else
    echo "FAIL $(basename "$test")"
    sed 's/^/     /' "$work/out"
    failed=1
  fi
  rm -rf "$work"
done
exit "$failed"
