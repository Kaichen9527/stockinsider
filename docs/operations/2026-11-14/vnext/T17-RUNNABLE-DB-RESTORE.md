# Runnable Linux staging DB restore — dedicated host execution only

Parent `aad99a49be95e09f6a58c4f38dda2ca79c25c408`. This adds a NEW runnable
DB-only entry; it does NOT replace historical disabled facades, change native
HOLD/CI, activate service/writer/timer, or grant release acceptance. Cloud receives
only generated public material. Actual source/key and execution stay onsite.

## Entry and fixed capability handoff

Host root/coordinator provisions the dedicated namespace, mounts, cgroup and lock,
then launches the reviewed source as a nonroot DynamicUser with these OPEN FDs.
This controlled root handoff and uncompromised kernel are explicit trust premises;
an arbitrary caller JSON/receipt/Boolean is never a runtime admission mechanism.
Do not put key bytes in environment, argv, console, a key file or a Git artifact.

| FD | Host-provided capability and lifecycle |
|---|---|
|3|Anonymous binary pipe READ end, owner root or current UID, exactly32 bytes then EOF. Close ALL producer aliases after32 bytes. Five-second EOF deadline. Closed before any SQL child; owned buffers cleared.|
|4|READONLY held regular inode already fs-verity SHA256 sealed. Never reopened by pathname. Full-size sources are NOT copied to memfd/RAM.|
|5|READONLY original DB manifest receipt JSON, <=1MiB. Privately captured once then FD closed; Node JSON.stringify context matches GCM authenticated header.|
|6|Root-owned single-link host lock inode, not group/other writable. Adapter atomically acquires/retains EX flock on THIS open description. Parent must not unlock its shared OFD until unit/children stop. Closed LAST.|
|7|READONLY directory FD on the host filesystem holding the preallocated work image; reserve is measured OUTSIDE that image.|
|8|READONLY root-owned single-link fully preallocated work image file; no group/other write. Metadata only; never reads image bytes or a dm-crypt key.|

These descriptors must survive exec into the entry at exactly3..8. Close unrelated
inherited descriptors. Host broker/keystore must do FD mapping in the unit's
approved execution context; no FD-store/broker/backend is invented here. The key
pipe may be passed through an existing independently approved binary transport,
but it must end as FD3, not stdin interpreted as SQL or a pathname. This source
does not SSH, fetch keys or require their transfer to Cloud.

Inside the already provisioned sandbox, with code and pinned SQL/helper files
read-only, PG17 at `/usr/lib/postgresql/17/bin`, Node22 at `/usr/bin/node22`
(or the conventional `/usr/bin/node`), Python
cryptography and working DynamicUser NSS/peer identity:

```sh
/usr/bin/python3 -I -B /readonly/reviewed-repo/scripts/staging_restore_database.py \
  --work-root /run/reviewed-private-work-mount
```

Only work-root is an argument. There is no key/backup filename, connection, SQL,
executable, approval, fixture or live override. Failure exit2 is a FAILED/REJECTED
receipt, not a restore success. Normal stdout is one sanitized JSON object; raw
rows, articles, SQL/errors/logs, keys, private paths and manifest IDs are excluded.

## Actual admission observations, not a caller assertion

The parent process first sets and observes no-new-privileges, core-size0 and
PR_SET_DUMPABLE=0 before reading key. Restored SQL runs under the PG OS UID and
must not ptrace/open the key parent's memory. Child subprocesses inherit only
whitelisted environment and explicit stdin; key/capability FDs are close-on-exec.

`staging_admission.py` observes nonroot, zero effective/permitted/ambient caps,
only loopback network interfaces, and a different PID1 network namespace when
that root namespace is observable (permission-denied is honestly unavailable).
It requires cgroupv2 finite memory<=768MiB and swap0. Root filesystem must be
read-only. Known production PG/config paths must be inaccessible/absent. Runtime
PG connections use no inherited credentials/service/pgpass settings.

Work-root must be the EXACT private, non-shared RW ext4 mountpoint owned0700 by
the DynamicUser, not merely a subdirectory on host ext4. It is tied through
kernel sysfs dm UUID `CRYPT-` -> one loop device -> backing-file metadata to FD8's
same dev/inode and FD7's host filesystem. The root-coordinator-created cryptsetup
mapping is part of the trusted host setup; observing its UUID is not independent
attestation against a malicious root administrator. No `/dev/mapper/control`,
table/key ioctl, host mount or filesystem feature is changed/read by this entry.

