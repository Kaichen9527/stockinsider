# Complete admitted official insider snapshots without false freshness

## Problem / approved baseline

At2cca2f8 every market source-sync fetches new bytes, and any response hash change resets the500-row cursor. Daily JSON whitespace, ordering or report-date changes can indefinitely hide later issuers. Row documents are truncated and cannot restore the original snapshot. This increment completes only a bounded admitted snapshot; it does not claim all intervening market versions, confirmed insider transactions or stock eligibility.

Preserve fixed five TWSE/TPEx endpoints,12MiB raw/50,000rows/15s/no-redirect limits, whole-response schema validation, symbol scope, source rights, guarded source-sync and production write lease. No alternate ingest/public API, credentials, legacy history deletion, principal/stock seeding or production migration.

## Persistence and concurrency

1. Add private service-only immutable raw snapshots with fixed dataset identity, raw bytes/hash/size/rowcount, original acquisition attempted/observed clocks, parser identity and explicit dataset retention/use policy. Recompute bytes/hash/schema before activation. No raw public route or user-visible personal-data table.
2. One active market snapshot per dataset. Read active first; while incomplete, do not replace or re-fetch it. Every page is at most500 raw rows, including excluded rows. Preserve actual first document storage clocks; cached source observation remains original. Symbol-specific scans must not advance the market cursor or claim its complete coverage.
3. Separate mutable progress from immutable snapshot. Narrow admit/read/commit RPCs validate dataset, complete bindings, expected snapshot/offset/generation and exact page span under a dataset lock; no direct table mutation grants. Raw admission/read can be a service-only bounded bytea/base64 transport, with actual PostgREST maximum-size acceptance required before enablement. No arbitrary filesystem references.
4. Persist all selected evidence documents before cursor CAS. Commit RPC verifies exact page raw-index accounting: each row is either a schema-derived exclusion or bound to an actually persisted source document with matching dataset/snapshot/row identity and content binding. Caller counts or invented document IDs alone are insufficient. A failed document write advances nothing. Crash after documents permits idempotent replay; duplicate processing never skips unaccounted rows. Concurrent admission returns the same active original snapshot; completion and active release are atomic. New acquisition occurs only in a later independent acquisition run, never merely a subsequent continuation invocation.
5. A legacy hash/offset lacks original raw bytes: preserve it with explicit legacy_snapshot_unavailable, start a separately admitted acquisition, never claim its earlier rows migrated. Do not silently resume with a changed parser, rights or missing/corrupt bytes; keep progress and explain the blocked reason. Existing snapshot processing cannot be displaced by a newly observed response.

## Freshness and health

Keep snapshotObservedAt, lastLiveAcquisitionAt, processingAttemptedAt/completedAt, coverageComplete and remainingRows distinct. Date-only output dates do not become precise publishedAt.

A cache replay/completion may be successful processing, but must not refresh source succeededAt, freshness deadline, expected cadence or live acquisition time. Use original acquisition for source freshness and processing time for execution receipts. Incomplete coverage remains partial regardless of zero new documents. Yesterday's completed cache is stale/refresh-pending when cadence elapsed. Any source-sync ledger/health projection must carry the distinction end to end; do not project now() as a fresh source read.

## Capacity, rights and continuation

- Hard total admitted raw-byte budget128MiB across active+completed snapshots, at most32 snapshot records and one active per each fixed dataset. Admission serialized for global budget and dataset uniqueness. All five maximum active raw payloads fit60MiB. SQL metadata bounded; record database/WAL and base64 memory overhead in VM evidence.
- No automatic deletion/overwrite of raw evidence, even completed. If budget fills, reject new acquisition with capacity gap; preserve active progress and referenced evidence. A separately approved archive/retention policy is later work. These are engineering limits, not claimed indefinite operation within128MiB.
- Decode/process one dataset at a time. Keep500-row page and existing document-size/row/schema constraints. Continue VM20GBresident/4GBtemp/8GBreserve; filesystem availability is not proven project quota. No other App cleanup.
- Add a trusted optional bounded continuation mode to the existing source controller/route, no cron activation: at most100 market invocations/30minutes, one at a time, no model calls. Before continuation, persist one closed dataset→snapshot identity set and per-dataset completion flags for the whole run, including empty snapshots. Explicit resume/restart retains that same set. Only unfinished pinned members may progress; completed members do not look up active, re-fetch, re-admit or reprocess. It may continue only that pinned set while the guarded result explicitly reports remaining pages; each source-sync iteration handles all five datasets at most once. Stop on rights/schema/auth/capacity/HTTP uncertainty, no blind retry or reset. At the cap/deadline expose remaining rows and resume in a later explicit call. New live acquisitions are not started merely to chase changing hashes inside one continuation run.
- The100-invocation upper bound can finish a50k-row snapshot only when every invocation succeeds and all five pages can be processed within the wall budget. Do not claim current cadence guarantees daily completion before actual VM timing and scheduler acceptance.

## Required red/green and actual acceptance

- Mixed-size pinned run: one1001-row dataset and four small/empty datasets finish in three rounds, each dataset acquired at most once, including after restart and exact replay. No completed member can churn into a new snapshot or consume the record budget again.
- Changing responses A/B/C, each1001rows: finish A0→500→1000→1001 before admitting B; do not apply A offset to reordered/deleted B. Existing2cca flow repeatedly resets; preserve red result.
- Crash before/after documents/CAS, restart, two workers, lost-response exact replay, completed empty snapshot: no offset regression, skipped pages or second active snapshot.
- Corrupt/missing raw, schema/parser/rights drift, invalid source clock, wrong dataset/hash/bytes/rowcount/page/generation: no progress or false completion. Complete source validation precedes activation.
- Cached yesterday completion never renews source freshness/ledger cadence. Fresh acquisition, partial duplicate-only, valid live empty and stale cache remain distinguishable in guarded HTTP and health.
- Exact/+1 raw bytes/rows/global bytes/record budget, parallel budget competition, huge base64 RPC and returned body rejection. Budget exhaustion preserves all existing data/progress.
- Actual isolated PostgreSQL plus guarded Next→PostgREST data-plane tests of admission/page/complete/restart/concurrency and clocks; no production/provider/official-host requests needed in deterministic acceptance. Public real endpoint probes, when run, retain separate acquisition attribution.
- Continuation bounded calls/deadline and partial failures, no extra fresh acquisition/retry, replay safety, private journal summary only. Measure resources, types/lint/normal build; independent exact-code review before enablement.

## Ownership and rollout

Worker owns the new snapshot migration/module, insider collector integration and source health/ledger route changes and their tests. Root owns contract review, PR/review coordination and progress. VM's observed-roster/priority/deep-job/publication files are out of scope; do not revert others' changes. Existing root helper repair and monitor branches remain separate.

Initial53bdeed requirements review requested oneP2 change for cross-dataset continuation churn. This successor freezes the complete run set and completion flags and adds mixed-size/restart acceptance; renewed requirements review pending. implementation must follow explicit review rather than treating a plan as actual coverage. This increment does not activate schedules, merge main, create protected evidence or prove profitability.
