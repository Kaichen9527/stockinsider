#!/usr/bin/env bash
set -euo pipefail

: "${HOME:=/Users/kaerchen}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

NVM_BIN_DIR="$(find "${HOME}/.nvm/versions/node" -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -n 1 || true)"
export PATH="${NVM_BIN_DIR:+${NVM_BIN_DIR}:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env"
  set +a
fi

if [[ -f "${ROOT_DIR}/.env.local" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/.env.local"
  set +a
fi

export PORT="${PORT:-3010}"
export BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"

cd "${ROOT_DIR}"
exec node scripts/runtime/auth-source-worker-cli.js --config config/runtime/auth-source-dag.json
