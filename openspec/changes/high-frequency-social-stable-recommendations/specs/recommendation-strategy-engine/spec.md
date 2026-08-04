## ADDED Requirements

### Requirement: Stable Recommendation Lifecycle
Recommendations SHALL move through lifecycle stages: discovered, watchlist, validated_thesis, scenario_candidate, formal_recommendation, and archived_reflected.

#### Scenario: Single social source mention
- **WHEN** a stock is mentioned by only one social source
- **THEN** it MAY enter discovered/watchlist
- **AND** it SHALL NOT become a formal recommendation.

### Requirement: Recommendation Index Uses PE Gap
The user-facing recommendation index SHALL include a PE/PB/peer valuation gap component. A low PE SHALL only increase the index when paired with earnings or margin inflection evidence.

### Requirement: Formal Recommendation Stability
Formal recommendations SHALL not churn from ordinary source noise. Hard gate failures and over-target states MAY downgrade immediately.
