# Requirements: market-aware-valuation-entry-discovery-upgrade

## Problem

StockInsider still misses the user's intended product behavior in four visible ways:

- Many visible stocks have already exceeded Base or scenario targets by a large margin, so the app can look like the valuation model is stale or underestimating the current market cycle.
- The homepage does not make the broad Taiwan market index regime important enough when explaining whether a stock can be bought, held, reduced, or repriced.
- Entry plans still overuse `不買`, `等回測`, or `過熱不追` without making it obvious when a user should enter, add, reduce, or exit.
- The app is not yet convincingly discovering under-followed Taiwan stocks before they move; broker reports, social signals, market movers, and global lead-lag signals need stronger evidence capture and clearer candidate promotion rules.

## Functional Requirements

- Add a market-aware valuation layer that can explain when Base/scenario targets are likely stale because the Taiwan market regime, sector rerating, peer multiple, broker consensus, or scenario checklist has moved.
- Keep formula valuation auditable: Base/scenario targets must still trace to financial bridge, forward EPS, target forward PE, broker/official citations, or scenario promotion evidence.
- Add a `marketValuationAdjustment` or equivalent read-model field that summarizes:
  - TAIEX/OTC trend and breadth,
  - sector/theme rerating pressure,
  - whether the market regime supports higher target PE,
  - whether the stock should be repriced, promoted from scenario to Base, or kept as price-led/fundamentals-pending.
- Add homepage market analysis that is useful for stock decisions, not just a generic regime label:
  - current TAIEX/OTC state,
  - market breadth/risk budget,
  - sector/theme leadership,
  - how the market gate changes buy size and exit discipline.
- Add entry/exit decision v3:
  - `action`: `建議買進`, `可分批買進`, `突破追蹤買進`, `等回測買點`, `不追價`, `不買`, `減碼`, `出場`, `停利`.
  - `buyNowAllowed`, `sellNowSuggested`, `positionSize`, `buyZone`, `breakoutTrigger`, `pullbackTrigger`, `stopLoss`, `takeProfit`, `validUntil`, `whyBuyNow`, `whyWait`, `whyExitNow`.
  - If a stock still has scenario upside and the market gate is supportive, the app must offer either a small trial buy, a concrete pullback buy zone, or a breakout tracking trigger unless hard risk blocks exist.
- Add explicit hard-block reasons so conservative decisions are explainable:
  - current price above scenario target,
  - TAIEX/OTC breakdown,
  - stock below MA60 with weak MACD,
  - RSI/extension extreme,
  - institutional selling plus margin crowding,
  - missing valuation/technical/chip data.
- Add rerating triggers:
  - scenario checklist >= threshold and external evidence count enough,
  - broker/FactSet/foreign target or forward EPS uplift,
  - sector peer multiple expansion,
  - market regime risk-on with theme leadership,
  - global lead-lag basket rerating Taiwan peers.
- Add stronger discovery proof:
  - market movers and limit-up/near-limit-up stocks must enter candidate/hot tracking or have explicit exclusion reasons,
  - social/broker leaks must trigger revaluation jobs,
  - foreign broker summaries must be distinguished from verified broker consensus,
  - under-followed stocks should be visible as discovery candidates before formal recommendation.

## Safety Requirements

- Do not loosen formal recommendation safety silently.
- Do not auto-raise a target only because the price rose.
- Do not let social-only, broker-leak-only, market-momentum-only, or ML-only evidence create a formal Base target.
- Existing `valuation-sanity`, `recommendation-gates`, `revaluation-loop`, and source-health behavior must not be weakened.
- No secrets or `.env*` edits.
- No deployment in this change unless the user explicitly requests release after verification.

## Acceptance Criteria

- Homepage shows a market analysis block that directly states what the Taiwan market allows: buy/hold/reduce risk budget, not only `risk-on`.
- A visible stock above Base but below scenario shows scenario buy/hold logic and repricing requirements instead of a generic `等待重估`.
- A visible stock above scenario is not recommended, but has a revaluation/hot-tracking reason and evidence needed for a target raise.
- Visible stocks are not all `不買/等回測/過熱不追`; when conditions are constructive, at least some cards/deep-dives produce actionable small-position entries.
- Every `待重估` visible state has job/SLA/last attempt/missing evidence/next attempt or a blocked reason.
- Broker evidence search status is shown for repricing candidates, including whether evidence is verified broker consensus or social broker leak.
- Discovery freshness proves new candidates, blocked candidates, hot movers, and unchanged reasons.
