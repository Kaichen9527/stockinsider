# Change Requirements Draft: improve-stock-discovery-pool

Generated: 2026-06-22
Loop command: `$loop-change improve-stock-discovery-pool`
Gate status: NEEDS `APPROVE REQUIREMENTS`

## Problem

The recommendation list is too stable and can miss fast-moving TW stocks, including limit-up or strong price/volume movers. Current discovery is mostly seed/theme/source driven, so a stock can be market-hot but absent from discovered/candidate/visible pools unless it also appears in existing themes or source documents.

## User Goal

Make StockInsider continuously surface more potential TW stocks before or during breakout while preserving strict formal recommendation gates.

## Requirements

### Requirement: Full-Market Hot Mover Discovery
The system SHALL identify TWSE/TPEx stocks with limit-up, near-limit-up, unusual volume, 3/5/10-day momentum, or strong sector rotation and place them into candidate, early, scenario, or hot-tracking buckets.

#### Scenario: Limit-up stock is not yet in recommendations
- **WHEN** a TW stock hits limit-up or near-limit-up with unusual volume
- **THEN** the stock appears in discovered/watchlist/hot_tracking or receives an explicit exclusion reason.

### Requirement: Social and Broker Signal Discovery
The system SHALL treat Threads, Instagram, PTT, Telegram, BullTalk, KOL audio/video, and social broker leaks as first-layer discovery sources.

#### Scenario: Broker target-price leak appears in social sources
- **WHEN** social content mentions a broker EPS, target price, rating change, or US broker keyword
- **THEN** it triggers candidate creation and revaluation search, but cannot alone promote the stock to formal recommendation.

### Requirement: Recommendation Pool Freshness Proof
The homepage SHALL explain whether the recommendation pool changed, and if not, why.

#### Scenario: No new stock passes the gates
- **WHEN** no new visible recommendation is added in the latest run
- **THEN** the homepage shows source activity, new candidates, blocked candidates, archived/reflected names, and the top reason no promotion occurred.

### Requirement: Formal Gate Safety Preserved
The system SHALL preserve the existing formal recommendation gate.

#### Scenario: Social-only hot stock
- **WHEN** a stock is hot only due to social/price momentum without verified bridge and valuation support
- **THEN** it can be discovered, early, scenario, or hot_tracking, but not formal.

## Non-Goals

- Do not loosen formal recommendation requirements in this change.
- Do not auto-deploy or run Supabase migrations without explicit approval.
- Do not treat a limit-up stock as a buy signal by itself.
- Do not rewrite valuation formulas or deep-dive layout in this change.

## Open Decisions

- Whether hot mover detection should scan full TWSE/TPEx hourly or only after close.
- Whether to persist hot mover candidates in a new table or reuse existing `story_candidates` and read models.
- Whether homepage hot mover proof should be a new card or folded into the existing recommendation pool freshness summary.
