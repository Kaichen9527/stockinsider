## ADDED Requirements

### Requirement: Render Radar, Theme, Weekly, and Deep-Dive Views from Canonical Research Objects
The product SHALL render daily radar, hot theme, weekly conviction, and stock deep-dive experiences directly from canonical research objects without manual assembly.

#### Scenario: User opens a radar or deep-dive view
- **WHEN** a user requests a daily, hot, weekly, or stock-specific research view
- **THEN** the system returns canonical research data including thesis state, evidence, catalysts, technical context, and risk information

### Requirement: Generate Research Reports with Source Traceability
The system SHALL generate daily, three-day, and weekly reports that include source links, evidence summary, story logic, valuation path, and entry/exit rules.

#### Scenario: Scheduled report build completes
- **WHEN** a report build job runs
- **THEN** the system stores a report artifact that is traceable to its underlying stories, evidence items, and recommendation states
