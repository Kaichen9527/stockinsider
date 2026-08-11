# Requirements Round 120 — P1 Repair Evidence

Round 120 subject: `32dded855831fc498ed0706ac0748bface89db2f` / tree
`6c2d9a738cf8e84a1b8936562a17d6a853c3bd88`.

## Root closure

1. Official balance-statement facts now use the SQL/runtime instant-fact shape:
   `periodStart=null`, `durationKind=instant`. Runtime accepts that exact shape and
   rejects duration mismatches. The parser-to-runtime regression reaches both BVPS
   and total NAV without changing their declared units.
2. The seven closed valuation methods now use method-specific input distributions.
   PE and EV paths combine 18 monthly revenue observations with eight discrete
   quarterly margins; normalized PE uses twelve cycle observations; PB/ROE uses nine
   book-value observations; residual income uses eight ROE observations and explicit
   cost-of-equity/growth cases; NAV uses total NAV divided by diluted shares. Formal
   relative scenarios require both 252 own sessions and eight same-session peers.
   Normalized PE and residual income require complete, cutoff-valid, ordered
   cross-check triples, reject more than 35% base divergence and score the actual
   method divergence rather than an unrelated median comparison.
3. Source overflow is terminal at every boundary. Podcast, YouTube and Threads all
   translate code-point overflow to rejected/rejected item outcomes. SQL accepts only
   `terminalDisposition=rejected` for `content_overflow`, records the overflow
   revision as rejected with `content_overflow_parse_failure`, and the catalog oracle
   owns the corresponding nullable-hash/revision constraint.
4. `DecisionEnvelopeV313` now distinguishes missing/failed/available quality and
   market authority. Missing or failed authority takes precedence over technical
   waiting states and always returns `unavailable`; known technical states are used
   only after both authority planes are available.

## Regression evidence before freeze

- V3.13 decision-integrity tests: `11/11 PASS`.
- Applied PostgreSQL migration suite: `46/46 PASS`.
- Seven valuation formula oracles, seven current-anchor freshness cases, both
  mandatory cross-check missing/future/unordered/divergent cases: PASS.
- Three connector overflow paths and SQL terminal grammar: PASS.
- Quality × market × technical authority matrix (`3 × 3 × 7`): PASS.
- Runtime JavaScript syntax and `git diff --check`: PASS.

These are repair diagnostics, not a Requirements verdict. A new immutable subject and
an independent fresh Requirements review are still required. No production migration,
runtime activation, connector credential installation, Web publication or source
write occurred.
