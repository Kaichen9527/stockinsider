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

drop_in_dir=/etc/systemd/system/stockinsider-web-standalone.service.d
drop_in_file=$drop_in_dir/20-writer-release.conf
writer_env_file=/etc/stockinsider/writer-release.env
install -d -m 0755 "$drop_in_dir"
# EnvironmentFile values override Environment= regardless of textual order.
# Keep the non-secret release identity in a dedicated later EnvironmentFile so
# an older value in the protected runtime file cannot survive activation.
install -o root -g stockinsider -m 0640 /dev/null "$writer_env_file"
printf 'STOCKINSIDER_WRITER_RELEASE_ID=%s\n' "$release_id" > "$writer_env_file"
printf '[Service]\nEnvironmentFile=%s\n' "$writer_env_file" > "$drop_in_file"
chmod 0644 "$drop_in_file"
systemctl daemon-reload
services=(stockinsider-web-standalone.service)
if systemctl cat stockinsider-internal-worker.service >/dev/null 2>&1; then
  services+=(stockinsider-internal-worker.service)
fi
systemctl restart "${services[@]}"
for service in "${services[@]}"; do systemctl is-active --quiet "$service"; done

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

if systemctl cat stockinsider-internal-worker.service >/dev/null 2>&1; then
  worker_ready=false
  for _attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 2 http://127.0.0.1:3101/api/radar/daily >/dev/null; then
      worker_ready=true
      break
    fi
    sleep 1
  done
  if [[ "$worker_ready" != true ]]; then
    echo "stockinsider internal worker did not become ready on 127.0.0.1:3101" >&2
    exit 1
  fi
fi

set -a
source /etc/stockinsider/stockinsider.env
set +a
APP_URL=http://127.0.0.1:3101 EXPECTED_APP_URL=http://127.0.0.1:3101 \
  /usr/bin/node /opt/stockinsider/current/scripts/call_internal_api.mjs \
  /api/internal/writer-release-activate "{\"releaseId\":\"$release_id\"}"
