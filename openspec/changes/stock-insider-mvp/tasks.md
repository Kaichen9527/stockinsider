## 1. Project Setup
- [x] 1.1 Initialize Next.js project with Tailwind CSS and lightweight-charts
- [x] 1.2 Set up Supabase project and define PostgreSQL database schema (users, stocks, strategies, market_data)
- [x] 1.3 Set up Python environment for scraping and data processing

## 2. Data Aggregation
- [x] 2.1 Implement Python scraper to collect daily US/TW market trends and focus industries
- [x] 2.2 Implement Python scraper to extract sentiments from PTT and Threads for specific tickers
- [x] 2.3 Implement Python scraper/API integration to monitor designated KOLs (投資癮, 股癌)
- [x] 2.4 Implement data normalization and insertion into Supabase

## 3. Stock Strategy Engine
- [x] 3.1 Implement daily cron job to generate stock recommendations based on aggregated data
- [x] 3.2 Implement logic to calculate explicit trading strategies (target price, buy/sell amounts)
- [x] 3.3 Implement tracking mechanism to evaluate if a stock hits its target price/stop-loss

## 4. LINE Integration
- [x] 4.1 Set up LINE Messaging API channel and webhook endpoint in Next.js
- [x] 4.2 Implement LINE user binding flow (associated with Supabase users)
- [x] 4.3 Implement notification service to send personalized alerts when strategies become actionable

## 5. Frontend Dashboard
- [x] 5.1 Create main dashboard page displaying daily market focus and recommended stocks
- [x] 5.2 Create stock detail page with interactive K-line charting component
- [x] 5.3 Implement chip analysis view for TW stocks (institutional buying/selling metrics)
- [x] 5.4 Integrate frontend pages with Supabase backend to fetch data
