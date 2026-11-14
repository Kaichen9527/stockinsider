# T18 fixed same-clone daily rollback — restricted onsite contract

## Evidence and acceptance scope

T17 real-backup DB restore passed onsite at bddce6ba with receipt commit
75e8493f0047da3d2cec7f0e2c7af8e7817f81f9. Reader preflight passed at e1987ea with
receipt58ce289cc6eecc585818f1be91a14c6ba6d6e3e7. Their exact sanitized JSON files
are retained here. The September19 backup has matching two-table/eleven-column
schema,131 home and131 daily valid snapshots, all262 older than26h, no missing
dates, UTC dates August16 through September14. Operator reported all formal
service/release/timer signatures unchanged and complete staging cleanup. These
are coordinator-reported onsite facts, not Cloud runtime admission.

This NEW workflow retains the authenticated backup's SAME clone until the fixed
old-release exercise finishes. It accepts no URL, command, role, credential path,
release selection or readiness flag. Original DB-only and reader-preflight APIs
remain independent. Every original DB gate precedes the app operation. Missing
genuine snapshot/schema produces an explicit GAP with exit3; it never inserts
replacement data. Key, ciphertext and manifest remain under the original FD3–8
binary-key/two-pass-GCM/kernel-immutable-custody/host-lock rules.

Accepted scope is the fixed OLD pair's daily snapshot API: original date,
stale_readonly, disabled action/acquisition authority, empty actionable stage if
present, no-store, exact stale/published HTTP headers, real static-file digest,
A→B→A, actual killed-B failed HTTP and automatic A recovery. Homepage200 is
HTTP_LIVENESS_ONLY. It is NOT genuine homepage/data acceptance. Stock details are
NOT_RUN_TWO_TABLE_SCOPE: both fixed packages use additional tables and a metadata
RPC; a200 candidate_detail_temporarily_unavailable shell proves no true detail.
The two-table proxy stays minimal and denies ALL RPC. The new-radar release and
real detail contracts require separate403 acceptance; full release remains false.

## Fixed artifacts

Host creates staging COPIES, without changing the retained production releases.
Mount a root-owned private RO tree at /run/t18-assets containing exactly the two
release directories plus the fixed PostgREST executable. Keep it immutable to all
three unprivileged UIDs until every unit stops. No symlinks, hardlinks, special files, env/key/backup files or caller pins are
accepted. The only group-writable member exception is ordinary0664 at an exact
original manifest pin, root UID/GID0, nlink1, bound to the live private RO release
FD/mount. All other group/other-writable files and writable directories reject. Exact
manifest member sets/modes/streamed hashes and Next16.3.4 BUILD_IDs are checked.

| Artifact | Fixed identity |
| --- | --- |
| A |169aad1b6cfa747f78ae3464b614f43c0749d806 |
| A manifest |2893ad708f4164abdc269e40bfcf15d167e00ee7e4e6b539e82305e25830575a |
| B |dd59817f750684b093965f539dd4de466be13077 |
| B manifest |344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a |
| /run/t18-assets/postgrest |16.3; SHA2560cf367dc2ee47d5c648baa2952e25bdf299de4e1998d31e251bb00d129262d71 |
| /usr/bin/node |v22.23.1; SHA25693956de2e59480474a7b46571da1651180b1a050cdf32641ebec4ce6e478e068 |

Node is separately root-owned on an observed RO mount. Both binaries are held and
version-checked; no PATH or /usr/bin/node22 fallback is permitted in this workflow.
Assets are verified in the controller and each broker. A missing official asset
is a refusal, not an excuse to execute a generated substitute.

## Three OS identities and fixed channels

Prepare three dedicated nonroot system accounts, with no password/login shell,
no elevated groups/capabilities and no collision with any formal/staging SSH UID:

| Account | Supplementary groups | Hard memory / CPU / tasks |
| --- | --- | --- |
|si-t18-db |stockinsider-t18-ipc, stockinsider-t18-dbaccess |768MiB /50% /64 |
|si-t18-app |stockinsider-t18-ipc ONLY |512MiB /50% /64 |
|si-t18-rest |stockinsider-t18-ipc, stockinsider-t18-dbaccess |256MiB /25% /64 |

