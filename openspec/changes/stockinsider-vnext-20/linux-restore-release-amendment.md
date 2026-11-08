# Linux isolated restore / standalone verification — source amendment

Continue protection source e8f99139f8ba98175adf7718f089ad3362b96dd5 on the same development VM. Explicit GPT-6.1 Sol High authors and an independent source reviewer implement bounded source changes. Actual production-backup restoration and real Next.js rollback are authorized only for the separate coordinator's isolated Contabo staging. Production stays running. This Cloud slice receives no actual archive, key, release package or private log and performs no SSH, VPN, PostgreSQL, SQL, service or timer operation. Native HOLD and original PR #384 head remain unchanged.

## Existing contracts and a retained execution blocker

Inventory repository contracts without enumerating any private backup directory. The existing daily sequence exports the database, verifies its archive, exports/restores storage, verifies provider recovery, rehearses a clean database restore and assembles a versioned backup set. A cipher artifact or TOC listing alone is not a complete recoverable system. Retention, lineage, unique evidence, current releases and rollback copies remain pinned; no cleanup is authorized.

The Mac-specific database rehearsal authenticates an archive, closes its descriptor, then reopens its pathname for TOC/restore. Its later inode/mtime check cannot prevent changed unauthenticated plaintext from reaching a consumer before GCM finalization. Do not reuse that path as a safe Linux restore runner, execute it, or report the existing source-regression assertions as resolution of this issue. A separately reviewed real runner needs authenticated immutable ciphertext custody through consumption, not a caller assertion, pathname pin or post-SQL check.

## Linux candidate boundary

The live facade stays unconditionally disabled, accepts no execution adapter and exposes no restore command. A deterministic non-executable plan may specify fixed Linux PG17 binaries, C/UTF8 initialization, no TCP, private Unix socket, fresh isolated cluster, and disjoint runtime/data/source locations. Capacity accounting must include ciphertext, expanded archive, restore data, WAL, both releases, scratch and growth with at least 15GiB disk and 1.5GiB available memory remaining. Host lock, kernel isolation, no production mounts/credentials and actual executable/version observations are outstanding requirements, never boolean authority supplied by a caller.

A bounded NONPRODUCTION cryptographic fixture may synchronously copy ciphertext and fixture key chunks, authenticate the entire private copy using the existing envelope, then invoke a fixture consumer. Reject wrong context/tag/key, truncation, over-size and mutation; zero owned buffers on success/failure. This does not implement real FD custody, key escrow/streaming, production manifest binding, PG restore, data compatibility, RLS/writer validation or actual kernel isolation. No plaintext archive is written.

## Standalone verification

Keep the existing standalone V2 manifest and canonical hash/output. Before filesystem consumption, require bounded, unique safe member paths and an entrypoint that names an included application server.js. Reject traversal, missing members, symlink/special or oversized manifests, forbidden environment/backup components, malformed metadata and excess members. Keep legitimate physical-release/current-symlink invocation compatibility. Stream file hashing through bounded buffers and bind opened regular-file metadata; an immutable trusted release tree remains a prerequisite against external privileged ancestor/content mutation.

This verifier is distinct from encrypted VPS release-tree export and its link/redaction policies. Manifest consistency does not prove trusted build provenance, absence of secrets hidden under benign filenames, Next BUILD_ID/assets/dependencies, platform compatibility, application behavior, clean rollback or production health. The coordinator must bind actual full release identities, hashes and private staging behavior independently. Short commit labels and approximate archive sizes are not substitutes.

## Verification and gates

Run relevant existing envelope/artifact/restore-list/package fixtures, new bounded negative cases, retained vNext regression, types/lint/full build serially with measured resource admission. No new synthetic HTTP/browser pass is claimed; do not rerun it for this request. Record actual PASS/FAIL/BLOCKED/NOT_RUN with exact source. Native HOLD, A1/protected review, real backup/key/restore, real source/session, release and deployment gates remain. No original/iCloud artifact is read, hydrated, modified or deleted.
