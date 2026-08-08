## ADDED Requirements

### Requirement: Require Multi-Class Evidence Before Thesis Validation
The system SHALL require a story candidate to be verified by at least one company-originated or official evidence item and at least one corroborating public or industry evidence item before it can become a `validated_thesis`.

#### Scenario: Story candidate meets evidence threshold
- **WHEN** verification finds sufficient independent evidence classes for a candidate
- **THEN** the system promotes the candidate to `validated_thesis` and stores the supporting evidence matrix

### Requirement: Hold Contradictory or Weak Stories in Review State
The system SHALL keep a story candidate in candidate or review state when evidence is insufficient, contradictory, stale, or time-sequence invalid.

#### Scenario: Story verification detects a contradiction
- **WHEN** a verification pass finds conflicting evidence or invalid timing
- **THEN** the system blocks promotion, records the contradiction, and places the item in a reviewable state
