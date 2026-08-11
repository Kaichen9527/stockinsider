# StockInsider V3.13 — Architecture Round 15 P1 repair

## Disposition

Both Round 15 P1 findings are repaired as closed boundary changes. A fresh independent
Architecture Round 16 remains mandatory; this evidence does not claim Architecture
PASS.

## Repair map

1. Available, unavailable and stale revision-bound detail responses are all
   `Cache-Control: no-store`. A ready envelope can no longer persist in shared cache
   after the schedule-derived freshness boundary. Deep-dive publishes this single
   builder result and insight delegates to deep-dive.
2. The DI-005 regression advances the same immutable decision across the exact
   exchange-session clock from fresh to `stale_readonly`; fresh is actionable but
   uncacheable, while stale is `409`, uncacheable and contains neither envelope nor
   valuation.
3. Generic migration discovery is now an exact legacy allowlist. Unknown files and
   every present/future V3-family filename are excluded unless a reviewed change
   explicitly edits the policy; V3 migrations must never enter the allowlist.
4. `db:v3:plan` emits the complete ordered base/V3.12/V3.13 chain, per-file hashes,
   chain hash and durable status-artifact hash. It derives the production migration
   authority bit from that artifact and exposes no apply command while authority is
   false.
5. Documentation now states the closed generic allowlist and dedicated,
   hash/authority-bound V3 apply plus disabled/drain rollback boundary.

## Executable evidence at repair time

- Typecheck, lint and production build: `PASS`.
- Base product/runtime: `61/61 PASS`.
- Product correctness plus V3.13 decision integrity: `50/50 PASS`.
- Migration contract and PostgreSQL rehearsal: `48/48 PASS`.
- Legacy V1/V2 regression: `2/2 PASS`.
- Playwright decision/accessibility matrix: `3/3 PASS`.
- Controlled performance matrix: `4/4 PASS` (the first parallel attempt raced the
  concurrent production build and was discarded; the isolated post-build rerun passed).
- Model runner: `17/17 PASS`.
- Disabled deployment host-pin v3.7 doctor: `PASS`.
- Root and Web production dependency audits: `0 vulnerabilities`.
- Dedicated V3 plan: three migrations, every file additive, ordered chain hash
  `cf4fbef749f94150c6d8bc726f2129ebd6356fc6c0d21acb4cd20becf0bb8976`,
  `applyAuthorized:false`.

The same matrix is rerun on the final reviewed commit at authoritative Code Gate.

No production state is read or mutated by this repair.
