# Linux staging restore candidate — source only

The live facade in [linux-restore-candidate.mjs](linux-restore-candidate.mjs)
always rejects. No adapter registration, executable/path override, readiness
boolean or fixture can enable it. All nine runtime requirements are explicitly
`NOT_IMPLEMENTED`. This is a bounded design and crypto fixture slice, not a
restore runner admitted to a host. Actual staging backup/restore and real Next
rollback belong to the independently authorized Contabo coordinator. Cloud does
not acquire, read, receive or restore production backup data or recovery keys.

## Repository contract inventory

| Source | Existing behavior and limit |
| --- | --- |
| [local-backup-envelope.mjs](../../../scripts/local-backup-envelope.mjs) | Bounded AES-256-GCM with authenticated manifest context. `verifyBackupChunks` consumes and clears internal plaintext without releasing it. `decryptSmallBackupPayload` returns its small buffer only after final authentication. Neither establishes artifact provenance, a complete backup set or restore success. |
| [local-backup-artifact.mjs](../../../scripts/local-backup-artifact.mjs) | Ciphertext-only publication and envelope verification; the caller must own the lock and exporter terminal result. This is not the new Linux immutable-custody integration. |
| [local-backup-set.mjs](../../../scripts/local-backup-set.mjs) | The v2 set requires database, storage and provider recovery members and their validation/restore receipts. One authenticated database artifact cannot substitute for the complete set or independent key recovery. Caller JSON alone is not trusted provenance. |
| [local-backup-key.swift](../../../scripts/local-backup-key.swift) | Historical device-local key custody and binary pipe output with a terminal guard. It is not a Linux backend, remote escrow or authority to fetch a key in Cloud. |
| [local-backup-file-key.mjs](../../../scripts/local-backup-file-key.mjs) | Historical private local-file custody with permission/link checks. The new candidate does not call it or create another secret backend. |
| [export-contabo-database-backup.mjs](../../../scripts/export-contabo-database-backup.mjs) | Existing SSH export uses a server-local Unix socket and a consistent custom-format dump, then persists encrypted bytes. Separate storage/provider exports are not a single distributed snapshot. This production exporter is neither invoked nor imported by the candidate. |
| [rehearse-contabo-database-restore.mjs](../../../scripts/rehearse-contabo-database-restore.mjs) | Historical rehearsal uses Mac binary/scratch paths and a smaller capacity floor. It authenticates and closes the file, then reopens the path for TOC and SQL consumption. A final inode/size/time check after SQL cannot prevent replacement before consumption; even one regular-file FD alone does not prevent in-place mutation. No Linux admission is inferred. |
| [rehearse-local-database-restore.mjs](../../../scripts/rehearse-local-database-restore.mjs) | Another historical Mac rehearsal retains an FD but does not enforce immutable ciphertext custody; its owner/ACL/application completeness fields remain false. It is not reused as a Linux execution adapter. |
| [build-contabo-restore-list.mjs](../../../scripts/build-contabo-restore-list.mjs) | Existing reviewed portability exclusions are separate from authentication, trusted provenance and complete SQL/application acceptance. No TOC or SQL is consumed in this slice. |
| [restore-contabo-database.sh](../../vps/restore-contabo-database.sh) and [production contract test](../../../scripts/contabo-production-restore-contract.test.mjs) | These control an existing production-named PG17 cluster and rename the prepared database. They must not be reused as a disposable staging runner. Neither source is changed. |
| [local-backup-policy.md](../../local-backup-policy.md) | Retained local budget, retention, encryption, independent escrow and full-set restore obligations are historical source requirements. No private backup location or existing artifact is inspected, copied, pruned or reclassified here. |

## Fixed Linux intent, without executable authority

The closed plan fixes Linux PG17 binaries at the conventional absolute PG17
directory, `C` locale and UTF8, a new nonroot private cluster, host authentication
rejection, peer local authentication and a private Unix socket only. Data,
runtime and immutable source are separate staging intents. The coordinator must
verify actual version/hash/owner/path/locale, absence of existing cluster/data,
socket namespace and filesystem isolation. No production socket, network/DNS,
inherited PG environment/service file, configuration hook or production writer
may be reachable. An authenticated archive can still contain executable SQL;
authentication does not make its contents safe to execute on a shared host.

The key contract requires a dedicated owned binary FD: exactly 32 bytes plus a
bounded extra-byte/EOF probe, deadline, abort/error/closure handling and owned
buffer zeroization. No key bytes belong in argv, environment, console or a newly
invented file/backend. This FD integration is **not implemented or tested**.

For real replay, an authenticated immutable ciphertext descriptor or enforced
sealed snapshot must stay owned across all verification and replay passes.
Path reopening, a caller hash/boolean, an ordinary descriptor or a final stat
after SQL is insufficient. The production integration must establish custody
before any TOC reader, decompressor, SQL tool or plaintext consumer starts.

An exclusive reviewed host lock must precede current measurement and remain held
through shutdown. Hypothetical capacity arithmetic separately counts source
ciphertext, an immutable custody copy, expanded archive, restored cluster, WAL,
restore scratch, both old/new releases and growth, with a memory peak. Expansion
and restored data are separate costs even when no plaintext archive is written.
The calculation is deliberately conservative and includes all declared retained
copies; existing occupancy must not silently erase a declared peak. It retains
15 GiB disk and 1.5 GiB available memory. Its single-filesystem arithmetic is not
a reservation or proof about the actual mounts; every actual filesystem and
temporary phase still needs verified headroom under the same host lock.

Restore SQL, TOC, owner/ACL/RLS/application/lineage checks, restored writer
disarming before application access, shutdown/rollback and real Next revision
validation remain unimplemented. No generic migration, production cluster or
service lifecycle permission is supplied. Native HOLD and all existing review,
staging and release gates remain unchanged.

## Bounded synthetic fixture

`verifyLinuxRestoreFixture` accepts only a supplied synthetic ciphertext Buffer
of at most 64 KiB plaintext plus envelope overhead, a finite array of at most 32
nonempty binary key chunks totaling exactly 32 bytes, context and one explicitly
fixture consumer. It copies and captures these inputs before its first await.
No FD, file path, live adapter or key backend is accepted. Both authentication
and replay use the same private in-memory copy, so caller mutation cannot swap
the authenticated source. The shared envelope verifier authenticates first;
the existing small-payload decryptor authenticates again before returning bytes
to the consumer. No PostgreSQL program or SQL engine is run.

Success always remains `FixtureOnly`, `restoreVerified=false`,
`stagingAccepted=false`, `osKeyFdVerified=false` and
`immutableHostDescriptorVerified=false`. Owned key parts, combined key,
ciphertext snapshot and plaintext buffer are cleared on success and rejection.
Caller originals and copies made by the consumer are outside that cleanup
claim. The fixed fixture deadline bounds waiting for a cooperative async callback
and clears the shared plaintext buffer; it cannot preempt synchronous JavaScript,
terminate a late callback or establish process/FD cleanup. Consumer error/EPIPE
simulation is not proof of a real pipe lifecycle.

The source tests cover unknown/missing/duplicate/subset/production collision
plans, capacity floors, corrupt/tag/context/key/length rejection before the
consumer, caller mutation, exact input bounds, post-consumer zeroization and
fixed sanitized failures. They establish no real backup, database restore,
kernel FD custody, filesystem reservation or website rollback acceptance.
