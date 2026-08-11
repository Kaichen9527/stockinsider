# StockInsider V3.13 — Architecture Round 13 P1 repair

## Disposition

All five Round 13 P1 findings are repaired in one root-cause closure tree. A fresh
independent Architecture Round 14 remains mandatory; this document does not claim
Architecture PASS.

## Repair map

1. **Source-only construction** — compact publication and Web validation now use a
   closed cited Decision Brief union. `unavailable` is permitted only with a typed
   blocker and an authoritative `unavailable` envelope; citation and navigable
   provenance remain mandatory.
2. **Analysis/disclosure lineage** — unchanged material analysis retains prior
   analysis/narrative authority while publishing the current decision and disclosure
   state, so price-only changes create a new Decision revision.
3. **Future facts** — reported periods are bounded by filing/source dates in the
   table and RPC, by cutoff in SQL reads, and independently in the worker. The
   additive migration audits incompatible existing rows before installing the
   constraint.
4. **Decision authority** — missing/failed quality or market authority precedes
   technical wait selection. Compact fails closed on a malformed present envelope
   instead of inventing a second decision.
5. **Rounding** — Runtime and Web implement decimal half-away-from-zero with
   floating-point boundary tolerance, matching PostgreSQL numeric rounding.

## Executable closure evidence

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
