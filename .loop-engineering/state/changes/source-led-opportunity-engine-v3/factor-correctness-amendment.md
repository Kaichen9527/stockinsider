# Factor Correctness Amendment: source-led-opportunity-engine-v3

Version: `opportunity-factor-correctness-v3.11.6`

## Purpose and boundary

The product must identify Taiwan stocks worth researching and, only when the
evidence permits, explain whether a new long entry is actionable now. It must not
manufacture turnover, treat a repeated check as a new opinion, or turn a low price
relative to a moving average into a buy signal without structural, fundamental and
valuation support.

This amendment closes the missing decision factors identified after the V3.11
correctness audit. It is additive to legacy radar fields. It preserves the current
`disabled` V3 route behavior and authorizes neither a production migration, a
runtime install, a scheduler change, shadow activation, a flag change nor a deploy.

## Four explicit decision axes

Every candidate card SHALL expose independent `discovery`, `quality`, `valuation`
and `timingRisk` axes. They are explanations, not an opaque composite that can
override a safety gate:

| Axis | Answers | Cannot do |
|---|---|---|
| discovery | Why this symbol newly merits research, or why it continued | Create an entry action |
| quality | Whether the business/facts support research | Substitute for a current technical trigger |
| valuation | Whether a point-in-time model supports a valuation range | Turn incomplete/contradictory facts into a target price |
| timingRisk | Whether technical geometry allows a new long now | Override valuation review or a below-support/reclaim state |

The canonical selection order remains source-led discovery, bounded shallow/deep
research, valuation completeness, then technical action eligibility. An out-of-seed
symbol with valid source evidence may surface as `source_signal` before valuation is
complete; no seed-only output may be described as live discovery.

## Moving-average deviation (BIAS)

`technicalDecision.maDeviation` uses adjusted closing prices only:

```text
biasNPct = 100 * (adjustedClose / SMA(N) - 1), for N in 20, 60, 120
bias20Atr = (adjustedClose - SMA(20)) / ATR(14)
```

The formulas use the same point-in-time corporate-action authority, completed Taiwan
sessions, `MA20|60|120` and `ATR14` already required by
`technical-decision-contract.md`. Values are calculated before presentation and are
rounded only at serialization. Missing adjusted history, action authority or ATR
returns `availability:'unavailable'` with no invented BIAS value.

The displayed label is stock-specific, not a universal percentage. The
`technical_history_reference` manifest selects the newest at most 877 consecutive
completed sessions strictly before the as-of session per ordered deep symbol using a
`LIMIT 878` sentinel, then orders those selected sessions oldest-to-newest. It
partitions that chronological series into at most seven unique chunks of width 132 (the
oldest chunk may be shorter). Every chunk except the oldest additionally carries its
immediately preceding 120 older rows as overlap. A raw
row is `[symbol,anchorBlockOrdinal,anchorSession,sessionOrdinalWithinBlock,session,
adjustedOpen,adjustedHigh,adjustedLow,adjustedClose,adjustedPriceEvidence]`, where
`adjustedPriceEvidence` is the complete nested `adjusted-price-evidence-v3.1` tuple
from `market-contract.md`, not a digest or an opaque reference. It is adjusted to that
block's latest unique session, so the exact corporate-action range contains at most 251
intervening sessions. The same raw session may validly appear in two adjacent blocks
with distinct complete anchor evidence.

