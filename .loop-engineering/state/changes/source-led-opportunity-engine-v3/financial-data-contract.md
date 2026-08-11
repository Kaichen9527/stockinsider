# Financial Data Contract: source-led-opportunity-engine-v3

Version: `opportunity-financial-inputs-v3.3`

The current `fundamental_snapshots` table is insufficient for V3 valuation and is never optimistically extended in application memory. V3 adds the append-only `opportunity_financial_facts_v3` observation plane from `storage-schema-contract.md`, populated before a run only from allowlisted official MOPS/TWSE/TPEx facts or FinMind rows carrying original source date/provider provenance.

The bounded loader accepts only the quota planner's ordered deep-candidate list. A list longer than 20 fails the entire batch with `deep_candidate_bound_exceeded` before any financial query; it never processes a partial first 20. For a valid list, per symbol it queries/returns at most the latest eighteen cutoff-valid monthly periods, the latest twelve cutoff-valid quarterly periods, twenty historical quarter-end multiples and nine book-value-per-share observations; it does not fetch a nineteenth month, thirteenth quarter, twenty-first historical multiple or tenth book-value observation. Eighteen months are the minimum bounded plane that can reproduce the six YoY values used by the quality acceleration formula without accepting provider-computed growth. The nine book-value observations reproduce the latest value plus eight sequential changes required by `valuation-contract.md`. It may additionally return one current cutoff-valid row for diluted shares, ROE, depreciation/amortization, net debt, cash, total debt, total equity, net asset value and shares outstanding; exactly two cutoff-valid instant rows each for `invested_capital` and `total_assets` (latest and the aligned fact four completed fiscal quarters earlier); and the twelve-quarter cash-flow, capex and interest-expense series required by `scoring-contract.md`. Database predicates/window ranks enforce the same symbol and row bounds rather than loading extra rows and truncating in application memory.

Each fact records provider, fact key, period start/end and duration kind, filing/publication timestamp, provider source timestamp, collection timestamp, database-generated `recorded_at`, unit, restatement identity and source ref. `sourceTimestamp` is the timestamp carried by the named provider for that exact filing/fact revision: for an official filing it is the official publication/revision timestamp, and for a FinMind mirror it is the preserved original-provider source timestamp rather than FinMind ingestion time. It is never derived from collection or database time. Ingestion enforces `filingPublishedAt <= sourceTimestamp <= collectedAt <= recordedAt`; all four must be `<= sourceCutoff` for use. Monetary units are exactly `TWD`, `TWD_thousand`, `TWD_million`, normalized to TWD with multipliers 1/1,000/1,000,000; shares are exactly `share` or `thousand_shares`, normalized with multipliers 1/1,000; per-share values are `TWD_per_share`; percentages are percentage points; multiples/ratios are dimensionless. Unknown units, unit-kind mismatches and non-finite normalized values make that fact missing.

Structured public-research observations use the same immutable fact plane and are never parsed ad hoc by an enrich worker. Every row has a database-checked `estimateKind`/`estimateHorizon` pair. Reported facts are exactly `reported/reported_period` and cannot use `broker_target_price`. An analyst estimate is exactly `analyst_estimate/next_twelve_months` for `quarterly_diluted_eps|quarterly_ebitda|quarterly_revenue|book_value_per_share`; quarter-only and fiscal-year-only values are not NTM and are rejected rather than substituted. A broker target is exactly `broker_consensus/target_12m` for the dedicated `broker_target_price` fact in `TWD_per_share`. Both non-reported families require their `sourceRef` to resolve to a cutoff-visible `source_publication_verifications_v3` row with a non-null institution identity. The candidate-financial builder independently orders each family by source timestamp descending, institution identity ascending, evidence ref ascending and fact UUID, applies literal `LIMIT 101`, and fails the run with `data_integrity_failure` when row 101 exists. At most 100 rows per family enter the immutable manifest before the valuation contract's latest-per-institution and top-eight rules.

Fact identity is `(stockId,factKey,periodStart|null,periodEnd,durationKind)`. Rows whose database-generated `recorded_at`, filing/publication timestamp, provider source timestamp or collection timestamp is after `sourceCutoff` are forbidden. Official filing rows outrank FinMind mirrors. Within the highest available authority tier, select greatest filing/publication timestamp, then greatest provider source timestamp, greatest collection timestamp, greatest recorded-at, lexicographically greatest non-null `filingRestatementId`, then ascending source ref. Byte-equal normalized values tied through restatement collapse to the first source ref; different normalized values still tied through restatement produce `conflicting_point_in_time_fact`, and the applicable factor/valuation is missing. FinMind may fill an identity only when no cutoff-valid official filing row exists and it carries the original provider source timestamp. Profile values are never a fallback.

