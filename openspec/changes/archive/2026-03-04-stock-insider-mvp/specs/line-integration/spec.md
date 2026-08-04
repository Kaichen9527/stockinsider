## ADDED Requirements

### Requirement: Send Personalized Alerts
The system SHALL support sending personalized stock strategy alerts to users via LINE.

#### Scenario: Trigger action alert
- **WHEN** a recommended stock hits its target price or stop-loss threshold
- **THEN** the system sends a LINE Push Message to the effectively subscribed user with instructions

### Requirement: User Subscription
The system SHALL allow users to bind their LINE account to receive StockInsider alerts.

#### Scenario: Bind LINE account
- **WHEN** a user completes the LINE Login or Bot linking flow
- **THEN** the system associates their LINE user ID with their personal alert preferences
