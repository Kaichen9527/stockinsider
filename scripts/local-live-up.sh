#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/web"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
HEALTH_URL="${BASE_URL}/api/internal/health-check"
PID_FILE="${ROOT_DIR}/.agent/local-live-up.pid"
LOG_FILE="${ROOT_DIR}/.agent/local-live-up.log"

mkdir -p "${ROOT_DIR}/.agent"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env"
  set +a
fi

export DATA_MODE=live
export STORY_CANDIDATE_TOP_N="${STORY_CANDIDATE_TOP_N:-50}"
export SOURCE_SYNC_LOOKBACK_HOURS="${SOURCE_SYNC_LOOKBACK_HOURS:-24}"
export JOB_TIMEOUT_SECONDS="${JOB_TIMEOUT_SECONDS:-300}"
export RUN_E2E_INVESTOR="${RUN_E2E_INVESTOR:-1}"
export RUN_E2E_RADAR="${RUN_E2E_RADAR:-1}"
export RUN_E2E_DEEP_DIVE="${RUN_E2E_DEEP_DIVE:-1}"

if [[ -z "${INTERNAL_API_KEY:-}" ]]; then
  echo "[ERROR] INTERNAL_API_KEY is missing in .env"
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "[WARN] lsof not found; port conflict detection is disabled"
fi

json_get() {
  local json="$1"
  local key="$2"
  node -e '
    const obj = JSON.parse(process.argv[1]);
    const key = process.argv[2];
    const value = key.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
    if (value === undefined || value === null) process.exit(2);
    if (typeof value === "object") console.log(JSON.stringify(value));
    else console.log(String(value));
  ' "$json" "$key"
}

kill_existing_port_listener() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local pids
  pids="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi
  echo "[WARN] Port ${PORT} already has running process(es): ${pids}"
  echo "[INFO] Stopping existing listener(s) on port ${PORT} ..."
  while read -r pid; do
    [[ -n "${pid}" ]] || continue
    kill "${pid}" 2>/dev/null || true
  done <<< "${pids}"
  sleep 1
}

kill_existing_repo_next_dev() {
  local pids
  pids="$(pgrep -f "${WEB_DIR}/node_modules/.bin/next dev --port" || true)"
  if [[ -n "${pids}" ]]; then
    echo "[WARN] Found existing next dev process(es) for this repo: ${pids}"
    echo "[INFO] Stopping stale next dev process(es)..."
    while read -r pid; do
      [[ -n "${pid}" ]] || continue
      kill "${pid}" 2>/dev/null || true
    done <<< "${pids}"
    sleep 1
  fi

  local lock_file="${WEB_DIR}/.next/dev/lock"
  if [[ -f "${lock_file}" ]]; then
    # If lock remains after killing, it is stale and blocks startup.
    rm -f "${lock_file}" 2>/dev/null || true
  fi
}