APP must lack DB-access group in primary/supplementary/real/saved/filesystem GIDs.
No actor has effective/permitted/ambient capabilities. No UID is production's
stockinsider/postgres. Actual peer UID/name/groups/caps come from SO_PEERCRED and
/proc status, not a caller JSON assertion. Root seals the fixed broker sockets:

- /run/t18-broker/control.sock (APP), /run/t18-rest/control.sock (REST).
- Each parent root:stockinsider-t18-ipc0750; socket same owner/group0660.
- Controller sees dedicated RO private binds of these control roots/socket.
- Each broker accepts one connection, authenticates exact si-t18-db, and closes
  its listening socket. Controller connects before ANY restored PG child starts;
  PG cannot inherit those channels or read the nondumpable controller's FDs.
- Broker HELLO observes a fresh socket's kernel SO_NETNS_COOKIE, and the controller
  independently compares its actual cookie BEFORE secrets. Every reply is bound
  to that cookie. Cookies stay private IPC metadata, never normal receipts.
- Cross-UID /proc status/cgroup metadata must be readable. Do not use ProtectProc
  settings that hide it and then substitute account names for observations.

All actors must share ONLY the dedicated DB unit's private loopback network.
Systemd255 JoinsNamespaceOf plus PrivateNetwork provides the host setup; actual
cookie equality is checked too. No public listener/Funnel/remote destination is
used. Ports are fixed: Next3000, raw PostgREST3301, read proxy3302. Existing occupied
ports reject. The two broker example units and DB drop-in are reviewable templates
for NEW stockinsider-t18-* units only. Never apply them to a formal unit or replace
its account, mounts, network namespace, release pointer or environment.

## Filesystem/host handoff

Host prepares these PRIVATE mounts in namespaces visible to the systemd manager;
a caller-private /var/tmp mount may be invisible to manager-created units. Make
propagation private; do not alter existing filesystems or formal mounts.

| Path | Ownership / bounds / use |
| --- | --- |
|/readonly/t18-source |root-owned RO exact reviewed source, all Python modules and pinned migration/bootstrap/TOC/verification inputs |
|/run/t18-db-work |si-t18-db0700, original dedicated preallocated8GiB dm-crypt ext4 work volume |
|/run/t18-pg |si-t18-db:stockinsider-t18-dbaccess0750, initially EMPTY; dedicated PG Unix socket only |
|/run/t18-app-work |si-t18-app0700 dedicated private tmpfs≤256MiB (128MiB suggested) |
|/run/credentials/stockinsider-t18-app |si-t18-app0700 dedicated private tmpfs≤256MiB (1MiB suggested), initially EMPTY |
|/run/t18-rest-work |si-t18-rest0700 dedicated private tmpfs≤256MiB (64MiB suggested) |
|/run/t18-assets |root-owned private RO fixed asset tree |

APP cannot traverse PG socket/work directories. REST can traverse only the shared
socket parent, never PGDATA or the controller's private management socket. All
production PG/config locations remain inaccessible. Do not bind formal credential
directories into any unit. Child env is constructed from a whitelist; inherited
PG/Supabase/internal/writer credentials are not used.

The reviewed DB FD-loader must exec ONLY:

```sh
/usr/bin/python3 -I -B /readonly/t18-source/scripts/staging_restore_next_rollback.py \
  --work-root /run/t18-db-work
```

It must provide the original trusted FD3 key pipe, FD4 held immutable ciphertext,
FD5 manifest, FD6 exclusive root-owned lock, FD7 host-capacity directory and FD8
preallocated-image binding. This source does not invent or replace that host key
handoff and must not be run with pathname key files. Include all four historical
CHECK migration pins; the first onsite attempt once omitted them and correctly
refused. No production backup or key is transferred to Cloud.

Start the NEW DB unit with its prepared loader, then start its two broker units
in that private namespace. The DB entry waits≤15s for the root-sealed socket
inodes BEFORE reading the key. This wait coordinates startup only; later actual
peer/group/cookie/cgroup/asset admission cannot be replaced by pathname presence.
Initially let each broker UID bind its own socket, then root seals parent/socket
ownership/modes as above. All this must finish within the bounded wait. Ordinary
unit examples alone do not transport the key FDs; retain the reviewed host loader.

