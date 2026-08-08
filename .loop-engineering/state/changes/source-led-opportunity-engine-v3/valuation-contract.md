# Valuation Contract: source-led-opportunity-engine-v3

Version: `opportunity-valuation-v3.4`

Valuation uses point-in-time reported facts and deterministic transformations. Social targets, company-profile assumptions, current observed multiples and assistive-model output are never default inputs.

## Method Selection

The closed method enum is
`pe|normalized_pe|ev_ebitda|pb_roe|residual_income|nav|ev_sales`. Cross-checks use
the same enum but are serialized separately and never masquerade as the primary
method. Apply the first eligible primary rule:

1. `finance_insurance` with positive BVPS and a complete latest-eight-quarter ROE
   series -> `residual_income`, with `pb_roe` mandatory cross-check.
2. `finance_insurance` with positive BVPS and ROE but no complete residual-income
   series -> `pb_roe`.
3. `construction` with positive official `net_asset_value` and diluted shares ->
   `nav`.
4. A cyclical sector in the exact set
   `semiconductor|steel|shipping_transport|plastics|chemical|cement|paper_pulp|
   glass_ceramic|rubber|oil_gas_electricity` with twelve consecutive quarterly
   attributable-common earnings and positive normalized full-cycle earnings ->
   `normalized_pe`, with `ev_ebitda` mandatory cross-check.
5. Other sectors with positive TTM attributable-common income/EPS and depreciation/
   amortization below 8% of revenue -> `pe`.
6. Positive TTM EBITDA with complete cash/debt/share facts -> `ev_ebitda`.
7. Non-positive TTM attributable income and EBITDA, but positive TTM revenue, positive
   gross margin and complete cash/debt/share facts -> `ev_sales`.
8. Otherwise -> status `missing`, method `null`, with `no_eligible_method`.

A company with non-positive TTM EPS never selects `pe`. It may select
`normalized_pe` only from the complete twelve-quarter cycle rule; otherwise it uses an
eligible EV method or remains missing.

Current-anchor freshness is evaluated only after every required bounded series is
constructed. The greatest-period quarterly operating bridge and every current
share/cash/debt/NAV/BVPS/ROE scalar used by the selected method must have
`sourceTimestamp >= sourceCutoff-135 days`. When monthly revenue growth is used, the
greatest-period current-month row anchoring the latest three derived YoY observations
must have `sourceTimestamp >= sourceCutoff-45 days`. The older paired prior-year
monthly rows, earlier members of the twelve-quarter/eight-quarter series and company
historical multiple rows are bounded history: they must be cutoff-valid, consecutive
or inside their stated five-year window and provenance-complete, but are not each
retested against the current-anchor freshness interval. Current peer multiples must
individually satisfy the 135-day interval. Price remains valid through the next
Taiwan close.

If a complete required series exists but a current anchor exceeds its applicable
freshness window, status is `stale` with the selected method, null values/confidence
and `stale_financial_inputs`. If a required scalar/share/cash/debt fact does not exist,
status is `missing` with `missing_required_inputs`; if a stated multi-observation
series is incomplete, status is `missing` with `insufficient_series`. Any
operating-bridge failure in `financial-data-contract.md` instead resolves to
`outlier_review` with the exact bridge reason and null scenario values/confidence. Its
method is null only when failure occurs before method eligibility can be established;
otherwise the already selected method is retained. No other `outlier_review` may have
a null method.

## Fundamental Distribution

For each deep candidate, analyst-estimate and broker-target pre-cap selection each uses an ordered `LIMIT 101` sentinel over cutoff-valid rows. Observing row 101 fails the enrich run with `data_integrity_failure`; it never hashes/truncates an unknown tail. Thus each selection manifest contains at most 100 eligible rows before latest-per-institution/top-eight reduction and the deep-20 workload is bounded.

