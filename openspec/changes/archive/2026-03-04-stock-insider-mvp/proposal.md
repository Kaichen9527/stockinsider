## Why

StockInsider aims to help investors identify potential high-growth stocks by aggregating scattered financial information from various sources. Currently, retail investors struggle to manually track news, institutional reports, KOL opinions, forum sentiments, and technical analysis simultaneously, making it difficult to form clear, data-driven investment strategies.

## What Changes

This change introduces the initial MVP for StockInsider, which will:
- Aggregate daily market trends (US/TW markets) to identify industry focus and money flows.
- Provide daily stock recommendations with explicit tracking of trading strategies (buy/sell timing, position sizing, and target prices).
- Analyze institutional reports to find market expectations and high-potential opportunities.
- Aggregate opinions from prominent US/TW KOLs (e.g., 投資癮, 股癌) and community forums (PTT, Threads).
- Provide a frontend dashboard featuring K-line charts, chip analysis, and technical indicators for recommended stocks.
- Integrate with LINE for personalized notifications and alerts on stock strategies.

## Capabilities

### New Capabilities
- `market-analysis`: Aggregation of US/TW market trends, KOL opinions, and forum (PTT/Threads) sentiments.
- `stock-strategy`: Core engine for stock recommendations, including target prices, buy/sell strategies, and institutional report analysis.
- `line-integration`: Personalized stock alerts, strategy updates, and notifications via LINE.
- `frontend-dashboard`: Web or app interface displaying K-line charts, daily insights, and chip analysis.

### Modified Capabilities

## Impact

- Creation of new backend services for data aggregation (scraping/APIs for KOLs, forums, institutional data).
- Development of a new frontend application with charting capabilities.
- Setup of a database to track historical recommendations and their performance.
- Integration with the LINE Messaging API.
