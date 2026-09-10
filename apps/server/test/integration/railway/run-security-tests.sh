#!/usr/bin/env bash
# ConqrHub security-lab runner: migrations on a throwaway database, then the F27/F28/F29
# integration suite, then a log-leak scan. Exits with the Jest exit code (a failing security test
# is a valid result and must surface as a non-zero exit).
#
# Refuses to run anywhere except the Railway project/environment reserved for this purpose and
# refuses non-private database/Redis hosts, so a mis-targeted deploy cannot touch real data.
set -uo pipefail

SERVER_DIR=/app/apps/server
RESULT_FILE="$SERVER_DIR/test/integration/result.json"
EXPECTED_PROJECT="${EXPECTED_RAILWAY_PROJECT:-conqr-security-lab}"
EXPECTED_ENV="${EXPECTED_RAILWAY_ENVIRONMENT:-security-lab}"

log() { printf '[harness] %s\n' "$*"; }

log "project=${RAILWAY_PROJECT_NAME:-<unset>} environment=${RAILWAY_ENVIRONMENT_NAME:-<unset>} service=${RAILWAY_SERVICE_NAME:-<unset>}"
log "deployment=${RAILWAY_DEPLOYMENT_ID:-<unset>} commit=${HARNESS_GIT_SHA:-unknown} node=$(node -v) pnpm=$(pnpm -v)"

if [ "${RAILWAY_PROJECT_NAME:-}" != "$EXPECTED_PROJECT" ] || [ "${RAILWAY_ENVIRONMENT_NAME:-}" != "$EXPECTED_ENV" ]; then
  log "REFUSING TO RUN: expected ${EXPECTED_PROJECT}/${EXPECTED_ENV}"
  exit 78
fi

host_of() { node -e 'const u=new URL(process.argv[1]);console.log(u.hostname)' "$1" 2>/dev/null || echo ""; }
for var in DATABASE_URL REDIS_URL; do
  val="${!var:-}"
  if [ -z "$val" ]; then log "REFUSING TO RUN: $var is not set"; exit 78; fi
  h="$(host_of "$val")"
  case "$h" in
    *.railway.internal|localhost|127.0.0.1|::1) log "$var host=$h (private)";;
    *) log "REFUSING TO RUN: $var host is not a private Railway host"; exit 78;;
  esac
done
# Never print DATABASE_URL / REDIS_URL / APP_SECRET / SUITE_IDP_CLIENTS values.

cd "$SERVER_DIR"

log "waiting for Redis"
for i in $(seq 1 60); do
  if node -e '
    const Redis=require("ioredis");const r=new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:3000,maxRetriesPerRequest:0});
    r.connect().then(()=>r.ping()).then(()=>{r.disconnect();process.exit(0)}).catch(()=>process.exit(1));
  '; then break; fi
  [ "$i" -eq 60 ] && { log "Redis not reachable"; exit 79; }
  sleep 3
done

log "running migrations (migration:latest) on the throwaway database"
mig_ok=0
for i in $(seq 1 40); do
  if pnpm run migration:latest; then mig_ok=1; break; fi
  log "migration attempt $i failed (database not ready yet?), retrying"
  sleep 5
done
[ "$mig_ok" -eq 1 ] || { log "migrations never succeeded"; exit 79; }

log "running integration suite: pnpm run test:integration"
set +e
pnpm run test:integration
jest_exit=$?
set -e

leak="pass"
if [ -f test/integration/.minted-tokens ]; then
  count=$(grep -c . test/integration/.minted-tokens || true)
  log "minted token count: $count"
  if [ -f test/integration/.jest-output.log ]; then
    while IFS= read -r tok; do
      [ -z "$tok" ] && continue
      if grep -qF -- "$tok" test/integration/.jest-output.log; then leak="fail"; fi
    done < test/integration/.minted-tokens
  fi
fi
log "log-leak scan: $leak"

printf '{"commit":"%s","deployment":"%s","jest_exit":%s,"leak_scan":"%s","finished_at":"%s"}\n' \
  "${HARNESS_GIT_SHA:-unknown}" "${RAILWAY_DEPLOYMENT_ID:-}" "$jest_exit" "$leak" "$(date -u +%FT%TZ)" > "$RESULT_FILE"
log "HARNESS_RESULT jest_exit=$jest_exit leak_scan=$leak commit=${HARNESS_GIT_SHA:-unknown}"

# Optional: keep the container alive so the evidence file can be pulled with `railway ssh`.
if [ "${HOLD_SECONDS:-0}" -gt 0 ] 2>/dev/null; then
  log "holding for ${HOLD_SECONDS}s"
  sleep "${HOLD_SECONDS}"
fi

if [ "$leak" = "fail" ]; then exit 80; fi
exit "$jest_exit"
