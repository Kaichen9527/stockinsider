# Source633ddb4 offline calendar metadata replay

Use the committed product CLI with the already reviewed Node22 runtime, in an isolated
read-only/no-network process. No SQL, source collector, credential or production path:

```sh
node --experimental-strip-types web/scripts/launch-calendar-history.mjs < PRIVATE_METADATA_MANIFEST.json
```

Input is <=1MiB fatal-UTF8 JSON, no URL/file arguments, exactly:

```json
{"schemaVersion":"launch-calendar-history-diagnostic-v1","cutoff":"2026-11-15T01:00:00Z","batches":[],"events":[]}
```

This empty example is not actual acquisition or coverage. Each of <=8 batches has exactly
sourceCutoff,availableAt,supersedes (prior computed batch SHA256 or null),rows (<=1200).
Each row has exactly market,session,status,openAt,scheduledCloseAt,sourceTimestamp,collectedAt,
sourceUrl,sourceSha256,sourceRef. Market is TWSE/TPEX; status is completed/holiday/scheduled
as an UNVERIFIED annual observation. Dates/clocks/URLs/sourceRef must match the existing
annual protocol; preserve original supplied source/observation times and hashes. Input has
no supplied approval field. Revisions are computed from canonical metadata. Explicit linked
corrections only replace overlapping identities; prior rows outside a later batch survive.

Each of <=256 events has exactly eventId,market,session,kind,effectiveAt,observedAt,sourceKnownAt,
recordedAt,commitKnownAt,sourceRevision,rightsRevision,rawSha256,supersedesEventId. Kind is cancel
or withdrawal; withdrawal requires a linked prior event and knowledge moves forward. SHA256/
UUID references remain unverified protocol observations. Never fill an unknown clock from
a session date or an earlier publication claim. A Nov15 capture cannot appear in a Nov13
projection. Missing prices and annual holiday status do not manufacture cancellation events.

Output includes actual input-byte SHA256, computed projection/batch/event revisions, per-market
schedule counts, cancellation observations/conflicts/withdrawal gaps. Source/calendar/
publication authority is always false; officialCompletedSessions/officialCoverage always null.
No old history is overwritten. Rejected input gets only a fixed generic JSON error and exit1.
The CLI neither fetches original data nor registers/updates any live source or selector.

Synthetic acceptance checks prove >400-observation accumulation, clipping by actual known
cutoff, explicit event supersession/withdrawal/conflict and bounded malformed-input refusal.
Actual staged metadata/raw-parse replay is separate and not supplied by these tests. The
missing real producer/rights/applied-chunk/witness bridge is detailed in HISTORY520.md.