The analyst metric is fixed by selected method: diluted EPS/share for
`pe|normalized_pe`, EBITDA in TWD for `ev_ebitda`, revenue in TWD for `ev_sales`, and
book value/share for `pb_roe`. `residual_income|nav` always use the official formula
path and never substitute an analyst target. Estimates must explicitly name that
next-12-month metric and period, use units normalized by
`financial-data-contract.md`, carry institution/publisher identity, satisfy
`verified_publication` in `source-matrix.md`, and be no more than 90 days old at
`sourceCutoff`. Keep the latest cutoff-valid estimate per institution, tie by ascending
evidence ref, then retain the first eight institutions ordered estimate timestamp
descending and institution ID ascending. With at least three distinct verified
publisher identities, Type-7 p10/p50/p90 of the normalized values is the fundamental
distribution for the selected method. An estimate for another metric cannot be
converted or substituted. Otherwise use the formula path:

- `growthBasePct = clamp(median(latest 3 monthly revenue YoY percentage-point values), -30, 50)` and `growthSpreadPct = clamp(1.4826 * MAD(the same 3 percentage-point observations), 5, 20)`.
- Scenario growth values in percentage points are `clamp(growthBasePct-growthSpreadPct,-50,70)`, `clamp(growthBasePct,-50,70)` and `clamp(growthBasePct+growthSpreadPct,-50,70)`. Revenue p10/p50/p90 are TTM revenue multiplied respectively by `1 + scenarioGrowthPct/100`. Percentage-point values are never used as unitless multipliers.
- Margin base is the latest TTM reported method margin plus half of the latest quarterly YoY margin delta, with that adjustment clamped to -3 through +3 percentage points. Margin spread is the larger of 1 percentage point and the MAD of the latest four reported quarterly margins; p10/p50/p90 margins use base minus spread, base, and base plus spread. No profile or sector target can raise the base.
- For `pe`, multiply each revenue scenario by its net-margin percentage-point scenario
  divided by 100, then divide by current diluted weighted shares to obtain EPS.
- For `normalized_pe`, take Type-7 p25/p50/p75 of the twelve quarterly
  attributable-common incomes, multiply by four and divide by current diluted weighted
  shares. The twelve-quarter median is the full-cycle normalized earnings authority;
  current EPS is never multiplied by revenue/margin factors.
- For `ev_ebitda`, multiply revenue by the EBITDA-margin percentage-point scenario
  divided by 100. For `ev_sales`, use revenue directly.
- For `pb_roe`, require the latest book value/share plus eight quarterly
  book-value/share changes: bear/base/bull next-12-month book values are
  `max(0,latestBVPS+4*Type7Quantile(changes,.10/.50/.90))`.
- For `residual_income`, let BVPS be latest official book value/share and ROE scenarios
  be Type-7 p25/p50/p75 of eight quarterly ROE observations divided by 100. Use
  `(costOfEquity,growth)` of `(0.12,0.00)|(0.10,0.03)|(0.08,0.05)` for bear/base/bull
  and compute `BVPS + max(-BVPS,((ROE-costOfEquity)*BVPS)/(costOfEquity-growth))`.
- For `nav`, divide official net asset value by diluted shares and multiply by
  `0.65|0.80|0.95` for bear/base/bull. NAV and its discount policy are each displayed
  as inputs; neither comes from market price.

All source series require their full stated sample. An incomplete series returns
`missing/insufficient_series`; absent diluted shares, cash/debt or another required
scalar returns `missing/missing_required_inputs`. A selected path that computes a
non-finite result becomes `outlier_review/non_finite_distribution`; a positive-EPS
method producing any non-positive scenario equity value becomes
`outlier_review/negative_equity_value`. These invariant branches use the public
null-value rules below rather than being reclassified as missing.

