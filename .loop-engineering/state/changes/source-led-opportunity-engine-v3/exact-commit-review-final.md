# V3.15 bounded-ingestion exact-commit review

Date: 2026-08-14
Reviewer: Codex Sol independent exact-range review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subjects

- Reviewed base: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Production repair commit/tree: `9afb12b85c8e0eb9a98090c6443c2be146b6d523` / `d70a3c3fe8fc58691537cc1c714d12989daa7e0f`
- Final assertion repair commit/tree: `82577e63dfcdbbd1a9306b6e4484c01b2c103b33` / `31aef4aafaa1bc2f27719fbbc9f054263f598bba`
- Requirements evidence carrier: `7b6eee8af578c4d7c800e65d4b2f946935e39c04`
- Architecture/source commit/tree: `ae25b07163232151aaccf3c4830eb65b22f604ce` / `b33c89254c39ce560a31c1e6490d1781aed95aba`
- Exact reviewed range: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd..ae25b07163232151aaccf3c4830eb65b22f604ce`
- Repair closure range: `2e2c835d4c678e48cddd0429abdc7358e2b0e2f2..ae25b07163232151aaccf3c4830eb65b22f604ce`
- Active graph: `734b013bdfd750bfdf87ceb731f9db5033d9d4c8614323e1a884d8b43cb7c717`
- PCR fulfillment: `pcr-fulfillment-record-v1.json`

## Diff review

1. Production evidence isolates one performance root: the reviewed worker completed
   3,388 predecessor jobs and staged 5,530 official rows, but applying a 200-row
   financial or price chunk exceeded the database's 120-second statement bound. The
   terminal failure published no decision revision or compact projection.
2. Financial, price and reported-valuation application chunks are now capped at 20
   rows. Trading-calendar chunks remain 200 because the production-shaped rollback
   probe completes them in under one second and they do not perform per-stock registry
   resolution.
3. The successor migration preserves the original V3.14 validator as a private base
   function. The service-role wrapper first stages the exact canonical chunk, applies
   it, and commits an immutable ledger identity containing run, job, kind, ordinal,
   hash, producer, cutoff and item count. A retry returns only for a byte-identical
   ledger member; a conflicting member fails closed.
4. Terminal completion refuses any non-terminal manifest member absent from that
   ledger, restores the exact run-bound authority hash, and then delegates to the
   unchanged V3.14 conservation, decision-revision and successor transition. Valid
   official facts may survive a later job failure, but no partial action or projection
   can publish.
5. The migration is additive and apply-twice safe. RLS is enabled, direct table access
   is revoked from public/anon/authenticated/service_role, and service_role receives
   EXECUTE only on the combined chunk wrapper and completion wrapper. No public
   mutating endpoint, scheduler owner, source trust tier, ranking weight, valuation
   threshold or user action changed.
6. Rollback-only production rehearsal applied the migration twice and verified the
   application table, base function and REST wrapper. Focused V3.15 tests pass 12/12;
   the combined V3.14/migration execution passes 85/85; full product correctness passes
   96/96 with zero failures, skips or todos; `git diff --check` passes.
7. Fresh Requirements Round 156 and independent Architecture Round 37 both pass with
   `P0=0 P1=0 P2=0`. The stale 200-row acceptance assertion found during the first
   full run was repaired before this review and the complete suite was rerun cleanly.

## Authority boundary

This PASS authorizes the already-approved coordinated additive migration, tracked
producer activation and Web release. LINE, dispatch, automatic trading and V3
Promotion remain disabled. Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable` pending real elapsed cohorts.
