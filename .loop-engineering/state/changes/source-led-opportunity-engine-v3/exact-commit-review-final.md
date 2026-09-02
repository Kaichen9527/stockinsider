# Exact commit review: rate-safe encrypted official price recovery

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `34e66b3986e5a355b721d72502f05928797ed23c..bd6106f80c6001f29f8404859bcb2af823109b60` and reviewed tree `1719694e65362916ec0f463b2f4e727b8c4f4fe2`.
- Per-host request pacing, bounded burst pauses, exchange-specific failure cooldowns, retry behavior, incremental persistence, resumability, and fail-closed incomplete-target reporting.
- Operator transport boundary requiring an SSH-encrypted `127.0.0.1:43100` tunnel while preserving the public Nginx deny-all rule for `/api/internal/*`.
- Append-only instrument and trading-session authority verification beyond the PostgREST 1,000-row response cap.
- Existing hash-bound official response parsing, writer fencing, stock/session identity checks, idempotent writes, and candidate/Shadow behavior.

## Findings

- No P0/P1/P2 findings remain. The recovery operator cannot transmit the internal Bearer credential to the public HTTP endpoint: it accepts only the fixed local SSH tunnel URL and therefore reaches the Next.js loopback listener through encrypted SSH transport.
- TWSE and TPEx acquisition rates are isolated per host. TWSE receives a pause after every ten requests and a longer cooldown after network or HTTP failures; retries remain bounded.
- Verified pages are persisted after each stock rather than held until the entire universe finishes. A restart re-reads durable coverage and upserts idempotently; it cannot fabricate missing rows or mark incomplete coverage successful.
- Authority verification now paginates all append-only rows. Duplicate authority revisions can no longer hide a valid recent session or instrument behind the 1,000-row cap.
- No scoring threshold, target price, market session, non-official price source, actionable quota, or Nginx exposure is introduced.

## Verification

- Product correctness acceptance cases: 150/150 passed.
- Official response parser, trust-boundary, and pagination tests: 4/4 passed.
- TypeScript, ESLint, diff check, script syntax, and production Next.js build: passed.

## Evidence

- Final reviewed repair/tree: `bd6106f80c6001f29f8404859bcb2af823109b60` / `1719694e65362916ec0f463b2f4e727b8c4f4fe2`
- Full final range: `34e66b3986e5a355b721d72502f05928797ed23c..bd6106f80c6001f29f8404859bcb2af823109b60`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