Public `evidenceRefs` is deterministic. The selected official formula source is always retained first and cannot be displaced by the eight-ref cap. If the analyst path is selected, traverse its retained estimates in the exact top-eight institution order. Then, or first for the formula path, traverse selected provenance rows in this fact-key order: `monthly_revenue`, `quarterly_revenue`, `quarterly_gross_profit`, `quarterly_operating_expense`, `quarterly_operating_income`, `quarterly_non_operating_income`, `quarterly_pretax_income`, `quarterly_income_tax_expense`, `quarterly_noncontrolling_interest`, `quarterly_net_income_attributable_to_common`, `quarterly_diluted_eps`, `diluted_weighted_average_shares`, `quarterly_ebitda`, `cash_and_equivalents`, `total_debt`, `net_debt`, `book_value_per_share`, `roe`, `net_asset_value`, `invested_capital`, `depreciation_amortization`, `current_price`; within a key use period-end descending, source timestamp descending, source ref ascending. Append first-seen opaque refs until eight. Multiple-reference evidence is represented separately by `referenceManifestRef`, approval by `verificationRef`, and excluded broker annotations never displace selected valuation evidence.

Every financial fact consumed by the formula path has authority tier
`official_filing|official_company_event|official`. The formula source ref is mandatory,
must be one of those consumed facts, must also occur in public `evidenceRefs`, and must
use the closed `official:|mops:|twse:|tpex:|company:` authority prefix. Missing or
non-authoritative formula provenance returns `missing/missing_formula_source`; it can
never publish `normal`, scenarios or a target range.

## Multiple Distribution

- Multiple distributions are required for
  `pe|normalized_pe|ev_ebitda|pb_roe|ev_sales`. `residual_income|nav` do not consume a
  market multiple and set reference counts/quantiles to zero/null unless a mandatory
  cross-check uses one.
- Historical sample: the company's prior 20 completed quarter-end method multiples over at most five years, excluding the run's current observation, loss/non-finite values and observations timestamped after cutoff; require at least eight.
- Peer sample: start from the `included_rows` of the exact bound global
  `sector_valuation_reference`, select the candidate's canonical V3 sector and
  method, remove only the row whose persisted first member byte-equals the
  candidate's immutable stock ID, then remove non-finite/loss values; require at
  least five. Equal/reused symbols are not exclusion keys. A missing candidate ID,
  duplicate `(stockId,method)` included row or row/roster stock-ID mismatch is
  `data_integrity_failure`. Recompute candidate-specific winsor limits and quantiles
  from those surviving rows. Global aggregate rows never supply candidate-specific
  quantiles.
- Each valid sample is winsorized at its own 10th/90th percentiles. If both samples qualify, each target quantile is `0.60 * historicalQuantile + 0.40 * peerQuantile`. If only one qualifies, use it. If neither qualifies, return `missing` with `insufficient_multiple_reference`.
- For `pb_roe`, manifest peers must have positive non-null ROE and each peer multiple is weighted by `clamp(peerROE / candidateROE, 0.5, 1.5)`. Weighted quantile sorts by multiple then symbol and selects the first multiple whose cumulative weight divided by total weight is at least p. The historical branch remains unweighted. All other quantiles use Type 7 from `scoring-contract.md`.

The global reference deliberately terminalizes the candidate's current observation
under the same finite selector as every other stock. Candidate-specific selection
then removes it. Thus the current observed candidate multiple is display evidence
only and cannot fill either the bounded company-history sample or the peer sample.

The public historical and peer counts are the qualifying post-exclusion sample sizes actually used. Their public quantiles are the corresponding post-winsorization Type-7 or PB weighted p10/p50/p90 before the 60/40 blend. A qualifying branch has a non-null quantile triple and count at or above its minimum; a non-qualifying branch has a null triple and its actual bounded count. `referenceManifestRef` is non-null for `normal`/`outlier_review` and for `stale` when a valid reference manifest was selected. A missing/corrupt/hash-mismatched manifest produces `missing`, null method/values/confidence/verification/reference ref, zero sample counts and null reference quantiles.

## Equity Value, scenarios and cross-checks

Pair bear/base/bull fundamentals with p10/p50/p90 multiples. PE/normalized-PE and PB
produce per-share equity value directly. EV methods subtract the same point-in-time
`totalDebt-cashAndEquivalents` from each enterprise-value scenario and divide by
current diluted weighted shares. Residual-income and NAV values are already per-share.
Validate the operating bridge, capital structure, finiteness, non-negativity and
`bear <= base <= bull` in that order. Negative, non-finite or invalid-capital-structure
results serialize `outlier_review` with null values/confidence so invalid numbers never
cross public numeric bounds; ordering-only and high-upside outliers retain their finite
non-negative values for review.

