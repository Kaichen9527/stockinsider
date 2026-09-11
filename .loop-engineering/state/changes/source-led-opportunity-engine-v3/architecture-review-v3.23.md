# Architecture review: evidence research and publication authority V6

Result: `PASS`

Findings: `P0=0 P1=0`

Reviewer: independent architecture agent `/root/plan_safety_check`

## Reviewed architecture

- Candidate observation identity is separated from immutable discovery
  identity. Repeated current-run evidence can remain unchanged without being
  rejected; prior-only retention cannot masquerade as a current observation.
  Canonical disposition/reason, current config/seed identity, discovery
  identity and discovery delta are checked before publication.
- Historical retained candidates obtain legacy run/config/seed lineage from
  the database-owned successful producer record. The reviewed migration path
  reapplies the reader definitions; source authority remains behind its
  opportunity-owned RPC rather than widening legacy relation access.
- Formal valuation publication uses the validated immutable decision
  envelope. Producer bear/base/bull objects and target prices use the same
  canonical numeric rounding rule; malformed shapes, strings and conflicting
  scenarios fail closed. Public target/range values are derived from the
  envelope, not independently supplied display values.
- The source terminal plane, disabled/drain read boundaries and fail-closed
  publication semantics remain intact. The no-global-Shadow successor does
  not remove per-stock evidence, technical or market requirements.
- The active graph binds 55 active artifacts, three incorporated OpenSpec
  artifacts and one historical audit artifact. The dual-lineage and canonical
  rounding amendment is an active owner. The protected worker dispatches
  historical catalog-v1 identities through the original v1 formula and this
  catalog-v2 identity through the extended v2 formula.
- PR #210 remains separate from subsequent Contabo migration and UI redesign
  scopes. Those later scopes are not certified as implemented by this review.
- Candidate code cannot register its own graph or rewrite protected review
  provenance. Independent graph registration, final exact review and protected
  execution remain release prerequisites.

## Verification

- Runtime/product/gate diagnostics: 64 passed, zero failed, zero skipped.
  Files: product-correctness.test.mjs, protected-external-gate-worker.test.mjs,
  gate-evidence.test.mjs and v320-kol-first-runtime-recovery.test.mjs.
- Isolated PostgreSQL verification: four selected migration/terminal/SQL
  canonicalization tests passed.
- DI-003 official financial facts and peer authority through EV/EBITDA,
  canonical rounding and public publication passed.
- Independent reproductions passed for historical retention, repeated current
  evidence and rejection of retained-to-current relabeling.
- An initial browser-test attempt failed because the review checkout used
  dependency symlinks outside Turbopack's root. Dependencies were replaced by
  local copies without changing tracked files; the complete 64-test rerun
  passed. This was not counted as application success before rerunning.
- These are locally executed diagnostics, not a claim that the protected
  release harness, production migration or deployment has completed.

## Evidence

- Final reviewed implementation commit/tree: `6ed9d39ac97c0c843f021417217ef45eaf0e7190` / `72034d4dd5389e776e9d77cad499c37f7180e90f`
- Full reviewed implementation range: `408c15c465715227690e1e429c8e9ab4b385f20b..6ed9d39ac97c0c843f021417217ef45eaf0e7190`
- Active graph: `a4cf40d99dbfe7d23e0bdd39130f73cf6943a5535394d8313f2055de9a7d3058`
