## Context
StockInsider needs a scalable backend to scrape and aggregate market data, KOL opinions, and forum sentiments. The application also requires a frontend to visualize this data with interactive K-line charts, track explicit investment strategies, and a notification system using the LINE API.

## Goals / Non-Goals
**Goals:**
- Aggregate and normalize data from multiple heterogeneous sources (APIs, web scraping).
- Provide a responsive frontend dashboard with technical charting capabilities.
- Integrate with LINE Messaging API for personalized, real-time notifications.
- Define a clear database schema for tracking stock recommendations and their associated strategies.

**Non-Goals:**
- Fully automated algorithmic trading execution (only strategy tracking and alerts for now).
- Real-time tick-by-tick data streaming (daily or hourly updates are sufficient for the MVP).

## Decisions
- **Database**: PostgreSQL via Supabase. It supports structured data properly, allows quick backend setup, and has built-in auth.
- **Frontend**: Next.js with Tailwind CSS, utilizing a charting library like `lightweight-charts` for K-line rendering. Next.js provides a good mix of SSR for SEO and API routes.
- **Scraping / Data Processing**: Python-based scraper cron jobs to parse institutional reports, PTT, Threads, and KOL blogs. Python has a rich ecosystem for scraping and NLP sentiment analysis.
- **Notification**: LINE Messaging API webhook integration.

## Risks / Trade-offs
- [Risk] Web scraping might break if source sites change their DOM layout. → Mitigation: Build robust error handling, alert developers to scraping failures, and use official RSS feeds/APIs where possible.
- [Risk] Aggregating diverse, natural-language opinions into a numerical strategy is complex. → Mitigation: Start with simple sentiment categorization (Bullish/Bearish) and clear target price extraction manually if needed, before automating fully.

## Open Questions
- What specific K-line indicators do users want aside from standard price and volume (e.g., MACD, RSI)?
- Do we need user authentication for the MVP, or is the LINE integration sufficient for identifying users?