Every scenario serializes:

```ts
type ValuationScenarioV31 = {
  case:'bear'|'base'|'bull';
  value:number;
  asOf:string;                  // latest applicable selected fact timestamp
  inputs:Array<{key:string;value:number;unit:string;sourceRef:string;asOf:string}>;
  sensitivity:Array<{key:string;delta:number;result:number}>;
};
```

Inputs are in the method formula's exact order, count 1..24, and every input is the
exact object `{key,value,unit,sourceRef,asOf}` with bounded non-empty strings, a finite
value and whole-second UTC `asOf`. Sensitivities are exactly four exact-key objects in
this order: fundamental `-10%`, fundamental `+10%`, multiple/discount `-10%`,
multiple/discount `+10%`. Values
are recomputed, not scaled target labels. All scenarios share method/version/cutoff and
contain at least one official source ref.

For a mandatory cross-check, compute its full scenario triple from independently
eligible facts/references. `crossChecks` has exactly one row for finance
residual-income/PB and cyclical normalized-PE/EV-EBITDA, otherwise zero or one optional
row; max two. Missing a mandatory cross-check produces
`outlier_review/cross_check_unavailable`. If
`abs(primaryBase-crossCheckBase)/max(abs(primaryBase),0.01)>0.35`, status is
`outlier_review/method_divergence`; all targets remain visible for review but no
buy-like action is allowed.

Valuation has no partially complete `normal` state. The selected analyst/formula path
enumerates all method-selection facts, every stated series observation, current price,
required share/cash/debt facts and every method-required reference/cross-check;
validation requires every applicable item fresh, finite and provenance-bound.
Therefore `inputCompleteness` is exactly 1 for `normal` and finite retained
high-upside/consensus/ordering/method-divergence `outlier_review`; bridge,
negative-equity, invalid-capital-structure, non-finite, stale or missing valuation has
null confidence and does not compute this formula.

For a normal distribution:

```text
inputCompleteness = 1
sampleConfidence =
  multiple method
    ? min(1, historicalSampleCount / 20 * 0.6 + peerSampleCount / 10 * 0.4)
    : min(1, selectedOfficialFactCount / requiredOfficialFactCount)
dispersionConfidence = clamp(1 - (p90 - p10) / max(abs(p50), 0.01), 0, 1)
valuationConfidence = 0.50 * inputCompleteness + 0.30 * sampleConfidence + 0.20 * dispersionConfidence
```

Round monetary outputs and confidence only at serialization: scenario prices to two
decimals, sensitivities to two decimals and confidence to four. Intermediate
calculations retain double precision. Public compatibility names p10/p50/p90 are
aliases of bear/base/bull respectively; both sets cannot disagree.

## Consensus and Outlier Rules

Broker consensus exists only with at least three `verified_publication` per-share targets from separately identified cutoff-valid publisher/institution identities under `source-matrix.md`, each no more than 90 days old at `sourceCutoff`. Keep the latest cutoff-valid target per institution, tie by ascending evidence ref; then retain at most eight institutions ordered target timestamp descending, institution ID ascending. Type-7 p10/p50/p90 uses those three-to-eight normalized targets. Fewer targets remain individual comparison annotations; more than eight cannot enter consensus, but every eligible pre-cap target and its retained/excluded decision enters `valuationInputHash` as selection evidence.

Status becomes `outlier_review` and buy-like actions are blocked when any applies. All matching reasons serialize uniquely in `ValuationReasonV3` enum order, bounded to eight; the first serialized reason is the primary decision reason:

- unverified formula Base/p50 upside is above 80% -> `unverified_base_upside`;
- any unverified scenario/p90 upside is above 150% -> `unverified_scenario_upside`;
- absolute difference between formula p50 upside and verified broker-consensus p50 upside is above 35 percentage points -> `consensus_divergence`;
- a mandatory cross-check cannot be constructed -> `cross_check_unavailable`;
- primary/cross-check base values differ by more than 35% -> `method_divergence`;
- any operating-bridge invariant fails -> its exact
  `financial-data-contract.md` bridge reason;