Every financial row also belongs to the exact database series
`(stockId,factKey,durationKind,estimateKind,estimateHorizon)`. The append RPC first
acquires the series advisory lock, inserts-or-locks the registry row, then collapses
an exact immutable duplicate and examines existing rows through the series-leading
index with literal `LIMIT 129`. A series has a lifetime maximum of
128 distinct immutable rows across every period, provider, source and restatement.
The proposed 129th distinct row fails `PT409/bound_violation` before the fact,
registry-change or RPC-audit write; an exact duplicate reuses its fact UUID and
does not consume the bound. This is a deliberate finite append-only envelope. A
later approved contract must migrate to a new series version before widening it;
no cleanup, overwrite or silent truncation is allowed.

A daily shallow sector-valuation reference may aggregate active-market method
multiples into canonical V3 sectors from already-stored observations. This is an
allowed durable paged reference computation, not candidate discovery or deep
research. Its closed `methodVersion` is exactly `sector-valuation-method-v3.1`.

The reference builder is roster-first. It enumerates the already bounded
effective-active common-stock rows in the header's complete instrument manifest in
native stock-ID order, then probes exactly the four reported
`quarter_end/dimensionless` series
`pe_multiple|pb_multiple|ev_ebitda_multiple|ev_sales_multiple` for each row. Each
probe uses the exact series-leading index and literal `LIMIT 129`; because append
rejects row 129, it examines at most 128 raw observations before applying knowledge
time, authority, restatement and latest-period precedence. Missing series produce no
collapsed identity. Across the complete roster one selector invocation therefore
examines at most `20,000*4*128 = 10,240,000` raw rows.

Every manifest-page invocation truthfully re-enumerates that complete bounded roster
and the same four series, derives at most 20,000 terminal collapsed identities, sorts
them under the native comparator below, applies the stored strict-after native-payload
cursor and only then observes `LIMIT 2001`. Missing series, reordered sectors/symbols
and sparse early roster prefixes therefore cannot create an underfilled intermediate
page or hide a later row. The per-page raw-observation worst case is the same finite
10,240,000 bound; there is no 501-stock shortcut. The database selector never scans
by a sparse cutoff prefix or loads an unbounded financial table. It binds each stock
to the exact effective-active common-stock row in the header's roster and the
cutoff-effective assignment in the header's taxonomy manifest. It then maps
`pe_multiple` to `normalized_pe` for the exact cyclical-sector set in
`valuation-contract.md` and to `pe` for every other known non-finance sector, maps
`pb_multiple` to `pb_roe` only for `finance_insurance`, maps
`ev_ebitda_multiple` to `ev_ebitda`, and maps `ev_sales_multiple` to `ev_sales`.
Every other fact/method combination is outside the selector and creates no row.

For each `(stockId,method)`, apply the fact-authority/restatement/conflict rules in
this contract independently at every fact identity, then select the surviving row
with greatest `periodEnd`, greatest `filingPublishedAt`, greatest
`sourceTimestamp`, greatest `collectedAt`, greatest `recordedAt`, lexicographically
greatest non-null `filingRestatementId`, then ascending `sourceRef`. A
different-valued unresolved authority tie yields one terminal
`authority_conflict`; it never falls through to an older period. The builder orders
these collapsed identities by method, canonical sector, symbol, stock ID, source
timestamp, recorded-at and source ref. Before page slicing, the complete bounded
selector observes `LIMIT 20001` under that comparator and fails
`reference_volume_exceeded` if row 20,001 exists. Each page then applies the exact
stored native-payload cursor and `LIMIT 2001` to this same globally ordered plane. It
does not truncate, accept a caller-supplied peer array, use roster order as a page
cursor, or emit more than one terminal row per stock/method.

Each collapsed identity is terminal under this first-match precedence:
`authority_conflict`; `ineligible_instrument` when roster authority is absent or not
effective-active common stock; `unknown_sector` when taxonomy authority is absent,
ambiguous or unknown; `invalid_multiple` when the value is non-finite or non-positive;
`missing_positive_roe` for `pb_roe` without a cutoff-valid positive current ROE; and
`stale_observation` when the selected multiple's source timestamp is older than
`sourceCutoff-135 days`; otherwise `included`. Missing observations are absence, not
invented rows.

Included rows are exactly
`[stockId,symbol,canonicalSector,method,multiple,roeOrNull,sourceTimestamp,recordedAt,
sourceRef,filingRestatementId,rosterManifestHash,taxonomyAssignmentManifestHash]`,
sorted by the collapsed-selector order above. Each excluded row is
`[stockId,symbol,canonicalSectorOrUnknown,method,reason,sourceTimestampOrNull,
recordedAtOrNull,sourceRefOrNull]` in reason-enum then
method/sector/symbol/stock-ID order. `stockId` is copied from the bound roster row
and byte-matches the selected fact rows; a display symbol is never an identity or
exclusion key.
The closed reason enum in ASCII order is
`authority_conflict|ineligible_instrument|invalid_multiple|missing_positive_roe|
stale_observation|unknown_sector`. Aggregate rows are
`[canonicalSector,method,includedCount,p10,p50,p90]` in sector/method order.
Conservation is exactly seven rows, `[disposition,count]`, in this order:
`included` followed by the six ASCII-sorted reasons, including zero counts. The
included count plus all six excluded counts equals the number of collapsed
stock/method identities, and each aggregate count equals its matching included-row
count.

