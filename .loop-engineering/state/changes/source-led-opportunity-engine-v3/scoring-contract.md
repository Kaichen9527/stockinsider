# Scoring Contract: source-led-opportunity-engine-v3

Version: `opportunity-features-v3.2`

## Freshness

| Factor | Freshness |
|---|---|
| price, volume, technical | latest completed Taiwan session from `tw-trading-calendar-v3.4` under the bound `priceProviderAllowlistHash`, accepted through next bound session close |
| institutional/chip | at most two authority-bound completed Taiwan sessions old |
| community catalyst | 72 hours |
| broker/news catalyst | 7 calendar days |
| official catalyst | 35 calendar days |
| monthly revenue | latest required filing, at most 45 calendar days old |
| quarterly fundamentals | at most 135 calendar days old |
| valuation | fresh price plus fresh financial inputs; recomputed each opportunity run |

Stale or missing subfeatures contribute zero. Factor availability requires at least half of its configured subfeature weight. Unavailable factors contribute zero to both score and available weight; available factors contribute their full configured horizon weight to `availableWeight`. In `marketSectorFactor`, the subfeature weights are regime 40%, sector excess return 40% and sector cycle 20%. A market `unknown` caused by core incompleteness and a sector `unknown` caused by missing/stale inputs are unavailable subfeatures worth zero; the numeric `unknown` display mapping is used only for a complete sector-cycle snapshot that reaches the final no-rule branch.

## Point-in-time Normalization

Sort finite reference values ascending. Quantiles use Hyndman-Fan Type 7: `h=(n-1)*p`, linearly interpolate between floor/ceil indices; for one value the quantile is that value. Winsorize both the reference and candidate value to the Type-7 1st/99th percentile boundaries. Then `PCTL(x) = 100 * (count(reference < x) + 0.5 * count(reference = x)) / n`. Equality is exact after input normalization but before output rounding. Empty reference is unavailable; a one-value reference gives percentile 50. The reference snapshot must have `source_timestamp <= sourceCutoff`.

- Market price/liquidity factors use active TWSE/TPEx common-stock end-of-day reference data with cutoff-valid coverage of at least 80% of the official active common-stock roster and at least 500 symbols; otherwise the reference and dependent subfactor are unavailable. The two market-wide sector-excess population keys, terminal rows, closed exclusions, conservation and identical 80%/500 availability threshold are exact in `sector-reference-contract.md`; they are never sector-local or candidate-sampled. Sector-cycle inputs use that same immutable sector manifest. This is allowed reference computation, not per-stock deep research.
- Chip, fundamental and valuation factors use same-sector reference data when at least 20 fresh peers exist; otherwise the active-market reference is used and the fallback is recorded.
- Higher-is-better transformations are applied before percentile ranking. `INV_PCTL(x) = 100 - PCTL(x)`.

### Scoring-reference manifest

Every completed-session offset in this section comes only from the point-in-time resolver in `trading-calendar-contract.md`. Each selected session-bound observation references the applicable exchange authority ID, and the factor-scoring header stores the exact `tradingCalendarWindowHash` covering all endpoints; a naked date, weekday offset or current calendar is invalid.

Every percentile population that can affect a V3 score is frozen by durable preparing manifest jobs before `seal_inputs`; no `enrich_rank` scoring job exists or leases before the final logical key is sealed. `factor_scoring_reference_manifest_v3` contains at most the 20,000 cutoff-valid roster symbols and exactly these 18 feature keys when available: `volume_ratio_20d`, `ma20_slope_5d`, `foreign_net_5d_over_turnover_5d`, `trust_net_5d_over_turnover_5d`, `margin_balance_change_5d_over_turnover_5d`, `sbl_short_balance_change_5d_over_turnover_5d`, `monthly_revenue_yoy`, `revenue_yoy_acceleration_3m`, `quarterly_eps_yoy`, `operating_margin_yoy_delta`, `avg_turnover_20d`, `zero_volume_sessions_20d`, `quality_roic_or_roe`, `quality_growth_acceleration`, `quality_margin_trend`, `quality_cash_conversion_accruals`, `quality_leverage_interest_cover`, and `quality_revisions`. Sector-excess-return populations remain owned by `sector-reference-contract.md` and official reported PE by `financial-data-contract.md`.

