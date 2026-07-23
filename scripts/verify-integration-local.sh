#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=""
KEEP_RUNNING="false"
SERVE="false"
STRESS_SCALE="${NOVAE_STRESS_SCALE:-4}"
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
    --serve)
      SERVE="true"
      shift
      ;;
    --stress-scale)
      STRESS_SCALE="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if ! [[ "$STRESS_SCALE" =~ ^[0-9]+$ ]] || (( STRESS_SCALE < 2 || STRESS_SCALE > 20 )); then
  echo "--stress-scale must be an integer between 2 and 20." >&2
  exit 2
fi

if [[ -n "$ENV_FILE" && ! -f "$ENV_FILE" ]]; then
  echo "The supplied --env-file is not readable." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for command_name in docker supabase curl script; do
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
if [[ "$SERVE" == "true" ]]; then
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v npx >/dev/null 2>&1; then
    TEST_NODE=(node)
    TEST_NPX=(npx --yes)
    TEST_ROOT="$ROOT"
  else
    echo "The interactive test environment requires native WSL Node.js 24 with npm and npx." >&2
    exit 2
  fi
  if [[ "$("${TEST_NODE[@]}" -p 'process.versions.node.split(`.`)[0]' | tr -d '\r')" != "24" ]]; then
    echo "The interactive test environment requires Node.js 24 LTS." >&2
    exit 2
  fi
  VITE_NPM=(npm)
  VITE_IS_WINDOWS="false"
  if [[ "$ROOT" == /mnt/* ]] && command -v cmd.exe >/dev/null 2>&1; then
    VITE_NPM=(cmd.exe /d /s /c npm)
    VITE_IS_WINDOWS="true"
  fi
fi

cd "$ROOT"
# config.toml enables Firebase third-party auth for production Realtime. Keep
# local database setup deterministic without depending on developer secrets.
export FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-integration-project}"
TEMP_ENV="$(mktemp)"
FUNCTION_ENV="$(mktemp)"
FUNCTION_LOG="$(mktemp)"
FUNCTION_PID=""
FIREBASE_LOG="$(mktemp)"
FIREBASE_PID=""
FCM_LOG="$(mktemp)"
FCM_PID=""
UPSTASH_LOG="$(mktemp)"
UPSTASH_PID=""
WORKER_LOG="$(mktemp)"
WORKER_PID=""
VITE_PID=""
VITE_WINDOWS_PID=""

cleanup() {
  if [[ -n "$FUNCTION_PID" ]] && kill -0 "$FUNCTION_PID" >/dev/null 2>&1; then
    kill "$FUNCTION_PID" >/dev/null 2>&1 || true
    wait "$FUNCTION_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$UPSTASH_PID" ]] && kill -0 "$UPSTASH_PID" >/dev/null 2>&1; then
    kill "$UPSTASH_PID" >/dev/null 2>&1 || true
    wait "$UPSTASH_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WORKER_PID" ]] && kill -0 "$WORKER_PID" >/dev/null 2>&1; then
    kill "$WORKER_PID" >/dev/null 2>&1 || true
    wait "$WORKER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$VITE_PID" ]] && kill -0 "$VITE_PID" >/dev/null 2>&1; then
    kill "$VITE_PID" >/dev/null 2>&1 || true
    wait "$VITE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$VITE_WINDOWS_PID" ]]; then
    taskkill.exe /PID "$VITE_WINDOWS_PID" /T /F >/dev/null 2>&1 || true
  fi
  if [[ -n "$FIREBASE_PID" ]] && kill -0 "$FIREBASE_PID" >/dev/null 2>&1; then
    kill "$FIREBASE_PID" >/dev/null 2>&1 || true
    wait "$FIREBASE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$FCM_PID" ]] && kill -0 "$FCM_PID" >/dev/null 2>&1; then
    kill "$FCM_PID" >/dev/null 2>&1 || true
    wait "$FCM_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$TEMP_ENV" "$FUNCTION_ENV" "$FUNCTION_LOG" "$FIREBASE_LOG" "$FCM_LOG" "$UPSTASH_LOG" "$WORKER_LOG"
  if [[ "$KEEP_RUNNING" != "true" ]]; then
    supabase stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[integration] Starting local Supabase"
START_EXCLUDES="edge-runtime,imgproxy,logflare,realtime,studio,vector"
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
  printf 'CLOUDINARY_API_BASE_URL=http://127.0.0.1:54330\n'
  printf 'CLOUDINARY_WEBHOOK_SECRET=integration-cloudinary-webhook\n'
  printf 'EDGE_ORIGIN_SECRET=integration-origin-secret\n'
  printf 'EDGE_FUNCTION_DELETE_URL=%s/functions/v1/processDeletionJobs\n' "$API_URL"
  printf 'EDGE_FUNCTION_OUTBOX_URL=%s/functions/v1/outboxWorker\n' "$API_URL"
  printf 'FIREBASE_PROJECT_ID=integration-project\n'
  printf 'FIREBASE_WEB_API_KEY=integration-web-api-key\n'
  printf 'FCM_EMULATOR_URL=http://127.0.0.1:54330\n'
  printf 'ADMIN_EMAILS=admin@integration.invalid\n'
  printf 'WEBHOOK_SECRET=integration-worker-secret\n'
  printf '\nAPP_SUPABASE_SERVICE_ROLE_KEY=%s\n' "$SERVICE_ROLE_KEY"
  printf 'SUPABASE_URL=%s\n' "$API_URL"
  printf 'SUPABASE_ANON_KEY=%s\n' "$ANON_KEY"
  printf 'SUPABASE_JWT_SECRET=%s\n' "$JWT_SECRET"
  printf 'SUPABASE_FUNCTIONS_URL=%s/functions/v1\n' "$API_URL"
  printf 'GOOGLE_SERVICE_ACCOUNT_JSON=not-json\n'
  printf 'UPSTASH_REDIS_REST_URL=http://127.0.0.1:54329\n'
  printf 'UPSTASH_REDIS_REST_TOKEN=integration-upstash-token\n'
  printf 'NOVAE_STRESS_SCALE=%s\n' "$STRESS_SCALE"
} >"$TEMP_ENV"

if [[ "$SERVE" == "true" ]]; then
  printf 'LOCAL_TEST_MODE=true\n' >>"$TEMP_ENV"
  printf 'FIREBASE_AUTH_EMULATOR_HOST=host.docker.internal:9099\n' >>"$TEMP_ENV"
  sed -i 's#CLOUDFLARE_WORKER_URL=http://127.0.0.1:1#CLOUDFLARE_WORKER_URL=http://127.0.0.1:8787#' "$TEMP_ENV"
fi
chmod 600 "$TEMP_ENV"
grep -v '^SUPABASE_' "$TEMP_ENV" >"$FUNCTION_ENV"
sed -i 's#UPSTASH_REDIS_REST_URL=http://127.0.0.1:54329#UPSTASH_REDIS_REST_URL=http://host.docker.internal:54329#' "$FUNCTION_ENV"
sed -i 's#FCM_EMULATOR_URL=http://127.0.0.1:54330#FCM_EMULATOR_URL=http://host.docker.internal:54330#' "$FUNCTION_ENV"
sed -i 's#CLOUDINARY_API_BASE_URL=http://127.0.0.1:54330#CLOUDINARY_API_BASE_URL=http://host.docker.internal:54330#' "$FUNCTION_ENV"
sed -i 's#EDGE_FUNCTION_DELETE_URL=http://127.0.0.1:54321#EDGE_FUNCTION_DELETE_URL=http://host.docker.internal:54321#' "$FUNCTION_ENV"
sed -i 's#EDGE_FUNCTION_OUTBOX_URL=http://127.0.0.1:54321#EDGE_FUNCTION_OUTBOX_URL=http://host.docker.internal:54321#' "$FUNCTION_ENV"
chmod 600 "$FUNCTION_ENV"
ORIGIN_SECRET="$(grep '^EDGE_ORIGIN_SECRET=' "$TEMP_ENV" | head -n 1 | cut -d= -f2-)"

if [[ "$SERVE" == "true" ]]; then
  echo "[environment] Starting Firebase Auth emulator"
  "${TEST_NPX[@]}" firebase-tools@15.24.0 emulators:start --only auth --project integration-project >"$FIREBASE_LOG" 2>&1 &
  FIREBASE_PID="$!"
  firebase_status=""
  for _ in $(seq 1 60); do
    firebase_status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:9099/ || true)"
    [[ "$firebase_status" != "000" ]] && break
    if ! kill -0 "$FIREBASE_PID" >/dev/null 2>&1; then cat "$FIREBASE_LOG" >&2; exit 1; fi
    sleep 1
  done
  if [[ "$firebase_status" == "000" ]]; then cat "$FIREBASE_LOG" >&2; exit 1; fi
fi

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

echo "[integration] Starting isolated FCM test receiver"
"$DENO_COMMAND" run --allow-env --allow-net scripts/external-provider-test-server.ts >"$FCM_LOG" 2>&1 &
FCM_PID="$!"
fcm_status=""
for _ in $(seq 1 30); do
  fcm_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:54330/__requests || true)"
  [[ "$fcm_status" == "200" ]] && break
  sleep 1
done
if [[ "$fcm_status" != "200" ]]; then
  cat "$FCM_LOG" >&2
  echo "Local FCM test receiver did not become ready." >&2
  exit 1
fi

echo "[integration] Serving Edge Functions with local database credentials"
# Supabase CLI currently fails with ENODATA when Windows launches WSL without a
# terminal. `script` gives the long-lived function server its own pseudo-TTY in
# both interactive and automated runs.
printf -v FUNCTION_SERVE_COMMAND 'exec supabase functions serve --env-file %q --no-verify-jwt' "$FUNCTION_ENV"
script --quiet --return --command "$FUNCTION_SERVE_COMMAND" /dev/null >"$FUNCTION_LOG" 2>&1 &
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
if [[ "$SERVE" != "true" ]] && ! "$DENO_COMMAND" test \
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

if [[ "$SERVE" != "true" ]]; then
  echo "[integration] All local integration checks passed"
  exit 0
fi

echo "[environment] Starting local Cloudflare gateway"
"${TEST_NPX[@]}" wrangler@4.112.0 dev --config "$TEST_ROOT/cloudflare/wrangler.toml" --env development --local --port 8787 \
  --var "ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173" \
  --var "CLOUDINARY_API_SECRET:integration-cloudinary-secret" \
  --var "CLOUDINARY_CLOUD_NAME:integration" \
  --var "CLOUDINARY_DELIVERY_BASE_URL:http://127.0.0.1:54330" \
  --var "CLOUDINARY_WEBHOOK_SECRET:integration-cloudinary-webhook" \
  --var "EDGE_FUNCTION_NAMESPACE:local" \
  --var "EDGE_ORIGIN_SECRET:$ORIGIN_SECRET" \
  --var "FIREBASE_PROJECT_ID:integration-project" \
  --var "LOCAL_TEST_MODE:true" \
  --var "SUPABASE_FUNCTIONS_BASE_URL:$API_URL/functions/v1" >"$WORKER_LOG" 2>&1 &
WORKER_PID="$!"
worker_status=""
for _ in $(seq 1 60); do
  worker_status="$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS http://127.0.0.1:8787/v1/actions -H 'origin: http://localhost:5173' || true)"
  [[ "$worker_status" == "204" ]] && break
  if ! kill -0 "$WORKER_PID" >/dev/null 2>&1; then cat "$WORKER_LOG" >&2; exit 1; fi
  sleep 1
done
if [[ "$worker_status" != "204" ]]; then cat "$WORKER_LOG" >&2; exit 1; fi

echo "[environment] Starting Vite"
export VITE_ALLOWED_DOMAIN=integration.invalid
export VITE_API_BASE_URL=http://127.0.0.1:8787
export VITE_FIREBASE_API_KEY=integration-web-api-key
export VITE_FIREBASE_APP_ID=1:123456789:web:local
export VITE_FIREBASE_AUTH_DOMAIN=integration-project.firebaseapp.com
export VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
export VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
export VITE_FIREBASE_PROJECT_ID=integration-project
export VITE_FIREBASE_APP_CHECK_ENABLED=false
export VITE_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export WSLENV="${WSLENV:-}:VITE_ALLOWED_DOMAIN/w:VITE_API_BASE_URL/w:VITE_FIREBASE_API_KEY/w:VITE_FIREBASE_APP_ID/w:VITE_FIREBASE_AUTH_DOMAIN/w:VITE_FIREBASE_AUTH_EMULATOR_URL/w:VITE_FIREBASE_MESSAGING_SENDER_ID/w:VITE_FIREBASE_PROJECT_ID/w:VITE_FIREBASE_APP_CHECK_ENABLED/w:VITE_SUPABASE_URL/w:VITE_SUPABASE_PUBLISHABLE_KEY/w"
"${VITE_NPM[@]}" run dev -- --host 0.0.0.0 --port 5173 --strictPort &
VITE_PID="$!"

for _ in $(seq 1 60); do
  if [[ "$VITE_IS_WINDOWS" == "true" ]]; then
    VITE_WINDOWS_PID="$(netstat.exe -ano | tr -d '\r' | awk '$2 ~ /:5173$/ && $4 == "LISTENING" { print $5; exit }')"
    [[ "$VITE_WINDOWS_PID" =~ ^[0-9]+$ ]] && break
  else
    vite_status="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/ || true)"
    [[ "$vite_status" == "200" ]] && break
  fi
  if ! kill -0 "$VITE_PID" >/dev/null 2>&1; then wait "$VITE_PID"; exit 1; fi
  sleep 1
done
if [[ "$VITE_IS_WINDOWS" == "true" ]]; then
  if ! [[ "$VITE_WINDOWS_PID" =~ ^[0-9]+$ ]]; then
    echo "Could not resolve the Windows Vite process." >&2
    exit 1
  fi
elif [[ "$vite_status" != "200" ]]; then
  echo "Vite did not become ready on port 5173." >&2
  exit 1
fi

"${TEST_NODE[@]}" scripts/check-local-auth-emulator.mjs

echo ""
echo "[environment] Ready"
echo "  App:           http://localhost:5173"
echo "  Auth emulator: http://localhost:4000/auth"
echo "  API gateway:   http://localhost:8787"
echo "  Admin login:   use Google sign-in, enter admin@integration.invalid in the emulator"
echo "  New users:     sign out and use Google sign-in with any *@integration.invalid address"
echo "  Stop:          press Ctrl+C"
wait "$VITE_PID"
