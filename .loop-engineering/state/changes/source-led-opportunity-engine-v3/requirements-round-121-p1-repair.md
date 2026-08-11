# Requirements Round 121 — P1 Repair Evidence

Round 121 subject: `eaae8ade09534c6158b324f8c30cd0a2c97b4750` / tree
`90570857f5d060767dd60cd9b4f039c3ba139765`.

## Root closure

1. The operating bridge now selects one common ordered four-quarter set for every
   flow, including operating expense and noncontrolling interest. Each quarter is
   reconciled from gross profit through attributable net income and reported diluted
   EPS. Diluted weighted shares are accepted only from the official statement,
   converted from cumulative YTD averages to discrete-quarter averages and day-
   weighted across the TTM. Instant balances must align with the latest bridge
   period; a mixed-period bridge fails closed.
2. All seven valuation methods now bind a method-specific 252-session primary
   authority, an exact eight-peer same-exchange/session/sector authority and every
   mandatory cross method. Each Bear/Base/Bull case preserves ordered inputs,
   source/as-of metadata and four sensitivity results. Required current anchors and
   method authority are freshness checked; method divergence retains both reviewable
   ranges while preventing a formal target. A regression also closes a discovered
   JavaScript callback-arity defect that silently changed PB observations to PE when
   `metric` was passed directly to `Array.map`; the authority envelope now records
   and must match the selected method.
3. The conditional research plane uses exactly 252 sessions including current and
   an exact eight-peer reference from the same exchange, trading session and
   canonical sector. It no longer combines an off-by-one runtime history with the
   legacy sector aggregation.
4. SQL source completion now joins documents and item outcomes by the complete
   profile/source/stable-item identity. Overflow must conserve a rejected document
   with a rejected/rejected item; accepted, deferred and metadata-only dispositions
   have their own closed pairings. Count-equal but identity- or disposition-mismatched
   multisets fail atomically.

## Regression evidence before freeze

- V3.13 decision-integrity tests: `11/11 PASS`.
- Applied PostgreSQL migration suite: `46/46 PASS`.
- Seven-method formula, common-quarter bridge, day-weighted shares, method authority,
  complete scenario/sensitivity, divergence, research-axis 252/8 and conflict
  permutation regressions: PASS.
- Source item/document identity conservation and overflow terminality: PASS.
- Runtime JavaScript syntax and `git diff --check`: PASS.

These are repair diagnostics, not a Requirements verdict. A new immutable Round 122
subject and an independent fresh Requirements review are still required. No
production migration, runtime activation, connector credential installation, Web
publication or source write occurred.
