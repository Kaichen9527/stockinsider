## ADDED Requirements

### Requirement: Build Daily TW Market Regime and Sector Rotation State
The system SHALL build a daily regime view for the Taiwan market that summarizes market breadth, leading sectors, lagging sectors, and capital rotation across TWSE and TPEx.

#### Scenario: Daily regime scan completes
- **WHEN** the daily market regime job finishes
- **THEN** the system stores canonical regime and sector-rotation outputs that can be consumed by downstream story ranking and report generation

### Requirement: Produce Theme Heat for Daily and Three-Day Windows
The system SHALL produce theme heat outputs that rank the hottest and fastest-emerging topics over daily and rolling three-day windows.

#### Scenario: Theme heat refresh executes
- **WHEN** the theme scan runs on its configured cadence
- **THEN** the system updates `theme_heat` outputs with time window, supporting evidence, and ranked symbols/themes
