# Bounded plan — review before isolated implementation

Parent5f46 remains frozen. This branch owns only new documentation at first:

- openspec/changes/insider-archive-fence-measurement-v2/spec.md
- openspec/changes/insider-archive-fence-measurement-v2/plan.md
- openspec/changes/insider-archive-fence-measurement-v2/tasks.md
- docs/operations/2026-10-09/insider-archive-fence-measurement-handoff.md

After explicit unsigned independent requirements/design PASS, proposed code ownership is limited to scripts/insider-archive-measurement-v2.mjs, scripts/insider-archive-measurement-v2.test.mjs and scripts/fixtures/insider-archive-fence-v2.sql. These files do not exist in this proposal. No production migration is added, and no existing codec/store/lease/route/package file is modified. Root coordinates any future cross-owner work.

## Steps

1. Reviewer resolves the material amendment: archive-only binding ledger is necessary but not sufficient for ABA. A narrowly scoped observer on the shared lease relation is required by this proposed design; only a disposable fixture may test it. Confirm its invalidation semantics and permanent attempt/reservation history, plus exact source inventory. Lease-only observation does not cover authority ABA: review the separate fixture-only authority invalidation journal incarnation and immutable head binding, which can only invalidate and cannot establish trust.
2. Reviewer evaluates the mandatory exact READ COMMITTED precondition on every control entrypoint and actual two-session RR-before-revoke negative control, then the proposed short-transaction lock profile and role privileges, including principal predicate protection and no earlier-lock acquisition from observer/ledger paths. Additive production SQL is a later, separately reviewed implementation; never silently substitute generic assert or timestamp equality.
3. Implement deterministic receipt/arithmetic/path-inventory tests first. Use real small FDs and controlled child cancellation locally. Reuse scripts/research-insider-acceptance-lifecycle.mjs without edits; each named check outcome and confirmed cleanup controls the final verdict.
4. Build a disposable PG profile from exact tracked definitions and source hashes. Preserve actual legacy acquire/release/backend predicate bodies. Declare every synthetic role, RLS policy, principal/backend fixture and absent production prerequisite. Fixtures never read configured production connection settings or credentials. Bind PG to a test-owned local socket and use explicit test tool paths, sanitized child environment, bounded logs and owned-process cleanup.
5. Run negative controls before adding the fixture observer, then repeat actual concurrent PG interleavings with the proposed observer/ledger. Fixture attempt ledger has the operation/binding/generation/history and immutable authority-head/journal-incarnation fields from spec; authority change observation remains a distinct private negative-only fixture mechanism. Demonstrate lease-only principal/backend/release/settings ABA failures, then require either tested fixture coverage or explicit unsupported refusal; no filesystem evidence is accepted as hot-deletion authority. Export SQL/profile hashes, timelines, actual statements/errors and per-check verdicts.
6. Instrument the frozen codec/shared store and real PG metrics. Do not monkey-patch the shared helper into a production quota participant; ordinary callers remain ordinary callers. The missing shared reservation protocol must remain visible. Large max-payload cases and PG run in root's single VM heavy queue; Mac does only lightweight checks.
7. Freeze isolated harness source for independent code review before VM execution. After VM run, publish exact source/tool/profile identities and measured coverage/limits. Do not derive productionReady:true from fixture PASS. Root may then request the next narrowly reviewed migration/shared-writer design.

## Existing measurement reuse and limits

- scripts/research-insider-dataplane.test.mjs:16–35 demonstrates source-extracted SQL with definition hashes;39–55 shows required-check lifecycle, sanitized environment and owned PG/HTTP processes. Its narrow fixture omits active backend authority; do not reuse it unchanged as proof of ARC-13.
- Same file:100 records pg_database_size, pg_total_relation_size and pg_stat_wal plus end-memory, explicitly not peak memory. Extend only in the new harness with WAL-LSN delta, heap/TOAST/index decomposition and actual allocation snapshots.
- scripts/audit_supabase_usage.js:73–87 supplies relation/index metrics and scripts/audit_supabase_io_hotspots.js:133–142 supplies per-index sizes. Reuse SQL concepts only; do not invoke scripts that resolve production connection settings.
- scripts/contabo-host-resource-check.mjs:39–61 and scripts/contabo-capacity-guard.mjs:4–30 supply existing host policy. Feed measured fixture inputs only, never fabricate a production capacity observation.
- Frozen archive component5f46 is real-FD/fsync/readback tested, not hard kernel deadline or power-loss proof. Harness cancellation must supervise its own children; inability to confirm close is a negative outcome and retained fixture liability.

## Future integration impact, explicitly not implemented

New private archive binding/attempt/history and eventually multi-purpose physical artifact bindings require additive schema. An archive-scoped lease observer and proposed authority-change observers touch existing relations, so it needs owner/ACL verification, bounded indexed work, reapplication/rollback tests, trigger-coverage runtime checks and an independent deployment review. A shared4GB reservation requires coordination of financial/audit writers and DB/history/WAL accounting. No plan step grants these changes implicitly. The original128MiB/32 cap remains operational until a separately reviewed complete archive transition exists.

## Independent P2 repair boundary

The e0b9 proposal is superseded for review by this docs-only repair. No harness code exists yet. Isolation checks must precede replay/early return as well as mutations; lock acquisition does not repair a stale transaction snapshot. A file verification captures immutable authority head and private invalidation journal incarnation, not merely active=true. Newer active authority cannot revive that evidence. The fixture journal fingerprint is not a trusted registry or permission source; any unobserved transition, disabled observer/history loss or unreviewed writer leaves coverage incomplete and old verification unusable. Re-review is required before even the isolated implementation begins.
