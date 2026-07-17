#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=""
KEEP_RUNNING="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --keep-running)
      KEEP_RUNNING="true"
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$ENV_FILE" && ! -f "$ENV_FILE" ]]; then
  echo "The supplied --env-file is not readable." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for command_name in docker supabase curl; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing local integration dependency: $command_name" >&2
    exit 2
  fi
done

DENO_COMMAND="${NOVAE_DENO_BIN:-}"
if [[ -z "$DENO_COMMAND" ]]; then
  DENO_FALLBACK=""
  while IFS= read -r deno_candidate; do
    if [[ "$deno_candidate" == "$ROOT/node_modules/.bin/"* ]]; then
      DENO_FALLBACK="${DENO_FALLBACK:-$deno_candidate}"
      continue
    fi
    DENO_COMMAND="$deno_candidate"
    break
  done < <(type -aP deno || true)
  DENO_COMMAND="${DENO_COMMAND:-${DENO_FALLBACK:-deno}}"
fi
if ! command -v "$DENO_COMMAND" >/dev/null 2>&1; then
  echo "Missing local integration dependency: $DENO_COMMAND" >&2
  exit 2
fi
echo "[integration] Using $("$DENO_COMMAND" --version | head -n 1) from $DENO_COMMAND"
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or the current WSL user cannot access it." >&2
  exit 2
fi

cd "$ROOT"
TEMP_ENV="$(mktemp)"
FUNCTION_ENV="$(mktemp)"
FUNCTION_LOG="$(mktemp)"
FUNCTION_PID=""
UPSTASH_LOG="$(mktemp)"
UPSTASH_PID=""

cleanup() {
  if [[ -n "$FUNCTION_PID" ]] && kill -0 "$FUNCTION_PID" >/dev/null 2>&1; then
    kill "$FUNCTION_PID" >/dev/null 2>&1 || true
    wait "$FUNCTION_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$UPSTASH_PID" ]] && kill -0 "$UPSTASH_PID" >/dev/null 2>&1; then
    kill "$UPSTASH_PID" >/dev/null 2>&1 || true
    wait "$UPSTASH_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$TEMP_ENV" "$FUNCTION_ENV" "$FUNCTION_LOG" "$UPSTASH_LOG"
  if [[ "$KEEP_RUNNING" != "true" ]]; then
    supabase stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[integration] Starting local Supabase"
START_EXCLUDES="edge-runtime,imgproxy,realtime,studio,vector"
supabase stop >/dev/null 2>&1 || true
supabase db start
echo "[integration] Resetting the local database"
supabase db reset --local
echo "[integration] Starting local API services after migrations"
supabase stop >/dev/null 2>&1 || true
supabase start --exclude "$START_EXCLUDES"

STATUS_ENV="$(supabase status -o env)"
eval "$(printf '%s\n' "$STATUS_ENV" | grep -E '^(ANON_KEY|API_URL|JWT_SECRET|PUBLISHABLE_KEY|SECRET_KEY|SERVICE_ROLE_KEY)=')"
ANON_KEY="${ANON_KEY:-${PUBLISHABLE_KEY:-}}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SECRET_KEY:-}}"
: "${API_URL:?Local Supabase did not report API_URL}"
: "${ANON_KEY:?Local Supabase did not report an anonymous or publishable key}"
: "${SERVICE_ROLE_KEY:?Local Supabase did not report a service-role or secret key}"
: "${JWT_SECRET:?Local Supabase did not report JWT_SECRET}"

echo "[integration] Waiting for the REST schema cache"
rest_status=""
for _ in $(seq 1 60); do
  rest_status="$(curl -sS -o /dev/null -w '%{http_code}' \
    "$API_URL/rest/v1/user_profiles?select=uid&limit=1" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'accept-profile: app_private' || true)"
  if [[ "$rest_status" == "200" ]]; then
    break
  fi
  sleep 1
done
if [[ "$rest_status" != "200" ]]; then
  echo "Local REST API schema cache did not become ready (HTTP $rest_status)." >&2
  exit 1
fi

echo "[integration] Linting the rebuilt database"
supabase db lint --local --level error --fail-on error

