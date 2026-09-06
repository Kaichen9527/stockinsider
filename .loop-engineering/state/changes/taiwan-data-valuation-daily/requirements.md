# Requirements: taiwan-data-valuation-daily

Status: approved by the user on 2026-09-06.

## Outcome

- TWSE, TPEx, MOPS and company IR remain the primary Taiwan-market authorities.
- A validated FinMind adapter may fill an observed gap, but every row retains the real provider and upstream provenance and may not be counted as an independent official confirmation.
- Every effective seven-day source candidate receives a bounded, durable research terminal result; acquisition failure is distinct from unpublished data and from an investigated no-defensible-method result.
- General, cyclical, financial and loss-making issuers use explicit valuation routes. Missing evidence fails closed and never creates a target price.
- Public candidate detail is company-specific, revision-bound and readable; raw UUID fact identifiers are audit-only.
- VPS systemd is the sole production writer. Preliminary and final publications are distinct; only the 21:00 final close can advance two-session confirmation and live Shadow.

## Schedule

- 06:00: instrument master, calendar, listing status and recent revisions.
- 06:30, 12:30, 18:30 and 23:30: active source refresh.
- 18:15: official close data plus validated gap acquisition.
- 19:00: preliminary read-only publication.
- 20:15 and 20:40: late institutional and missing-field retries.
- 21:00: immutable final inputs, valuation, classification, detail, atomic publication, independent replay and Shadow observation.
- 21:45: health and queue-stall checks.
- Hourly at minute 10, excluding 18:10 through 21:10: bounded historical financial/IR queue drain.

## Safety

- Provider conflicts preserve both values and block affected promotion inputs.
- Period, announcement/availability, unit, precision, basic/diluted EPS, instant/duration and quarter/YTD semantics are explicit.
- A successful HTTP response is not a successful dataset result without schema, expected-date and persistence validation.
- Non-trading days may update sources and queues but cannot advance confirmation or Shadow.
- FinMind API/MCP software access does not grant data redistribution rights.
- Threads, BullTalk and podcast-content analysis remain disabled until their external access/licensing gates pass; their state cannot masquerade as healthy active ingestion.
