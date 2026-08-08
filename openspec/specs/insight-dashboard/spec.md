# insight-dashboard Specification

## Purpose
Provide an operator- and investor-facing dashboard that renders canonical market/recommendation/strategy data with freshness and risk context.

## Requirements
### Requirement: Render Daily Focus and Recommendation List from Canonical Data
The frontend SHALL render dashboard market focus and recommendation table from canonical DB/API data (no static mock source).

#### Scenario: Dashboard loaded
- **WHEN** user opens homepage
- **THEN** system shows latest market snapshots, recommendation score/confidence/action, and strategy summary

### Requirement: Render Stock Insight with MA/RSI/MACD and Strategy
The frontend SHALL render stock insight page with K-line data, chip metrics, MA/RSI/MACD, and strategy/risk disclosure.

#### Scenario: Stock insight loaded
- **WHEN** user opens `/stock/:symbol`
- **THEN** system shows latest signal freshness, technical indicators, strategy state, and risk disclosure
