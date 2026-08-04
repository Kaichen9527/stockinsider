# Requirements: actionable-entry-revaluation-broker-upgrade

## Problem

StockInsider still feels too passive in three user-visible areas:

- Entry plans often say `不買`, `等回測`, or `過熱不追` without giving a usable first-buy plan.
- `待重估` is visible but does not always expose job status, SLA, missing evidence, or next attempt.
- Broker/foreign-report discovery is important, but the card/deep-dive payload does not consistently expose broker search state as a first-class revaluation input.

## Functional Requirements

- Add an actionable entry decision layer that can answer:
  - whether buying now is allowed,
  - initial/add/max position sizing,
  - buy zone,
  - breakout and pullback triggers,
  - stop-loss, take-profit, and invalidation.
- Default style is `aggressive_fractional`: when trend/risk conditions are acceptable, show a 3%-10% trial position instead of only conservative waiting.
- Add indicator stack fields for ADX, ATR, Bollinger, Stochastic, MFI, OBV, CMF, and 20-day volume ratio when chart data is available.
- Expose revaluation SLA fields:
  - `revaluationSlaStatus`,
  - `nextRevaluationAt`,
  - `missingRepricingEvidence`,
  - `brokerEvidenceSearchStatus`.
- Broker evidence remains a trigger and verification source; social broker leaks must not directly support formal Base.

## Safety Requirements

- Formal recommendation Gate remains strict.
- ML/HF/social/broker leak signals cannot alone promote a stock to formal recommendation.
- No secrets, migrations, or deployment in this change.
