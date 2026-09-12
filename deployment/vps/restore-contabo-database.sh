#!/usr/bin/env bash
set -euo pipefail

# Consumes a pg_dump custom archive from stdin after the local operator has
# authenticated and decrypted it. The archive is never written on the VPS.
# This prepares the database only; it does not activate PostgREST or web traffic.

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cluster_name=stockinsider
stage_database=stockinsider_stage
final_database=stockinsider
toc_path=${1:-}
started=false

stop_on_failure() {
  local status=$?
  if [[ "$status" -ne 0 && "$started" == true ]]; then
    pg_ctlcluster 17 "$cluster_name" stop --mode fast >/dev/null 2>&1 || true
  fi
}
trap stop_on_failure EXIT

if [[ $(id -u) -ne 0 ]]; then
  echo "restore-contabo-database.sh must run as root" >&2
  exit 1
fi
if [[ ! "$toc_path" =~ ^/var/lib/stockinsider/restore/[0-9a-f]{40}[.]toc$ ]]; then
  echo "reviewed restore list path required" >&2
  exit 1
fi
if [[ ! -f "$toc_path" || -L "$toc_path" ]]; then
  echo "reviewed restore list is missing or unsafe" >&2
  exit 1
fi
read -r toc_owner toc_group toc_mode < <(stat -c '%U %G %a' "$toc_path")
if [[ "$toc_owner" != root || "$toc_group" != root || "$toc_mode" != 600 ]]; then
  echo "reviewed restore list permissions invalid" >&2
  exit 1
fi
if [[ $(pg_lsclusters --no-header | awk -v name="$cluster_name" '$1==17&&$2==name {print $3":"$4}') != 5432:down ]]; then
  echo "dedicated PostgreSQL cluster must exist and be stopped" >&2
  exit 1
fi

# Both names must be absent. A failed prior attempt remains preserved for
# diagnosis and must be handled explicitly, never silently replaced.
pg_ctlcluster 17 "$cluster_name" start -- \
  -o "-c wal_level=minimal -c max_wal_senders=0 -c archive_mode=off"
started=true
if sudo -u postgres psql --no-psqlrc --tuples-only --no-align --dbname=postgres \
  --command "SELECT 1 FROM pg_database WHERE datname IN ('$stage_database','$final_database') LIMIT 1" \
  | grep -qx 1; then
  echo "StockInsider restore database already exists; refusing replacement" >&2
  exit 1
fi

sudo -u postgres createdb --template=template0 --encoding=UTF8 --locale=C "$stage_database"
sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$stage_database" \
  --file="$repo_root/deployment/vps/bootstrap-stockinsider-postgres.sql" >/dev/null
sudo -u postgres pg_restore --dbname="$stage_database" --use-list="$toc_path" \
  --exit-on-error --no-password
sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$stage_database" \
  --file="$repo_root/migrations/20260911_contabo_data_plane_v1.sql" >/dev/null
verification=$(sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
  --dbname="$stage_database" --file="$repo_root/deployment/vps/verify-contabo-database.sql")

sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=postgres \
  --command "ALTER DATABASE $stage_database RENAME TO $final_database" >/dev/null
pg_ctlcluster 17 "$cluster_name" stop --mode fast
started=false
pg_ctlcluster 17 "$cluster_name" start
started=true
sudo -u postgres psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
  --dbname="$final_database" --command \
  "SELECT current_database()='$final_database' AND current_setting('listen_addresses')=''" | grep -qx t

printf '%s\n' "$verification"
echo '{"databasePrepared":true,"postgrestActivated":false,"webSwitched":false}'
