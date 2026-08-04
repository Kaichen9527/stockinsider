# Evidence: market-aware-valuation-entry-discovery-upgrade

## Current Code Observations

- `MarketIndexSignal` already exists in `web/src/lib/types.ts` and is built by `buildMarketIndexSignal()` in `web/src/lib/domain.ts`.
- Radar already attaches market-aware decisions through `applyMarketAwareDecisionToCard()`.
- Deep-dive already builds `tradeDecision` with market gate context.
- Scenario promotion exists through `buildScenarioPromotionGate()`, but current output still tends to say price-led/fundamentals pending instead of explaining market rerating pressure.
- Revaluation SLA fields exist through `RevaluationJobSummary`, but user feedback shows visible `等待重估` still feels static.
- Entry decisions can output `建議小量買進` and `可分批買進`, but thresholds and copy still feel too conservative when scenario upside remains.

## Baseline Audit Run: 2026-06-28

Base URL: `https://stockinsider-three.vercel.app`

- `audit:market-index-gate`: failed.
  - Report: `.agent/reports/market-index-gate-audit-2026-06-28T04-01-37-318Z.json`
  - Finding: visible sampled symbols were missing `tradeDecision`, e.g. `2382`, `3711`, `2337`, `2356`, `2408`, `3008`, `3231`.
  - Interpretation: user feedback that broad-market analysis is not consistently driving per-stock buy/sell decisions is supported by current production evidence.
- `audit:entry-buy-actionability-v2`: passed.
  - Report: `.agent/reports/entry-buy-actionability-v2-audit-2026-06-28T04-02-50-229Z.json`
  - Interpretation: the existing v2 audit is not strict enough to catch the user's UX concern; v3 must check surfaced action text and market-aware decisions.
- `audit:scenario-actionability`: passed.
  - Report: `.agent/reports/scenario-actionability-audit-2026-06-28T04-02-04-831Z.json`
  - Interpretation: scenario candidates have some actionable logic, but it does not prove homepage/deep-dive copy answers "when can I buy?"
- `audit:revaluation-sla-v2`: passed.
  - Report: `.agent/reports/revaluation-sla-v2-audit-2026-06-28T04-03-24-410Z.json`
  - Interpretation: SLA fields exist, but v3 should verify the user-visible copy does not collapse to generic `等待重估`.
- `audit:broker-evidence-radar-v2`: passed.
  - Report: `.agent/reports/broker-evidence-radar-v2-audit-2026-06-28T04-03-24-315Z.json`
  - Interpretation: broker radar status exists, but v3 needs to ensure broker evidence drives repricing priority and distinguishes verified consensus from social broker leaks.
- `audit:recommendation-pool-freshness`: passed.
  - Report: `.agent/reports/recommendation-pool-freshness-audit-2026-06-28T04-03-24-118Z.json`
  - Interpretation: pool freshness exists, but v3 should connect this proof to under-followed discovery and missed hot stocks.
- `audit:market-aware-entry-v3`: failed as expected after adding RED scaffold.
  - Report: `.agent/reports/market-aware-entry-v3-audit-2026-06-28T04-13-29-344Z.json`
  - Finding: visible cards are missing compact `tradeDecision`.
  - Interpretation: the new v3 audit captures the exact user-facing gap and should turn green after the compact radar payload fix.

## Root Cause: Radar Compact Payload Drops Trade Decisions

Production API sample on 2026-06-28:

- Cards had `marketGateStatus=risk_on_can_attack`.
- Cards had `entryDecision` in most buckets.
- Cards did not have `tradeDecision`.
- Cards did not have per-card `marketIndexSignal`.
- Because the homepage falls back to `entryActionLabel` when `tradeDecision` is missing, visible cards can show `不買` / `等回測` without `positionSize`, `entryZone`, `marketGateReason`, or `exitCondition`.

Relevant files:

- `web/src/lib/domain.ts`
  - `applyMarketAwareDecisionToCard()` builds `tradeDecision` and `marketIndexSignal` for cards.
  - `buildTradeDecision()` contains market-aware sizing and exit logic.
- `web/src/app/api/radar/daily/route.ts`
  - `compactRecommendationCard()` currently includes `entryDecision`, `entryActionLabel`, and `marketGateStatus`.
  - It does not compact or return `tradeDecision`.

Implication:

- The data model already has a market-aware trade decision, but the public radar payload strips it.
- First implementation task should add a compact `tradeDecision` to `/api/radar/daily` cards and update the audit to verify action plus position size.
- To stay egress-safe, return only compact fields: `action`, `positionSize`, `entryZone`, `addCondition`, `stopLoss`, `takeProfit`, `exitCondition`, `marketGateReason`, `confidence`, and the first few entry/exit triggers.

## Available Existing Audits

- `audit:recommendation-gates`
- `audit:valuation-sanity`
- `audit:revaluation-loop`
- `audit:revaluation-job-execution`
- `audit:revaluation-job-sla`
- `audit:scenario-actionability`
- `audit:scenario-candidate-display`
- `audit:entry-buy-actionability-v2`
- `audit:broker-evidence-radar-v2`
- `audit:global-theme-lead-lag`
- `audit:market-index-gate`
- `audit:missed-hot-symbols`
- `audit:recommendation-pool-freshness`

