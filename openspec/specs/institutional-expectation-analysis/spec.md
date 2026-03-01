# institutional-expectation-analysis Specification

## Purpose
TBD - created by archiving change stock-insider-opportunity-engine. Update Purpose after archive.
## Requirements
### Requirement: Parse Public Institutional Sources
The system SHALL parse public institutional-research-like sources and map expectation signals to symbols.

#### Scenario: Public source report is ingested
- **WHEN** a supported public report source is processed
- **THEN** the system stores `institutional_signals` with source, expectation score, summary, and timestamp

### Requirement: Rank High-Expectation Candidates
The system SHALL rank high-expectation symbols based on recency and expectation score.

#### Scenario: Daily expectation ranking runs
- **WHEN** institutional aggregation finishes
- **THEN** the system outputs ranked candidate signals for downstream strategy scoring