Manifest terminal codes are `included` for included rows, the exact reason for
excluded rows, and null for aggregate/conservation rows. Under
`manifest-storage-contract.md`, cutoff plus financial/method/roster/taxonomy
versions are the `sector_valuation_reference` header and those values populate
`included_rows`, `excluded_rows`, `aggregate_rows`, `conservation`. Its named hash
is the universal root. Enrich runs read logical kind
`sector_valuation_reference` only; they do not launch full-market per-stock
research. Candidate-specific peer selection reads included rows from this root,
removes only the row whose first member byte-equals the candidate's immutable stock
ID, then recomputes its own winsor limits and quantiles. Equal or reused symbols do
not remove another stock; a missing/mismatched candidate stock ID or a duplicate
included stock-ID/method identity is `data_integrity_failure`;
the global aggregate rows are never candidate-specific quantile authority. Public
valuation exposes the opaque
`sector-valuation-reference-v3:<manifestHash>` ref, historical/peer counts and
bounded reference quantiles from `data-contract.md`.

During the durable `input_manifest_pages` preparation stage and before `seal_inputs`, the server freezes a candidate-financial manifest. `selected_facts` rows are `[symbol,factKey,periodStartOrNull,periodEnd,durationKind,normalizedValue,normalizedUnit,authorityTier,filingPublishedAt,sourceTimestamp,collectedAt,recordedAt,sourceRef,filingRestatementIdOrNull,estimateKind,estimateHorizon,institutionIdentityOrEmpty,selectionDisposition]`. `selectionDisposition` is exactly `reported_fact` for reported rows and `eligible_verified_estimate` for non-reported rows; the latter always carries the cutoff-verified institution identity. Rows are ordered by the planner's symbol ordinal, fact-key enum, period-end descending, period-start, duration, source ref. `excluded_facts` use the same identity fields plus the closed missing/conflict reason and identical ordering. `conservation` has exactly one row per ordered candidate, `[symbol,expectedFactIdentityCount,selectedCount,excludedCount,exclusionReasonCounts]`, with every reason including zero. Under `manifest-storage-contract.md`, cutoff, ordered symbols, financial version and sector-valuation-reference hash are the `candidate_financial` header and those are the exact sections. `candidateFinancialManifestHash` is the universal root. The final logical key is unknown until this and every other required manifest completes; enrichment jobs cannot be created or leased before the seal. No Vercel request downloads arbitrary datasets. Scheduled ingestion writes through the fixed runner role in `auth-principal-contract.md`; provider and field allowlists are server-owned. A missing/corrupt manifest or hash mismatch makes valuation `missing` with `missing_financial_manifest`; it cannot fall back to profile/current-multiple data.

## Official daily reported-PE plane

`opportunity_exchange_reported_pe_v3` is a separate append-only observation plane;
it is not a `financial_fact_key_v3` and cannot be recomputed from a model multiple.
Only the official exchange owner (`twse` for TWSE, `tpex` for TPEX) may append
`[stockId,exchange,sessionDate,close,reportedPe,publishedAt,
sourceTimestamp,collectedAt,recordedAt,sourceRef]`. The append transaction resolves
the date to a completed official session for the same exchange; consumers bind the
cutoff-selected `sessionAuthorityId` from the immutable trading calendar rather than
accepting it from the caller. The append uses `collectedAt` as its authority cutoff and
requires the selected event to be `completed` with `closeAt <= collectedAt` before
either the valuation row or its audit is written; missing, cancelled, pre-close or
conflicting authority is `calendar_authority_mismatch`/the underlying integrity error
and leaves both tables unchanged. `close` is
finite positive and `reportedPe` is finite. All timestamps are database-checked in the
same order and at/before cutoff. The immutable identity includes every member through
`sourceRef`; selection first collapses an exact `(stockId,exchange,sessionDate,
sourceRef)` stream by greatest publication, source, collection and recorded
timestamp, then source ref. A differing final tie is `authority_conflict`; a
mirror/provider fallback is forbidden.

