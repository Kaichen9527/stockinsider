# market-intelligence Specification

## Purpose
TBD - created by archiving change stock-insider-opportunity-engine. Update Purpose after archive.
## Requirements
### Requirement: Ingest Latest TW/US Market and Stock Signals
The system SHALL ingest latest TW/US market and stock signals including price, volume, chip metrics, MA, RSI, and MACD.

#### Scenario: Daily market ingestion completes
- **WHEN** the scheduled daily ingestion starts
- **THEN** the system stores normalized `market_snapshots` and `stock_signals` records with source timestamps

### Requirement: Enforce One-Hour Freshness Gate
The system SHALL block recommendation publication when critical market/stock signals are older than one hour.

#### Scenario: Critical signal is stale
- **WHEN** any critical signal exceeds 1 hour freshness threshold
- **THEN** the system marks recommendation rows as blocked with block reason and prevents publish timestamp

