# StockInsider V3.15 — Fresh Requirements Gate Round 138

## Subject identity

- Subject commit: `835f66ba8589f6fa6d58be71ad8880b070b2da11`
- Subject tree: `4e16faa465278eface62428fca172a0b506440d9`
- Direct parent: `e74b672cf397b7f8ba11f86ff49b2633afb5b7dd`
- Initial and final subject worktree/index: clean

## Verdict

`PASS P0=0 P1=0 P2=0`

The V3.15 opportunity-recovery amendment is requirements-complete for architecture
review. No remaining contradiction, hidden buy quota, authority bypass, unbounded
whole-market operation, secret dependency or compatibility break was found.

## Recomputed requirements

- Official whole-market factors and approved-source evidence are separate research
  entrances into the same bounded 60→30→20 funnel. Factor discovery never emits a
  user action; `DecisionEnvelopeV314` remains the sole action authority.
- Missing factor axes retain their fixed weight and incur the declared coverage
  penalty. A missing input cannot improve ranking, and ranking is not represented as
  a probability of gain.
- TPEX price history uses the provider's Gregorian query, preserves the response URL,
  converts lots/thousands to shares/TWD and accepts the official compact ROC action
  date. Corporate-action retries remain bounded and incomplete authority fails closed.
- Official monthly revenue carries reporting period, filing time, unit and source into
  the point-in-time fact plane. Formal valuation and technical actions still require
  the existing four-quarter, 252-session/peer, adjusted-price and market gates.
- The producer and doctor use allowlisted Supabase HTTPS credentials. The previously
  rotated database password is neither reset nor embedded; provider failures are
  redacted. The REST claim carries the frozen authority hash.
- Migration V3.15 is additive and apply-twice safe, returns at most 3,000 active common
  instruments and narrowly grants only the authority-carrying claim and health RPC to
  `service_role`. RLS, append-only triggers and public mutation boundaries remain intact.
- 8299 and 2408 are validation examples only. Neither is forced into a buy bucket and
  production has no minimum actionable-stock quota.

## Executed evidence

- TypeScript and ESLint: PASS.
- Next.js production build: PASS, 63/63 pages generated.
- Core V3 tests: 61/61 PASS.
- Product correctness: 90/90 PASS.
- Complete five-migration fresh PostgreSQL chain, applied twice: 51/51 PASS.
- Legacy V1/V2 regressions: PASS.
- Browser correctness: 8/8 PASS, including V3.12 last-good 46-stock visibility.
- Controlled compact-projection performance oracle: 4/4 PASS.

This gate establishes requirements eligibility only. It does not claim future return,
production activation or Promotion Gate completion. Evaluation governance remains
blocked until non-fabricated elapsed cohorts mature.