## Implementation Hypothesis

The first implementation should be read-model first:

1. Add market valuation adjustment fields to existing target snapshots/cards.
2. Make scenario-promotion summaries market-aware without auto-raising targets.
3. Make trade-decision copy v3 more decisive for scenario-upside names.
4. Add audits that fail when all visible names are conservative without hard reasons.

Durable schedule/job changes should be a separate migration/scheduler change if required.

## Gate Update: 2026-06-28

- User response: `APPROVE REQUIREMENTS`.
- Additional instruction: continue without waiting for more commands until the goal is achieved.
- Loop state updated from `requirements_gate` to `implementation`.
- Design is treated as approved for this change because the design was already drafted, matches the approved requirements, and the user explicitly asked for autonomous continuation.
- Release/deployment is still excluded by policy and non-goals unless separately requested.
- Repository note: `.specify/memory/constitution.md` is referenced by Loop instructions but is not present in this repo; active change artifacts, policy, and project guide were read and used as the operative Loop source of truth.

## Implementation Evidence: 2026-06-28 Local

Local base URL: `http://127.0.0.1:3012`

Code changes:

- `/api/radar/daily` compact cards now include egress-safe `tradeDecision`.
- `/api/radar/daily` compact cards now include compact card-level `marketIndexSignal`.
- Radar cards and deep-dive target snapshots now include `marketValuationAdjustment`.
- `ScenarioPromotionStatus` now distinguishes `price_led_market_rerating_pending_evidence`.
- `buildTradeDecision()` now converts constructive risk-on scenario/base setups from generic conservative labels into `突破追蹤買進` or `等回測買點` when no hard data/chip/market block exists.
- Source health auth-degraded messaging now includes cookie/session diagnostics without exposing cookie values.

Build checks:

- `cd web && npm run lint`: pass with existing warnings in `research-v2.ts`.
- `cd web && npm run build`: pass.

Targeted audits:

- `audit:market-index-gate -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-index-gate-audit-2026-06-28T07-04-14-514Z.json`
- `audit:market-aware-entry-v3 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-aware-entry-v3-audit-2026-06-28T07-04-14-492Z.json`
- `audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/entry-buy-actionability-v2-audit-2026-06-28T07-05-14-839Z.json`
- `audit:scenario-actionability -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/scenario-actionability-audit-2026-06-28T07-04-33-221Z.json`
- `audit:revaluation-sla-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/revaluation-sla-v2-audit-2026-06-28T07-05-49-776Z.json`
- `audit:broker-evidence-radar-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/broker-evidence-radar-v2-audit-2026-06-28T07-05-50-291Z.json`
- `audit:recommendation-pool-freshness -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-pool-freshness-audit-2026-06-28T07-05-50-780Z.json`
- `audit:recommendation-gates -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-gates-audit-2026-06-28T07-05-49-653Z.json`
- `audit:valuation-sanity -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/valuation-sanity-audit-2026-06-28T07-08-22-311Z.json`
- `audit:revaluation-loop -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/revaluation-loop-audit-2026-06-28T07-07-00-980Z.json`
- `audit:radar-live-availability -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/radar-live-availability-audit-2026-06-28T07-06-38-811Z.json`
- `audit:source-health -- --base-url http://127.0.0.1:3012`: pass after auth/cookie reason normalization.
  - Report: `.agent/reports/source-health-audit-2026-06-28T07-12-11-193Z.json`

Runtime sample after implementation:

- Visible card action distribution included `突破追蹤買進` for 8 cards, `等回測買點` for 1 card, `不買` for 3 hard-risk cards, and `停利` for 12 reflected cards.
- Sample scenario/early cards now include position sizing such as `先 3%–5% 小量追蹤，回測守住再加到 10%`.
- Sample cards include `marketValuationAdjustment.marketReratingStatus` and `repricingTriggerStrength` to explain whether market rerating supports a revaluation review.

Remaining work:

- Homepage market-analysis copy should still be reviewed visually to ensure the risk budget is sufficiently prominent.
- Deep-dive first screen may need a UI polish pass to prioritize `tradeDecision` and `marketValuationAdjustment` without too much text.
- Full Playwright smoke was not yet rerun in this implementation slice.

## UI And Full Smoke Evidence: 2026-06-28 Local

Additional UI changes:

- Homepage stock cards now show a compact market rerating chip (`市場支持重估`, `重估線索累積`, or risk-off equivalents) when available.
- Deep-dive first screen now shows `marketValuationAdjustment` inside the valuation safety area and investment advice block, including repricing trigger strength and required evidence.
- Source health summary now provides cookie/session diagnostics for Threads auth degradation without exposing cookie values.

Additional checks after UI changes:

