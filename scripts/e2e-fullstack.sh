#!/usr/bin/env bash
# Full-stack e2e for the website: starts compose.dev.yml + compose.e2e.yml (MySQL with seed data,
# local OIDC issuer, API), builds and serves apps/web against it, runs the Cypress specs in
# apps/web/cypress/e2e/fullstack and tears everything down again. See docs/e2e.md.
#
#   pnpm e2e:fullstack                                   everything
#   pnpm e2e:fullstack --spec cypress/e2e/fullstack/agreements.js
#                                                        extra arguments go to `cypress run`
#
#   E2E_KEEP_UP=1      leave the stack and the web server running afterwards (for `cypress open`)
#   E2E_SKIP_BUILD=1   reuse the existing apps/web/.next build (same ports as the last build)
#   E2E_SKIP_STACK_BUILD=1
#                      use the effekt-backend-dev:local image as it is (CI builds it with a layer cache)
#   E2E_WEB_PORT (3100), E2E_API_PORT (5150), E2E_AUTH_PORT (8191), E2E_DB_PORT (3317)
#
# The production build is written to apps/web/.next, replacing any earlier `next build`.
set -euo pipefail

cd "$(dirname "$0")/.."

export E2E_WEB_PORT="${E2E_WEB_PORT:-3100}"
export E2E_API_PORT="${E2E_API_PORT:-5150}"
export E2E_AUTH_PORT="${E2E_AUTH_PORT:-8191}"
export E2E_DB_PORT="${E2E_DB_PORT:-3317}"
LOG_DIR="${E2E_LOG_DIR:-apps/web/cypress/logs}"
mkdir -p "$LOG_DIR"

compose() { docker compose -f compose.dev.yml -f compose.e2e.yml "$@"; }

WEB_PID=""
cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    compose logs --no-color >"$LOG_DIR/compose.log" 2>&1 || true
    echo "Logs: $LOG_DIR/compose.log, $LOG_DIR/web.log" >&2
  fi
  if [ "${E2E_KEEP_UP:-0}" = "1" ]; then
    echo "E2E_KEEP_UP=1: stack and web server left running (web pid ${WEB_PID:-none})."
    echo "Stop with: kill ${WEB_PID:-<pid>}; pnpm e2e:env:down"
  else
    [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
    compose down -v --remove-orphans >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

timer() { date +%s; }
elapsed() { echo "$(($(date +%s) - $1))s"; }

t=$(timer)
echo "==> Starting backend stack (db, migrate + seed, auth, oidc, api) in the background"
# Build first: migrate and api share one image tag, building it from both at once can race.
if [ "${E2E_SKIP_STACK_BUILD:-0}" != "1" ]; then
  compose build migrate
fi
# The stack starts while the tRPC types build below; the web build waits for it, because static
# generation reads from the API (a fundraiser page).
compose up -d --wait >"$LOG_DIR/stack-up.log" 2>&1 &
STACK_PID=$!

# Public, non-secret build settings. Content comes read-only from the production Sanity dataset
# (no token needed); everything the browser talks to besides Sanity is local.
export NEXT_PUBLIC_SANITY_PROJECT_ID=vf0df6h3
export NEXT_PUBLIC_SANITY_DATASET=production
export NEXT_PUBLIC_EFFEKT_API="http://localhost:${E2E_API_PORT}"
export NEXT_PUBLIC_SITE_URL="http://localhost:${E2E_WEB_PORT}"
export NEXT_PUBLIC_AUTH_DOMAIN="http://localhost:${E2E_AUTH_PORT}"
export NEXT_PUBLIC_AUTH_CLIENT_ID=effekt-web-e2e
export NEXT_PUBLIC_AUTH_AUDIENCE=http://localhost:5050
export NEXT_PUBLIC_AUTH_USER_ID_CLAIM=https://gieffektivt.no/user-id
export NEXT_TELEMETRY_DISABLED=1

wait_for_stack() {
  if ! wait "$STACK_PID"; then
    cat "$LOG_DIR/stack-up.log" >&2
    exit 1
  fi
  echo "    stack up in $(elapsed "$t")"
}

if [ "${E2E_SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building the tRPC types"
  # As `pnpm build` does: without dist-types the tRPC client is untyped (docs/web-trpc.md)
  pnpm build:types >"$LOG_DIR/web-build.log" 2>&1 || {
    tail -50 "$LOG_DIR/web-build.log" >&2
    exit 1
  }
  wait_for_stack
  tb=$(timer)
  echo "==> Building apps/web (next build)"
  # `next build` directly: the package's prebuild step builds the Sanity studio, not needed here.
  # CI=1 turns on the build's shared Sanity fetch cache (apps/web/lib/sanity.client.ts), as on
  # Vercel; GitHub Actions sets CI=true.
  CI=1 pnpm --filter main-site exec next build >>"$LOG_DIR/web-build.log" 2>&1 || {
    tail -50 "$LOG_DIR/web-build.log" >&2
    exit 1
  }
  echo "    web built in $(elapsed "$tb")"
else
  wait_for_stack
fi

echo "==> Serving apps/web on http://localhost:${E2E_WEB_PORT}"
pnpm --filter main-site exec next start -p "$E2E_WEB_PORT" >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://localhost:${E2E_WEB_PORT}/min-side/"; then break; fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    cat "$LOG_DIR/web.log" >&2
    exit 1
  fi
  sleep 1
done

t=$(timer)
echo "==> Running Cypress (cypress-fullstack.config.ts)"
CYPRESS_BASE_URL="http://localhost:${E2E_WEB_PORT}" \
  pnpm --filter main-site exec cypress run --config-file cypress-fullstack.config.ts "$@"
echo "    tests ran in $(elapsed "$t")"
