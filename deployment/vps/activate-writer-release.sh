#!/usr/bin/env bash
set -euo pipefail

release_id=${1:-}
if [[ $(id -u) -ne 0 ]]; then
  echo "activate-writer-release.sh must run as root" >&2
  exit 1
fi
if [[ ! "$release_id" =~ ^[0-9a-f]{7,64}$ ]]; then
  echo "a full deployed git release id is required" >&2
  exit 1
fi
current_target=$(readlink -f /opt/stockinsider/current)
if [[ $(basename "$current_target") != "$release_id" ]]; then
  echo "release id does not match /opt/stockinsider/current" >&2
  exit 1
fi

drop_in_dir=/etc/systemd/system/stockinsider-web.service.d
drop_in_file=$drop_in_dir/20-writer-release.conf
install -d -m 0755 "$drop_in_dir"
printf '[Service]\nEnvironment=STOCKINSIDER_WRITER_RELEASE_ID=%s\n' "$release_id" > "$drop_in_file"
chmod 0644 "$drop_in_file"
systemctl daemon-reload
systemctl restart stockinsider-web.service
systemctl is-active --quiet stockinsider-web.service

# `systemctl is-active` only proves that the process was spawned. Next.js can
# still need a short interval before it binds loopback, so registering the
# writer immediately races startup and leaves the new service identity fenced
# out of Supabase. Wait for the local HTTP listener before activating it.
app_ready=false
for _attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3100/ >/dev/null; then
    app_ready=true
    break
  fi
  sleep 1
done
if [[ "$app_ready" != true ]]; then
  echo "stockinsider web did not become ready on 127.0.0.1:3100" >&2
  exit 1
fi

set -a
source /etc/stockinsider/stockinsider.env
set +a
APP_URL=http://127.0.0.1:3100 EXPECTED_APP_URL=http://127.0.0.1:3100 \
  /usr/bin/node /opt/stockinsider/current/scripts/call_internal_api.mjs \
  /api/internal/writer-release-activate "{\"releaseId\":\"$release_id\"}"
