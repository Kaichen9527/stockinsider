# StockInsider v5.15: High-Frequency Social Radar + Stable Recommendation Lifecycle

## Why
StockInsider is meant to find Taiwan stocks before or during major repricing, but the current system mixes fast social signals with slow recommendation decisions. That makes social freshness feel stale while recommendation buckets can still churn too much when individual scores move.

## What Changes
- Split ingestion into a high-frequency signal layer and a slower recommendation decision layer.
- Refresh Telegram, Threads, and Instagram every hour.
- Refresh InvestAnchors, Podcast, and YouTube once per day at 09:00 Asia/Taipei.
- Display source health as whether the connector ran, whether it wrote new data, and whether it failed.
- Add a recommendation lifecycle: discovered, watchlist, validated thesis, scenario candidate, formal recommendation, archived reflected.
- Make recommendation index the user-facing ranking score and include PE / PB / peer valuation gap.
- Use LLM/Hugging Face only for extraction, summarization, sentiment, clustering, and evidence scoring. They must not directly promote a stock.

## Non-Goals
- Do not loosen the formal recommendation gate.
- Do not let a single social mention promote a stock into formal recommendation.
- Do not train a black-box recommendation model in this change.
