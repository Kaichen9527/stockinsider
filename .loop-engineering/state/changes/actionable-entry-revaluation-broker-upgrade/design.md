# Design: actionable-entry-revaluation-broker-upgrade

## Approach

This change extends existing read models instead of adding new tables.

## Entry Decision v2

- Extend `EntryDecision` with:
  - `actionabilityScore`,
  - `buyNowAllowed`,
  - `entryStyle`,
  - `buyPlan`,
  - `indicatorStack`.
- Compute lightweight technical indicators from existing daily candles:
  - ATR for stop distance and pullback risk,
  - ADX for trend strength,
  - Bollinger for expansion/compression,
  - Stochastic/MFI/OBV/CMF for momentum and money flow,
  - volume ratio for breakout quality.
- Preserve existing RSI/MACD/MA/Fib logic and make it less binary:
  - Severe risk still blocks buys.
  - Constructive trend with acceptable heat can show `可分批買進` or `突破後小量追蹤`.

## Revaluation SLA v2

- Derive SLA status from existing `RevaluationJobSummary`.
- Copy SLA status to radar cards and deep-dive target snapshots.
- Keep missing evidence tied to `requiredEvidence`/`repricingRequiredEvidence`.
- Summarize broker attempts from existing `broker_search_attempts`.

## Broker Evidence Radar

- Reuse `brokerSearchSummary` and broker consensus fields.
- Expose a compact status object:
  - hit/miss/pending/stale/not_attempted,
  - last attempt time,
  - next attempt time,
  - summary.

## Verification

- Add four audits:
  - `audit:entry-buy-actionability-v2`,
  - `audit:revaluation-sla-v2`,
  - `audit:scenario-promote-to-base-v2`,
  - `audit:broker-evidence-radar-v2`.
- Audits must work against `--base-url` and write JSON reports to `.agent/reports/`.