There is at most one terminal row per `(featureKey,symbol)`. Each included row is `[featureKey,symbol,canonicalSector,value,observedAt,sourceRef,authorityTier,rosterManifestHash,taxonomyAssignmentManifestHash,orderedAdjustedPriceEvidenceOrNull]`; `orderedAdjustedPriceEvidenceOrNull` is the complete session-descending array of exact `adjusted-price-evidence-v3.1` tuples for `ma20_slope_5d` and `sbl_short_balance_change_5d_over_turnover_5d`, and is JSON null for features that consume no adjusted close. Each excluded row is `[featureKey,symbol,exclusionReason,observedAtOrNull,sourceRefOrNull]`. Both arrays sort feature-key enum order then symbol ascending; per-key conservation rows follow feature-key enum order. Under `manifest-storage-contract.md`, cutoff/version/provider/roster/taxonomy/coverage decisions are the `factor_scoring_reference` header and the three exact ordered sections are `included_rows`, `excluded_rows` and `conservation`. `factorScoringReferenceManifestHash` is the universal root hash and its opaque ref is stored. More than 20,000 distinct symbols, 360,000 combined terminal rows, a duplicate terminal row, corrupt hash or unknown key fails closed. Candidate percentile lookup reads only this immutable manifest; it cannot query a newer live population or hash one monolithic array.

The candidate's selected normalized feature value is separately bound in the candidate/market input manifest. Any included value, exclusion, provider/source ref, coverage decision or allowlist correction changes the scoring-reference hash and therefore the `enrich_rank` logical idempotency key.

Reference features use the latest completed Taiwan session `t` at/before `sourceCutoff`. Official adjusted close/volume/turnover and institutional/credit facts follow `market-contract.md`; financial facts follow `financial-data-contract.md`. Windows are exact and require every stated observation:

- `volume_ratio_20d = volume_t / mean(volume_{t-20}..volume_{t-1})`; zero denominator is unavailable.
- `MA20_s = mean(adjustedClose_s..adjustedClose_{s-19})`; `ma20_slope_5d = 100 * (MA20_t / MA20_{t-5} - 1)`; both full windows and positive denominator are required.
- `turnover_5d = sum(turnover_{t-4}..turnover_t)`; foreign/trust ratios are their same-session five-day TWD net sums divided by turnover. `margin_balance_change_5d` is official TWD financing balance at `t` minus `t-5`; `sbl_short_balance_change_5d` is the official share-balance change times `adjustedClose_t`; each divides by positive `turnover_5d`.
- `monthly_revenue_yoy` is the latest fresh percentage-point fact. `revenue_yoy_acceleration_3m = latestYoYPct - mean(the three immediately preceding monthly YoY percentage-point facts)`, requiring four consecutive reported months.
- `quarterly_eps_yoy` and `operating_margin_yoy_delta` are the latest fresh comparable quarterly percentage-point facts.
- `avg_turnover_20d = mean(turnover_{t-19}..turnover_t)` and `zero_volume_sessions_20d = count(volume_s = 0 for s=t-19..t)`.

For each feature key, start from every symbol in the bound cutoff-valid active common-stock roster, never a seed/candidate subset. Include exactly one row iff the identical formula has all required cutoff-visible, fresh, finite, authority-resolved observations and every denominator/window constraint passes. Otherwise emit exactly one closed exclusion reason in this precedence: `provider_conflict`, `future_observation` (only required facts exist after cutoff), `stale_observation`, `insufficient_history`, `missing_observation`, `non_finite_value`, `non_positive_denominator`. No other filtering, sampling or outlier removal occurs before Type-7 winsorization. Per key, `rosterCount = includedCount + sum(exclusionReasonCounts)`; the sorted inclusion/exclusion/conservation rows are the exact universal manifest section payloads. Any conservation failure is fatal.

The scheduled manifest builder is bounded to 20,000 roster symbols, eighteen feature terminal rows per symbol (360,000 total), at most 25 completed price/volume/turnover sessions, six institutional/credit sessions, exactly the latest bounded 18 monthly periods, twelve quarterly periods, two aligned instant `invested_capital` snapshots, two aligned instant `total_assets` snapshots and at most eight cutoff-valid analyst-EPS rows per symbol. SQL symbol predicates/window ranks enforce those limits; the builder never loads extra history and truncates in application memory. This shallow reference computation cannot create candidates or load valuation research.

