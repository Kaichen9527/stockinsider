# Forecast evidence source candidate

This is a pure, disconnected diagnostic contract. `forecast-evidence.ts` performs no acquisition, database lookup, financial validation, provider dispatch or publication. A structurally accepted descriptor is **not** a verified receipt or an admission authority. No existing resolver, guard, SQL profile, grant, model binding or scheduler changes here. Source tests are synthetic; execution results must be recorded separately.

## Finite meanings

| Kind | Diagnostic key | Required source period |
| --- | --- | --- |
| Annual forecast | `annual_forecast_eps` | Explicit fiscal year and fiscal calendar, labelled forecast |
| Next four quarters | `next_four_quarter_eps` | Four explicit, consecutive fiscal quarters starting with the next wholly future fiscal quarter |
| NTM | `ntm_eps` | Explicit rolling twelve-calendar-month period anchored to the original publication's Taipei date |
| Twelve-month target | `target_price_12m` | Explicit original-publication-anchored target horizon, `TWD_per_share` price; no valuation method inferred |

Fiscal year labels in this candidate identify the year containing the fiscal year's first month. A future reader must map the publisher's actual year-label convention explicitly, not silently reinterpret it. A partial current-quarter vector is outside v1. Rolling periods end the day before the clamped one-year anniversary; this is a versioned diagnostic domain, not a claim that every publisher uses that convention. A source with different semantics stays unsupported.

Annual forecast never populates reported `annualEps`; the diagnostic result always has `reportedAnnualEps: null`. NTM never populates next-four-quarter EPS. No reported quarterly EPS is summed to invent annual reported EPS. All entries require the original `TWD_per_share` unit, including broker target prices; `TWD` is rejected without conversion. Four-quarter forecast addition requires one explicitly disclosed constant denominator, the same basic/diluted basis and common-shareholder numerator throughout the vector. Changing dilution, unknown denominators, unit conversion, inferred fiscal calendars and rounding are unsupported. Original values may be negative or zero; target prices must be positive. No default multiples, scenarios, scores or probabilities are produced.

The source contract binds issuer/stock, document/revision/content hash, publisher/institution verification, manifest identity/root hash, exact numeric field paths and parsed-row hashes, original periods/values/units, fiscal calendar and disclosed share basis. Rights require a structured-numeric-use receipt bound to that publisher and revision, a finite validity interval and no withdrawal. This v1 diagnostic accepts at most32 descriptors and four fields per descriptor, uses a90-day original publication-age bound, and suppresses conflicting same-key/period values or share bases. Later verification/receipt clocks cannot refresh source age. Descriptors are copied before returning; there is no raw source body, credential or model output in the contract. URL shape checks do not establish source approval or rights.

## Actual authority gap

The original `opportunity_financial_facts_v3` schema admits analyst estimates only with `next_twelve_months`, and broker targets with `target_12m`; it does not provide an explicit four-quarter source vector, annual forecast contract, fiscal-year-label mapping or forecast share-basis receipt. Existing `read_financial_facts_for_stocks_as_of` exposes classification, but official financial validation covers reported facts. `financial-evidence-sources.ts` therefore rejects nonreported rows correctly. Broker snapshot `forward_eps`/`forward_year`, publisher verification booleans and manifest labels cannot fill these gaps.

The original manifest normalizer and revision/publisher reader provide useful source identity lineage. They do not independently establish licensed numeric extraction, exact share basis or current forecast rights. The private manifest normalizer has no existing vNext execution grant in the captured source profile. This candidate creates no new permission and does not claim current database metadata was observed.

## Required integration before any financial use

1. A reviewed, server-owned reader must fetch the actual original fact/version or explicit forecast field receipt, exact issuer/document/revision/hash, manifest rows/root and current publisher/source authority. It must verify actual field values and parsed-row hashes against immutable originals, approved numeric-use rights and per-content withdrawal. A caller descriptor, arbitrary HTTPS host or `approved: true` is insufficient. A source providing only NTM must remain NTM; missing annual/four-quarter details stay named gaps.
2. Freeze those server-derived descriptors after existing admission and expensive-work reservation, before immutable preparation. Explicit cached preparation recovery must use the same projection without acquisition, parser execution, model invocation, new attempt or renewed deadline. Exact source correction creates new lineage; a later fetch clock alone does not.
3. Add a finite database-current checker used by provider reservation and `vnext_input_sources_current_v1`, so preparation, qualification, author/review completion, publish/replay and current public eligibility all retain issuer/revision/manifest/rights/withdrawal checks. Historical rows remain immutable. The pure diagnostic output must never be accepted as that checker or copied directly into `Evidence`.
4. Review the exact finite read/execute privilege delta separately; no broad internal manifest API grant, new role or existing ACL/profile weakening is authorized by this contract. Keep the existing single4/day, active20, global external4, independent review, source50/day and total200/day authorities unchanged.

Subsequent integration tests must use actual guarded SQL and immutable source receipts to exercise current rights/withdrawal, corrected revisions, manifest identity and concurrent publication. Pure synthetic positives here establish structural arithmetic only. Current licensed forecast acquisition, real numeric extraction, database authority, formal semantic review and full worker/publication integration remain **NOT_RUN / NOT_IMPLEMENTED** for this candidate.


## Source-only execution receipt

Final source02 has12synthetic structural PASS, full TS5.9.3 noEmit/incrementalfalse PASS, focused two-file lint PASS, run sequentially on Node22.14 with original8GiB floors. Typecheck sampled own-session peak1,334,751,232bytes is not an instantaneous maximum. Initial3file draft is retained; root review corrected target-price units to original `TWD_per_share`, with explicit `TWD` rejection. Final3file inventory SHA `d3f24821a8bcd6ddd8b7cb37ba85c2ae88c424f3bbfca53554d88dd99e4da852` refers to the sealed pre-receipt doc; adding this execution section changes only documentation. No actual DB, licensed source, model, preparation/provider consumer or current authority was executed for this disconnected prerequisite. It does not close VN08 or replace the subsequent integrated producer/checker work.
