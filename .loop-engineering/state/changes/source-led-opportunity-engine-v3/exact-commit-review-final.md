# Exact commit review: rate-safe official recovery and bounded public Radar

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `34e66b3986e5a355b721d72502f05928797ed23c..7056eb2300c55cc951a47619c4c34ab8e554df8a` and reviewed tree `ff3da374a47389165a9850daa899b3f044b56433`.
- Per-host request pacing, bounded burst pauses, exchange-specific failure cooldowns, retry behavior, incremental persistence, resumability, and fail-closed incomplete-target reporting.
- Operator transport boundary requiring an SSH-encrypted `127.0.0.1:43100` tunnel while preserving the public Nginx deny-all rule for `/api/internal/*`.
- Append-only instrument and trading-session authority verification beyond the PostgREST 1,000-row response cap.
- Public Radar card compaction and the live 150,000-byte response budget without removing source, score, valuation, technical, or unmet-condition evidence used by the UI.
- Existing hash-bound official response parsing, writer fencing, stock/session identity checks, idempotent writes, and candidate/Shadow behavior.

## Findings

- No P0/P1/P2 findings remain. The recovery operator cannot transmit the internal Bearer credential to the public HTTP endpoint: it accepts only the fixed local SSH tunnel URL and therefore reaches the Next.js loopback listener through encrypted SSH transport.
- TWSE and TPEx acquisition rates are isolated per host. TWSE receives a pause after every ten requests and a longer cooldown after network or HTTP failures; retries remain bounded.
- Verified pages are persisted after each stock rather than held until the entire universe finishes. A restart re-reads durable coverage and upserts idempotently; it cannot fabricate missing rows or mark incomplete coverage successful.
- Authority verification paginates all append-only rows. Duplicate authority revisions can no longer hide a valid recent session or instrument behind the 1,000-row cap.
- The public payload removes only repeated or unused card fields. Applied to the current 131-card production snapshot, the response falls from 155,256 to 148,313 bytes while retaining every displayed source, valuation, technical, score, concentration, and blocking condition field.
- No scoring threshold, target price, market session, non-official price source, actionable quota, or Nginx exposure is introduced.

## Verification

- Product correctness acceptance cases: 150/150 passed.
- Official response parser, trust-boundary, pagination, and public Radar budget tests: 5/5 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.

## Evidence

- Final reviewed repair/tree: `7056eb2300c55cc951a47619c4c34ab8e554df8a` / `ff3da374a47389165a9850daa899b3f044b56433`
- Full final range: `34e66b3986e5a355b721d72502f05928797ed23c..7056eb2300c55cc951a47619c4c34ab8e554df8a`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
