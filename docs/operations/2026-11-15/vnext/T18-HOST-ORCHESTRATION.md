# Fixed onsite host orchestration — admission first, fixed FD handoff

This source adapts the coordinator-supplied successful reader launcher, identified
onsite by SHA256 1de4b4c85b2859ae030f85a2424a6ba2e4e7d69ac1cde41e29573d38abefa9e4.
It preserves root-only capability delivery, the original restore lock, production
baseline comparisons, an 8 GiB one-use dm-crypt workspace, resource floors and
reverse cleanup. It does not claim byte equality with the original launcher.
The new root code and fixed unprivileged bootstrap are separately reviewed.
No root provisioning/mount/unit commands were run in Cloud.

## Already observed onsite

Exact e6e73ad asset-only admission passed both actual 2584/2586-member packages;
intentional RW bind rejected fixed_readonly_asset_mount_required. Receipt:
704524c19259df7ef9399a52b97a934bc44b2b93. The earlier systemd 255 probe observed
shared dedicated unit namespace cookies different from host, loopback only and
strict RO roots, with cleanup and unchanged formal signatures (7e0e253). Those
facts close the reported packaging incompatibility; they are not reusable
runtime permission, root-launcher execution evidence or real Next HTTP evidence.

## Fixed roots and exact source staging

| Input | Host path | Unit path |
| --- | --- | --- |
| Existing verified staging asset COPIES |/var/tmp/stockinsider-t18-fa1d6c-assets |/run/t18-assets, private RO bind |
| Fresh public reviewed source |/run/stockinsider-t18-host-source |/readonly/t18-source, private RO bind |
| Original private database manifest |/run/stockinsider-t17-5b65286/source/database-manifest.json |FD5 only; never bind this source tree |
| Original exclusive host lock |/run/stockinsider-t17-5b65286/restore-host.lock |FD6, same open description |

No root-global /run/t18-assets is created. No production release path is mounted,
chmodded or copied. Existing asset file bytes/modes remain unchanged. The root
launcher verifies fixed input root ownership, public readable source metadata,
reserved account/group identity and the host manager mount namespace. Run it
only from the exact fresh fixed source root in the systemd manager's host mount
namespace. Do not invoke it in Cloud or a caller-private mount namespace.

Start with the 45 verified 337dc5bd runtime blobs (the original host source plus
its two procfs replacements). Apply the exact THREE replacements in
[the current stage manifest](t18-host-broker-diagnostic-stage-manifest.json):
t18_app_broker.py, t18_host_plan.py and staging_t18_host.py. Retain the other
42 blobs unchanged, including the shared procfs observer and all four historical
migrations. The runtime source count remains 45. These five host files remain
required; do not mix old broker/output routing with the new collector:

- deployment/staging/vnext/t17_keyfd/t18_host_plan.py
- deployment/staging/vnext/t17_keyfd/t18_fd_handoff.py
- scripts/staging_t18_fd_bootstrap.py
- scripts/staging_t18_host_admission.py
- scripts/staging_t18_host.py

The original [host source receipt](t18-host-orchestration-receipt.json) is historical
evidence for 793c0cbc; [the procfs fix receipt](t18-host-procfs-receipt.json) records
337dc5bd. Use the current stage manifest for the three replacement SHA256/Git
blob IDs and [the broker diagnostic receipt](t18-host-broker-diagnostic-receipt.json)
for current test/review evidence. Tests/docs/receipts are not runtime dependencies.
Do not place database-manifest.json, env files, backups or
keys in this public source tree; the private manifest remains in the original
root-only location. The host coordinator must stage/verify exact Git blobs before
invoking root source, as with the previous 40-file staging. Metadata ownership is
not a substitute for reviewing exact source. No build artifacts from Cloud are
needed; both fixed genuine release packages and binaries stay onsite.

The coordinator's 793c0cbc no-key run rejected before sockets/key read because
glibc if_nameindex() required AF_NETLINK. The current shared observer instead
opens only /proc/self/net/dev read-only, reads at most 16385 bytes to detect
overflow, and rejects more than 16 KiB, malformed/truncated headers or rows,
duplicate names, over 64 interfaces, or counters outside the 16 uint64 columns.
Admission still requires exactly lo and the unchanged zero-capability/network
namespace checks. No broker address-family permission is expanded: the fixed
AF_UNIX/AF_INET/AF_INET6 allowlist remains. Missing/unreadable or unexpected procfs
observations reject without falling back to libc, another path or caller data.
The host reports app_broker_startup_refused or rest_broker_startup_refused if a
broker exits while its socket is awaited; these are fixed role-only labels and
do not include raw exceptions, stderr or journal contents. A socket that remains
absent with live brokers still reaches the bounded broker_socket_startup_deadline.
This source fix does not convert the failed onsite run into admission success.

