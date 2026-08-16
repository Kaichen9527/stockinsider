# V3.16.16 exact-commit financial recollection review

Date: 2026-08-16
Reviewer: Sol exact-range runtime/data-integrity review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `c65013f062941d86548db3df62e9d37f62c2d866`
- Initial implementation: `dd55f08e2bc6f867144e1a0547567f75f7aeb7af`
- Final reviewed repair/tree: `cdff3204231b5a93e0034636b286703ebe96b2f8` / `328938f98428c8714c946ffaaeb63882692eeeaa`
- Initial range: `c65013f062941d86548db3df62e9d37f62c2d866..dd55f08e2bc6f867144e1a0547567f75f7aeb7af`
- Repair range: `dd55f08e2bc6f867144e1a0547567f75f7aeb7af..cdff3204231b5a93e0034636b286703ebe96b2f8`
- Full final range: `c65013f062941d86548db3df62e9d37f62c2d866..cdff3204231b5a93e0034636b286703ebe96b2f8`

## Production failure and closure

The reviewed V3.16.15 activation reached the official-fact persistence stage,
then failed with typed PostgreSQL `PT409 database_constraint_rejected` because
the same immutable MOPS disclosure was observed at a later truthful collection
time and treated as another semantic fact revision.  Repeated collection
heartbeats had filled the closed 128-row per-series bound.  The failed installer
restored the previous runtime and scheduler.

V3.16.16 adds an upgrade-safe wrapper around the validated append authority.
When every immutable disclosure field matches an existing fact and the new
collection time is monotonic, the wrapper returns the existing fact and appends
an idempotent audit whose input hash still binds the new observation time.  True
semantic changes continue through the predecessor and retain all original
authority, period, unit, bounds and source validations.

## Exact review and repair closure

- Initial review finding: `P1`.  The first wrapper used a recollection-specific
  advisory-lock key, so two concurrent first observers could both miss the
  existing row before delegating to the predecessor.
- Repair: the lookup now takes the predecessor's exact stock/fact/period series
  lock.  Lookup and true append are therefore serialized under one transaction
  boundary; the predecessor's re-entrant lock preserves the original behavior.
- Repair-range closure: PASS, `P0=0 P1=0 P2=0`.
- Full-range closure: PASS, `P0=0 P1=0 P2=0`.

## Safety review

- Migration and upgrade safety: PASS.  The complete chain applies twice on a
  fresh upgraded database.  The repair is additive, contains no destructive
  DDL or table-data rewrite, and preserves the predecessor for genuine changes.
- Permission boundary: PASS.  Only the public wrapper remains executable by
  `service_role`; its predecessor is private and both functions retain the
  dedicated RPC owner.
- Point-in-time integrity: PASS.  Filing/source semantics remain immutable and
  the true later `collectedAt` remains present in the audit input hash.
- Runtime resume: PASS.  Object and persisted-array fact shapes use the same
  semantic identity, so an interrupted chunk graph can resume across a later
  collection heartbeat without refetching or changing prior chunk bytes.
- Scope: CLEAN.  One additive migration, the official-fact dedupe/resume path,
  migration registration and regressions changed.  No credential, V3 mode,
  LINE, dispatch, automatic-trading or Promotion configuration changed.

## Verification evidence

- Product/runtime diagnostic: PASS; stdout SHA-256
  `bb6536987c9d1992b3f8faf5c9e6eccdc2df72b832492919edd602983af27481`.
- Product correctness: 109/109 PASS; stdout SHA-256
  `1c29b5e92487362cca64463a3641afa7d12c246c21d21c4e3f2d528367a4213c`.
- Core product tests: 61/61 PASS.
- Migration contract and apply-twice rehearsal: 57/57 PASS.
- V1/V2 regression: 2/2 PASS.
- Playwright correctness: 8/8 PASS.
- Performance: 5/5 PASS.
- Model runner: 18/18 PASS; doctor PASS with deployment disabled and host pin v3.9;
  combined stdout SHA-256
  `fd87ec5e6c7bb4249e947355c796a7d9241606ee6047b3e63fc1bf1f1c1e932e`.
- Typecheck, lint, production build and `git diff --check`: PASS.
- Initial, repair and full-range exact review: final `P0=0 P1=0 P2=0`.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` until the real 120-date,
20-live-date and 252-attempt cohorts mature.  This Code Gate does not claim that
future returns have been proven.
