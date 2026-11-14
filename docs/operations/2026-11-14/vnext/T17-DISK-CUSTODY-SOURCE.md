# T17 disk streaming custody and fixed PG17 fixture — REFUSED on Cloud

Parent: `4a206c8f2cd814869a9c0d088e2db1738a706a07`. Only the staging source
branch changes. No SSH, Contabo action, key, real backup, host mount/feature,
production credential/service or original gate was touched.

## Current actual execution

The filesystem primitive copied **32MiB synthetic AES-256-GCM ciphertext** in
<=1MiB reads/writes into a fresh private disk file, not a memfd. The kernel then
returned ENOTTY (25) for ENABLE_VERITY on this Cloud workspace filesystem.
The consumer was not called, owned FDs closed and the ciphertext scratch inode
was removed. No successful disk immutability, disk authentication/replay or
large-file restore is inferred from this rejection. The test prints REFUSED,
even though its expected-refusal assertion passes. It has no mocked success path.

The new fixed fixture runner was also actually invoked. It returned exit 2,
`status=REFUSED`, `reason=fsverity_enable_required`, errno25, `pgStarted=false`,
`restoreVerified=false`; its private tree was removed. It never reached initdb,
SQL, TOC or restore. Existing user-directory tools separately report server and
pg_restore **17.11**, but that does not establish the conventional trusted binary
path or permission to bypass the failed kernel gate. The full positive PG path
in this new runner remains **NOT_RUN** and needs onsite tests and independent
source review. Previous successful PG fixtures do not validate this new path.

## Disk primitive

`deployment/staging/vnext/t17_keyfd/disk_custody.py` consumes an owned regular
source FD and borrows a private owner0700 scratch-directory FD. It creates a
fresh O_EXCL/NOFOLLOW/CLOEXEC0600 file using openat, streams at most256GiB with
1MiB copy buffers, fsyncs it, and acquires its read handle before authentication.
The two initial handles are checked against the same inode. It closes the
write handle, requires actual Linux fs-verity enable and SHA256 measurement on
the held read FD, checks sealed size, then verifies that owner-write open is
rejected despite the file still having owner-write mode. An outstanding writer
or writable mmap must prevent verity enable; there is no chmod fallback.

From verity establishment through every tag/authentication/TOC/restore pass,
the held read FD is the only input. No source pathname is reopened, no artifact
path is scanned again, and a directory rename/replacement cannot select another
inode. Initial private read-handle acquisition is BEFORE sealing/authentication,
not the historical post-authentication pathname reopen. Each pass asks the
kernel for verity measurement and reads using positional IO. Mutation of the
original input during copying creates untrusted final bytes; only the final
sealed bytes may be authenticated. Measurement supplies immutability, not
provenance or authentic backup-set membership.

Unavailable kernel/filesystem capability, open writer, ineffective seal,
wrong inode/size, unsafe directory, error, range or short read rejects before
consumer exposure. Cleanup only unlinks the generated name if it still refers
to the owned inode; a hostile same-UID namespace replacement can cause leftovers
or denial of service, not a trusted consumer. Caller must serialize FD reuse.
This is not a defense against arbitrary same-process/ptrace/root kernel control.
The 120s copy check is cooperative; blocked synchronous IO still needs an
independent process supervisor. MAX_BYTES is an allocation ceiling, NOT disk
reservation/admission. External per-filesystem quotas, capacity locks and process
limits remain required for actual-size backup integration.

## Tag-to-consumer source and fixed fixture runner

`stream_fixture_gcm.py` accepts only the internal disk-snapshot type; even a
forged object wrapping an ordinary file fails the real kernel measurement. A
boolean/receipt cannot authorize it. It captures one private32-byte key copy
and context, then completes a full streaming GCM tag check discarding plaintext.
Replay uses the SAME fs-verity-held FD and same captured values. Only this second
pass may stream to the consumer, after full first-pass authentication. There is
no whole-archive/plaintext buffer or pathname reopening between passes. Bounds
remain O(chunk). Cryptography-internal copies/consumer copies are outside the
Python owned-key zeroization claim. This module is synthetic fixture source,
not an integration with a production key backend or the live facade.

