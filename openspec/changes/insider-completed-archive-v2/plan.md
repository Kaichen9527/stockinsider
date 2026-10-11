# Implementation plan — reviewed design, integration PROPOSED

Parent snapshot source: d274726ee2824f09539cc9197b5acd8535553b75. Root relayed unsigned requirements/design PASS on exact ccb004a7ed92f8df2b60d1c91f716dcb8bbabd53 and authorized only the isolated codec/private-descriptor component slice. Exact-code review is pending. Budget/storage/lease integration prerequisites below remain open; this pass does not supply deployment authority or a working shared-writer quota protocol.

## Reuse and exact gaps

| Existing code | Reuse | Gap that must be reviewed |
|---|---|---|
| `web/src/lib/private-artifact-store.ts` | Existing private hash-addressed root,64MiB object guard, no-overwrite link publication, file/directory fsync, bounded read/hash verification | Insider wrapper enforces12MiB raw/encoded bound, closed codec, nonblocking regular descriptor checks and deadline; existing helper alone is not a shared quota, archive receipt or root-compromise guarantee. |
| `web/src/lib/source-audit-artifact.ts` | Existing private storage / DB receipt choreography | Its diagnostic_attachment purpose is wrong for an archival copy authorizing hot eviction; use explicit additive purpose/binding and actual verified storage, not caller claims. |
| `migrations/20260911_contabo_data_plane_v1.sql:248` | Same DB, private receipts, established backend ownership/lease | Existing purpose constraint permits only financial_document/diagnostic_attachment. New archive-purpose bindings must preserve older receipt semantics and allow shared physical content without changing financial records. |
| `migrations/20261008_insider_snapshots_v1.sql` | Immutable source IDs, tokens, original clocks, global/dataset locks, document-before-CAS | Additive V2 storage transition, bounded historical indexes/readers and operational counters; preserve the historical V1 file and existing data. No generic DELETE/trigger disable. |
| `scripts/retention/archive-core.mjs` | Review its bounded decompression and verified-publication patterns | Current envelope is canonical JSON of allowlisted legacy rows, not byte-identical insider raw; do not extend its destructive relation allowlist or claim compatibility. |
| `scripts/export-contabo-private-artifacts.mjs` and restore tooling | Possible existing encrypted backup path after separately verified compatibility | Export emits storage-export-v2/stockinsider-contabo with1000-object inventory; inspected restore accepts storage-export-v1/older project and100-object inventory. Not an already working archive recovery pair. Do not import credentials or call them in this documentation slice. |

The existing configured private root is authoritative deployment input; `/var/lib/stockinsider/artifacts` appears in the current export tool but this proposal does not create/reconfigure it or declare a new root. Never point authoritative storage at `/tmp` or a disposable VM task directory. No new environment credential or network storage provider is needed by the proposed local persistent-store slice.

## Small implementation slices after review

1. Additive SQL: source identity preserved; explicit nullable-hot-raw transition guard; private archive object/purpose binding, per-snapshot storage/operation journal and immutable terminal receipt; shared quota reservations; operational counters/indexes. Migration over an existing d274 profile must preserve every ID/hash/clock and reject inconsistent incomplete/archived states. Reapplication and rollback tests must preserve existing authority/ACL.
2. Archive adapter: one completed snapshot at a time, closed request, existing guarded source operation with exact authenticated backend/lease-owner/attempt fencing; derive bytes from DB, reserve, publish/readback/decode, finalize by exact operation. No new public endpoint. Complete conservative4GB shared allocation reservation formulas and integration with other source writers before any production enablement; root coordinates any cross-owner changes.
3. V2 reader/replay: dispatch hot versus archive by DB-owned location; validate actual raw identity and parser/rights; return original receipt or explicit unavailable. Never initiate fresh acquisition to repair an old read. Preserve external existing page shape and bounded500-row response. Complete historical lookup avoids full-history raw scans.
4. Portable red→green tests for codec/private descriptors/races/receipt selection. VM queue: actual PG transition/rollback/concurrency, real guarded HTTP/private filesystem, more-than32/128-history regression, actual12MiB transport/read and resource guards. Keep d274 regression tests unchanged.
5. Independent exact-code review and measured persistence/restore evidence. Root separately integrates reviewed migration/release identity and deployment/rollout, if authorized. Contract approval alone does not grant these operations.

## Integration decisions and evidence still required

- Accept the precise distinction between permanent history and bounded operational32 snapshots/128 runs, with4GB shared byte accounting instead of a lifetime row cutoff.
- Approve the explicit hot-raw nullable transition and narrow storage-verification receipt trust boundary; filesystem verification belongs to the established backend, not arbitrary service clients. The generic assert_stockinsider_backend_request_v1(true) any-live-lease/nullable behavior is insufficient: require exact locked backend/lease ownership and operation-generation checks, NULL refusal, explicit CAS takeover and fresh verification after restart/takeover.
- Fix and review conservative quota reservations covering existing source writers, orphan artifacts, copy/encoding overhead, DB/history/index and WAL peaks; reconcile measured allocation without assuming DELETE instantly frees disk. Missing formulas/integration block implementation acceptance and activation, not justify evidence deletion.
- Confirm the deployment's persistent private root/owner, whole-host guard policy and actual backup/restore scope. No unknown protocol is filled with fake receipts.

Historical evidence grows. This proposal removes premature hot/lifetime-count stalls but does not promise endless daily ingestion within4GB. A future offline archive capacity or explicit evidence-retention decision is separate work; permanent source-failure cancellation is also separate.

## Independent review repair (documentation only)

Root relayed an independent P2 against e8b9223: the existing backend-request helper does not bind the live lease to this owner and can return NULL when identity enforcement is disabled. This successor specifies an additional exact backend/lease/operation-attempt fence and ARC-13; it does not claim the helper is fixed or this protocol already exists. Root subsequently relayed the unsigned ccb requirements/design pass; implementation still requires independent exact-code review. The implementation must inspect actual lease-takeover locking and establish one compatible global order before coding finalize; no new owner/key/credential may be seeded to manufacture proof.

## First component candidate and next boundary

Owned runtime files are only insider-completed-archive-codec-v2.ts and insider-completed-archive-io-v2.ts plus their two adjacent tests. Existing private-artifact-store.ts, snapshot SQL/routes, package scripts and deployment files are unchanged. Component checks cover actual raw12MiB/+1, actual valid encoded maximum/+1, gzip single member/trailing/truncation/bomb, hashes, real FIFO/no-follow/growth/rename and fsync/readback faults. Stream cancellation and captured input identity are tested.

Before any finalize/takeover SQL, inventory actual backend/lease fields, revocation and transfer routines, and establish their complete compatible lock order. Before capacity admission/eviction integration, exercise a fixed conservative allocation reservation profile with every shared writer. Neither prerequisite was performed by this component slice. Persistent-root/backup restore, failed-stage accounting, hard filesystem-stall lifecycle, real guarded HTTP/PG and shared quota evidence remain open. Heavy builds and integration go to root's single VM queue, not the Mac.
