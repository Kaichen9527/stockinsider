## ADDED Requirements

### Requirement: Hourly Social Source Refresh
Telegram, Threads, and Instagram SHALL have a terminal connector run at least once per hour, or show a connector-specific failure reason.

#### Scenario: Successful run with no new data
- **WHEN** the connector completes successfully and writes zero records
- **THEN** the UI SHALL display "已更新，暫無新增資料"
- **AND** it SHALL NOT display "等待本機 worker".

### Requirement: Daily KOL Refresh
InvestAnchors, Podcast, and YouTube SHALL run a daily KOL scan at 09:00 Asia/Taipei or show an explicit terminal failure.

### Requirement: Model Signal Boundary
LLM and Hugging Face signals SHALL be assistive-only and SHALL NOT directly promote a stock into formal recommendation.