`reported_pe_reference` has two bounded selectors over the exact completed sessions
named by its header `tradingCalendarWindowHash`. For each ordered deep symbol it reads
the last 1,260 session members through `LIMIT 1261`, joins every exchange/date row to
the cutoff-selected official `sessionAuthorityId`, retains only positive terminal official reported-PE rows, and
requires 252 through 1,260 rows including the current as-of session. Own-history rows
need no shares and cannot inherit a current share count. For the same as-of session it
enumerates the full bound roster once. It resolves current reported PE first: among
cutoff-valid official rows for the roster exchange and exact `sessionDate=asOfSession`,
the latest immutable official row wins only after the bound calendar resolves that
exchange/date; a missing bound completed session is `calendar_authority_mismatch`, and
no official observation is `missing_official_pe`. It then selects exactly one official `shares_outstanding` fact
after filtering to `periodEnd <= asOfSession`, `filingPublishedAt <= sourceCutoff`,
`sourceTimestamp >= asOfSession-183 calendar days` and the normal cutoff-valid
authority rules. Across the surviving fact identities it chooses greatest `periodEnd`,
then greatest `filingPublishedAt`, greatest `sourceTimestamp`, greatest `collectedAt`,
greatest `recordedAt`, lexicographically greatest non-null `filingRestatementId`, then
ascending `sourceRef`. A different-valued tie before the final source-ref tie is
`authority_conflict`; no older or alternate period may substitute. That selected shares
fact is carried only in the sector-current native row with its period end/source/timestamp.
An observation-stream or shares selector `authority_conflict` propagates unchanged to
the unavailable current/history/sector reported-PE branch and to valuation review;
`data-contract.md` is the sole public closed-union owner. It may never be relabeled as
missing data, abort unrelated candidate rows or silently substitute an older fact.
The compact fact plane therefore retains one typed conflict terminal for the affected
stock/session with null valuation values; the runtime cannot select its source-ref/UUID
as a winner.
It computes market cap as `close*sharesOutstanding`, then Type-7 sector P25/P50/P75
and `sum(reportedPe*marketCap)/sum(marketCap)` only when at least eight same-sector
rows qualify. The three ordered sections, cursor and row bounds are owned by
`manifest-storage-contract.md`; a selector never scans an older sparse prefix or
substitutes a model PE. The public reported-PE comparison is display lineage only; its
missing/review state cannot supply a formal target price.

## V3.11 operating bridge

The closed additional reported fact keys are
`quarterly_operating_expense|quarterly_non_operating_income|quarterly_pretax_income|
quarterly_income_tax_expense|quarterly_noncontrolling_interest|
quarterly_net_income_attributable_to_common|diluted_weighted_average_shares|
cash_and_equivalents|total_debt|total_equity|invested_capital|net_asset_value|
operating_cash_flow|capital_expenditure|total_assets|interest_expense|
shares_outstanding`.
They use the same immutable identity, provider authority, cutoff, unit normalization,
restatement collapse and conflict rules as the original fact keys. Monetary flow facts
are quarterly/TTM TWD, balance facts are instant TWD, weighted shares and shares
outstanding are shares, and NAV is instant TWD. A lower-tier mirror never overrides
an official fact.

For each selected quarter, the complete bridge is:

```text
revenue
  -> grossProfit
  -> operatingIncome = grossProfit - operatingExpense
  -> pretaxIncome = operatingIncome + nonOperatingIncome
  -> netIncomeAttributableToCommon =
       pretaxIncome - incomeTaxExpense - noncontrollingInterest
  -> dilutedEPS =
       netIncomeAttributableToCommon / dilutedWeightedAverageShares
```

Every arrow requires the named selected facts; an implementation may not infer a
missing term from a margin, company profile or current EPS. TTM flows sum exactly four
consecutive quarters. TTM weighted shares use the four reported quarterly weighted
share denominators weighted by each quarter's day count. Net debt is recomputed as
`totalDebt-cashAndEquivalents`; an available reported `net_debt` is a cross-check and
a difference above tolerance is `capital_structure_conflict`.

For a paired instant fact used by quality, `latest` is the greatest selected instant
`periodEnd` at or before cutoff and `four_quarters_earlier` is the selected fact whose
`periodEnd` is exactly four reported fiscal-quarter ordinals before `latest`; a missing
or non-comparable fiscal-quarter predecessor is `insufficient_history`, never an
older-date approximation. The loader returns no third instant row for either paired
key. For each monetary identity the absolute tolerance is
`max(1 TWD,abs(revenue)*1e-8)`. EPS recomputation must be within
`max(0.01 TWD/share,abs(reportedEPS)*1e-4)`. Shares must be finite and positive.
Effective tax rate is calculated only when pretax income is positive; it must lie
`-0.20..0.60`, otherwise `tax_rate_outlier`. Cash/debt may not be negative. ROIC is
`TTM operatingIncome*(1-clamp(effectiveTaxRate,0,0.35))/averageInvestedCapital`,
where both opening and closing official invested-capital facts are required and their
average is positive. Missing data produces a named review reason; it is never zero.

Closed bridge failure precedence is:

