## ADDED Requirements

### Requirement: Gate Actionable Setups with Technical and Capital-Flow Timing
The system SHALL require a validated thesis to pass technical and capital-flow timing checks before it becomes an `actionable_setup`.

#### Scenario: Timing gate passes
- **WHEN** a validated thesis has aligned trend, volume, and timing conditions
- **THEN** the system upgrades it to `actionable_setup` and records the timing rationale

### Requirement: Publish Full Entry and Invalidation Rules
The system SHALL publish entry zone, add conditions, stop-loss, target range, catalyst calendar, and thesis invalidation rules for each actionable setup.

#### Scenario: Actionable setup is published
- **WHEN** the system publishes an actionable setup
- **THEN** the output includes explicit entry, risk, target, catalyst, and invalidation fields
