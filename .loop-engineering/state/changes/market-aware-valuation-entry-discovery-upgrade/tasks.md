# Tasks: market-aware-valuation-entry-discovery-upgrade

- [x] Characterize current radar/deep-dive distribution for over-target, scenario-only, entry actions, revaluation SLA, and market gate.
- [x] Add compact `tradeDecision` to `/api/radar/daily` cards so market-aware action, position size, entry zone, stop, and exit conditions reach the homepage.
- [x] Add compact card-level market signal only if needed for UI risk-budget copy, without bloating the payload.
- [x] Strengthen `audit:market-index-gate` so it requires compact `tradeDecision.positionSize` and not only action.
- [x] Add RED audit scaffold `audit:market-aware-entry-v3` before changing app behavior.
- [x] Extend types for market valuation adjustment and entry/exit decision v3 fields.
- [x] Build market-aware valuation adjustment from `MarketIndexSignal`, scenario gate, global lead-lag, and broker evidence status.
- [x] Attach market-aware valuation adjustment to radar cards and deep-dive target snapshots.
- [x] Update scenario promotion summary to distinguish price-led/fundamentals-pending from market-rerating-pending evidence.
- [x] Update trade decision logic so constructive scenario-upside stocks expose buy/hold/add/reduce triggers instead of generic no-buy language.
- [x] Update homepage market analysis copy to explain allowed risk budget and stock decision impact.
- [x] Update deep-dive first-screen investment advice to show buy/hold/reduce/exit action, size, trigger, stop, and next revaluation source.
- [x] Add audits for market-aware valuation, entry decision v3 actionability, scenario promotion with market rerating, and broker repricing evidence.
- [x] Run lint, build, targeted audits, and update Loop status.
