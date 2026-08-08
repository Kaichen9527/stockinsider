# Implementation Handoff: market-aware-valuation-entry-discovery-upgrade

## Gate State

- Current gate: Requirements draft.
- Next required human response: `APPROVE REQUIREMENTS`.
- Do not implement core app behavior before Requirements and Design are approved.

## First Implementation Priority

Fix radar cards missing market-aware `tradeDecision`.

Observed production failure:

- `/api/radar/daily` includes `marketGateStatus`.
- It includes `entryDecision` and `entryActionLabel`.
- It does not include `tradeDecision`.
- `audit:market-index-gate` fails with `missing_trade_decision` for sampled visible cards.

Files:

- `web/src/app/api/radar/daily/route.ts`
  - Add `compactTradeDecision()`.
  - Add `tradeDecision: compactTradeDecision(card.tradeDecision as Record<string, unknown> | null | undefined)` in `compactRecommendationCard()`.
  - Keep payload compact to protect Supabase/Vercel egress.
- `web/src/app/components/RadarTabs.tsx`
  - It already reads `rec.tradeDecision?.action` and `rec.tradeDecision?.positionSize`; once API includes the field, homepage should become more actionable.
- `scripts/audit_market_index_gate.js`
  - After API fix, extend it to require `tradeDecision.positionSize`, not only `tradeDecision.action`.

## Second Implementation Priority

Make market-aware target stale explanation clearer.

Files:

- `web/src/lib/domain.ts`
  - `buildBridgeAwareTargetSnapshot()`
  - `buildScenarioPromotionGate()`
  - `buildMarketIndexSignal()`
  - `buildTradeDecision()`

Expected behavior:

- Above Base but below scenario:
  - show scenario upside,
  - show small-position/hold/wait plan depending on market and technical gate,
  - show exact evidence needed for repricing.
- Above scenario:
  - hot tracking / reflected,
  - no buy recommendation,
  - show broker/EPS/Forward PE evidence needed to raise target.
- Risk-on market:
  - allow trial buy or breakout tracking when stock-specific hard blocks are absent.
- Risk-off market:
  - no chase; reduce or wait.

## Third Implementation Priority

Discovery and broker evidence visibility.

Files:

- `web/src/lib/domain.ts`
  - `buildDiscoveryFreshnessSummary()`
  - `brokerEvidenceSearchStatusFromRows()`
  - `buildGlobalLeadLagSummary()`
- Existing audits:
  - `audit:missed-hot-symbols`
  - `audit:recommendation-pool-freshness`
  - `audit:broker-evidence-radar-v2`

Expected behavior:

- If the app does not change recommendations, homepage explains whether the reason is:
  - no new candidate passed Gate,
  - stale source,
  - over target,
  - bridge insufficient,
  - broker evidence missing.
- Broker evidence must distinguish:
  - verified broker consensus,
  - public news summary,
  - social broker leak,
  - no hit.

## Verification Order

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `npm run audit:market-index-gate -- --base-url http://127.0.0.1:3012`
4. `npm run audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012`
5. `npm run audit:scenario-actionability -- --base-url http://127.0.0.1:3012`
6. `npm run audit:revaluation-sla-v2 -- --base-url http://127.0.0.1:3012`
7. `npm run audit:broker-evidence-radar-v2 -- --base-url http://127.0.0.1:3012`
8. `npm run audit:recommendation-gates -- --base-url http://127.0.0.1:3012`
9. `npm run audit:valuation-sanity -- --base-url http://127.0.0.1:3012`
10. `npm run audit:revaluation-loop -- --base-url http://127.0.0.1:3012`

## Non-Goals For First Implementation

- Do not create new Supabase tables.
- Do not loosen formal recommendation Gate.
- Do not deploy.
- Do not edit `.env*`.
- Do not treat social broker leaks as verified broker consensus.