Each BIAS endpoint is emitted once from its owning unique chunk. Its 120 consecutive
adjusted OHLC rows are ordered oldest-to-newest and include the endpoint: `SMA20|60|120`
are arithmetic means of their final 20/60/120 closes. `TR(t)` is exactly
`max(high(t)-low(t),abs(high(t)-close(t-1)),abs(low(t)-close(t-1)))`; `ATR14` is the
arithmetic mean of the final 14 such terms, whose first term's prior close is the
preceding row inside that same 120-row window. Thus every emitted value is reproducible
from the native tuple with no live read, hidden adjusted field or look-ahead. `N`
selected sessions produce exactly `max(0,N-119)` eligible strictly-before-as-of
endpoints: 252 through 758 for an available own-history sample and exactly 758 at
`N=877`. The maximum raw plane is `877 + 6*120 = 1,597` rows per symbol; no live reread
or unbounded rolling window is permitted. The own history sample is the latest 252
through 758 endpoints. Fewer than 252 is
`insufficient_own_history`, never a generic "cheap" badge. Separately, the full
roster `bias_reference` manifest computes the current BIAS20 for at most 20,000
cutoff-valid common stocks, and its current-session canonical-sector population is
available only with at least eight rows. Both manifests bind the calendar, raw-price,
corporate-action, roster and taxonomy roots. They own exact page cursors, row bounds,
conservation and the public counts/as-of/manifest refs.

The own label uses this closed first-match order, so an exact quantile boundary has
one and only one label: `bias20Pct <= P10` is `extreme_low`; otherwise
`bias20Pct <= P25` is `low`; otherwise `bias20Pct <= P75` is `normal`; otherwise
`bias20Pct < P90` is `high`; otherwise it is `extended`. This remains deterministic
when two or more Type-7 quantiles are equal. The sector values are context only; a
missing sector population never invents a sector label. Closed unavailable reasons,
nullability and serialization belong to `data-contract.md`.

BIAS has two deliberately separate effects. Its **shadow contribution** is
deterministic but has zero influence on the six-factor horizon score, `scoreDelta`,
`availableWeight`, formal status and ordinary action threshold until Promotion has a
versioned factor-approval evidence row. Let `own = 1|0.5|0|-0.5|-1` for
`extreme_low|low|normal|high|extended`, and let `sector = 0.25` at/below sector P10,
`-0.25` at/above sector P90, otherwise `0`. With an unavailable own or sector branch
its respective term is zero. `shadowBiasNormalized = clamp(own+sector,-1,1)` and
`shadowBiasPoints = roundHalfAwayFromZero(maxPoints*shadowBiasNormalized,2)`, where
`maxPoints` is 7/4/1 for momentum/swing/thesis. These exact values are visible only
as timing-risk diagnostics.

The independent **safety cap** is authoritative only after the technical hard-state
gate: an available `bias20Atr <= -3` with technical state other than
`below_support|reclaim_required|invalidated` sets `timingRisk='observe_only'`,
`shadowBiasPoints=0` and action `avoid/bias_observe_only`; it is not a score weight.
It clears only on a later completed session with `bias20Atr > -3`, after which the
ordinary technical state and geometry are evaluated again. `below_support`,
`reclaim_required` and `invalidated` precede this cap and always block buy-like
action; the first two serialize their technical-state reason rather than
`bias_observe_only`, and former support remains a reclaim condition, never a pullback
entry. Promotion may enable a nonzero BIAS score weight only after the real-cohort
gate in this amendment and a new factor-contract version change invalidate run
identity.

## Point-in-time PE comparison

The product SHALL keep two non-interchangeable fields:

- `exchangeReportedPe`: official TWSE/TPEx daily reported PE with its official
  publication date, source reference and as-of session; and
- `modelComparablePe`: the selected valuation method's comparable multiple, present
  only for a positive-EPS `pe` or `normalized_pe` path with complete model inputs.

Official exchange PE is an append-only daily observation, never silently recomputed
from revised facts. `reported_pe_reference` selects the current official row and its
latest 252 through 1,260 completed-session own history for each deep symbol using a
`LIMIT 1261` sentinel. It also selects same-session canonical-sector rows from the
complete roster. A sector needs at least eight positive-PE rows with a current
official close and a cutoff-valid official `shares_outstanding` fact; its cap-weighted
aggregate is `sum(PE*close*shares)/sum(close*shares)`. Own history serializes
P10/P25/P50/P75/P90/current percentile; sector serializes P25/P50/P75/count and that
aggregate. A missing source, session, share count, sample or manifest selects its
closed unavailable reason. These are **reported-PE** comparisons; the selected
model-method history/peer distribution remains the separate valuation bridge.

