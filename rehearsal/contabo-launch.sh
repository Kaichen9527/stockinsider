#!/usr/bin/env bash
# Coordinator-only local invocation. Never SSHes or touches system units.
# Requires a working user systemd manager with delegated controllers/user namespaces.
# Unsupported sandbox properties or strict runtime evidence MUST fail closed.
set -euo pipefail
[[ $(id -u) -ne 0 ]] || { echo nonroot_required >&2; exit 1; }
bundle=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
parent=${1:?usage: contabo-launch.sh EXISTING_PRIVATE_OUTPUT_PARENT}
[[ "$parent" == /var/tmp/si-fixture-output-* && -d "$parent" && ! -L "$parent" ]] || exit 1
[[ $(stat -c '%u:%a' "$parent") == "$(id -u):700" ]] || exit 1
[[ $(realpath -e -- "$parent") == "$parent" ]] || exit 1
[[ "$bundle" == /var/tmp/si-fixture-bundle-* ]] || { echo reviewed_bundle_under_var_tmp_required >&2; exit 1; }
for f in recovery-drill.py fixture-schema.sql; do [[ -f "$bundle/$f" && ! -L "$bundle/$f" ]] || exit 1; done
unit="si-fixture-$(id -u)-$(date +%s)-$$"
# All PostgreSQL work runs as this nonroot user in an isolated network namespace.
# /tmp is an independently capped 256MiB tmpfs; output has per-file 64MiB caps.
exec systemd-run --user --wait --collect --pipe --unit="$unit" \
 -p Type=exec -p RuntimeMaxSec=180 -p TimeoutStopSec=15 -p KillMode=control-group \
 -p MemoryMax=768M -p MemorySwapMax=0 -p TasksMax=32 -p CPUQuota=100% \
 -p LimitFSIZE=67108864 -p LimitCORE=0 -p LimitNOFILE=64 \
 -p PrivateUsers=yes -p PrivateNetwork=yes -p NoNewPrivileges=yes \
 -p ProtectSystem=strict -p ProtectHome=yes -p ProtectControlGroups=yes \
 -p RestrictAddressFamilies='AF_UNIX AF_INET' \
 -p 'TemporaryFileSystem=/tmp:rw,size=256M,mode=1777' \
 -p "ReadWritePaths=$parent" -p UMask=0077 \
 /usr/bin/python3 -I "$bundle/recovery-drill.py" \
 --pg-bin /usr/lib/postgresql/17/bin --temp-parent /tmp \
 --require-hard-sandbox --output "$parent/result-$unit"
