#!/usr/bin/env bash
set -euo pipefail

# Package-only preparation for the StockInsider data plane. This script does
# not start PostgreSQL, restore data, create credentials, or switch traffic.

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
pgdg_key=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
pgdg_source=/etc/apt/sources.list.d/pgdg.sources
cluster_name=stockinsider
cluster_data=/var/lib/postgresql/17/stockinsider
postgrest_version=v16.3
postgrest_sha256=4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d
postgrest_url="https://github.com/PostgREST/postgrest/releases/download/${postgrest_version}/postgrest-${postgrest_version}-linux-static-x86-64.tar.xz"

if [[ $(id -u) -ne 0 ]]; then
  echo "prepare-contabo-postgres.sh must run as root" >&2
  exit 1
fi
if [[ $(. /etc/os-release; printf '%s:%s' "$ID" "$VERSION_ID") != ubuntu:24.04 ]] || [[ $(uname -m) != x86_64 ]]; then
  echo "unsupported Contabo host" >&2
  exit 1
fi
if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)(5432)$'; then
  echo "port 5432 is already in use" >&2
  exit 1
fi
if systemctl is-active --quiet postgresql.service 2>/dev/null; then
  echo "an active PostgreSQL service already exists" >&2
  exit 1
fi

install -d -o root -g root -m 0755 /usr/share/postgresql-common/pgdg
install -d -o root -g root -m 0755 /etc/postgresql-common
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$pgdg_key.new"
observed_fingerprint=$(gpg --batch --show-keys --with-colons "$pgdg_key.new" \
  | awk -F: '$1=="fpr" {print $10; exit}')
if [[ "$observed_fingerprint" != B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8 ]]; then
  rm -f "$pgdg_key.new"
  echo "PostgreSQL repository signing key mismatch" >&2
  exit 1
fi
install -o root -g root -m 0644 "$pgdg_key.new" "$pgdg_key"
rm -f "$pgdg_key.new"

install -o root -g root -m 0644 \
  "$repo_root/deployment/vps/postgresql-common-createcluster.conf" \
  /etc/postgresql-common/createcluster.conf
source_tmp=$(mktemp)
archive_tmp=$(mktemp)
extract_tmp=$(mktemp -d)
trap 'rm -f "$source_tmp" "$archive_tmp"; rm -rf "$extract_tmp"' EXIT
printf '%s\n' \
  'Types: deb' \
  'URIs: https://apt.postgresql.org/pub/repos/apt' \
  'Suites: noble-pgdg' \
  'Architectures: amd64' \
  'Components: main' \
  'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' >"$source_tmp"
install -o root -g root -m 0644 "$source_tmp" "$pgdg_source"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes --no-install-recommends postgresql-17 postgresql-client-17 ca-certificates curl xz-utils

if ! getent passwd stockinsider >/dev/null; then
  echo "the existing StockInsider service account is missing" >&2
  exit 1
fi
usermod --append --groups postgres stockinsider

if pg_lsclusters --no-header | awk '{print $1":"$2}' | grep -qx "17:${cluster_name}"; then
  echo "StockInsider PostgreSQL cluster already exists; refusing to replace it" >&2
  exit 1
fi
if pg_lsclusters --no-header | grep -q .; then
  echo "an unexpected PostgreSQL cluster exists after package installation" >&2
  exit 1
fi

pg_createcluster 17 "$cluster_name" --port 5432 --start-conf manual --datadir "$cluster_data"
install -o root -g postgres -m 0640 "$repo_root/deployment/vps/postgresql-stockinsider.conf" \
  "/etc/postgresql/17/${cluster_name}/conf.d/stockinsider.conf"
install -o root -g postgres -m 0640 "$repo_root/deployment/vps/pg_hba-stockinsider.conf" \
  "/etc/postgresql/17/${cluster_name}/pg_hba.conf"

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "$postgrest_url" -o "$archive_tmp"
printf '%s  %s\n' "$postgrest_sha256" "$archive_tmp" | sha256sum --check --status
tar --extract --xz --file "$archive_tmp" --directory "$extract_tmp" postgrest
install -o root -g root -m 0755 "$extract_tmp/postgrest" /usr/local/bin/postgrest

test "$(pg_lsclusters --no-header | awk -v name="$cluster_name" '$2==name {print $4}')" = down
test "$(/usr/local/bin/postgrest --version | awk '{print $2}')" = "${postgrest_version#v}"
echo "StockInsider PostgreSQL and PostgREST are installed; cluster and traffic remain stopped"
