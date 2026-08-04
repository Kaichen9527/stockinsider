## ADDED Requirements

### Requirement: Persist Agent Runs, Tasks, and Findings with Auditability
The system SHALL persist every research agent run, task, and finding with timestamps, input/output references, status, and reviewer state.

#### Scenario: Agent task finishes
- **WHEN** any StockInsider agent completes, fails, or retries a task
- **THEN** the system records the run, task, outcome, and evidence links in auditable storage

### Requirement: Restrict External Agent Profiles to Allowlisted Roles
The system SHALL restrict imported external agent profiles, including vendored `agency-agents` profiles, to an explicit allowlist and mapped internal role contract.

#### Scenario: External agent profile is registered
- **WHEN** an external agent profile is added to the system
- **THEN** the system maps it to a StockInsider internal role and denies any unmapped or unapproved profile from execution

### Requirement: Block Direct Recommendation Publication by External Profiles
The system SHALL prevent external agent profiles from directly publishing or promoting final recommendations.

#### Scenario: External profile attempts final publication
- **WHEN** an external agent profile produces a recommendation-oriented output
- **THEN** the system records it as agent finding input only and requires internal Hybrid Judge + review flow before publication

### Requirement: Route Drift and Contradictions into Review Queues
The system SHALL route source drift, parse failures, evidence contradictions, and agent conflicts into review queues instead of silently continuing.

#### Scenario: Research pipeline detects a governance issue
- **WHEN** a source, evidence chain, or agent result fails governance checks
- **THEN** the system creates a review item with enough context for operator intervention
