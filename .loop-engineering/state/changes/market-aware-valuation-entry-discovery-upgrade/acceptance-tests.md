# Acceptance Tests: market-aware-valuation-entry-discovery-upgrade

## Required Local Checks

```bash
cd web && npm run lint
cd web && npm run build
```

## Required Radar / Deep-Dive Audits

```bash
npm run audit:market-index-gate -- --base-url http://127.0.0.1:3012
npm run audit:market-aware-entry-v3 -- --base-url http://127.0.0.1:3012
npm run audit:entry-buy-actionability-v2 -- --base-url http://127.0.0.1:3012
npm run audit:scenario-actionability -- --base-url http://127.0.0.1:3012
npm run audit:revaluation-sla-v2 -- --base-url http://127.0.0.1:3012
npm run audit:broker-evidence-radar-v2 -- --base-url http://127.0.0.1:3012
npm run audit:recommendation-pool-freshness -- --base-url http://127.0.0.1:3012
npm run audit:recommendation-gates -- --base-url http://127.0.0.1:3012
npm run audit:valuation-sanity -- --base-url http://127.0.0.1:3012
npm run audit:revaluation-loop -- --base-url http://127.0.0.1:3012
```

## New / Strengthened Checks Required By This Change

The implementation must add or strengthen audits so the following fail when violated:

- Visible radar cards must include market-aware trade decision fields or an explicit reason why the decision is unavailable.
- Scenario-only stocks must show a concrete buy/hold/wait/reduce plan and not only `等待重估`.
- Over-scenario stocks must show hot-tracking/revaluation evidence requirements and must not appear as buy recommendations.
- Visible stocks must not all surface only `不買 / 等回測 / 過熱不追` unless every conservative decision has a hard-block reason.
- Broker evidence for repricing candidates must distinguish verified broker consensus from `social_broker_leak`.
- Market analysis must state the current allowed risk budget and how it changes stock entry timing.

Detailed RED checks are defined in `red-checks.md`.

## Baseline Failure To Fix

Production baseline on 2026-06-28:

```bash
npm run audit:market-index-gate -- --base-url https://stockinsider-three.vercel.app
```

Failed because sampled visible symbols were missing `tradeDecision`.
