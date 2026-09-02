# Exact commit review: verified official price backfill bridge and cache-first refresh

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `3da5531ee84c4005ef1c27f84aaf2320632676c5..30f4f596cf42c3f2d19da4edbe7722f398b603e4` and reviewed tree `ead6d6d359b0bf8bdb5930c79c99da54a1c8d2a6`.
- Internal operator route, official TWSE/TPEx response parsing, official URL and schema validation, response and batch SHA-256 binding, active writer fencing, stock/session authority checks, idempotent persistence, and the bounded local acquisition script.
- Candidate price refresh selection after durable authority/cache reads, including full recovery below 240 sessions, bounded five-session refresh for stale complete histories, and no network refresh when current.
- Credential handling, request size and batch bounds, duplicate/conflict behavior, OHLC geometry, trading-lot normalization, point-in-time availability, and production-only origin constraints.
- Existing candidate research, valuation fail-closed rules, market evidence, publication, stage classification, and Shadow v2 behavior.

## Findings

- No P0/P1/P2 findings remain. The VPS never trusts caller-supplied OHLCV: it accepts hash-bound raw official JSON pages and derives the rows server-side after checking the exact exchange host, path, symbol, month, response status, and field schema.
- Writes require internal authentication, the currently active 40-character production writer release, active official common-stock identities, and completed official sessions. The route is bounded to 30 pages, 750 derived rows, 2 MB, and rejects conflicting duplicates.
- The operator is a one-time bounded recovery path for an exchange CDN block on the VPS IP. It reads the frozen Shadow v2 manifest, uses only official TWSE/TPEx HTTPS endpoints, never prints credentials, posts only to the canonical VPS, and does not become a scheduler or alternate database writer.
- The research cycle now reads persisted official history before deciding network depth. Complete current histories perform no redundant history fetch; stale complete histories request only five official sessions; incomplete histories retain the full recovery path and remain fail-closed below 240 sessions.
- Existing price rows remain additive and idempotent. No threshold, score, target price, synthetic session, fallback price provider, or actionable quota is introduced.

## Verification

- Product correctness acceptance cases: 150/150 passed.
- Candidate dossier, research, risk-action, valuation-policy, market-evidence, and Shadow v2 tests: 17/17 passed.
- Focused official response parser and trust-boundary tests: 3/3 passed.
- TypeScript, ESLint, diff check, and production Next.js build: passed.

## Evidence

- Final reviewed repair/tree: `30f4f596cf42c3f2d19da4edbe7722f398b603e4` / `ead6d6d359b0bf8bdb5930c79c99da54a1c8d2a6`
- Full final range: `3da5531ee84c4005ef1c27f84aaf2320632676c5..30f4f596cf42c3f2d19da4edbe7722f398b603e4`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