### Quality-axis feature formulas

The six `quality_*` rows are independent raw observations, not profile-derived
assumptions. All terms are selected point-in-time under
`financial-data-contract.md` and must be finite. A row is included only with its
complete stated series; otherwise it receives the existing first-match exclusion
reason. The directions below are all higher-is-better before percentile ranking:

- `quality_roic_or_roe`: use `100 * sum(last four quarterly operating income after
  its reported tax rate) / average(latest invested capital, invested capital four
  quarters earlier)` when both capital facts and four comparable quarters exist;
  otherwise use the latest official `roe` percentage-point fact. No other fallback.
- `quality_growth_acceleration`: use the mean of the latest three independently
  derived monthly-revenue YoY values minus the preceding three, requiring 18 monthly
  revenue observations.
- `quality_margin_trend`: latest quarterly operating margin minus the mean of the
  preceding three comparable quarterly margins.
- `quality_cash_conversion_accruals`: let `FCF=TTM operating cash flow - TTM capital
  expenditure`, `conversion=FCF/max(abs(TTM attributable common income),1)` and
  `accrual=(TTM attributable common income - TTM operating cash flow)/max(average
  (latest total assets,total assets four quarters earlier),1)`; store
  `100*(conversion-accrual)`.
- `quality_leverage_interest_cover`: store
  `min(TTM operating income/max(TTM interest expense,1),50) - netDebt/max(TTM
  EBITDA,1)`, requiring positive interest expense and EBITDA.
- `quality_revisions`: for at least three distinct verified institutions, select the
  latest and immediately prior cutoff-valid next-twelve-month diluted-EPS estimate
  within 90 days, then store their Type-7 median
  `100*(latest-prior)/max(abs(prior),0.01)`. Reported fact restatement rows do not
  impersonate analyst revisions.

For each candidate component, construct the same canonical-sector reference from the
manifest's included row for that feature. Fewer than eight peers makes that component
unavailable; no market-wide fallback exists. The component score is `PCTL(candidateRaw)`
rounded only at serialization. `quality.availableWeight` is the sum of available fixed
weights `0.25,0.25,0.15,0.15,0.10,0.10`. Quality is `available` exactly when
`availableWeight >= 0.65`; then its score is the weighted mean of only the available
component scores. It is `unavailable` exactly when `availableWeight < 0.65`, with a
null aggregate score; its reason is `quality_reference_insufficient` when the first
missing weighted component in the fixed order has complete raw facts but fewer than
eight sector peers, otherwise `insufficient_quality_inputs`. The component map always
preserves every individually available score and uses null only for its own missing
component; no BIAS, technical or valuation reason is valid on the quality axis. Quality
is explanatory except for the explicit decision minimum in `decision-contract.md`; it
never changes source priority or the six-factor horizon formula.

## Factor Formulas

All results round half away from zero to two decimals before horizon aggregation.

```text
priceVolumeFactor =
  0.30 * PCTL(sector_excess_return_5d)
+ 0.30 * PCTL(sector_excess_return_20d)
+ 0.25 * PCTL(volume_ratio_20d)
+ 0.15 * PCTL(ma20_slope_5d)

chipFactor =
  0.45 * PCTL(foreign_net_5d / turnover_5d)
+ 0.25 * PCTL(trust_net_5d / turnover_5d)
+ 0.15 * INV_PCTL(margin_balance_change_5d / turnover_5d)
+ 0.15 * INV_PCTL(sbl_short_balance_change_5d / turnover_5d)

catalystFactor = clamp(sourcePriority, 0, 100)

marketSectorFactor =
  0.40 * regimeNumeric
+ 0.40 * PCTL(sector_excess_return_20d)
+ 0.20 * sectorCycleNumeric

fundamentalFactor =
  0.40 * PCTL(monthly_revenue_yoy)
+ 0.25 * PCTL(monthly_revenue_yoy - prior_3m_revenue_yoy_mean)
+ 0.25 * PCTL(quarterly_eps_yoy)
+ 0.10 * PCTL(operating_margin_yoy_delta)

valuationFactor = clamp(50 + 2 * p50_upside_pct + p10_upside_pct, 0, 100)

liquidityFactor =
  0.70 * PCTL(avg_turnover_20d)
+ 0.30 * INV_PCTL(zero_volume_sessions_20d)
```

Mappings:

| State | Numeric |
|---|---:|
| market `risk_off` / `unknown` / `selective` / `risk_on` | 0 / unavailable / 65 / 90 |
| sector `contraction` / `unknown` / `late_expansion` / `early_recovery` / `expansion` | 10 / 30 / 55 / 75 / 90 |

## Source Priority

```text
sourcePriority =
  45 * strongest_unique_claim_prior
+ 20 * min(independent_source_classes / 3, 1)
+ 20 * recency_factor
+ 10 * min(log2(1 + deduplicated_reach) / 4, 1)
+  5 * link_confidence
```

From fresh unique claims linked to the candidate, choose `anchorClaim` by source prior descending, claim confidence descending, effective timestamp descending, then canonical claim hash ascending. `strongest_unique_claim_prior`, `recency_factor` and `link_confidence` are the anchor's values. For independence, group all fresh claims by `evidenceRootId`; each root contributes exactly one source class, chosen by highest source prior then source-class key ascending. `independent_source_classes` is the count of distinct classes across those root representatives, so cross-class reposts/citations of one root cannot increase it. `deduplicatedReach` is the union count of distribution tuples from `entity-link-contract.md` across those claims. All terms except the leading coefficients are 0 through 1. `recency_factor = max(0, 1 - age / classTTL)` using an effective timestamp at or before cutoff. No fresh unique claim means no active candidate. Final priority is clamped to 0 through 100. Candidate ties use newest fresh source timestamp, then ascending symbol.

## Horizon Aggregation

For each factor, `contribution = horizonWeight * factor / 100`. `horizonScore` is the sum of all contributions; missing factors are zero and are not renormalized.

`availableWeight` is the sum of horizon weights for available factors. For valuation-dependent decisions:

```text
scoreConfidence = availableWeight / 100 * min(sourceConfidence, valuationConfidence)
```

For `event_starter` only:

```text
eventDecisionConfidence = availableWeight / 100 * sourceConfidence
```

For source confidence, first group fresh unique claims by `evidenceRootId` and retain one representative per root by claim confidence descending then canonical claim hash ascending. For each representative, `claimConfidence = sourcePrior * linkConfidence * recencyFactor`. Sort representatives descending by claim confidence, then canonical claim hash ascending, retain at most five, multiply by fixed rank weights `1.00, 0.70, 0.50, 0.30, 0.20`, and divide by the sum of weights actually used. That value, clamped to 0 through 1, is `sourceConfidence`. With no fresh unique root it is zero. `valuationConfidence` comes from `valuation-contract.md` and is null unless valuation status is normal.

For formal-status purposes, `dataCompletenessPct` is exactly the `availableWeight` of `thesis_120_250d`; the thesis weights total 100. Formal evidence requires `sourceConfidence >=0.60` and normal valuation confidence >=0.60. These are independent from action confidence.

## Pre-research Selection

The shallow 30-stock pool uses:

```text
preResearchPriority =
  0.60 * sourcePriority
+ 0.20 * priceVolumeFactor
+ 0.10 * chipFactor
+ 0.10 * liquidityFactor
```

Only the top 20 after sector quota receive deep research and horizon scores. Others have status `enriched_observation`, `formalResearchStatus=not_evaluated` and no action.

## Action Horizon

- `event_starter`: `momentum_5_20d` only.
- Other new-position actions: higher of `momentum_5_20d` and `swing_20_60d`; exact tie selects `swing_20_60d`.
- `thesis_120_250d`: formal research and existing-position context only.

## Additive factor-correctness overlay

The six existing factors remain the authoritative score decomposition. The public
four-axis explanation and BIAS overlay are defined by
`factor-correctness-amendment.md` v3.11.6. For each horizon, shadow BIAS points use
the amendment's exact own-label/sector-P10/P90 mapping and 7/4/1 maxima. They are
stored in `timingRisk.shadowBiasPoints` but are excluded from horizon score,
`scoreDelta`, `availableWeight`, source priority and action thresholds. A versioned
promotion approval may change that rule only through a new static identity. The
separate `bias20Atr <= -3` safety cap maps to `observe_only`, not to a negative or
positive score contribution. Quality uses the six formulas and 25/25/15/15/10/10
weights above; it is unavailable rather than profile-imputed only when its complete
component availability weight is below 0.65. A missing component remains null and can
never be imputed or assigned a non-quality reason.