post_json() {
  local path="$1"
  local payload="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  local http_code
  local curl_exit=0
  set +e
  http_code="$(curl -sS -m "${JOB_TIMEOUT_SECONDS}" -o "${tmp_file}" -w "%{http_code}" -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
    --data "${payload}")"
  curl_exit=$?
  set -e
  local body
  body="$(cat "${tmp_file}")"
  rm -f "${tmp_file}"
  if [[ ${curl_exit} -ne 0 ]]; then
    echo "[ERROR] ${path} request failed (curl_exit=${curl_exit}, timeout=${JOB_TIMEOUT_SECONDS}s)"
    if [[ -n "${body}" ]]; then
      echo "${body}"
    fi
    return 90
  fi
  if [[ ! "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
    echo "[ERROR] ${path} returned HTTP ${http_code}"
    if [[ -n "${body}" ]]; then
      echo "${body}"
    fi
    return 91
  fi
  printf "%s" "${body}"
}

run_job() {
  local path="$1"
  local payload="$2"
  local label="$3"
  echo "[INFO] Running ${label} (${path}) ..."
  local res
  if ! res="$(post_json "${path}" "${payload}")"; then
    echo "[ERROR] ${label} failed (${path})"
    echo "[INFO] Check ${LOG_FILE} and connector_runs for latest error details."
    exit 1
  fi
  local ok
  ok="$(json_get "${res}" "ok" || true)"
  if [[ "${ok}" != "true" ]]; then
    echo "[ERROR] ${label} failed (${path})"
    echo "${res}"
    echo "[INFO] Check ${LOG_FILE} and connector_runs for latest error details."
    exit 1
  fi
  local run_id duration_ms records_written candidate_count
  run_id="$(json_get "${res}" "meta.runId" || true)"
  duration_ms="$(json_get "${res}" "result.durationMs" || true)"
  records_written="$(json_get "${res}" "result.recordsWritten" || true)"
  candidate_count="$(json_get "${res}" "result.candidateCount" || true)"
  RUN_IDS+=("${label}:${run_id:-n/a}")
  echo "[OK] ${label} runId=${run_id:-n/a} durationMs=${duration_ms:-n/a} recordsWritten=${records_written:-n/a} candidateCount=${candidate_count:-n/a}"
}

kill_existing_port_listener
kill_existing_repo_next_dev

echo "[INFO] Starting local web server at ${BASE_URL} (DATA_MODE=live)..."
(
  cd "${WEB_DIR}"
  npm run dev -- --port "${PORT}"
) >"${LOG_FILE}" 2>&1 &
DEV_PID=$!
echo "${DEV_PID}" > "${PID_FILE}"

cleanup() {
  if [[ -n "${DEV_PID:-}" ]] && kill -0 "${DEV_PID}" 2>/dev/null; then
    kill "${DEV_PID}" 2>/dev/null || true
  fi
  rm -f "${PID_FILE}"
}

trap cleanup EXIT

echo "[INFO] Waiting for health-check..."
HEALTH_JSON=""
for _ in $(seq 1 90); do
  if ! kill -0 "${DEV_PID}" 2>/dev/null; then
    echo "[ERROR] local dev server exited before health-check became ready."
    echo "[INFO] Log tail (${LOG_FILE}):"
    tail -n 80 "${LOG_FILE}" || true
    exit 1
  fi
  if HEALTH_JSON="$(curl -sS -m 5 "${HEALTH_URL}" 2>/dev/null)"; then
    if json_get "${HEALTH_JSON}" "ok" >/dev/null 2>&1; then
      break
    fi
  fi
  sleep 1
done

if [[ -z "${HEALTH_JSON}" ]]; then
  echo "[ERROR] health-check did not become ready. Log: ${LOG_FILE}"
  exit 1
fi

DATA_MODE_VALUE="$(json_get "${HEALTH_JSON}" "dataMode" || true)"
FALLBACK_USED="$(json_get "${HEALTH_JSON}" "fallbackUsed" || true)"
if [[ "${DATA_MODE_VALUE}" != "live" || "${FALLBACK_USED}" != "false" ]]; then
  echo "[ERROR] Invalid runtime mode: dataMode=${DATA_MODE_VALUE:-unknown}, fallbackUsed=${FALLBACK_USED:-unknown}"
  echo "${HEALTH_JSON}"
  exit 1
fi
echo "[OK] health-check passed: dataMode=live fallbackUsed=false"

declare -a SOURCE_CONNECTORS=(
  "investanchors"
  "threads"
  "instagram"
  "telegram"
  "ptt"
  "bulltalk"
  "googlenews"
  "anue"
  "udn"
  "mobile01"
  "twse_insider"
)
declare -a RUN_IDS=()

for connector in "${SOURCE_CONNECTORS[@]}"; do
  run_job "/api/internal/source-sync" "{\"dryRun\":false,\"connector\":\"${connector}\"}" "source-sync:${connector}"
done

run_job "/api/internal/source-discovery" '{"dryRun":false}' "source-discovery"
run_job "/api/internal/theme-scan" '{"dryRun":false}' "theme-scan"
run_job "/api/internal/story-scan" '{"dryRun":false}' "story-scan"
run_job "/api/internal/story-verify" '{"dryRun":false}' "story-verify"
run_job "/api/internal/report-ingest" '{"dryRun":false}' "report-ingest"
run_job "/api/internal/thesis-refresh" '{"dryRun":false}' "thesis-refresh"
run_job "/api/internal/thesis-rank" '{"dryRun":false}' "thesis-rank"
run_job "/api/internal/research-report-build" '{"dryRun":false}' "research-report-build"
run_job "/api/internal/report-build" '{"dryRun":false}' "report-build"

TODAY_TPE="$(TZ=Asia/Taipei date +%F)"
for radar in daily hot weekly; do
  url="${BASE_URL}/api/radar/${radar}"
  body="$(curl -sS -m 30 "${url}")"
  as_of="$(json_get "${body}" "asOf" || true)"
  if [[ "${as_of}" != "${TODAY_TPE}" ]]; then
    echo "[ERROR] ${url} asOf=${as_of:-missing}, expected=${TODAY_TPE}"
    echo "${body}"
    exit 1
  fi
  if [[ "${radar}" == "daily" ]]; then
    has_opps="$(json_get "${body}" "opportunities.0.symbol" >/dev/null 2>&1 && echo "yes" || echo "no")"
    has_early="$(json_get "${body}" "earlyWatchlist.0.symbol" >/dev/null 2>&1 && echo "yes" || echo "no")"
    has_discovered="$(json_get "${body}" "discoveredStocks.0.symbol" >/dev/null 2>&1 && echo "yes" || echo "no")"
    if [[ "${has_opps}" == "no" && "${has_early}" == "no" && "${has_discovered}" == "no" ]]; then
      echo "[ERROR] ${url} opportunities/earlyWatchlist/discoveredStocks are all empty"
      echo "${body}"
      exit 1
    fi
  fi
  echo "[OK] ${url} asOf=${as_of}"
done

if [[ "${RUN_E2E_INVESTOR}" == "1" ]]; then
  echo "[INFO] Running investor E2E gate ..."
  if ! (
    cd "${WEB_DIR}" &&
    E2E_BASE_URL="${BASE_URL}" PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e:investor
  ); then
    echo "[ERROR] investor E2E gate failed"
    exit 1
  fi
  echo "[OK] investor E2E gate passed"
fi

if [[ "${RUN_E2E_RADAR}" == "1" ]]; then
  echo "[INFO] Running radar E2E gate ..."
  if ! (
    cd "${WEB_DIR}" &&
    E2E_BASE_URL="${BASE_URL}" PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e:radar
  ); then
    echo "[ERROR] radar E2E gate failed"
    exit 1
  fi
  echo "[OK] radar E2E gate passed"
fi

if [[ "${RUN_E2E_DEEP_DIVE}" == "1" ]]; then
  echo "[INFO] Running deep-dive E2E gate ..."
  if ! (
    cd "${WEB_DIR}" &&
    E2E_BASE_URL="${BASE_URL}" PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e:deep-dive
  ); then
    echo "[ERROR] deep-dive E2E gate failed"
    exit 1
  fi
  echo "[OK] deep-dive E2E gate passed"
fi

echo
echo "Local live is ready:"
echo "  ${BASE_URL}/"
echo "  ${BASE_URL}/api/radar/daily"
echo "Recent runIds:"
printf '  - %s\n' "${RUN_IDS[@]}"
echo
echo "Dev log: ${LOG_FILE}"
echo "Dev PID: ${DEV_PID}"
echo
echo "Press Ctrl+C to stop local server."
trap - EXIT
wait "${DEV_PID}"