```text
missing_bridge_inputs
conflicting_point_in_time_fact
invalid_unit
nonconsecutive_quarters
operating_bridge_mismatch
pretax_bridge_mismatch
net_income_bridge_mismatch
share_count_conflict
reported_eps_mismatch
tax_rate_outlier
capital_structure_conflict
non_finite_bridge
```

Any match makes valuation status `outlier_review`, adds the exact bridge reason, sets
all scenario targets/confidence null and forces downstream
`newPositionAction='valuation_review'`; every buy-like action is unavailable. When the
bridge fails before a valuation method can be selected, `method` is null. When a
method was already selected, it is retained for diagnosis. These are the only two
`outlier_review` method-nullability branches and they are mirrored by
`valuation-contract.md` and `data-contract.md`.

### 2337 golden case

The RED fixture's only inputs are revenue `56,390,000,000 TWD`, operating margin
`10 percentage_points` and diluted weighted shares `1,969,000,000 shares`. It lacks
gross profit, operating expense, non-operating income, pretax income, tax,
noncontrolling interest and attributable net income. The sole valid result is
`missing_bridge_inputs`, computed EPS null and targets null. Multiplying an old EPS by
revenue/margin factors to produce `30.04` is explicitly rejected.

The complete fixture is one exact rule-expanded persisted fact set, not a loose list.
Its cutoff is `2026-04-30T06:00:00Z`; stock ID is
`00000000-0000-4000-8000-000000002337`, symbol is `2337`, instrument-authority ID is
`00000000-0000-4000-8001-000000002337`, and sector-assignment-authority ID is
`00000000-0000-4000-8002-000000002337`. The cutoff-valid official assignment is
`[stockId,"TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z",
"2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active"]`, with database
`recordedAt=2026-04-29T04:10:00Z`.

Every fact below uses the exact `financial_fact_input_v3` order followed by the
fixture's expected database `recordedAt`:

```text
[stockId,factKey,periodStartOrNull,periodEnd,durationKind,value,unit,
 provider,authorityTier,estimateKind,estimateHorizon,filingPublishedAt,
 sourceTimestamp,collectedAt,filingRestatementIdOrNull,sourceRef,recordedAt]
```

The database-generated `factId` is a unique fixture UUID but does not enter selection,
valuation, identity hashes or any expected result and is deliberately absent from the
caller input tuple above.

Every row is `mops,official_filing,reported,reported_period`, has null
`filingRestatementId`, and uses
`sourceRef="mops-2337:"+periodEnd+":"+factKey`. The exact twelve period/time rows are:

```text
periodStart  periodEnd   filingPublishedAt/sourceTimestamp  collectedAt           recordedAt
2023-04-01   2023-06-30  2023-07-29T06:00:00Z              2023-07-29T07:00:00Z  2023-07-29T08:00:00Z
2023-07-01   2023-09-30  2023-10-29T06:00:00Z              2023-10-29T07:00:00Z  2023-10-29T08:00:00Z
2023-10-01   2023-12-31  2024-01-29T06:00:00Z              2024-01-29T07:00:00Z  2024-01-29T08:00:00Z
2024-01-01   2024-03-31  2024-04-29T06:00:00Z              2024-04-29T07:00:00Z  2024-04-29T08:00:00Z
2024-04-01   2024-06-30  2024-07-29T06:00:00Z              2024-07-29T07:00:00Z  2024-07-29T08:00:00Z
2024-07-01   2024-09-30  2024-10-29T06:00:00Z              2024-10-29T07:00:00Z  2024-10-29T08:00:00Z
2024-10-01   2024-12-31  2025-01-29T06:00:00Z              2025-01-29T07:00:00Z  2025-01-29T08:00:00Z
2025-01-01   2025-03-31  2025-04-29T06:00:00Z              2025-04-29T07:00:00Z  2025-04-29T08:00:00Z
2025-04-01   2025-06-30  2025-07-29T06:00:00Z              2025-07-29T07:00:00Z  2025-07-29T08:00:00Z
2025-07-01   2025-09-30  2025-10-29T06:00:00Z              2025-10-29T07:00:00Z  2025-10-29T08:00:00Z
2025-10-01   2025-12-31  2026-01-29T06:00:00Z              2026-01-29T07:00:00Z  2026-01-29T08:00:00Z
2026-01-01   2026-03-31  2026-04-29T06:00:00Z              2026-04-29T07:00:00Z  2026-04-29T08:00:00Z
```

For every one of those twelve rows, expand all of these `quarterly` fact/value/unit
members; there is no partial historical bridge:

```text
quarterly_revenue                           56,390,000,000 TWD
quarterly_gross_profit                      11,278,000,000 TWD
quarterly_operating_expense                  5,639,000,000 TWD
quarterly_operating_income                   5,639,000,000 TWD
quarterly_non_operating_income              -1,000,000,000 TWD
quarterly_pretax_income                      4,639,000,000 TWD
quarterly_income_tax_expense                 2,000,000,000 TWD
quarterly_noncontrolling_interest              866,900,000 TWD
quarterly_net_income_attributable_to_common  1,772,100,000 TWD
diluted_weighted_average_shares              1,969,000,000 share
quarterly_diluted_eps                                  0.90 TWD_per_share
quarterly_ebitda                            11,278,000,000 TWD
```