- a computed equity value is finite but negative -> `negative_equity_value`;
- diluted shares are non-positive or the net-debt/share capital-structure invariants fail -> `invalid_capital_structure`;
- a computed value is non-finite -> `non_finite_distribution`;
- finite values do not satisfy `p10 <= p50 <= p90` -> `distribution_ordering`.

Assistive-model estimates may be displayed under shadow evidence but are excluded from consensus, confidence, status and action rules.

## Verification Authority

`valuationInputHash` is SHA-256 over the primary method, ordered cross-check methods,
selected analyst/formula path, every retained and excluded analyst-estimate
institution/metric/period/value/unit/timestamp/recorded-at/evidence-root/ref plus the
top-eight decision, every reported operating-bridge/price/share/cash/debt/NAV/ROE
input value and source timestamp/recorded-at/ref, cycle windows, historical and peer
sample identities/values/recorded-at, scenario policy/sensitivity inputs, every
retained and excluded broker-consensus row plus the top-eight decision, and
valuation/financial/sector-taxonomy versions in RFC-8785 canonical JSON. Only
cutoff-visible rows with database-generated `recordedAt <= sourceCutoff` enter the
hash. Only an outlier whose reasons are a non-empty subset of
`unverified_base_upside|unverified_scenario_upside|consensus_divergence|
method_divergence` can return to normal through immutable review. Missing cross-check,
bridge, negative equity, invalid capital structure, non-finite or ordering failures
are never human-clearable.

For each `(symbol,valuationInputHash)`, query cutoff-visible verification rows ordered `reviewTimestamp DESC, recordedAt DESC, reviewerPrincipalId ASC, verificationId ASC` with `LIMIT 101`. The sentinel is applied before validity filtering so rejected, expired and malformed authority rows cannot create an unbounded hidden tail; row 101 fails the run `valuation_verification_overflow`. At most 100 rows proceed. Rows tied on `(symbol,inputHash,reviewerPrincipalId,reviewTimestamp,decision)` must have byte-equivalent reason/evidence/rationale/computed/expiry payloads; equivalent rows retain the lowest verification UUID and a differing tie is `data_integrity_failure`.

A valid approval satisfies every item below:

- the exact matching input hash and symbol;
- decision `approved`, verified `valuation_reviewer` principal ID from `auth-principal-contract.md`, and `valuationComputedAt <= reviewTimestamp <= recordedAt <= sourceCutoff < expiresAt`; the write RPC computes `expiresAt = reviewTimestamp + 30 * 24 hours` and rejects a caller-supplied expiry, so exactly 30 days old is expired and freshness is anchored to the run cutoff rather than wall-clock read time;
- at least two evidence refs published and collected at/before both `reviewTimestamp` and `sourceCutoff`, with distinct `evidenceRootId` and distinct verified publisher identity under `source-matrix.md`, including at least one official filing/company-event publisher, explicitly validating the forecast drivers and reference-multiple rationale; reposts/citations of one root never satisfy two;
- `reasonCodes` equal the sorted unique current clearable outlier-reason set, `evidenceRefs` contain 2..8 sorted unique opaque refs satisfying the evidence predicate, and rationale is 1..500 Unicode code points after NFKC/trim with no control characters.

Rows are created only through the exact dual-controlled `POST /api/internal/valuation-verification-v3` catalog in `auth-principal-contract.md`, which requires both `requireInternalAuth()` and signed `valuation_reviewer`; request-body actor/expiry fields are rejected. After duplicate/conflict handling, evaluate rows in the query order and select the first valid approval; rejected/expired/invalid rows remain audit evidence but cannot shadow a later valid row. `verificationRef` is exactly `valuation-verification-v3:{selected lowercase verification UUID}`. Thus competing valid approvals select deterministically by review time, knowledge time, principal and UUID. If none is valid, valuation remains `outlier_review`; a changed input hash, expiry or missing evidence reactivates the hard block. Approval does not change p10/p50/p90; it changes status to normal, records that exact ref, and leaves the unusually high distribution visible. A verification recorded after a historical cutoff is invisible to that historical run even when its review timestamp is backdated.

