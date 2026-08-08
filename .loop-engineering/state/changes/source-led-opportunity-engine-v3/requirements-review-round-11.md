# Requirements Gate Review — Round 11

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..3d7f0376983009622066739b09d005a9d86486a0`
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=6 P2=1`
- Architecture Gate performed: no

## Findings

1. **P1 — Immutable revision selection and closed adapter registry:** the revision-family grouping key, collapse/count/cap order, superseded-revision treatment and one-row-per-canonical-source registry were not exact.
2. **P1 — Discovery authority versus static policy:** `sourceIdentityAllowlistManifestHash` and `sourceFunnelPolicyHash` lacked exact versioned preimages/formulas, and acceptance did not prove their different comparison-key effects.
3. **P1 — Official alias seeding:** `entity-link-contract.md` required signed `identity_reviewer` authority while the route-role matrix assigned official roster-name seeds to `opportunity_runner`.
4. **P1 — Prepare/seal convergence:** convergence on an existing final logical success did not define the preparing attempt, jobs, returned identity, later status or cleanup; older claim wording conflicted with the two-key lifecycle.
5. **P1 — Valuation verification authority:** expiry, bounded query, duplicate/conflict/selection rules and deterministic `verificationRef` were incomplete for multiple matching rows.
6. **P1 — V3 detail behavior:** the invalid/non-success error schema was not exact and permitting fewer than three horizon details conflicted with the successful deep-candidate invariant.
7. **P2 — Unavailable warnings:** selection was ambiguous when multiple matching attempts existed.

## Independently Confirmed Closed

Pre-truncation immutable source revisions, database knowledge time, HMAC-bound principals and no-anon fallback, durable bounded execution, same-run V3 detail isolation, shadow-only authority, no legacy writes and zero model influence remain closed.

## Inventory Validation

- Canonical version: `1.10.0`
- Declared/actual/unique cases: `166/166/166`
- Structurally complete records: `166`
- Duplicate, malformed or empty cases: `0`

Structural validation passed. Semantic one-to-one coverage failed on the six P1 contracts above. Another fresh Requirements Gate is required after repair; Architecture re-gate remains locked.
