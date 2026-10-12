# Financial history native extraction — slice 1

Base approved main: `0997336d0eb8ec43ea0899f22fe5a03cc774518f`.
Source of the existing approved financial amendment/cases:
`2e078dfdd74272d3d50dffdd4cc6c14df3152c78` (pending PR364).
Prior scope audit: `3fb0b0f08a4611f39d487d7b33fd0d62ccadd56d`,
`docs/operations/2026-10-12/financial-bound-minimal-audit.md` in that docs-only branch.
Original financial spec remains at that pending Git subject under
`openspec/changes/financial-history-admission-v1/spec.md`; no thresholds or
expectations from it are changed.

## Exact extraction

`migrations/20261005_financial_history_admission_v1.sql` is copied byte-for-byte
(169 lines). It separates stored history from the 128 distinct claims within one
period, preserves original facts/disclosure clocks, wraps the existing append
RPC, adds immutable observations with known-only backfill and a bounded PIT
keyset reader. The same-period cap is still 128; no dates or facts were changed.

The main `migration-contract.test.mjs` retains every original test/fixture and
adds only the existing `financialHistorySql` file read plus the exact original
**financial history amendment admits genuine periods, preserves PIT revisions
and bounds pages on the real predecessor chain** case. No complete pending test
file or unrelated test imports were copied. The original baseline
**V3.16.16 financial fact append is recollection-idempotent and still rejects the
129th distinct series row** remains unchanged.

The original amendment test applies SQL twice inside its rollback-only isolated
transaction, then validates 160 monthly periods, original fact ID on recollection,
exact retry, changed value/unit/restatement/provider, cutoff pagination 128+32,
unique coverage, invalid cursor/size/principal, period correction storm, private
predecessor/no service INSERT/no owner CREATE. It asserts 287 fixture facts and
288 observation rows before rolling back. This is a genuine native SQL test on
synthetic rows, not an official refresh or 1723/343 production repair.

## Explicitly pending case and installer

The second original **financial atomic replay rollback retains installed
successor after predecessor replacement and forced failure** case requires
`migrationBodyInAtomicTransaction` from `scripts/opportunity-v3/atomic-migration-chain.mjs`,
which does not exist in approved main. Its exact original case is archived in
this slice's unique receipt directory as `pending-atomic-replay-case.mjs.txt`.
It is **not** registered, skipped, replaced with a stub, or counted PASS. The
next authorized installer slice owns that real dependency and its guard/scanner
regression. This first slice does not claim atomic installation/replay acceptance.

The 48 original migration files, default planner/apply, authority artifacts,
roles outside the existing copied SQL, package/lock and PCR catalog are untouched.
The default installer still does not select this new financial tail. Do not apply
it to production by a raw SQL route. A narrow reviewed atomic plan/profile,
installed-successor guard, existing-schema rehearsal, exact/protected review and
capacity-admitted operation remain necessary before production apply.

## Native profile and limits

Node22.14.0 and the already available PostgreSQL17.11 tools execute the unchanged
main `before()` predecessor migration fixture. It starts a private Unix-socket
cluster with `listen_addresses=''` and uses the original synthetic legacy tables
and managed migration role. No new prerequisite stub, alternative schema fixture,
clock shim or live connection was introduced. This focused predecessor fixture
is **not** the complete VPS schema-only installation profile or a production
role/permission/clock attestation.

The native command selects precisely the old baseline and new amendment case,
not the entire canonical suite. Actual PASS/FAIL/SKIP and raw output are retained;
unselected original tests and pending atomic case are not called verified.
OS-derived USER and a short private TMPDIR are runner-only settings. Existing
proxy/CA settings are inherited. No model/provider/crawl/HTTP operation or
qualification/strategy release is part of this manual engineering task.

Web dependencies are reused from the own exact-main-lock checkout through a local
hardlink directory (no cross-root symlink and no install/lock change). Typecheck,
lint and normal build are separately captured. Only a stopped, already pushed
own `.next` was retired after all compiled file hashes matched its saved manifest;
source, unique raw evidence and other worktrees were preserved.
