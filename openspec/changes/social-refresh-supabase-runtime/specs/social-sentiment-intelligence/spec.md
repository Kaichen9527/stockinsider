# social-sentiment-intelligence Delta

## Modified Requirements

### Requirement: Ingest PTT/Threads/KOL Sentiment
The system SHALL ingest sentiment and source evidence for tracked symbols from PTT, Threads, InvestAnchors, Instagram, Telegram public channels, Podcast, YouTube, and configured KOLs.

#### Scenario: Six-hour social source terminal run
- **WHEN** the local canonical worker reaches a scheduled social refresh slot
- **THEN** each configured social connector records `lastAttemptAt`, terminal status, `recordsWritten`, affected symbols, and connector-specific failure reason in Supabase.

#### Scenario: Browser connector unavailable in Vercel
- **WHEN** a browser-backed connector is invoked in Vercel serverless
- **THEN** the system records status-only metadata without invalidating credentials or overwriting the last successful local-worker write.

#### Scenario: Social source misses six-hour SLA
- **WHEN** a social connector has no terminal run within six hours
- **THEN** source health marks the connector stale or degraded with a connector-specific reason.
