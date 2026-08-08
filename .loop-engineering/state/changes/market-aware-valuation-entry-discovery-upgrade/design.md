# Design: market-aware-valuation-entry-discovery-upgrade

## Approach

Build on the existing StockInsider read models instead of replacing them:

- `MarketIndexSignal` already exists and is passed into radar/deep-dive trade decisions.
- `TradeDecision` already summarizes current buy/exit behavior.
- `ScenarioPromotionGate` already checks whether scenario can become Base.
- `RevaluationJobSummary` already exposes SLA and missing evidence.
- Discovery metadata already includes hot movers, social broker leaks, global lead-lag, and pool freshness.

This change tightens the connections between those systems and makes the output more decisive.

## Market-Aware Valuation

Add a derived market valuation adjustment object to target snapshots and cards:

- `marketReratingStatus`: `supports_multiple_expansion | neutral | compressing | missing`.
- `marketReratingReason`: short user-facing explanation.
- `targetPeAdjustmentHint`: human-readable note, not an automatic target raise.
- `repricingTriggerStrength`: score or label derived from scenario progress, broker evidence, market regime, sector leadership, and global lead-lag.

The object never directly changes Base/scenario target. It only:

- raises revaluation priority,
- explains why old targets may be too low,
- allows scenario promotion gate to show stronger `price-led but supported by market` vs `price-led fundamentals pending`.

## Scenario Promotion v2

Extend `buildScenarioPromotionGate()`:

- Keep the existing hard requirements: checklist score, external evidence, Forward EPS/target PE support, valuation sanity.
- Add soft accelerants:
  - market regime supports multiple expansion,
  - sector/theme leadership is active,
  - global lead-lag indicates overseas peers rerating,
  - broker search has verified target/EPS uplift.
- If hard requirements fail but soft accelerants are strong, status remains not promoted but summary becomes:
  - `price_led_market_rerating_pending_evidence`
  - and `requiredEvidence` points to broker/EPS/monthly revenue/peer multiple evidence.

## Entry/Exit Decision v3

Extend `buildTradeDecision()` and `buildEntryDecisionFromAssessment()`:

- Convert constructive but warm situations into an actionable plan:
  - if scenario upside remains and market gate is not risk-off, show `突破追蹤買進` or `等回測買點` with a real trigger.
  - if risk-on and technical/chip score is high enough, allow `建議買進` / `可分批買進` with 3%-10% initial size.
- Preserve hard blocks:
  - above scenario target => no new buy; use stop/trim/hot-tracking.
  - market breakdown => no chase, reduce or wait.
  - severe overheat + poor chip => no buy.
- Add `whyBuyNow`, `whyWait`, and `whyExitNow` fields for homepage/deep-dive copy.

## Radar Payload Fix

The production baseline showed that market-aware trade decisions are built in domain code but stripped by the compact radar API.

Add `compactTradeDecision()` in `web/src/app/api/radar/daily/route.ts`:

- Include compact `tradeDecision` on each radar card.
- Include only egress-safe fields:
  - `action`,
  - `positionSize`,
  - `entryZone`,
  - `addCondition`,
  - `stopLoss`,
  - `takeProfit`,
  - `exitCondition`,
  - `marketGateReason`,
  - `confidence`,
  - compact `entryTriggers` / `exitTriggers`.
- Optionally include a compact per-card `marketIndexSignal` subset when it differs from the global radar market signal or when the UI needs a card-level risk budget.
- Do not include long reasons arrays or raw source text on homepage cards.

This is the first implementation priority because it fixes the observed `audit:market-index-gate` failure without changing formal recommendation safety.

## Homepage Market Analysis

Reuse `marketHighlightSummary` and `marketIndexSignal` but make the homepage section decision-oriented:

- market regime label,
- TAIEX/OTC state,
- breadth/foreign flow if available,
- allowed position budget,
- which stock buckets can be acted on now.

## Broker And Discovery Evidence

Do not add a new table in this change. Reuse:

- `broker_report_documents`,
- `broker_consensus_snapshots`,
- `broker_search_attempts`,
- `source_raw_documents`,
- `story_candidates`,
- `revaluation_jobs`.

Improve derived summaries:

- candidate cards explain broker search status and whether it is verified or only a social leak.
- revaluation candidates show next source search plan.
- discovery freshness mentions hot movers and broker/source hits.

## Verification

Add/extend audits:

- `audit:market-aware-valuation`
- `audit:entry-decision-v3-actionability`
- `audit:scenario-promotion-market-rerating`
- `audit:broker-repricing-evidence`
- Keep existing regression gates.

The first implementation can be read-model only. Durable job execution changes should be separated if they require Supabase migration or schedule changes.
