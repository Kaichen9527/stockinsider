## ADDED Requirements

### Requirement: Display K-Line Charts
The frontend SHALL display interactive K-line (candlestick) charts for recommended stocks, including daily price movements and trading volume.

#### Scenario: View stock chart
- **WHEN** a user navigates to a specific stock's detail page
- **THEN** the system renders an interactive K-line chart encompassing historical and current price data

### Requirement: Display Chip Analysis
The frontend SHALL provide a view indicating the flow of institutional buying and selling (chip analysis) for specific Taiwanese stocks.

#### Scenario: View chip analysis
- **WHEN** a user views stock details for a TW market stock
- **THEN** the system displays the net buying/selling metrics of major institutional investors alongside the chart