- `cd web && npm run lint`: pass with existing warnings in `research-v2.ts`.
- `cd web && npm run build`: pass.
- `audit:market-index-gate -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-index-gate-audit-2026-06-28T07-15-54-894Z.json`
- `audit:market-aware-entry-v3 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-aware-entry-v3-audit-2026-06-28T07-15-54-322Z.json`
- `audit:source-health -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/source-health-audit-2026-06-28T07-15-54-798Z.json`
- `audit:recommendation-gates -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-gates-audit-2026-06-28T07-15-54-823Z.json`
- Playwright smoke:
  - Command: `cd web && PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3012 npm exec playwright test e2e/investor.spec.ts e2e/deep-dive-story.spec.ts e2e/radar-layering.spec.ts --reporter=line`
  - Result: 5 passed in 2.1m.

Implementation status:

- All listed implementation tasks in `tasks.md` are complete.
- Change is ready for full Loop verification, but not release/deploy.

## Full Verification Evidence: 2026-06-28 Local

Local base URL: `http://127.0.0.1:3012`

Build checks:

- `cd web && npm run lint`: pass with existing warnings in `research-v2.ts`.
- `cd web && npm run build`: pass.

Loop verification audits:

- `audit:market-index-gate -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-index-gate-audit-2026-06-28T07-23-19-482Z.json`
- `audit:market-aware-entry-v3 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-aware-entry-v3-audit-2026-06-28T07-23-29-870Z.json`
- `audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/entry-buy-actionability-v2-audit-2026-06-28T07-24-19-127Z.json`
- `audit:scenario-actionability -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/scenario-actionability-audit-2026-06-28T07-24-44-833Z.json`
- `audit:revaluation-sla-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/revaluation-sla-v2-audit-2026-06-28T07-24-54-694Z.json`
- `audit:broker-evidence-radar-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/broker-evidence-radar-v2-audit-2026-06-28T07-25-04-637Z.json`
- `audit:recommendation-pool-freshness -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-pool-freshness-audit-2026-06-28T07-25-14-066Z.json`
- `audit:recommendation-gates -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-gates-audit-2026-06-28T07-25-24-697Z.json`
- `audit:valuation-sanity -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/valuation-sanity-audit-2026-06-28T07-26-27-093Z.json`
- `audit:revaluation-loop -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/revaluation-loop-audit-2026-06-28T07-26-55-704Z.json`
- `audit:radar-live-availability -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/radar-live-availability-audit-2026-06-28T07-27-07-869Z.json`
- `audit:source-health -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/source-health-audit-2026-06-28T07-27-25-859Z.json`
- `audit:global-theme-lead-lag -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/global-theme-lead-lag-audit-2026-06-28T07-27-41-919Z.json`
- `audit:price-target-revaluation -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/price-target-revaluation-audit-2026-06-28T07-27-56-116Z.json`

Playwright smoke:

- Command: `cd web && PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3012 npm exec playwright test e2e/investor.spec.ts e2e/deep-dive-story.spec.ts e2e/radar-layering.spec.ts --reporter=line`
- Result: 5 passed in 1.3m.

Verification result:

- `PASS`.
- Change is ready for release evaluation.
- No merge or deploy was performed.

## Verification Refresh After Copy Guard Fix: 2026-06-28 Local

Reason:

- Final sanity check found that some generated entry-plan text could still contain missing-price placeholders such as `站回 -`.
- `buildTradeDecision()` and lower-level add-condition generation were updated to emit `站回關鍵均線或帶量突破前高` when resistance is unavailable.

Sanity check:

- `/api/radar/daily` scenario + early cards: `badCount=0` for `站回 -`, `突破 -`, and `NT$-`.

Build checks:

- `cd web && npm run lint`: pass with existing warnings in `research-v2.ts`.
- `cd web && npm run build`: pass.

Refreshed audits:

- `audit:market-index-gate -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-index-gate-audit-2026-06-28T07-34-35-597Z.json`
- `audit:market-aware-entry-v3 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/market-aware-entry-v3-audit-2026-06-28T07-34-45-423Z.json`
- `audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/entry-buy-actionability-v2-audit-2026-06-28T07-35-44-024Z.json`
- `audit:scenario-actionability -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/scenario-actionability-audit-2026-06-28T07-36-17-398Z.json`
- `audit:recommendation-gates -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/recommendation-gates-audit-2026-06-28T07-36-33-581Z.json`
- `audit:valuation-sanity -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/valuation-sanity-audit-2026-06-28T07-37-57-623Z.json`
- `audit:revaluation-loop -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/revaluation-loop-audit-2026-06-28T07-38-29-805Z.json`
- `audit:price-target-revaluation -- --base-url http://127.0.0.1:3012`: pass.
  - Report: `.agent/reports/price-target-revaluation-audit-2026-06-28T07-38-42-534Z.json`

Playwright smoke:

- Command: `cd web && PLAYWRIGHT_SKIP_WEBSERVER=1 E2E_BASE_URL=http://127.0.0.1:3012 npm exec playwright test e2e/investor.spec.ts e2e/deep-dive-story.spec.ts e2e/radar-layering.spec.ts --reporter=line`
- Result: 5 passed in 2.0m.

Verification result remains:

- `PASS`.
- Release evaluation remains recommended.
