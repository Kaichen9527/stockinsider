set -euo pipefail
key="$RUNNER_TEMP/pgdg.asc"
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$key"
fingerprint=$(gpg --batch --show-keys --with-colons "$key" | awk -F: '$1=="fpr" {print $10; exit}')
test "$fingerprint" = B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
sudo install -d -m 0755 /usr/share/postgresql-common/pgdg
sudo install -m 0644 "$key" /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
printf '%s\n' 'Types: deb' 'URIs: https://apt.postgresql.org/pub/repos/apt' 'Suites: noble-pgdg' 'Architectures: amd64' 'Components: main' 'Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc' | sudo tee /etc/apt/sources.list.d/pgdg.sources >/dev/null
sudo apt-get update
sudo apt-get install --yes --no-install-recommends postgresql-17 postgresql-client-17
bin=/usr/lib/postgresql/17/bin
for tool in pg_config initdb pg_ctl psql; do test -x "$bin/$tool"; done
"$bin/pg_config" --version | grep -E '^PostgreSQL 17\.'
echo "$bin" >> "$GITHUB_PATH"
echo "USER=$(id -un)" >> "$GITHUB_ENV"
