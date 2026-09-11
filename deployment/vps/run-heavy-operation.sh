#!/usr/bin/env bash
set -euo pipefail

operation=${1:-}
budget_file=${2:-}
shift $(( $# >= 2 ? 2 : $# ))
if [[ ! "$operation" =~ ^(build|restore|backfill)$ || ! "$budget_file" = /* || ${1:-} != -- || $# -lt 2 ]]; then
  echo "usage: run-heavy-operation.sh build|restore|backfill ABSOLUTE_BUDGET_JSON -- ABSOLUTE_REVIEWED_COMMAND [args...]" >&2
  exit 64
fi
shift
command_path=$1
if [[ ! "$command_path" =~ ^/opt/stockinsider/(current|releases/[0-9a-f]{40})/deployment/vps/operations/[a-zA-Z0-9._-]+$ ]]; then
  echo "reviewed StockInsider operation path required" >&2
  exit 64
fi
if [[ ! -x "$command_path" || ! -f "$budget_file" ]]; then
  echo "reviewed command or capacity budget missing" >&2
  exit 66
fi

exec 8>/run/lock/vps-heavy-operation.lock
exec 9>"/run/lock/stockinsider-${operation}.lock"
if ! flock -n 8; then
  echo "another VPS heavy operation is active" >&2
  exit 75
fi
if ! flock -n 9; then
  echo "the requested StockInsider operation is active" >&2
  exit 75
fi
/usr/bin/node /opt/stockinsider/current/scripts/contabo-host-resource-check.mjs "$budget_file"
exec "$@"
