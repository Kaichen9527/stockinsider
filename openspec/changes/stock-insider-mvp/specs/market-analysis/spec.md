## ADDED Requirements

### Requirement: Aggregate Market Data
The system SHALL aggregate daily market trends from US and TW stock markets.

#### Scenario: Update market trends
- **WHEN** the daily market close occurs
- **THEN** the system updates the daily focus industries and overall money flow metrics

### Requirement: Aggregate KOL and Forum Sentiments
The system SHALL collect and summarize discussions from PTT, Threads, and designated KOLs (e.g., 投資癮, 股癌).

#### Scenario: Collect KOL opinions
- **WHEN** a tracked KOL publishes new content or a forum reaches high activity on a ticker
- **THEN** the system extracts and summarizes the sentiment and explicitly mentioned stocks
