# StockInsider V3.15 — Fresh Architecture Gate Round 19

## Subject identity

- Subject commit: `70167d6a3d8015824fe1a695505d06ae6b03179f`
- Subject tree: `25111b0c4f8204cc54316aabc647aa1522c945ee`
- Requirements evidence: `requirements-review-round-138.md`
- Initial and final subject worktree/index: clean

## Verdict

`PASS P0=0 P1=0 P2=0`

The architecture is coherent and eligible for exact implementation freeze. No
remaining data-flow, authority, compatibility, atomicity, rollback or operational
constructibility finding was identified.

## Recomputed architecture invariants

- One producer DAG owns acquisition, research discovery, bounded deep selection,
  official authority loading, immutable decision revision and compact publication.
  Public request paths remain projection-only.
- Full-market acquisition is coarse-first and bounded in memory and SQL. It supplies
  research candidates only; all actions still flow through the point-in-time decision
  envelope after official financial, valuation, adjusted technical and market gates.
- The official loader starts parallel calendar and MOPS work with immediate settled
  rejection handlers. One fast provider failure degrades its own authority instead of
  terminating the producer or erasing valid sources.
- Supabase REST is a transport adapter, not a new authority. The migration wrapper
  restores the same transaction-local authority hash used by the PostgreSQL path;
  payload decoding, idempotency keys and terminal completion semantics are unchanged.
- The REST RPC surface is narrow and service-role-only. The active-instrument query
  ranks the latest recorded revision before filtering, so a historical active row
  cannot revive a delisted instrument.
- Migration order is base→V3.12→V3.13→V3.14→V3.15 and is advisory-locked,
  apply-twice safe and additive. Runtime rollback can stop the scheduler and restore
  the prior manifest while leaving additive database objects inert.
- Runtime bundle, credential allowlist, installation manifest, doctor and Web release
  identity share one reviewed commit. Missing connector OAuth remains typed and does
  not block official market/fundamental acquisition.
- LINE, dispatch, automatic trading and Promotion remain outside this release. A
  factor-ranked candidate is never promoted to public action without decision authority.

## Executed evidence

- Exact Requirements subject: PASS P0=0 P1=0 P2=0.
- Complete product/runtime diagnostic: PASS.
- Fresh PostgreSQL complete migration chain applied twice: 51/51 PASS.
- Product correctness including V3.15 REST, official-source and funnel owners: 90/90 PASS.
- Browser compatibility and projection performance: 8/8 and 4/4 PASS.

This is an Architecture gate, not the exact-commit diff review, protected Code Gate,
production smoke or proof of investment performance.