The coordinator then verified exact 337dc5bd replacements and reported a no-key
failure after 3.965 seconds: app_broker_startup_refused, keyRead=false, unchanged
formal signatures and cleaned staging resources. This is the latest onsite
observation, not evidence that any later source has been admitted.

The current broker emits ONE failure-only JSON record on stdout with exactly
schema=stockinsider-t18-broker-refusal-v1, role=APP or REST, and one compiled tag.
There is no exception text, errno, path, namespace cookie, SQL, row or log field.
Fixed check groups cover namespace/interface/capability refusal, formal PG path
access, account/group, each prctl, each private work tmpfs, cgroup path/memory/
swap/tasks, each control socket operation, asset context entry, namespace cookie,
tool installation, exact Node version and peer accept/identity. runtime_or_cleanup
is the fixed fallback, never exception interpolation. Tags identify the refusing
check, not an inferred host-specific cause. The exact allowlist is in the receipt.

APP/REST retain StandardError=null. StandardOutput=null is removed ONLY for these
two new staging units, so existing systemd-run --pipe supplies the direct host
stdout pipe. This does not route broker diagnostics through the journal. Host
reader threads cap both broker streams at 512 bytes each, keep draining on
overflow, and refuse overflow/incomplete capture. DB capture retains its original
1 MiB cap. Node/PostgREST/app output continues to use its existing private sinks.
The host exports only one exact-schema, duplicate-free, allowlisted role/tag
record in brokerDiagnostics, never raw captured bytes. Normal exit 0 adds no
refusal. A complete record captured before cleanup also covers a still-waiting
systemd-run wrapper; exit-2 records of already-failed wrappers are collected after
draining. Import-time failure, kill or invalid/missing records can remain
NO_VALID_REFUSAL_RECORD. Refusals emitted only after an intentional cleanup stop
are not promoted to startup observations. Empty or classified diagnostics never
grant admission, trigger a retry, read a key or alter any existing gate/exit code.
Actual systemd stdout routing and the newly identified host check remain for the
coordinator's next no-key run. Cloud has tested real owned pipes and refusals,
not the three privileged onsite units.

## Modes

Run the fixed root entry with Python isolated mode. It accepts only a fixed mode
and, for invalid/real, the non-secret expected original manifest SHA256. There
is no command, URL, role, source/assets path, key-file or release override.

```sh
# Root onsite only: source/assets/group/cookie/cgroup prerequisites, no key/PG.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py admission

# Then fixed zero-key negative; still no real stdin key. Replace only digest.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py invalid \
  --manifest-sha256 EXPECTED_ORIGINAL_MANIFEST_SHA256

# The SAME fixed entry's real mode receives exactly 32 binary bytes plus EOF
# from the coordinator's existing trusted stdin channel. No bytes in argv.
/usr/bin/python3 -I -B /run/stockinsider-t18-host-source/scripts/staging_t18_host.py real \
  --manifest-sha256 EXPECTED_ORIGINAL_MANIFEST_SHA256
```

The two digest placeholders are not accepted literally. Use the non-secret
expected manifest digest already established by the trusted original launcher;
do not derive authority from this document or a previous PASS receipt. Cipher
identity is compiled to the existing 491423538-byte official ciphertext SHA256
f0845866ae749e88cbc0b9d0370e982ad8f5e9c98ce754cc68e45551f02202d4. A different
backup requires separate review, not a replacement path/hash command argument.
Never put key bytes in a shell command, environment, transcript or artifact.
Do not use stdin simultaneously to supply Python source and a backup key.

Exit 0 is a verified requested phase after cleanup: admission-only prerequisites,
expected invalid-key rejection, or the restricted fixed-old-pair daily exercise.
Real runner GAP remains exit 3, never a host success for rollback. Other failures
exit 2. Output is bounded JSON lines: runner/resource/cleanup observation, and a
fixed refusal record on failure. It contains no raw command output, SQL, app
payload, journal, private key or stdin bytes. Host wrappers must preserve exit 3.

## What admission actually does

Admission locks the original host restore lock and observes the four formal
services/current release/timer inventory without mutating them. It refuses
existing fixed staging units or any pre-existing mutable target directory. It
reserves locked no-login si-t18-db/app/rest accounts and the two dedicated groups;
UID/GID aliases, unrelated primary/supplementary users and active account processes
reject. Reserved locked system accounts remain for subsequent runs; they are not
removed automatically or confused with transient unit/process cleanup.

