#!/usr/bin/env bash
set -euo pipefail

# TPEx currently serves only its leaf certificate from some edge locations.
# Install the public intermediate named by that leaf's AIA so curl/Node can
# keep normal TLS verification enabled. The certificate is fetched over HTTPS
# and pinned before it is added to the host trust store.

if [[ $(id -u) -ne 0 ]]; then
  echo "install-tpex-ca-intermediate.sh must run as root" >&2
  exit 1
fi

certificate_url=https://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt
expected_fingerprint=01:AF:23:24:D0:98:09:8F:5E:0C:DF:6F:AA:BA:DA:43:0B:21:CC:E7:77:F4:7E:AC:B2:62:48:B2:FD:A3:E5:31
certificate_der=$(mktemp)
certificate_pem=$(mktemp)
trap 'rm -f "$certificate_der" "$certificate_pem"' EXIT

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "$certificate_url" -o "$certificate_der"
observed_fingerprint=$(openssl x509 -inform DER -in "$certificate_der" \
  -noout -fingerprint -sha256 | cut -d= -f2)
if [[ "$observed_fingerprint" != "$expected_fingerprint" ]]; then
  echo "TWCA intermediate fingerprint mismatch" >&2
  exit 1
fi
openssl x509 -inform DER -in "$certificate_der" -out "$certificate_pem"
openssl verify -CApath /etc/ssl/certs "$certificate_pem"
install -o root -g root -m 0644 "$certificate_pem" \
  /usr/local/share/ca-certificates/TWCA_SSL_2023.crt
update-ca-certificates

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  --connect-timeout 10 --max-time 30 \
  https://www.tpex.org.tw/openapi/v1/tpex_daily_trading_index >/dev/null
echo "TPEx TLS chain verified with pinned TWCA intermediate"