`scripts/t17_disk_pg17_fixture.py` has no input-backup, key, executable override,
readiness flag or live mode. It generates fixed public data only. It requires a
real fs-verity probe before any PostgreSQL process, then independently observes a
loopback-only namespace. It fixes `/usr/lib/postgresql/17/bin`, checks17.x, creates
nonroot fresh PGDATA with C/UTF8, peer local/host-reject auth, listen_addresses='',
private0700 Unix socket and a whitelisted PG environment (no inherited service,
pgpass, PGHOST or credentials). Its different public schema subset uses2 stocks,
12 signals,6 constraints, PK/FK/price rejection and orphan/hash checks.

The intended positive path exports a custom dump, encrypts with an explicitly
PUBLIC fixture key and streams through disk custody into a lazy TOC child,
then a new target DB and pg_restore. No TOC/restore child starts until tag check
completes. It verifies source/target data hashes, rows and constraints, corrupt
tag rejection before consumer, and reaps its postmaster/removes its private tree.
180s parent and bounded child deadlines are included; no aggregate cgroup/quota
is invented. These positive branches are **unexecuted source**, not acceptance.
The only CLI input is an existing reviewed scratch parent. Use only inside an
independently provisioned fixed fixture sandbox, NEVER as a live restore runner:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/t17_disk_pg17_fixture.py \
  --scratch-parent /reviewed/staging/private-filesystem
```

## Coordinator-reported host facts, not runtime admission

The coordinator reports Linux6.8, PG17.11, cgroupv2, ext4 `/var/tmp` WITHOUT the
verity feature; loop-control, mapper-control and mkfs.ext4/veritysetup/cryptsetup
exist; staging SSH unit timed out. Reported free disk28,344,692,736 bytes, memory
4,225,351,680 bytes, production DB approximately3,611,817,651 bytes. Original
iCloud ciphertext set approximately503MB / DB member491MB remains in place;
key remains on Mac. No artifact/key was received or independently inspected here.
The nonproduction iCloud browser re-download/decrypt is separate evidence.

These observations neither enable fs-verity on current ext4 nor authorize a
runtime. No command in this commit formats/mounts/provisions anything. For this
choice, onsite work must independently create a brand NEW bounded staging-only
loop image/filesystem with verity feature, in a PRIVATE mount namespace, without
changing existing ext4 features or global host mounts. The formatter/loop device
must be tied to the exact newly created exclusive file; never an existing disk,
loop/image or glob. Retain image/namespace/loop lifetime through consumers and
cleanup; withhold raw block/image writers and mount capabilities from the stage
process. Provide its own hard quota/cgroup/process supervisor; then run the tiny
kernel probe, writer/mmap exclusion and fixed fixture acceptance. All of that
provisioning/lifetime/cleanup and the positive primitive behavior need local
verification and independent review. Presence of the tools is not proof.

Count the image's full possible occupancy plus retained ciphertext/custody,
expanded custom archive, restored DB (not its compressed491MB), WAL, scratch,
old/new releases and growth on each actual filesystem. Retain15GiB disk and
1.5GiB available memory after credible measured peaks, under the same reviewed
host lock. Missing expansion/release/image peak measurements block admission;
reported free capacity is not a reservation or sufficient calculation.
Key recovery/FD custody, trusted complete-set manifests, real data validation,
restored writer disarm and production continuity remain unintegrated.

## Gates and evidence

24/24 local Python assertions pass (retained20 plus4 new), with explicit REFUSED
disk capability; the retained candidate suite passes12/12. No skips and no mock
grants. New disk-positive crypto/PG code is not claimed covered on this VM.
Original Node live facade, all nine runtime requirements, native HOLD and CI
are unchanged. Exact full-branch build/types/lint remain NOT_RUN because Git
transport returns CONNECT503; the provider publishes only this exact-parent
additive delta. Formal/independent review remains NOT_RUN, not waived. No change
to PR384/main/product protection. T17 stays incomplete.