The prepare phase creates only new fixed staging directories and private bounded
APP/REST/JWT tmpfs mounts. It uses a plain empty DB work directory for scheduling;
NO encrypted-work admission is claimed. It does not open the database manifest,
cipher image, key, PG or real app. Fixed three transient units are launched from
immutable argv tuples: strict FS, private joined DB network, no capabilities,
production denials, DB 768 MiB/50%, APP 512 MiB/50%, REST 256 MiB/25%, no swap, 64 tasks,
bounded runtime/stop and control-group killing. Both /tmp and /var/tmp are
private 32 MiB tmpfs; the real backing-image directory is explicitly bound RO over
the private /var/tmp so kernel device/inode checks retain the original view. The no-key DB entry
observes the actual fixed RO assets, SO_PEERCRED/group/capability identity, kernel network
cookies and three cgroup memory budgets, then requests SHUTDOWN only. Brokers
may execute the fixed Node --version metadata probe; Next/PostgREST servers do
not start. Root seals the two broker socket parents/inodes before admission.

Initial available capacity is at least 23 GiB disk and 3 GiB memory. Live host floors
remain 15 GiB disk and 1.5 GiB memory; the unprivileged three-UID budget independently
subtracts actual maxima. Formal service PID/start/active state, release symlink
and timer inventory must be identical after every phase. The account and source
setup is not a reason to restart or repair a formal service if observations differ.

## Real/invalid capability handoff

Both data modes create the same original 8 GiB preallocated AES-XTS512 plain dm-crypt
workspace; its 64-byte random workspace key goes directly from /dev/urandom to
cryptsetup stdin. It is unrelated to the backup key. The retained root 0400 sealed
image is opened once with NOFOLLOW after validating its root/non-writable intake
and seal directories. Root mounts via that held FD, verifies the exact ciphertext
member identity, and passes its held read-only immutable inode. Original image
bytes/links/modes are not modified or deleted.

The DB bootstrap uses fixed root-owned 0711 /run/stockinsider-t18 and root:IPC 0660
handoff socket, SOCK_SEQPACKET, actual root peer, one V record and exactly six
SCM_RIGHTS descriptors. Root authenticates the connecting DB MainPID, exact static
UID/GID, system.slice cgroup and zero capabilities. It also observes all three
actual private namespace inodes/interfaces and capabilities before reading real
stdin. The control listener closes after one accept. Root then sends:

1. Exact 32+EOF key pipe (32 zero-valued bytes in invalid mode; root stdin only in real).
2. Held authenticated-source ciphertext descriptor.
3. Root-only manifest descriptor pinned by the expected digest.
4. SAME open host-lock description, retained by root through all cleanup.
5. Host backing directory for reserve/device identity.
6. Read-only preallocated workspace image for actual loop/dm binding.

The bootstrap rejects truncated/malformed rights, duplicates all six above 19
BEFORE closing originals/mapping 3–8, closes its socket and execs only the fixed
staging_restore_next_rollback.py --work-root /run/t18-db-work with a whitelist
environment. Handoff is bounded 45s for three-unit startup. No key is serialized
into the protocol, argv, env, disk, stdout or stderr; root readv uses a 33-byte
buffer, requires exact32+EOF within 5s and wipes it. The real unprivileged entry
reobserves its own OS/FD/key/manifest/custody/gates. Host mode or earlier receipts
cannot bypass any of them.

## Cleanup and interruption

Bounded reader threads drain all child pipes while units run; each DB buffer caps
at 1 MiB and each broker buffer at 512 bytes. They continue draining on overflow
and force refusal. The monitor samples
host reserve/work space and observable kernel unit-memory peaks every 150ms.
SIGTERM/INT/HUP defer cancellation to checkpoints so side effects cannot precede
ownership records; native commands time out. Cleanup stops only the three fixed
NEW unit names and verifies empty cgroups, then closes descriptors and reconciles
actual mounts, owned loops and random-name mapper/backing identity. An unknown
loop baseline never authorizes detaching retained source loops. Existing source
loops are excluded. Work image deletion requires zero remaining associations.
Unconfirmed cleanup quarantines the workspace rather than deleting an active
backing file. The original exclusive lock releases LAST, after resource cleanup
and formal signature comparison. Inputs, sealed image and old source stay intact.

A SIGKILL, host crash or power loss cannot execute Python finally. Such events
require coordinator-local inspection/cleanup of the compiled staging unit names
and newly created si-t18 workspace resources; no crash-proof recovery is claimed.
A failed cleanup must not be treated as permission to rerun or broad-delete files.
No full three-unit privileged/root or actual Next/PostgREST success was executed
in Cloud. The tests cover real SCM descriptors, bounded byte streams/output,
pure fixed argv, fail-closed Cloud entries and public PG/HTTP mechanisms. Actual
onsite execution remains separate from source review, formal A1/CI, HOLD, true
stock detail/new-radar acceptance and production continuity.
