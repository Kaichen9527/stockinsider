#!/usr/bin/env bash
# StockInsider: Run Playwright-based source-sync connectors locally
# Threads, Instagram, and InvestAnchors require a real browser (Playwright)
# and cannot run in Vercel serverless. This script starts the local dev
# server, runs these three connectors, then stops.
#
# Usage:
#   ./scripts/playwright-sync.sh
#   CONNECTORS="investanchors threads" ./scripts/playwright-sync.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${ROOT_DIR}/web"
PORT="${PORT:-3020}"
BASE_URL="http://127.0.0.1:${PORT}"
HEALTH_URL="${BASE_URL}/api/internal/health-check"
LOG_FILE="${ROOT_DIR}/.agent/reports/playwright-sync-$(date +%Y%m%dT%H%M%S).log"
CONNECTORS="${CONNECTORS:-investanchors threads instagram}"

mkdir -p "${ROOT_DIR}/.agent/reports"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

if [[ -z "${INTERNAL_API_KEY:-}" ]]; then
  echo "[ERROR] INTERNAL_API_KEY is missing in .env"
  exit 1
fi

echo "[INFO] Starting local web server on port ${PORT}..."
(cd "${WEB_DIR}" && npm run dev -- --port "${PORT}") >"${LOG_FILE}" 2>&1 &
DEV_PID=$!

cleanup() {
  echo "[INFO] Stopping dev server (PID ${DEV_PID})..."
  kill "${DEV_PID}" 2>/dev/null || true
  wait "${DEV_PID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "[INFO] Waiting for health-check..."
for _ in $(seq 1 90); do
  if curl -sf -m 4 "${HEALTH_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf -m 4 "${HEALTH_URL}" >/dev/null 2>&1; then
  echo "[ERROR] Server did not start. Check log: ${LOG_FILE}"
  exit 1
fi
echo "[OK] Server ready."

for connector in ${CONNECTORS}; do
  echo "[INFO] Running source-sync?connector=${connector} ..."
  result=$(curl -sS -m 300 -X POST "${BASE_URL}/api/internal/source-sync" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${INTERNAL_API_KEY}" \
    -d "{\"connector\":\"${connector}\"}")
  records=$(echo "${result}" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d?.result?.recordsWritten ?? d?.recordsWritten ?? '?');" 2>/dev/null || echo '?')
  ok=$(echo "${result}" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d?.ok ?? 'unknown');" 2>/dev/null || echo 'unknown')
  echo "[${ok}] ${connector}: recordsWritten=${records}"
done

echo "[INFO] Playwright sync complete. Log: ${LOG_FILE}"
