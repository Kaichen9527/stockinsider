set -euo pipefail
exec 8>/run/lock/vps-heavy-operation.lock
exec 9>/run/lock/stockinsider-production-write.lock
flock -n 8 || exit 75
flock -n 9 || exit 75
release=/opt/stockinsider-standalone/releases/169aad1b6cfa747f78ae3464b614f43c0749d806
test "$(readlink -f /opt/stockinsider/current)" = "$release"
/usr/bin/node "$release/scripts/contabo-host-resource-check.mjs" "$release/deployment/vps/capacity-watch-budget.json"
set -a
source /etc/stockinsider/stockinsider.env
set +a
APP_URL=http://127.0.0.1:3101 EXPECTED_APP_URL=http://127.0.0.1:3101 INTERNAL_API_TIMEOUT_MS=1500000 /usr/bin/node "$release/scripts/call_internal_api.mjs" /api/internal/pipeline-run '{"mode":"core","syncTimeoutMs":1200000}'
