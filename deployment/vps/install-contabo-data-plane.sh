#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
postgrest_config_source="$repo_root/deployment/vps/postgrest-stockinsider.conf"
nginx_config_source="$repo_root/deployment/vps/nginx/stockinsider-postgrest-loopback.conf"
unit_source="$repo_root/deployment/vps/systemd"

if [[ $(id -u) -ne 0 ]]; then
  echo "install-contabo-data-plane.sh must run as root" >&2
  exit 1
fi

for required in \
  /usr/local/bin/postgrest \
  /usr/sbin/nginx \
  "$postgrest_config_source" \
  "$nginx_config_source" \
  "$unit_source/stockinsider-postgrest.service" \
  "$unit_source/stockinsider-web-standalone.service" \
  /etc/stockinsider/data-plane.env \
  /etc/credstore.encrypted/stockinsider-postgrest-database-uri \
  /etc/credstore.encrypted/stockinsider-postgrest-jwt-secret \
  /etc/credstore.encrypted/stockinsider-postgrest-service-role-jwt \
  /etc/credstore.encrypted/stockinsider-provider-secrets-v1-key; do
  if [[ ! -f "$required" && ! -x "$required" ]]; then
    echo "required Contabo data-plane dependency is missing: $required" >&2
    exit 1
  fi
done

read -r data_plane_owner data_plane_group data_plane_mode < <(stat -c '%U %G %a' /etc/stockinsider/data-plane.env)
if [[ "$data_plane_owner" != root || "$data_plane_group" != stockinsider || "$data_plane_mode" != 640 ]]; then
  echo "Contabo data-plane environment permissions invalid" >&2
  exit 1
fi
grep -qx 'STOCKINSIDER_DATA_PLANE=contabo' /etc/stockinsider/data-plane.env
grep -qx 'STOCKINSIDER_POSTGREST_URL=http://127.0.0.1:3302/' /etc/stockinsider/data-plane.env

for credential in \
  /etc/credstore.encrypted/stockinsider-postgrest-database-uri \
  /etc/credstore.encrypted/stockinsider-postgrest-jwt-secret \
  /etc/credstore.encrypted/stockinsider-postgrest-service-role-jwt \
  /etc/credstore.encrypted/stockinsider-provider-secrets-v1-key; do
  owner=$(stat -c '%U' "$credential")
  mode=$(stat -c '%a' "$credential")
  if [[ "$owner" != root || ! "$mode" =~ ^(400|600)$ ]]; then
    echo "encrypted credential must be root-owned and mode 400 or 600: $credential" >&2
    exit 1
  fi
done

install -d -o root -g stockinsider -m 0750 /etc/stockinsider
install -d -o root -g stockinsider -m 0750 /var/lib/stockinsider
install -d -o stockinsider -g stockinsider -m 0700 /var/lib/stockinsider/artifacts
install -o root -g stockinsider -m 0640 "$postgrest_config_source" /etc/stockinsider/postgrest.conf
install -o root -g root -m 0644 "$nginx_config_source" /etc/nginx/conf.d/stockinsider-postgrest-loopback.conf
install -o root -g root -m 0644 "$unit_source/stockinsider-postgrest.service" /etc/systemd/system/stockinsider-postgrest.service
install -o root -g root -m 0644 "$unit_source/stockinsider-web-standalone.service" /etc/systemd/system/stockinsider-web-standalone.service

/usr/sbin/nginx -t
systemctl daemon-reload
systemctl enable stockinsider-postgrest.service
systemctl reload nginx

# Deliberately do not start PostgREST or replace the current web service here.
# Activation happens only after the restored database, writer identity and exact
# reviewed release have passed the isolated cutover canary.
echo "Contabo data-plane files installed; activation remains disabled"