Every equation therefore balances for every selected quarter. The two additional
current scalar rows use null `periodStart`, `periodEnd=2026-03-31`,
`durationKind=instant`, the final period row's four timestamps and the same tuple
defaults:

```text
cash_and_equivalents  10,000,000,000 TWD
total_debt             5,000,000,000 TWD
```

This is a deterministic arithmetic oracle, not a substitute filing. A production
2337 valuation still requires real cutoff-valid official facts for every bridge term.
Recomputed latest-quarter EPS is exactly `0.90` after two-decimal serialization, not
`30.04`. Mutation of shares, tax, cash, debt or any bridge sign must either produce
the recomputed changed result or one of the closed failures; no hard-coded
symbol/target branch is allowed.

The formula-growth plane contains exactly sixteen `monthly_revenue` rows for
`2024-12-01..2026-03-31`, one per consecutive calendar month, each value
`10,000,000,000 TWD`, duration `monthly` and the same row defaults. Period start/end
are the first/last calendar day; filing/source time is the tenth day of the next
month at `06:00:00Z`, collection is one hour later and recording two hours later.
Source ref is `mops-2337:<periodEnd>:monthly_revenue`. Thus the latest January,
February and March 2026 rows compare with the exact January, February and March 2025
rows and each derived YoY value is zero. The March anchor source timestamp
`2026-04-10T06:00:00Z` satisfies the exact monthly freshness rule in
`valuation-contract.md`; older paired history is not misclassified as a stale current
anchor.

The multiple-reference fixtures are exact method-specific persisted facts. Historical
rows use stock ID 2337, periodStart null, duration `quarter_end`, provider `twse`,
official/reported defaults, unit `dimensionless`, and these eight period ends in
ordinal order:

```text
2024-03-31,2024-06-30,2024-09-30,2024-12-31,
2025-03-31,2025-06-30,2025-09-30,2025-12-31
```

For each ordinal `01..08`, one `pe_multiple=15` row has source ref
`hist-2337-pe-<ordinal>` and one `ev_ebitda_multiple=2.5` row has source ref
`hist-2337-ev-ebitda-<ordinal>`. Filing/source time is the period end at
`06:00:00Z`, collection one hour later and recording two hours later. The periods are
inside the five-year historical window and exclude the current 2026-03-31
observation.

The exact peer symbols/stock IDs in ordinal order are:

```text
2303/00000000-0000-4000-8000-000000002303
2344/00000000-0000-4000-8000-000000002344
2408/00000000-0000-4000-8000-000000002408
3034/00000000-0000-4000-8000-000000003034
6770/00000000-0000-4000-8000-000000006770
```

The fixture does not assume those symbols are eligible. It installs the following
exact six cutoff-visible roster RPC inputs in caller-field order
`[stockId,symbol,exchange,instrumentType,listingStatus,officialLegalName,
officialShortName,provider,sourceTimestamp,validFrom,validTo,rosterVersion]`:

```json
["00000000-0000-4000-8000-000000002303","2303","TWSE","common_stock","active","聯華電子股份有限公司","聯電","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
["00000000-0000-4000-8000-000000002337","2337","TWSE","common_stock","active","旺宏電子股份有限公司","旺宏","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
["00000000-0000-4000-8000-000000002344","2344","TWSE","common_stock","active","華邦電子股份有限公司","華邦電","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
["00000000-0000-4000-8000-000000002408","2408","TWSE","common_stock","active","南亞科技股份有限公司","南亞科","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
["00000000-0000-4000-8000-000000003034","3034","TWSE","common_stock","active","聯詠科技股份有限公司","聯詠","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
["00000000-0000-4000-8000-000000006770","6770","TWSE","common_stock","active","力晶積成電子製造股份有限公司","力積電","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-instrument-roster-v3.0"]
```

The RPC's returned `instrumentAuthorityId` replaces the stock UUID's `8000` group
with `8001`, and every returned/database `recordedAt` is
`2026-04-29T04:10:00Z`. Therefore the exact manifest row for each input is the
`instrument-roster-contract.md` tuple with that authority ID, the generated
`officialName` equal to the short name, and that recorded time. All six terminal
codes are `effective_active`. The canonical one-page manifest has header
`[["rosterVersion","tw-instrument-roster-v3.0"],["rowCount",6],
["sourceCutoff","2026-04-30T06:00:00Z"]]`, `rows` page hash
`5253f027da6f4dc23d7b4198041627cab9fa0227ba9e1c242d8995cdf810f8e5`,
and root/`rosterManifestHash`
`57ba0f3f848369e2e6123162db530568b2982a0113c3885367967714633d36f3`.

