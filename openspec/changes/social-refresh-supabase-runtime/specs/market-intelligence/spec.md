# market-intelligence Delta

## Modified Requirements

### Requirement: Ingest Latest TW/US Market and Stock Signals
The system SHALL store runtime update state, worker job runs, and audit artifacts in Supabase so market and recommendation freshness are auditable from production.

#### Scenario: Runtime state is written durably
- **WHEN** a scheduled worker job completes, fails, or degrades
- **THEN** the system writes latest job state and route-level run details to Supabase.

#### Scenario: Audit artifact is generated
- **WHEN** a source-health, visibility, or runtime audit runs
- **THEN** the system can persist a JSON artifact record in Supabase for later production diagnosis.
