# Design

## Source Cadence
`hourly_social` connectors are Telegram, Threads, and Instagram. They run every hour through the local launchd worker and write terminal status, records written, matched symbols, and failure reason.

`daily_kol` connectors are InvestAnchors, Podcast, and YouTube. They run daily at 09:00 Asia/Taipei. Manual forced runs may update the same state but must be labeled as terminal runs.

Vercel serverless remains status-only for browser connectors. It may record a skipped attempt, but it cannot overwrite the canonical local worker terminal status.

## Recommendation Lifecycle
Fast social sources create or update candidate evidence. Formal recommendation is event-gated:
- Upgrade only after evidence and gates persist across repeated runs or sufficient time.
- Downgrade immediately on hard gate failure, over-target state, material contradiction, or technical/chip deterioration.
- Ordinary score noise changes thesis momentum, not the formal bucket.

## PE Valuation Signal
PE discount is useful only when paired with earnings inflection and peer rerating logic. Cyclical industries use normalized PE and peer ranges rather than raw TTM PE. If PE data is unavailable or unreliable, the signal contributes little and states the gap.

## Model Boundary
LLM/Hugging Face output is assistive only. Model signals can summarize KOL content, extract stocks, classify sentiment, and cluster themes, but formal recommendations still require deterministic evidence, valuation, chip, and technical gates.
