#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
unit_source="$repo_root/deployment/vps/systemd"
unit_target=/etc/systemd/system

if [[ $(id -u) -ne 0 ]]; then
  echo "install-systemd-schedules.sh must run as root" >&2
  exit 1
fi
if [[ ! -f /etc/stockinsider/stockinsider.env ]]; then
  echo "/etc/stockinsider/stockinsider.env is missing" >&2
  exit 1
fi
if ! grep -Eq '^INTERNAL_API_KEY=.+$' /etc/stockinsider/stockinsider.env; then
  echo "INTERNAL_API_KEY is missing from the protected environment file" >&2
  exit 1
fi
if ! grep -Eq '^TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED=true$' /etc/stockinsider/stockinsider.env; then
  echo "TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED=true is required for the approved Telegram schedule" >&2
  exit 1
fi
env_owner=$(stat -c '%U' /etc/stockinsider/stockinsider.env)
env_mode=$(stat -c '%a' /etc/stockinsider/stockinsider.env)
if [[ "$env_owner" != root || ! "$env_mode" =~ ^(600|640)$ ]]; then
  echo "/etc/stockinsider/stockinsider.env must be root-owned with mode 600 or 640" >&2
  exit 1
fi
for required in /opt/stockinsider/current/scripts/call_internal_api.mjs /usr/bin/node /etc/systemd/system/stockinsider-web.service; do
  if [[ ! -e "$required" ]]; then
    echo "required runtime dependency is missing: $required" >&2
    exit 1
  fi
done

install -m 0644 "$unit_source"/*.service "$unit_source"/*.timer "$unit_target"/
systemctl daemon-reload
systemctl enable --now stockinsider-source-refresh.timer stockinsider-research-cycle.timer stockinsider-health-check.timer
systemctl list-timers 'stockinsider-*' --no-pager
