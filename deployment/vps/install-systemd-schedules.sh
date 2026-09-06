#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
unit_source="$repo_root/deployment/vps/systemd"
unit_target=/etc/systemd/system
runner_principal_id=a11d4e67-7d0a-4c44-8a9d-1d5c3b875001
runtime_env_file=/etc/stockinsider/stockinsider.env

if [[ $(id -u) -ne 0 ]]; then
  echo "install-systemd-schedules.sh must run as root" >&2
  exit 1
fi
if [[ ! -f "$runtime_env_file" ]]; then
  echo "$runtime_env_file is missing" >&2
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
if ! grep -Eq '^CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED=(true|false)$' /etc/stockinsider/stockinsider.env; then
  echo "CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED=true|false is required so research cannot silently use an unavailable price history" >&2
  exit 1
fi
env_owner=$(stat -c '%U' /etc/stockinsider/stockinsider.env)
env_mode=$(stat -c '%a' /etc/stockinsider/stockinsider.env)
if [[ "$env_owner" != root || ! "$env_mode" =~ ^(600|640)$ ]]; then
  echo "/etc/stockinsider/stockinsider.env must be root-owned with mode 600 or 640" >&2
  exit 1
fi

# The V3 client deliberately requires a project-scoped tuple and an approved
# digest in addition to the service-role key. Derive the non-secret tuple
# metadata only after validating the protected runtime file.
set -a
# shellcheck disable=SC1091
source "$runtime_env_file"
set +a
supabase_project_ref=${SUPABASE_PROJECT_REF:-}
supabase_service_role_key=${SUPABASE_SERVICE_ROLE_KEY:-}
if [[ ! "$supabase_project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  echo "SUPABASE_PROJECT_REF must be a 20-character project reference" >&2
  exit 1
fi
if [[ ${#supabase_service_role_key} -lt 32 ]]; then
  echo "SUPABASE_SERVICE_ROLE_KEY is unavailable" >&2
  exit 1
fi
service_role_digest=$(printf '%s' "$supabase_service_role_key" | sha256sum | cut -d' ' -f1)
unset supabase_service_role_key SUPABASE_SERVICE_ROLE_KEY
for required in /opt/stockinsider/current/scripts/call_internal_api.mjs /usr/bin/node /etc/systemd/system/stockinsider-web.service; do
  if [[ ! -e "$required" ]]; then
    echo "required runtime dependency is missing: $required" >&2
    exit 1
  fi
done

install -m 0644 "$unit_source"/*.service "$unit_source"/*.timer "$unit_target"/
install -d -m 0755 /etc/systemd/system/stockinsider-web.service.d
printf '[Service]\nEnvironment=OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID=%s\nEnvironment=OPPORTUNITY_V3_SUPABASE_PROJECT_REF=%s\nEnvironment=OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256=%s\n' \
  "$runner_principal_id" "$supabase_project_ref" "$service_role_digest" \
  > /etc/systemd/system/stockinsider-web.service.d/30-opportunity-runner-principal.conf
chmod 0644 /etc/systemd/system/stockinsider-web.service.d/30-opportunity-runner-principal.conf
systemctl daemon-reload
systemctl enable --now stockinsider-source-refresh.timer stockinsider-research-cycle.timer stockinsider-health-check.timer
systemctl list-timers 'stockinsider-*' --no-pager