The exact six taxonomy manifest rows, already in native sort order, are:

```json
["00000000-0000-4000-8002-000000002303","00000000-0000-4000-8000-000000002303","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
["00000000-0000-4000-8002-000000002337","00000000-0000-4000-8000-000000002337","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
["00000000-0000-4000-8002-000000002344","00000000-0000-4000-8000-000000002344","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
["00000000-0000-4000-8002-000000002408","00000000-0000-4000-8000-000000002408","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
["00000000-0000-4000-8002-000000003034","00000000-0000-4000-8000-000000003034","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
["00000000-0000-4000-8002-000000006770","00000000-0000-4000-8000-000000006770","TWSE","24","semiconductor","twse","2026-04-29T04:00:00Z","2023-01-01T00:00:00Z",null,"tw-sector-taxonomy-v3.0","active","2026-04-29T04:10:00Z"]
```

All six terminal codes are `effective_active`. With taxonomy-map hash
`6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c`,
the ASCII header is `[["rowCount",6],["sourceCutoff",
"2026-04-30T06:00:00Z"],["taxonomyMapHash",
"6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c"]]`;
the one `rows` page hash is
`16adc3769c06964f0cba59c0922ba938540437dc381b549e7c3d4854b387d9df`
and root/`taxonomyAssignmentManifestHash` is
`0a51c2672d16ff4a076536c3d9350e5bd5eee29ce01229df7cbe68c463b99c7b`.

The persisted current-multiple plane also contains one 2337
`pe_multiple=15` row with ref `current-2337-pe`, one 2337
`ev_ebitda_multiple=2.5` row with ref `current-2337-ev-ebitda`, and, for every peer
ordinal `01..05`, one `pe_multiple=15` row with ref
`peer-2337-pe-<ordinal>` plus one `ev_ebitda_multiple=2.5` row with ref
`peer-2337-ev-ebitda-<ordinal>`. Each uses periodStart null,
periodEnd `2026-03-31`, duration `quarter_end`, provider `twse`,
filing/source `2026-04-29T05:00:00Z`, collection `05:10:00Z` and recording
`05:20:00Z`; every row is current under the 135-day reference rule. The
latest-per-stock/method collapse therefore selects these twelve rows and excludes
all sixteen older 2337 historical-multiple facts from the global daily reference.

PCR-013 starts before reference validation and builds the actual canonical
`sector_valuation_reference`; it does not inject an already-selected peer array.
Let `R` be the roster root above and `T` the taxonomy-assignment root above. Its
ASCII-sorted header is exactly:

```json
[["financialContractVersion","opportunity-financial-inputs-v3.3"],["methodVersion","sector-valuation-method-v3.1"],["priceProviderAllowlistHash","48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e"],["rosterManifestHash","57ba0f3f848369e2e6123162db530568b2982a0113c3885367967714633d36f3"],["sourceCutoff","2026-04-30T06:00:00Z"],["taxonomyAssignmentManifestHash","0a51c2672d16ff4a076536c3d9350e5bd5eee29ce01229df7cbe68c463b99c7b"],["taxonomyMapHash","6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c"]]
```

The exact twelve `included_rows`, in order, expand
`[stockId,symbol,"semiconductor",method,multiple,null,
"2026-04-29T05:00:00Z","2026-04-29T05:20:00Z",sourceRef,null,R,T]` with these
literal first, second, fourth, fifth and ninth members:

```text
00000000-0000-4000-8000-000000002303 2303 ev_ebitda     2.5 peer-2337-ev-ebitda-01
00000000-0000-4000-8000-000000002337 2337 ev_ebitda     2.5 current-2337-ev-ebitda
00000000-0000-4000-8000-000000002344 2344 ev_ebitda     2.5 peer-2337-ev-ebitda-02
00000000-0000-4000-8000-000000002408 2408 ev_ebitda     2.5 peer-2337-ev-ebitda-03
00000000-0000-4000-8000-000000003034 3034 ev_ebitda     2.5 peer-2337-ev-ebitda-04
00000000-0000-4000-8000-000000006770 6770 ev_ebitda     2.5 peer-2337-ev-ebitda-05
00000000-0000-4000-8000-000000002303 2303 normalized_pe 15  peer-2337-pe-01
00000000-0000-4000-8000-000000002337 2337 normalized_pe 15  current-2337-pe
00000000-0000-4000-8000-000000002344 2344 normalized_pe 15  peer-2337-pe-02
00000000-0000-4000-8000-000000002408 2408 normalized_pe 15  peer-2337-pe-03
00000000-0000-4000-8000-000000003034 3034 normalized_pe 15  peer-2337-pe-04
00000000-0000-4000-8000-000000006770 6770 normalized_pe 15  peer-2337-pe-05
```

