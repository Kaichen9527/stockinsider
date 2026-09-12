#!/usr/bin/env bash
set -euo pipefail

release_id=${1:-}
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
data_plane_env=/etc/stockinsider/data-plane.env
legacy_service=stockinsider-web.service
web_service=stockinsider-web-standalone.service
postgrest_service=stockinsider-postgrest.service
activated=false
legacy_was_active=false

rollback() {
  local status=$?
  if [[ "$status" -ne 0 && "$activated" != true ]]; then
    systemctl disable --now "$web_service" "$postgrest_service" >/dev/null 2>&1 || true
    if [[ "$legacy_was_active" == true ]]; then systemctl start "$legacy_service" >/dev/null 2>&1 || true; fi
  fi
}
trap rollback EXIT

read_exact_env() {
  local key=$1
  mapfile -t rows < <(grep -E "^${key}=" "$data_plane_env" || true)
  if [[ ${#rows[@]} -ne 1 ]]; then echo "missing or duplicate $key" >&2; exit 1; fi
  printf '%s' "${rows[0]#*=}"
}

if [[ $(id -u) -ne 0 ]]; then echo "activate-contabo-cutover.sh must run as root" >&2; exit 1; fi
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then echo "full reviewed release id required" >&2; exit 1; fi
if [[ ! -f "$data_plane_env" ]] || [[ $(read_exact_env STOCKINSIDER_DATA_PLANE) != contabo ]]; then
  echo "reviewed Contabo environment is not installed" >&2; exit 1
fi
backend_id=$(read_exact_env STOCKINSIDER_BACKEND_ID)
principal_id=$(read_exact_env OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID)
configured_release=$(read_exact_env STOCKINSIDER_WRITER_RELEASE_ID)
if [[ ! "$backend_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
  || ! "$principal_id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
  || "$configured_release" != "$release_id" ]]; then
  echo "Contabo activation identity mismatch" >&2; exit 1
fi
current_target=$(readlink -f /opt/stockinsider/current)
if [[ $(basename "$current_target") != "$release_id" ]]; then
  echo "release id does not match /opt/stockinsider/current" >&2; exit 1
fi
for required in "$repo_root/deployment/vps/activate-contabo-data-plane.sql" \
  /etc/systemd/system/stockinsider-postgrest.service \
  /etc/systemd/system/stockinsider-web-standalone.service; do
  if [[ ! -f "$required" ]]; then echo "cutover dependency missing: $required" >&2; exit 1; fi
done
if [[ $(pg_lsclusters --no-header | awk '$1==17&&$2=="stockinsider" {print $4}') != online ]]; then
  echo "verified StockInsider database is not online" >&2; exit 1
fi
if systemctl is-active --quiet "$legacy_service" 2>/dev/null; then legacy_was_active=true; fi
systemd-analyze verify "$postgrest_service" "$web_service"

sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=stockinsider \
  --set=backend_id="$backend_id" --set=principal_id="$principal_id" --set=release_id="$release_id" \
  --file="$repo_root/deployment/vps/activate-contabo-data-plane.sql" >/dev/null

if [[ "$legacy_was_active" == true ]]; then systemctl stop "$legacy_service"; fi
systemctl enable --now "$postgrest_service"
systemctl enable --now "$web_service"
app_ready=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3100/api/radar/daily >/dev/null; then
    app_ready=true
    break
  fi
  sleep 1
done
if [[ "$app_ready" != true ]]; then echo "Contabo Radar canary did not become ready" >&2; exit 1; fi
if systemctl cat "$legacy_service" >/dev/null 2>&1; then systemctl disable "$legacy_service" >/dev/null 2>&1 || true; fi
activated=true
echo '{"schema":"stockinsider-contabo-cutover-v1","databaseActivated":true,"postgrestActivated":true,"webSwitched":true,"radarCanary":true}'