Expiry comparison uses PostgreSQL `timestamptz` precision without date truncation or inclusive-end rewriting. The canonical boundary fixture fixes `reviewTimestamp=2026-06-19T04:00:00Z` and therefore `expiresAt=2026-07-19T04:00:00Z`: `sourceCutoff=2026-07-19T03:59:59Z` is eligible, equality at `2026-07-19T04:00:00Z` is expired, and `2026-07-19T04:00:01Z` remains expired. Implementations using `<=`, calendar-day comparison or request wall-clock time fail acceptance.

`p90DecisionEligible` is true exactly when valuation status is `normal`, p90 is finite, and either no raw outlier threshold/invariant fired for the current input hash or the current matching `verificationRef` approved those fired reasons. Existing-position trim consumes this predicate; the ambiguous phrase “verified p90” has no other interpretation.

Threshold evaluation belongs solely to valuation status. Without a current matching approval, any threshold above produces `outlier_review`; with a valid approval the same visible values serialize `normal`. Downstream decision code consumes that resolved status and may not independently reapply the raw outlier thresholds.

## Additive reported-PE and relative-multiple extension

`factor-correctness-amendment.md` v3.11.6 adds `relativeMultiple` without changing
the selected-method scenario bridge above. `exchangeReportedPe`, `ownHistory` and
`sector` are the immutable official daily reported-PE plane from
`financial-data-contract.md` v3.3; `modelComparablePe` is this contract's selected
`pe|normalized_pe` path. They are different data types and neither can fill the
other's null branch.

Official reported-PE own history is the retained positive daily sample including the
current as-of observation, with 252 through 1,260 completed sessions and Type-7
P10/P25/P50/P75/P90/current percentile. Its sector population has exactly the same
as-of session, at least eight distinct cutoff-valid stock IDs with positive official
PE/close and fresh official shares outstanding, and P25/P50/P75 plus the specified
cap-weighted aggregate. The current PE, historical sample and sector sample each
carry their own closed availability/reason branch and opaque manifest ref. `pe` is
not displayed for non-positive official PE; an unavailable reported PE does not make a
positive-EPS model PE appear, nor does it alter scenario targets.

The existing method-specific valuation **reference** remains distinct: its own
quarter-end same-method history requires at least eight and its candidate peer sample
requires at least five after the candidate stock-ID exclusion. That five-peer rule is
for target-price model calibration, not the public reported-PE sector comparison; the
latter's eight-peer rule does not relax or replace it. `finance_insurance`,
construction, asset/NAV paths and non-positive EPS emit `modelComparablePe` with the
closed absence reason; they never display a PE-like model fallback. Missing bridge or
mandatory cross-check still produces the existing `valuation_review` fail closure.

For the additive public valuation axis, a normal valuation computes five required
finite 0..100 terms before serialization. `ownHistoryScore` is
`100-currentPercentile` from the available official PE own-history branch.
`sectorRelativeScore` is 100 when current official PE is at/below sector P25, 50 at
sector P50 and 0 at/above sector P75, linearly interpolated in the two intervening
closed intervals. `scenarioBridgeScore` is
`clamp(50 + 2*(100*(p50/currentPrice-1)),0,100)`. `capitalStructureScore` is
`100*cashAndEquivalents/(cashAndEquivalents+totalDebt)` when the denominator is
positive and 50 when both values are exactly zero. `crossCheckScore` is 100 when the
selected method has no mandatory cross-check; otherwise it is
`100*(1-abs(primaryBase-crossCheckBase)/(0.35*max(abs(primaryBase),0.01)))` after the
existing 35% divergence rejection, and is clamped 0..100. The exact aggregate is the
five-weight formula in `factor-correctness-amendment.md`; no omitted term is
renormalized. A missing reported-PE branch, non-finite term or unavailable mandatory
cross-check returns `valuation_review` with null valuation-axis score.
