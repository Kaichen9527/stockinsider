#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/web"
LOG_DIR="${ROOT_DIR}/.agent"
mkdir -p "${LOG_DIR}"

PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
HEALTH_URL="${BASE_URL}/api/internal/health-check"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-14400}" # 4 hours
AUTO_START_WEB="${AUTO_START_WEB:-1}"
WEB_LOG_FILE="${LOG_DIR}/research-daemon-web.log"
CYCLE_LOG_FILE="${LOG_DIR}/research-daemon.log"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env"
  set +a
fi

export DATA_MODE=live
export STORY_CANDIDATE_TOP_N="${STORY_CANDIDATE_TOP_N:-50}"
export SOURCE_SYNC_LOOKBACK_HOURS="${SOURCE_SYNC_LOOKBACK_HOURS:-24}"

if [[ -z "${INTERNAL_API_KEY:-}" ]]; then
  echo "[daemon] INTERNAL_API_KEY is missing in .env" | tee -a "${CYCLE_LOG_FILE}"
  exit 1
fi

ensure_web_server() {
  if curl -sS -m 6 "${HEALTH_URL}" >/dev/null 2>&1; then
    return 0
  fi
  if [[ "${AUTO_START_WEB}" != "1" ]]; then
    echo "[daemon] web server is not reachable and AUTO_START_WEB=0" | tee -a "${CYCLE_LOG_FILE}"
    return 1
  fi

  echo "[daemon] starting web dev server on ${PORT}" | tee -a "${CYCLE_LOG_FILE}"
  (
    cd "${WEB_DIR}"
    npm run dev -- --port "${PORT}"
  ) >"${WEB_LOG_FILE}" 2>&1 &

  for _ in $(seq 1 90); do
    if curl -sS -m 6 "${HEALTH_URL}" >/dev/null 2>&1; then
      echo "[daemon] web server is ready" | tee -a "${CYCLE_LOG_FILE}"
      return 0
    fi
    sleep 1
  done

  echo "[daemon] web server failed to become ready" | tee -a "${CYCLE_LOG_FILE}"
  return 1
}

run_job() {
  local path="$1"
  local payload="$2"
  local label="$3"

  local response_file
  response_file="$(mktemp)"
  local http_code
  http_code="$(curl -sS -m 900 -o "${response_file}" -w "%{http_code}" -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
    --data "${payload}")"

  if [[ ! "${http_code}" =~ ^2[0-9][0-9]$ ]]; then
    echo "[daemon] ${label} failed with HTTP ${http_code}" | tee -a "${CYCLE_LOG_FILE}"
    cat "${response_file}" | tee -a "${CYCLE_LOG_FILE}"
    rm -f "${response_file}"
    return 1
  fi

  local body
  body="$(cat "${response_file}")"
  rm -f "${response_file}"
  local ok
  ok="$(node -e 'const o=JSON.parse(process.argv[1]); process.stdout.write(String(Boolean(o.ok)));' "${body}" 2>/dev/null || echo false)"
  if [[ "${ok}" != "true" ]]; then
    echo "[daemon] ${label} returned ok=false" | tee -a "${CYCLE_LOG_FILE}"
    echo "${body}" | tee -a "${CYCLE_LOG_FILE}"
    return 1
  fi

  echo "[daemon] ${label} ok" | tee -a "${CYCLE_LOG_FILE}"
  return 0
}

run_cycle() {
  echo "[daemon] ===== cycle start $(TZ=Asia/Taipei date '+%F %T %Z') =====" | tee -a "${CYCLE_LOG_FILE}"

  ensure_web_server

  local connectors=(all)
  for connector in "${connectors[@]}"; do
    run_job "/api/internal/source-sync" "{\"dryRun\":false,\"connector\":\"${connector}\"}" "source-sync:${connector}"
  done

  run_job "/api/internal/source-discovery" '{"dryRun":false}' "source-discovery"
  run_job "/api/internal/story-scan" '{"dryRun":false}' "story-scan"
  run_job "/api/internal/story-verify" '{"dryRun":false}' "story-verify"
  run_job "/api/internal/thesis-refresh" '{"dryRun":false,"topN":50}' "thesis-refresh"
  run_job "/api/internal/thesis-rank" '{"dryRun":false,"topN":50}' "thesis-rank"
  run_job "/api/internal/research-report-build" '{"dryRun":false,"topN":10}' "research-report-build"
  run_job "/api/internal/report-build" '{"dryRun":false}' "report-build"

  echo "[daemon] ===== cycle end $(TZ=Asia/Taipei date '+%F %T %Z') =====" | tee -a "${CYCLE_LOG_FILE}"
}

while true; do
  if ! run_cycle; then
    echo "[daemon] cycle failed; retry in 300s" | tee -a "${CYCLE_LOG_FILE}"
    sleep 300
  else
    echo "[daemon] sleep ${INTERVAL_SECONDS}s" | tee -a "${CYCLE_LOG_FILE}"
    sleep "${INTERVAL_SECONDS}"
  fi
done