`modelComparablePe` is present only for a complete positive-EPS `pe` or
`normalized_pe` valuation path. It is never filled from official reported PE.
Conversely, an unavailable model path does not rewrite a retained official PE. A
reported historical PE and a model multiple may appear side by side but never merge
or substitute for one another.

For finance use PB/ROE or residual income; for asset businesses use NAV; for
cyclicals use normalized earnings plus EV/EBITDA cross-check; for non-positive EPS,
do not display PE and use an eligible EV method or `valuation_review`. Multiple
relative cheapness contributes exactly 35% of the valuation axis: own-history 20%
and sector 15%. The remaining closed weights are scenario bridge 30%, capital
structure 20% and method cross-check 15%. For a normal valuation,
`valuationAxisScore = 0.20*ownHistoryScore + 0.15*sectorRelativeScore +
0.30*scenarioBridgeScore + 0.20*capitalStructureScore + 0.15*crossCheckScore`, with
every term a finite 0..100 value defined in `valuation-contract.md`. The five terms
are required together; there is no partial valuation-axis weighted mean. Any missing
source/as-of/sample, method disagreement outside the contractual tolerance or
operating-bridge failure yields `valuation_review`, with no formal target price or
buy-like recommendation.

## Quality, revisions and explanation integrity

The quality axis uses only provenance-complete point-in-time facts: ROIC/ROE (25%),
growth and acceleration (25%), margin trend (15%), free-cash-flow conversion/accrual
quality (15%), leverage/interest cover (10%) and estimate/fact revisions (10%).
`financial-data-contract.md` owns the additional official cash-flow, capex,
total-assets, interest-expense and shares facts; `scoring-contract.md` owns all six
formulas, sector percentile populations and a 65% availability/50-score action
precondition. An unavailable component remains unavailable and reduces confidence; it
is not imputed from a profile, company description or LLM.

`lastEvaluatedAt` records a deterministic re-check. A new immutable analysis revision
requires a material input hash change in source/fact/price-trigger/technical/
valuation/risk/factor-state authority. A no-change re-check publishes its time through
`noChangeMessage` and an append-only evaluation disposition, while legacy
`changedBecause` remains the rank/transition delta only. Model prose may
only render locked structured facts and decision outputs; it cannot add a number,
change an action or claim a source.

## Public compatibility and acceptance

`/api/radar/daily`, `/hot` and `/weekly` retain all legacy fields. Available V3
projections add only closed fields: `factorAxes`, `technicalDecision.maDeviation`,
`valuation.relativeMultiple`, `lastEvaluatedAt`, `analysisGeneratedAt`,
`materialChangeHash`, `materialChangedBecause` and `noChangeMessage`. Sources and detailed reference samples are
paginated. `disabled|drain` continues to make no V3 query and `/api/opportunity-v3`
continues to return the exact disabled 404.

Canonical acceptance inventory `1.44.6` now owns seven non-skipped R14 cases:
`PCR-025..PCR-031`. They cover BIAS formula/history, sector bounds, shadow/safety
precedence, official/model PE and history, quality formulas, no-change schema and
factor run identity. They were intentionally RED in the historical planning baseline;
the current implementation requires each named owner to execute its real caller and
result dependency without skips or todos. A Code Gate may claim the inventory only
after every named owner passes with JSON/Markdown parity.

## Required evidence before promotion

The factor change remains shadow-only until 120 point-in-time backtest dates, 20
real live trading dates and the immutable 252-attempt roster evaluate IC, turnover,
sector grouping and forward returns without fabricated elapsed cohorts. A blocked
cohort result is `blocked/non_fabricated_elapsed_cohorts_unavailable`; it is not a
pass and cannot be converted into a claim that the product can predict large gains.