{
  printf 'ALLOWED_DOMAIN=integration.invalid\n'
  printf 'CLOUDFLARE_WORKER_URL=http://127.0.0.1:1\n'
  printf 'CLOUDINARY_API_KEY=integration-api-key\n'
  printf 'CLOUDINARY_API_SECRET=integration-api-secret\n'
  printf 'CLOUDINARY_CLOUD_NAME=integration-cloud\n'
  printf 'CLOUDINARY_WEBHOOK_SECRET=integration-cloudinary-webhook\n'
  printf 'EDGE_ORIGIN_SECRET=integration-origin-secret\n'
  printf 'FIREBASE_PROJECT_ID=integration-project\n'
  printf 'FIREBASE_WEB_API_KEY=integration-web-api-key\n'
  printf 'WEBHOOK_SECRET=integration-worker-secret\n'
  printf '\nAPP_SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SERVICE_ROLE_KEY"
  printf 'SUPABASE_URL=%s\n' "$API_URL"
  printf 'SUPABASE_ANON_KEY=%s\n' "$ANON_KEY"
  printf 'SUPABASE_JWT_SECRET=%s\n' "$JWT_SECRET"
  printf 'SUPABASE_FUNCTIONS_URL=%s/functions/v1\n' "$API_URL"
  printf 'GOOGLE_SERVICE_ACCOUNT_JSON=not-json\n'
  printf 'UPSTASH_REDIS_REST_URL=http://127.0.0.1:54329\n'
  printf 'UPSTASH_REDIS_REST_TOKEN=integration-upstash-token\n'
} >"$TEMP_ENV"
chmod 600 "$TEMP_ENV"
grep -v '^SUPABASE_' "$TEMP_ENV" >"$FUNCTION_ENV"
sed -i 's#UPSTASH_REDIS_REST_URL=http://127.0.0.1:54329#UPSTASH_REDIS_REST_URL=http://host.docker.internal:54329#' "$FUNCTION_ENV"
chmod 600 "$FUNCTION_ENV"
ORIGIN_SECRET="$(grep '^EDGE_ORIGIN_SECRET=' "$TEMP_ENV" | head -n 1 | cut -d= -f2-)"

echo "[integration] Starting isolated Upstash REST test server"
"$DENO_COMMAND" run --allow-env --allow-net scripts/upstash-test-server.ts >"$UPSTASH_LOG" 2>&1 &
UPSTASH_PID="$!"
for _ in $(seq 1 30); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54329 -d '["GET","ready"]' || true)"
  [[ "$status" == "200" ]] && break
  sleep 1
done
if [[ "${status:-}" != "200" ]]; then
  cat "$UPSTASH_LOG" >&2
  echo "Local Upstash REST test server did not become ready." >&2
  exit 1
fi

echo "[integration] Serving Edge Functions with local database credentials"
supabase functions serve --env-file "$FUNCTION_ENV" --no-verify-jwt >"$FUNCTION_LOG" 2>&1 &
FUNCTION_PID="$!"
for _ in $(seq 1 60); do
  status="$(curl -sS -o /dev/null -w '%{http_code}' \
    -X OPTIONS "$API_URL/functions/v1/backendAction" \
    -H "x-novae-origin-secret: $ORIGIN_SECRET" || true)"
  if [[ "$status" == "200" ]]; then
    break
  fi
  if ! kill -0 "$FUNCTION_PID" >/dev/null 2>&1; then
    cat "$FUNCTION_LOG" >&2
    exit 1
  fi
  sleep 1
done
if [[ "${status:-}" != "200" ]]; then
  cat "$FUNCTION_LOG" >&2
  echo "Edge Functions did not become ready." >&2
  exit 1
fi
if grep -Eq 'Node\.js 20 and below are deprecated|integrationReadinessProbe' "$FUNCTION_LOG"; then
  cat "$FUNCTION_LOG" >&2
  echo "Edge Functions emitted a deprecated-runtime or synthetic readiness error." >&2
  exit 1
fi

echo "[integration] Running every backend action, permission matrix, RLS, and worker lifecycle"
DENO_DEPENDENCY_AGE_ARGS=()
if "$DENO_COMMAND" test --help | grep -q -- '--minimum-dependency-age'; then
  DENO_DEPENDENCY_AGE_ARGS+=(--minimum-dependency-age=0)
fi
if ! "$DENO_COMMAND" test \
  --node-modules-dir=none \
  --no-lock \
  "${DENO_DEPENDENCY_AGE_ARGS[@]}" \
  --env-file="$TEMP_ENV" \
  --allow-env \
  --allow-net \
  --allow-read \
  --fail-fast \
  tests/integration; then
  echo "[integration] Edge Function log follows" >&2
  cat "$FUNCTION_LOG" >&2
  exit 1
fi

echo "[integration] All local integration checks passed"
