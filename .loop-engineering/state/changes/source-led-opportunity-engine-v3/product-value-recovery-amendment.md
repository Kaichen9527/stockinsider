# Product Value Recovery Amendment — V3.12

## Objective

StockInsider MUST rank Taiwan equities whose material operating evidence is not yet fully reflected in price. A missing formal target-price model MUST NOT erase a candidate's research priority. Formal position actions and target prices remain fail-closed.

## Confirmed RED baseline (production, 2026-08-09 audit)

- `/api/radar/daily` exposes 30 source signals and zero opportunities; every source signal is `valuation_review`, `pending`, and technically `unavailable`.
- The tracked six-stage producer succeeds, but `read_legacy_candidate_fact_plane_v3_11` reads only `opportunity_financial_facts_v3`, `opportunity_price_observations_v3`, and `opportunity_market_observations_v3`; all three production planes contain zero rows.
- Production nevertheless contains 34,565 `stock_signals` rows for 146 stocks, 375 `fundamental_snapshots`, 45 `revenue_signals`, 18,324 `valuation_cases`, and 216 TW `market_snapshots`. The `facts_refresh` stage does not bridge them.
- Existing fundamental snapshots are not automatically authoritative. A production sample stored 2330 PE/PB as 114/30.32 while the TWSE 2026-08-07 endpoint reports 31.86/10.43. Legacy values therefore require source classification and sanity validation before use.
- The market card emits a risk-on budget while TAIEX, OTC, breadth, and foreign-flow component states are null.
- Entity extraction scans an entire document and shows its first 180 characters rather than the matched passage; cards can therefore display a different company's headline.

## Product contract

### PV-001 — Research priority is separate from trade authority

Every linked candidate with at least two trustworthy axes MUST receive an `underreactionScore` from 0–100, `coverage` from 0–1, `confidence` from 0–1, a research disposition (`research_now`, `watch_reclaim`, `watch_evidence`, `avoid`), positive reasons, risk reasons, and explicit missing axes. Missing valuation removes valuation weight and lowers coverage; it does not force the research score to null. A target price and buy-like `newPositionAction` remain unavailable until the formal valuation and technical gates pass.

### PV-002 — Price-dislocation lane

The daily producer MUST scan its bounded point-in-time Taiwan universe for price dislocation, including drawdown from 20/60/120-session highs, BIAS20/60/120, RSI, volume, and relative strength when available. A stock with a large drawdown and non-deteriorating official/reliable fundamentals can enter the ranked research lane even without a new social mention. It MUST state whether a reclaim is required.

### PV-003 — Valuation comparison

Exchange-reported current PE/PB/dividend yield is preferred. Historical own PE and sector reference are displayed only when their observations have an exact source and as-of date and pass sanity checks. Invalid, swapped, stale, seed, or zero-placeholder metrics are rejected with a typed reason. The research score may be reweighted; the formal valuation may not.

### PV-004 — Local source evidence

Each source-led card MUST carry a bounded local matched snippet and match basis. The first 180 characters of an unrelated document MUST NOT be used as the stock's evidence summary. Ambiguous common-name matches without local stock context are rejected.

### PV-005 — Market analysis

The home page MUST show the TAIEX state, drawdown/trend, breadth, institutional flow, and data completeness. It MUST NOT publish an attack/risk budget when required components are absent or stale. Missing components produce a neutral, explicit data-quality state.

### PV-006 — Compact actionable research UI

The first stock surface MUST contain a ranked “目前最值得研究” lane, not only a source inbox. Each card shows score, coverage/confidence, current price and dislocation, BIAS, fundamental change, valuation comparison, technical trigger, reasons, risks, and missing evidence. The source inbox remains available as a secondary lane.

## Acceptance gates

1. A fixture with missing formal valuation but trustworthy discovery, technical, and fundamental evidence receives a finite research score and never receives a fabricated target price.
2. A 20%+ drawdown with stable/growing fundamentals ranks ahead of an equally sourced extended stock; below-support candidates say `watch_reclaim` and have no fake pullback entry.
3. A candidate with fewer than two trustworthy axes is `watch_evidence`, not a buy recommendation.
4. Official 2330 PE/PB parses as 31.86/10.43 for the captured TWSE fixture; swapped 114/30.32 input is rejected.
5. The matched snippet contains the candidate name/symbol and never uses an unrelated leading paragraph.
6. Incomplete market components suppress the risk budget; complete fixtures expose component-level explanations.
7. Production-shaped 30-card Unicode payload remains at or below 150 KB and warm/cold performance gates remain green.
8. Production verification must show at least one finite research score, non-zero rankable cards when trustworthy axes exist, no false target prices, and an evidence-backed market state. If production inputs cannot satisfy two trustworthy axes, deployment is not claimed to meet the product objective.

## Rollout boundary

- V3 public mutation remains disabled until its existing migration/shadow authority is granted.
- This amendment may update the tracked legacy producer, additive compact projection fields, read-only data bridges, and Web presentation.
- Backfills or refreshes may write only through reviewed, idempotent producer paths with exact provenance. No synthetic market or cohort data is permitted.