`excluded_rows` is empty. `aggregate_rows` is exactly
`[["semiconductor","ev_ebitda",6,2.5,2.5,2.5],
["semiconductor","normalized_pe",6,15,15,15]]`. `conservation` is exactly
`[["included",12],["authority_conflict",0],["ineligible_instrument",0],
["invalid_multiple",0],["missing_positive_roe",0],["stale_observation",0],
["unknown_sector",0]]`. Using the terminal codes and paging/root preimages in
`manifest-storage-contract.md`, the page hashes are respectively
`867ce1ed37c48f6a48c80d748e5ddf9bcb84fa948f955bcdeae8de414aa24fac`,
`28efd464d4ce22432bed88a5aaddcdb38b9cc0a228aad7394d29e0cc6a4cecf1`
and `5d2af4eb2ae2e6ec856395d51d4217f7efb59726a56930d68aef5da26eac3ea6`;
the canonical root is
`5a292ad67f07bd20a518b3dc0dc23fdf904df93c038e8d1d6bdbf72ebb466908`
and public reference is
`sector-valuation-reference-v3:5a292ad67f07bd20a518b3dc0dc23fdf904df93c038e8d1d6bdbf72ebb466908`.
Acceptance recomputes every row identity, page and root; it never trusts these
literals alone. It starts with all twenty-eight persisted multiple facts, applies the
finite fact-key/method selector and latest-per-stock/method collapse, and proves
exactly twelve terminal identities. The normal peer selector must then read that
reference, exclude stock ID `00000000-0000-4000-8000-000000002337` itself and
report the exact used peer set
`2303,2344,2408,3034,6770` for both methods. The candidate's two current rows remain
display evidence only and enter neither historical nor peer valuation samples.
In a separate identity oracle, change the 2303 roster/display symbol to `2337` while
retaining stock ID `00000000-0000-4000-8000-000000002303` and rebuild all bound
manifests. Candidate exclusion still removes only the true 2337 stock ID and retains
the equal-symbol 2303 stock ID as a peer; symbol comparison or a 2337-specific branch
fails.
Revoking one roster member, changing one assignment, changing any bound root/hash
or nulling the reference must prevent a normal valuation.

The four latest quarters therefore give TTM revenue `225,560,000,000 TWD`, TTM
EBITDA `45,112,000,000 TWD`, EBITDA margin `20 percentage_points`, latest quarterly
YoY EBITDA-margin delta `0 percentage_points`, and four latest quarterly margins all
`20 percentage_points`. The normalized-PE historical manifest has exactly eight
cutoff-valid observations, each `15`; its same-sector peer manifest has exactly five,
each `15`. The EV/EBITDA historical and peer manifests use the parallel exact
method-specific rows above and each multiple is `2.5`. Within each manifest,
observations use consecutive ordinals, distinct stock/period/method identities and
the exact refs/timestamps above. Winsorization and Type-7 quantiles therefore remain
exactly `15/15/15` and `2.5/2.5/2.5`.

The expected normalized-PE Bear/Base/Bull calculation is:

```text
quarterly earnings p25/p50/p75 = 1,772,100,000 TWD
annualized normalized earnings = 7,088,400,000 TWD
normalized EPS                 = 3.60 TWD/share
primary values                 = 54.00 / 54.00 / 54.00 TWD/share
```

For the mandatory EV/EBITDA cross-check, growth spread is exactly five percentage
points and margin spread exactly one percentage point:

```text
case   revenue TWD       EBITDA margin  EBITDA TWD      EV at 2.5x TWD  equity TWD       value/share
Bear   214,282,000,000   19%            40,713,580,000  101,783,950,000  106,783,950,000  54.23257998984256
Base   225,560,000,000   20%            45,112,000,000  112,780,000,000  117,780,000,000  59.81716607414931
Bull   236,838,000,000   21%            49,735,980,000  124,339,950,000  129,339,950,000  65.68814118842052
```

The displayed cross-check values round to `54.23/59.82/65.69`. Base divergence uses
unrounded values and is
`abs(54-59.81716607414931)/54 = 0.10772529766943172`, so status is `normal`.
Removing every fact tuple whose period end is `2023-06-30` leaves eleven complete
quarters and yields `missing/insufficient_series`. Removing exactly
`hist-2337-ev-ebitda-08` and `peer-2337-ev-ebitda-05` leaves the two EV/EBITDA samples
at seven and four rows, so neither qualifies and the result is
`outlier_review/cross_check_unavailable`. Changing all thirteen valuation-sample
EV/EBITDA rows—the eight historical rows plus five peers—from `2.5` to `3.5` gives
Base
`82.72828847130523` and divergence `0.5320053420612081`, yielding
`outlier_review/method_divergence`; the candidate's separate current observation is
not a valuation-sample input and does not change that result. Industry, symbol,
dates, values, units, refs, share count, scenarios and results are all asserted—no
2337-specific implementation branch is permitted.
