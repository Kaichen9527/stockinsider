#!/usr/bin/env bash
set -euo pipefail

: "${HOME:=/Users/kaerchen}"

SERVICE="${1:-}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${HOME}/Library/Application Support/StockInsiderRuntime"
AGENT_DIR="${ROOT_DIR}/.agent"
REPORTS_DIR="${AGENT_DIR}/reports"
RUNTIME_LOG_DIR="${AGENT_DIR}/runtime"
BOOT_LOG="${AGENT_DIR}/${SERVICE:-unknown}.launchd.boot.log"

mkdir -p "${AGENT_DIR}" "${REPORTS_DIR}" "${RUNTIME_LOG_DIR}" "${RUNTIME_DIR}"

NVM_BIN_DIR="$(find "${HOME}/.nvm/versions/node" -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -n 1 || true)"
export PATH="${NVM_BIN_DIR:+${NVM_BIN_DIR}:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export PORT="${PORT:-3010}"
export BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"

load_env_file() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return
  fi
  set -a
  # shellcheck source=/dev/null
  source "${file}"
  set +a
}

load_env_file "${RUNTIME_DIR}/runtime.env"
load_env_file "${RUNTIME_DIR}/runtime.env.local"
load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

write_marker() {
  local message="$1"
  printf '[%s] [%s] %s\n' "$(timestamp)" "${SERVICE:-unknown}" "${message}" | tee -a "${BOOT_LOG}"
}

write_marker "boot root=${ROOT_DIR} home=${HOME} port=${PORT} base_url=${BASE_URL}"
write_marker "path=${PATH}"

cd "${ROOT_DIR}"

case "${SERVICE}" in
  web)
    COMMAND=(/bin/bash "${ROOT_DIR}/scripts/local-web-service.sh")
    ;;
  auth-source-worker)
    COMMAND=(/bin/bash "${ROOT_DIR}/scripts/local-auth-source-worker.sh")
    ;;
  data-collect)
    COMMAND=(node "${ROOT_DIR}/.agent/scripts/data-collect-local.js")
    ;;
  *)
    write_marker "unknown service '${SERVICE}'"
    exit 78
    ;;
esac

write_marker "exec ${COMMAND[*]}"

"${COMMAND[@]}" &
CHILD_PID=$!
write_marker "child_pid=${CHILD_PID}"

terminate_child() {
  write_marker "received termination signal, forwarding to child ${CHILD_PID}"
  kill -TERM "${CHILD_PID}" >/dev/null 2>&1 || true
}

trap terminate_child TERM INT

set +e
wait "${CHILD_PID}"
EXIT_CODE=$?
set -e

write_marker "exit_code=${EXIT_CODE}"
exit "${EXIT_CODE}"