Actual admission sums all THREE cgroup memory maxima before reserving≥1.5GiB
host MemAvailable. Swap is zero, cgroups distinct, pids.max≤64, CPU maxima bounded
as above and controls root-owned/nondelegated. Original host disk reserve15GiB
outside the prepaid image and DB/WAL/growth work-capacity checks remain. All
units have RuntimeMaxSec/TimeoutStopSec and KillMode=control-group; no cloud call
starts units, creates users, mounts filesystems or grants host permissions.

## Fixed operations and refusal tests

After all DB checks pass, source observes genuine home/daily rows and fingerprints
snapshot/state data and constraint bits. It creates only fresh clone-local
roles t18_authenticator/t18_reader. No elevated membership/BYPASSRLS, no app-table
writes, no app routine/sequence privileges or nonpublic schema usage; eleven
SELECT columns and restrictive plus permissive reader RLS policies only. Source
preserves failed publication-state rows so stale detection cannot hide failures.
It revokes restored PUBLIC app grants across non-system schemas. An existing RLS
helper dependency that no longer works rejects; never auto-regrant broad RPCs.
System pg_catalog builtins remain available, which is why Next is forbidden raw
PG access and PostgREST has its separate trusted UID and fixed public schema.

Only the owned clone restarts to expose its second Unix socket. Fixed pg_ident
maps si-t18-rest to the unprivileged authenticator; fixed HBA allows that mapping
and DB-admin peer, then rejects everything else. PG keeps listen_addresses=''.
REST verifies peer admin-login denial, role escalation and write/create denial.
Fresh HS256 JWT lifetime is15minutes, minted AFTER restore. PostgREST config uses
a sealed memfd; only the staging JWT enters APP's private tmpfs credential file,
which is removed on close. Neither secret enters argv/stdout/receipt/artifact.

The3302 proxy only forwards exact GET/HEAD queries on radar_public_snapshots and
radar_publication_state with fixed home/daily filters/select/order/limit. It
replaces client credentials with its staging token. All RPC, writes, arbitrary
URLs/hosts/paths, redirects, oversized/slow/incomplete messages reject. Direct
PostgREST write/RPC denial is checked too; GET-only proxy alone is insufficient.

A→B→A uses actual daily HTTP/stale/date/authority checks and static byte digests.
Then B is SIGKILLed, fresh HTTP must fail, and fixed A is automatically started
and rechecked. Snapshot/state data and original constraint bits must still hash
the same. No snapshot insertion, refresh, timestamp update or producer request
is permitted. Process groups are killed/reaped; broker and DB cgroups must have
only their controller at successful cleanup, and all three listeners close.
Host must still stop/reap the transient units, verify empty cgroups/remove private
mounts/loop/dm-crypt/custody and compare formal four-service/release/timer signatures.
A Python receipt cannot attest external formal continuity or host cleanup.

Exit0 means only this restricted OLD-pair daily exercise passed. Exit3 means DB
verified but genuine data/schema gap, no app exercise. Exit2 is admission or test
refusal/failure. HOLD, formal A1/CI/release gates, provider recovery, true stock
detail/new-radar acceptance and production continuity remain separate.

## Cloud evidence and exact limits

Cloud ran generated-public-only PG17 role/RLS/ACL tests, real loopback proxy tests,
actual AF_UNIX/frame/deadline/kernel-cookie checks, immutable asset negatives,
strict receipt tests and real PG open-client shutdown tests. A→B→A/fault mechanics
used distinct generated Python HTTP processes. They are explicitly NOT Next or
PostgREST binaries and cannot grant the real workflow authority.

Official PostgREST16.3 download returned proxy503 in both normal and approved
outer command paths; the official package helper is absent. The fixed onsite
Node binary, root-owned RO asset tree, three OS users/cgroups/control sockets and
same-clone runtime do not exist here. Actual Cloud entries reject, without falling
back to same-UID or fixture execution. Real two-package HTTP is NOT_RUN pending
onsite validation. Ordinary Next16.3.4 webpack compilation succeeds, but full build
still fails pre-existing layout/page export type checks; no app source changed.
