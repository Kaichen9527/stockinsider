# line-personalized-alerts Specification

## Purpose
TBD - created by archiving change stock-insider-opportunity-engine. Update Purpose after archive.
## Requirements
### Requirement: Bind LINE Subscription Preferences
The system SHALL support LINE binding with per-user watchlist and event preference settings.

#### Scenario: User binds LINE
- **WHEN** bind request is submitted from API or webhook command
- **THEN** system upserts `line_subscriptions` with watchlist, event preferences, digest setting, and throttle minutes

### Requirement: Support Event Alerts and Daily Digest
The system SHALL dispatch both actionable event alerts and daily digest events according to user preferences.

#### Scenario: Pending event dispatch
- **WHEN** dispatch job processes pending line alert events
- **THEN** system marks each event as sent/skipped based on subscription preference filters

