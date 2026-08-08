## ADDED Requirements

### Requirement: Convert Verified Stories into Thesis and Valuation Cases
The system SHALL convert each verified story into a structured investment thesis with base, upside, and invalidation cases, including estimated impact on revenue, earnings, margin, or valuation multiple.

#### Scenario: Verified thesis is built
- **WHEN** the thesis engine processes a verified story
- **THEN** the system writes a canonical thesis and valuation case with assumptions, impact path, and confidence

### Requirement: Separate Candidate, Validated, and Actionable States
The system SHALL classify outputs into `watchlist_candidate`, `validated_thesis`, and `actionable_setup` instead of publishing a single flattened score.

#### Scenario: Ranking cycle completes
- **WHEN** the ranking stage finishes
- **THEN** the system assigns each symbol to the highest justified lifecycle state and persists the justification

### Requirement: Prevent Social-Only Final Recommendations
The system SHALL prevent social, forum, or KOL signals from independently promoting a stock to final recommendation without verified evidence and thesis support.

#### Scenario: Social hype lacks verification
- **WHEN** a symbol has strong social attention but insufficient verified evidence
- **THEN** the system may keep it as a watchlist candidate but SHALL NOT publish it as an actionable setup
