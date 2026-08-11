# StockInsider V3.13 — Architecture Round 14 P1 repair

## Disposition

The sole Round 14 P1 is repaired as one publication-boundary root closure. A fresh
independent Architecture Round 15 remains mandatory; this evidence does not claim
Architecture PASS.

## Repair map

1. Runtime, TypeScript and SQL share the exact unavailable blocker
   `insufficient_cited_decision_brief`; arbitrary blockers fail closed.
2. Web validation emits one closed detail availability:
   `available | unavailable | stale_readonly`. Stale markers must be exact and their
   `lastKnownAction` must equal the immutable envelope action.
3. Deep-dive and inherited insight publication use the same pure result builder.
   Source-only and stale results are `409`, `no-store`, and omit the decision envelope
   and valuation. Stale exposes only `lastKnownAction` as action history.
4. React resolves stale-readonly before unavailable/available rendering and never
   renders the historical envelope as an actionable decision.
5. Regression fixtures cover source-only detail, stale historical buy, invalid
   blocker, stale-action mismatch and SQL rejection of the arbitrary blocker.

## Executable evidence at repair time

- Typecheck, lint and production build: `PASS`.
- Base product/runtime: `61/61 PASS`.
- Product correctness plus V3.13 decision integrity: `49/49 PASS`.
- Migration contract: `48/48 PASS`.
- Legacy V1/V2 regression: `2/2 PASS`.
- Playwright decision/accessibility matrix: `3/3 PASS`.
- Controlled performance matrix: `4/4 PASS`.
- Model runner: `17/17 PASS`.
- Disabled deployment host-pin v3.7 doctor: `PASS`.

The same matrix is rerun at authoritative Code Gate on the final reviewed commit.

No production state was read or mutated as part of this repair.
