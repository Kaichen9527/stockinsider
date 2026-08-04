# Requirements Gate Review — Round 6

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Date: 2026-07-19 (Asia/Taipei)
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=10 P2=4`

## Findings

1. **P1 — Canonical identity:** URL percent/default-port/repeated-query behavior, claim-text separators/punctuation normalization and overlapping mention-reason precedence were not exact.
2. **P1 — Point-in-time identity:** instrument/taxonomy authority did not require `sourceTimestamp <= sourceCutoff`; aliases lacked approval/source timestamps.
3. **P1 — Scoring lineage:** full-market price/volume/liquidity/chip percentile reference populations were not all manifest-bound.
4. **P1 — Valuation units:** percentage-point financial inputs conflicted with `1 + growthBase` and direct revenue-times-margin arithmetic.
5. **P1 — Verification lineage:** analyst estimates were not explicit valuation-hash inputs and verification did not require `reviewTimestamp <= sourceCutoff` with an exact freshness anchor.
6. **P1 — Verified research authority:** public broker/research verification lacked a deterministic allowlist/evidence predicate.
7. **P1 — Terminal reasons:** negative equity/capital-structure failures lacked closed reasons and “verified p90” trim eligibility was undefined.
8. **P1 — Public state:** shallow/deep/deferred counts, health/warnings and unavailable `asOf`/`sourceCutoff` derivation were incomplete.
9. **P1 — Evaluation selection:** no fixed daily cutoff/one-run-per-date rule existed for backtest or live cohorts.
10. **P1 — Acceptance completeness:** the 129-case inventory did not cover findings 1–9.
11. **P2 — Peer selection:** authority and deterministic truncation above the global 12-peer cap were unspecified.
12. **P2 — Mover audit:** selection among multiple completed audit sessions was unspecified.
13. **P2 — Public prose:** `sourceSummary` and `invalidation` had bounds but no deterministic construction.
14. **P2 — Loop governance:** `.specify/memory/constitution.md` was absent.

## Independently Confirmed Closed

Deferred-row hashing/conservation, claim-occurrence persistence, provider allowlist and z-score rules, consensus cap/tie-break, running unavailable state, workload/egress caps, internal auth/RLS and legacy shadow isolation remained closed.
