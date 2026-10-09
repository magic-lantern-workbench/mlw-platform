#!/usr/bin/env bash
# End-to-end test of the login with Keycloak: starts the local development stack
# in its own compose project (so existing containers and volumes are untouched),
# waits for Keycloak and the app, runs scripts/test-login/login.test.mjs in a
# headless browser and removes the stack again.
#
#   scripts/test-login.sh [--keep]     --keep leaves the stack running
#
# Needs Docker with Compose, Node.js and Chrome or Chromium (set CHROME to its
# path if it is not in a standard place). Stop any other stack that uses the
# ports 8090 and 8180 first.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
project=mlwlogintest
keep=false; [ "${1:-}" = "--keep" ] && keep=true

cleanup() { $keep || docker compose -p "$project" down -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

[ -d scripts/test-login/node_modules/playwright-core ] || (cd scripts/test-login && npm install --no-audit --no-fund)

docker compose -p "$project" up -d --build

echo "waiting for Keycloak and the app..."
for _ in $(seq 1 60); do
  if curl -sf http://localhost:8180/realms/mlw >/dev/null && curl -sf http://localhost:8090/api/v1/health >/dev/null; then ready=1; break; fi
  sleep 4
done
[ "${ready:-0}" = 1 ] || { echo "the stack did not become ready" >&2; docker compose -p "$project" logs --tail 30 >&2; exit 1; }

(cd scripts/test-login && node login.test.mjs)
