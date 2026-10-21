# One-time restricted staging preflight identity

Source commit `5691bb62448cc3a05c744c0c79403aa9cb801f4b`:
[bootstrap.py](https://github.com/Kaichen9527/stockinsider/blob/5691bb62448cc3a05c744c0c79403aa9cb801f4b/deployment/staging/vnext/bootstrap.py).
SHA256 `564a76c835e3504af52764e1a9bc5b3d546a815a38c677c5384d6de14543a902`.
Eight actual isolated OpenSSH9.2 checks passed; receipt is adjacent. Contabo actual login, network grant and application/DB staging remain unverified. The exact original expiring memory-only VM key is used; no automatic renewal. The client expires 2026-10-22 08:08:18 Asia/Taipei (00:08:18Z).

Owner can paste the entire block into the **trusted Contabo Console**. Default `APPLY=0` performs read-only identity/capacity checks and downloads a new reviewed public script/public-key file; it changes no account/service. After independent source review, explicit `APPLY=1` on the first line permits only this new account/empty namespace and forced read-only gateway. Stop if the expected host, hash, time or capacity fails. No existing user/key/service/DB/scheduler is changed. Downloads use verified TLS, fixed commit and SHA; no credential is requested or printed. No cleanup is performed. A private-repository download denial stops before account mutation; it is not a reason to disable verification.

```bash
APPLY=0
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Use the account-owner root Console'; exit 1; }
[ "$(hostname -s)" = vmi3152467 ] || { echo 'Unexpected host; stop'; exit 1; }
printf 'Host: '; hostname -s
printf 'Addresses (expected locator 5.104.83.211): '; hostname -I
printf 'Trusted Console host fingerprint: '; ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
printf 'Public host key (not a private key): '; cat /etc/ssh/ssh_host_ed25519_key.pub
df -B1 /srv
grep '^MemAvailable:' /proc/meminfo
umask 077
vnext_console_dir=$(mktemp -d /tmp/stockinsider-vnext-console-XXXXXXXX)
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  'https://raw.githubusercontent.com/Kaichen9527/stockinsider/5691bb62448cc3a05c744c0c79403aa9cb801f4b/deployment/staging/vnext/bootstrap.py' \
  --output "$vnext_console_dir/bootstrap.py"
printf '%s  %s\n' '564a76c835e3504af52764e1a9bc5b3d546a815a38c677c5384d6de14543a902' "$vnext_console_dir/bootstrap.py" | sha256sum --check -
printf '%s\n' 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPIbm+pF5UQ1Y7x33aMBuDffWUBwHTi+Koby5T12vK6m stockinsider-vnext-oct22-staging-ephemeral' > "$vnext_console_dir/vm-public-key.pub"
ssh-keygen -lf "$vnext_console_dir/vm-public-key.pub"
python3 -I "$vnext_console_dir/bootstrap.py" > "$vnext_console_dir/dry-run.json"
cat "$vnext_console_dir/dry-run.json"
python3 -I - "$vnext_console_dir/dry-run.json" <<'PY'
import datetime,json,sys
r=json.load(open(sys.argv[1]))
assert r['capacityReady'], 'Unchanged15GiB disk /1.5GiB memory reserves not met'
remaining=(datetime.datetime.fromisoformat('2026-10-22T00:08:18+00:00')-datetime.datetime.now(datetime.timezone.utc)).total_seconds()
assert 300 < remaining <=3600, 'Original VM key too near expiry or expired; stop, do not renew'
print('Capacity/time checks passed; remaining original key seconds:',int(remaining))
PY
if [ "$APPLY" = 1 ]; then
  python3 -I "$vnext_console_dir/bootstrap.py" --apply \
    --public-key-file "$vnext_console_dir/vm-public-key.pub" \
    --expires-utc '2026-10-22T00:08:18Z' | tee "$vnext_console_dir/identity-receipt.json"
else
  [ "$APPLY" = 0 ] || { echo 'APPLY must be0or1'; exit 1; }
  echo 'DRY_RUN only. After review, set first line APPLY=1 and paste whole block again.'
fi
printf 'Receipt directory (retained; no cleanup): %s\n' "$vnext_console_dir"
```

Return only the Console's **hostname/addresses, public Ed25519 host key+SHA256 fingerprint, capacity/dry-run or identity receipt**. Never return a private key, password, environment dump or application secrets. Host locator is already known, not a request to invent a staging host. A console-observed key is needed to establish trust; no matching trusted host-key pin was found in the bounded repository deployment/runbook search.

Platform TCP routing still requires owner/admin authorization for **5.104.83.211:22 only**. Current task TCP domain/IP rules were empty. The available draft tool edits HTTP allowed domains and saves drafts but cannot publish or configure rawTCP routes. The saved HTTP draft is not an SSH grant. No SSH/VPS command has yet been run by this VM. The restricted command can only prove login/capacity/namespace; further app/DB/service/queue/storage provisioning requires independently reviewed finite commands, exact artifact and isolation proof. No generic root/sudo/docker access is requested.
