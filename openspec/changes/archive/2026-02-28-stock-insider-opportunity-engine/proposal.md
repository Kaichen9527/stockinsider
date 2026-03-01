## Why

StockInsider needs a strict, implementation-ready contract so teams can ship a production-grade opportunity engine without drifting from the core goal: finding high-potential TW/US stocks from multi-source evidence. We must lock scope (TW-first), output format (rule-based + confidence), and operational constraints (freshness/alert policy) before further development.

## What Changes

- Define a TW-primary / US-secondary intelligence pipeline for latest price, chip flow, earnings context, and technical indicators (MA/RSI/MACD).
- Add market regime + sector capital-flow analysis to determine where money is concentrating.
- Add public institutional expectation extraction and ranking for high-conviction companies.
- Add social sentiment intelligence from PTT Stock, Threads, and tracked KOLs (including 投資癮, 股癌).
- Add a rule-based recommendation strategy engine that outputs score, confidence, action (buy/watch/reduce), and strategy fields.
- Add a one-hour freshness gate: stale critical signals SHALL block recommendation publication.
- Add dashboard and stock insight pages backed by canonical DB tables.
- Add LINE personalization with dual-mode notifications: event-triggered alerts + daily digest.

## Capabilities

### New Capabilities
- `market-intelligence`: TW/US market + stock signal ingestion with freshness metadata.
- `institutional-expectation-analysis`: Public-source institutional expectation extraction and scoring.
- `social-sentiment-intelligence`: PTT/Threads/KOL sentiment aggregation with confidence and source weights.
- `recommendation-strategy-engine`: Rule-based recommendation scoring and strategy lifecycle tracking.
- `insight-dashboard`: Data-backed daily dashboard and stock detail insights with MA/RSI/MACD.
- `line-personalized-alerts`: LINE binding, preference filters, event alerts, and daily digest.

### Modified Capabilities
- None.

## Impact

- Backend: New canonical signal tables, recommendation lifecycle records, and dispatch events.
- Data model: Adds market snapshots, stock signals, institutional/social signals, recommendations, strategy actions, line subscriptions/events, pipeline runs.
- Frontend: Replaces mock dashboard/detail data with Supabase-backed endpoints.
- Operations: Adds migration flow, ingestion/recommendation/dispatch jobs, and freshness governance.
- External dependencies: Public market/institutional/social sources, Supabase/PostgreSQL, LINE Messaging API.
