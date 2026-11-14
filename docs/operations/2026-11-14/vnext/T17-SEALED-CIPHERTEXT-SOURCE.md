# T17: kernel-sealed fixture custody — source slice, not live admission

Parent staging commit: `b5aec9843baf5e76f94065e6e2def4d88cbe414e`.
The existing protected Linux restore candidate, live facade, requirements, HOLD,
CI, PR #384 and product branches are unchanged. No SSH, production credential,
backup, recovery key, SQL, Contabo or service operation occurred.

## Actually observed in this Cloud VM

Linux 6.18.57 supports `memfd_create(MFD_CLOEXEC|MFD_ALLOW_SEALING)` and the Linux
UAPI `F_ADD_SEALS`/`F_GET_SEALS` operations. Python lacks the seal constant names,
so the source defines the fixed Linux UAPI values checked against local headers.
Tests query actual kernel seals, not a caller boolean. All four required seals
are present: WRITE, GROW, SHRINK and SEAL. Actual alias pwrite, truncate/grow,
shared writable mmap and adding another seal fail with EPERM/EACCES. An existing
shared writable mapping prevents WRITE sealing and the primitive rejects.

Separately, an enable-fs-verity ioctl on a new tiny public `/tmp` fixture returned
ENOTTY (25). No disk-backed fs-verity custody was established on that mount.
This is not a claim about other filesystems or Contabo. The probe did not touch
an existing file and its temp fixture was removed. An initial capability probe
found Python's missing symbolic constants before any mutation attempt; after
checking UAPI headers, the actual syscall probe succeeded. No kernel was changed.

## New primitive and ownership

`deployment/staging/vnext/t17_keyfd/sealed_fixture.py` accepts only an exclusively
owned regular source FD >2 (no path, key, trust metadata or readiness boolean).
It copies at most **64KiB ciphertext**, in <=8KiB reads, into an anonymous memfd.
It refuses empty/oversize/nonregular sources and unsupported or ineffective
sealing. Kernel seals and exact sealed size are checked before exposure. The
source FD is closed before the reader is yielded; authentication and replay then
use `pread` on the SAME held sealed descriptor. No source pathname is reopened.
Each read asks the kernel for seals again. Cursor changes through a dup alias do
not affect `pread`. On normal exit, exception or abort, the snapshot FD closes and
the retained reader is invalidated. Failed copy/sealing closes owned descriptors.
Invalid selectors/stdio are not consumed. No normal-file/path-scan fallback exists.

The memfd is RAM/swap-backed and deliberately capped at 64KiB. It is NOT suitable
for a real-sized backup, persistent custody, durable archive or a whole-dataset
RAM copy. Nothing in this primitive discovers or opens an artifact or key source.
Ciphertext sealing establishes immutable bytes, NOT authenticity or provenance.
If a source changes during copying, the final sealed bytes still require complete
cryptographic authentication against trusted manifest/context before any consumer.

Tests use public deterministic synthetic AES-256-GCM ciphertext with the existing
`SI-BACKUP-1` header/nonce/context/tag layout. A first complete GCM verification
reads the sealed descriptor; then the original inode is overwritten and its path
replaced; replay from the same sealed descriptor completes another GCM pass and
only then exposes the synthetic plaintext consumer. A corrupt tag yields no
plaintext consumer. The test-only AESGCM implementation is supplied by the
already installed `cryptography` 50.0.0 package; it is not a new key backend or a
production decryptor. Test keys/nonces/plaintexts are explicitly public fixtures.

Ownership must be serialized: no competing source readers, FD-number reuse,
consumer close/dup2 of internal descriptors or arbitrary interpreter tampering.
This is not a privilege boundary against code controlling the same interpreter.
The synchronous regular-file copy has no preemptive I/O deadline and is not a
process supervisor. Ciphertext pages/consumer plaintext copies, process death,
swap, core dumps and external alias cleanup are outside its erasure claims.

## What remains blocked

The historical authentication-close/pathname-reopen runner is NOT modified or
certified safe. The new bounded primitive removes that gap only for its own
fixture lifecycle. There is no connection to the Node live restore facade, no
real GCM backup/member admission, no SQL/replay adapter and no new runtime grant.
The nine live integration requirements remain NOT_IMPLEMENTED. Test receipts
cannot enable live execution. This branch does not satisfy T17 acceptance.

For large backups, the coordinator still needs separately reviewed disk-backed
immutable custody (e.g. actually verified fs-verity or an independently enforced
immutable snapshot), held descriptors across ALL authentication/replay passes,
trusted original complete-set provenance, independent key recovery and key-FD
integration. Ordinary chmod, an opened regular FD, post-consumption stat/hash,
or a caller supplied boolean is insufficient. If supported filesystem custody
cannot be verified, refuse execution; do not reopen or scan a pathname instead.

Contabo must verify its own filesystem, host lock, simultaneous ciphertext/custody
copy/expanded archive/DB/WAL/scratch/old-new-release/growth peaks, >=15GiB disk and
>=1.5GiB available memory after peak costs, staging isolation and production
continuity. None is measured or authorized here. Existing read-only identity is
expired and was not retried; no new key/ACL is requested by this slice. The next
operator action is only to review source and independently report sanitized local
filesystem/capacity capabilities through the existing coordinator. Do not send
actual ciphertext or a key to Cloud.

## Verification and retained gates

`PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/tests -p 'test_t17_*.py' -v`
passes 20 tests: retained key pipe 10 and new kernel custody 10. New tests include
actual seals/mutations/mmap, post-authentication source/path replacement, corrupt
GCM tag, empty/64KiB/max+1, unsupported kernel/no-op sealing rejection, existing
writable mapping, copy error, consumer EPIPE/abort, invalid selectors/ranges and
descriptor cleanup. They run without skipped cases or real backup/key inputs.
The retained exact-protection candidate suite passes 12/12 and continues to reject
FDs/callbacks/readiness overrides as live authority.

Full exact-branch web build/types/lint remain NOT_RUN: Git transport again returns
proxy CONNECT 503; provider reads/writes support a minimal delta on the exact
parent, but do not supply a complete build checkout. No result from the older
local web tree is substituted. Full CI/build gate, independent review/A1 and all
original real-source/session/restore/release gates remain incomplete. The source
slice is reviewable, not approved for production or actual restore execution.