IMPORTANT: the loop backing-file metadata path from sysfs must remain stat-able
in the unit namespace and identify FD8. Keep its name until the unit stops; do
not unlink it early. Its contents need not be readable by the DynamicUser. A
private source mount invisible to the systemd manager will not work (retain the
coordinator's corrected `/run` placement/private propagation). No fallback to
ordinary ext4/chmod/path scanning exists if binding cannot be observed.

`st_blocks*512 >= st_size` verifies preallocation, and work filesystem size must
fit that image. Host free>=15GiB on FD7 is checked after this charge. MemAvailable
minus768MiB must retain1.5GiB. Inside the image, available space must cover declared
databaseBytes +1GiB WAL +0.5GiB scratch +2GiB growth +128MiB cluster overhead. This
preserves the original growth floor; it does not require15GiB INSIDE an8GiB image.
Reported values DB3,611,817,651 + those costs =7,504,131,763 bytes, below reported
8,333,492,224 workfree; reported host18,731,298,816 and memory4,211,789,824 also
fit. These reports are NOT substituted for actual observations under the lock.

## Authentication, consumer and DB engine

Manifest schema gates retain existing v1/v2/v3/compact behavior, custom format,
v2 transport/credential cleanup, v3 local socket/ownerACL provenance fields and
compact source lineage. Exact Node canonical manifest context, declared plaintext
size/digest and actual cipher size are checked. Manifest capture alone grants
nothing: a secure independently provided key must authenticate the complete
immutable cipher and match its declared plaintext SHA256/bytes before ANY PG/TOC
consumer starts. Cipher SHA256 is measured and reported, not invented from a
caller claim. Source FD4 stays owned through every pass.

Every replay performs another FULL GCM/digest pass BEFORE its consumer, then
streams a second pass from the SAME sealed FD/captured key/header/tag. There is
no cached readiness Boolean; a forged `.authenticated=True` is ignored. TOC may
close its replay pipe early only after complete prior authentication and a
successful TOC child terminal status. No plaintext archive is materialized and
buffers are bounded256KiB. A <=64KiB kernel-sealed memfd is allowed only as a
small immutable input mechanism for synthetic tests, not a size substitute for
the491MB real source; large sources must pass actual fs-verity measurement.

The internal engine creates ONLY new owned PGDATA/database/Unix socket, observes
server identity/listen_addresses/user/data/socket, and reuses the exact original
pinned bootstrap, JS TOC filter, compat migration, restored-only identity-fence
disable and full historical verification SQL. Owner/ACL restore is retained.
No production cluster/database rename, connection or service command exists.
It checks portable roles/runtime privileges, owner allowlist, RLS/policies,
7 application tables/3 functions/grants, validated constraints and7 fixed public
row anti-joins (required NULLs/orphans reject; only2 declared nullable links may
beNULL). This verifies declared DB relationships, not investment/business
semantics of every article or an independent complete-set/key-escrow audit.

The owned clone is stopped/reaped and its exact temp subtree removed before the
engine returns. No original artifact is pruned. First soft stop disables repeated
soft stops to permit bounded cleanup; host must use KillMode=control-group and
retain its lock until the entire unit stops, including hard-kill/failure paths.
Engine900s/main1200s wall bounds and finite per-command/file/memory limits apply;
the host8GiB image/cgroup supply aggregate limits. The server2GiB file ceiling
supports normal1GiB PG relation segments rather than the obsolete32MiB fixture cap.

Service/provider recovery, key escrow/full-set audit, production continuity,
Next rollback and release approval are reported separately, NOT used to hard-close
this DB entry. External statuses remain NOT_RUN/HOST_REQUIRED where applicable.
DB restore success does not remove native HOLD or imply a production rollout.

## Evidence and remaining onsite test

Cloud runs actual synthetic GCM->held sealed FD->PG17 restore, wrong key/tag/
digest/truncation zero-consumer tests, real stream failures, orphan/requiredNULL
archives, actual>32MiB relation, and cleanup. The generated7table/3function fixture
uses explicit public stubs: it tests structural checks, NOT real app semantics.
Actual flock/preallocation and Cloud CLI refusal are tested without faking OS
admission. Cloud cannot provide the full DynamicUser/dm-crypt/cgroup/fs-verity
host setup and does NOT claim a complete CLI positive or real491MB backup run.

Independent engineering source review is separate from formalA1. Exact source
and test hashes, counts and any review limitations are in the machine receipt.
The unchanged historical facades remain disabled. Exact full-branch app build,
types/lint/CI are not substituted with an older checkout when Git CONNECT503
prevents a full source checkout. These original gates/HOLD remain unwaived.
