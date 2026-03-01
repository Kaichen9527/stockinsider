# recommendation-strategy-engine Specification

## Purpose
TBD - created by archiving change stock-insider-opportunity-engine. Update Purpose after archive.
## Requirements
### Requirement: Generate Rule-Based Recommendation Score
The system SHALL generate daily stock recommendations using a deterministic weighted score and confidence output.

#### Scenario: Daily scoring executes
- **WHEN** required upstream signals are available
- **THEN** the system writes recommendation rows with score, confidence, action (`buy|watch|reduce`), and rationale

### Requirement: Map Score to Actionable Strategy
The system SHALL map recommendation score to actionable strategy fields including entry rule, position sizing, target, stop-loss, and review horizon.

#### Scenario: Strategy record upsert
- **WHEN** a recommendation row is created or updated
- **THEN** the system upserts matching `strategy_actions` row with full action fields and current state

### Requirement: Emit State Transition Events
The system SHALL evaluate strategy state transitions and emit line alert events for actionable changes.

#### Scenario: Target hit transition
- **WHEN** latest price crosses target threshold for an active strategy
- **THEN** the system updates strategy state and inserts pending `line_alert_events` event

