# social-sentiment-intelligence Specification

## Purpose
Capture noisy social signals (PTT/Threads/KOL) and normalize them into weighted sentiment features that are usable for deterministic recommendation scoring.

## Requirements
### Requirement: Ingest PTT/Threads/KOL Sentiment
The system SHALL ingest sentiment for tracked symbols from PTT Stock, Threads, and configured KOLs.

#### Scenario: Social source update detected
- **WHEN** new social content is captured from configured sources
- **THEN** the system stores sentiment label, confidence, source metadata, and mention count in `social_signals`

### Requirement: Apply Source-Weighted Sentiment Aggregation
The system SHALL aggregate social signals using source weights and confidence to reduce noise.

#### Scenario: Daily social aggregation runs
- **WHEN** recommendation scoring requests social features
- **THEN** the system returns source-weighted sentiment score per symbol
