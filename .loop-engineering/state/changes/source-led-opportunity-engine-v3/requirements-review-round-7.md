# Requirements Gate Review — Round 7

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=7 P2=3`

## Findings

1. **P1 — Byte identity:** query-pair/empty/malformed-percent behavior, exact ticker patterns/boundaries and claim-ID byte encoding remained incomplete.
2. **P1 — Authority manifests:** alias, taxonomy-assignment and publisher allowlist hashes lacked canonical preimages/order.
3. **P1 — Publication content:** normalized content hash and raw ingestion revision were incomparable under the stated verification predicate.
4. **P1 — Scoring population:** feature windows and closed include/exclude construction were not canonical.
5. **P1 — Invalidation:** valuation-review plus missing MA20 had no serializable branch.
6. **P1 — Public provenance:** source/valuation ref selection was unordered and the public root-count bound was below the valid internal maximum.
7. **P1 — Acceptance:** 143 cases did not cover findings 1–6 completely.
8. **P2 — Mover audit:** selected count versus eligible-universe count and adjusted return authority were ambiguous.
9. **P2 — Peer edges:** supply-chain direction and duplicate-edge collapse were unspecified.
10. **P2 — Residual serialization:** `changedBecause`, unused `verification_required`, and market-reason precedence remained open.

## Independently Confirmed Closed

Conservation/claims; scan/deferred/idempotency sentinels; quota/stage boundaries; market provider/z-score; percentage-point valuation; analyst/target bounds and cutoff approval; valuation invariants and p90 eligibility; public stage/health/unavailable/as-of; unique daily evaluation cohorts; auth/RLS/atomicity; legacy shadow isolation; and constitution presence.
