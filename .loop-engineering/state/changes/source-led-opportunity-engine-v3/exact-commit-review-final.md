# Exact commit review: bounded market-evidence persistence retry

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `21bbb5000675fb4d0c15f9a0ebbbbd97993ec5e4..a1d3582f3d343a610f746cbf067a5842331a9700` and reviewed tree `e1c2bf40481dea75c5aab168b856c339f59d0116`.
- Official market-evidence history persistence after the verified calendar, price and retained-index backfills.
- PostgREST request size, retry boundaries, idempotency identity, prerequisite failure semantics and regression coverage.
- Candidate/shadow contract tests, full product correctness, TypeScript, ESLint and the production Next.js build.

## Findings

- No P0/P1/P2 findings remain.
- Official market history writes are bounded to 100 rows per request instead of 500, reducing transport and proxy body pressure.
- Only the exact idempotent `market,session_date` batch is retried, at most three attempts with bounded backoff. No non-idempotent operation is retried.
- Both returned PostgREST errors and rejected transport promises retain the named `official_market_history_write_failed` terminal reason.
- Valuation-history and market-evidence prerequisites now preserve distinct named failure boundaries instead of leaking a generic `TypeError: fetch failed`.
- No source policy, scoring threshold, valuation formula, target price, market regime, actionable quota or historical Shadow observation is changed.

## Verification

- Candidate, market, source, valuation and Shadow tests: 48/48 passed.
- Candidate/shadow contract tests: 17/17 passed.
- Product correctness: 150/150 passed.
- TypeScript and production Next.js build: passed.
- ESLint: passed with only the repository's pre-existing warnings.

## Evidence

- Final reviewed repair/tree: `a1d3582f3d343a610f746cbf067a5842331a9700` / `e1c2bf40481dea75c5aab168b856c339f59d0116`
- Full final range: `21bbb5000675fb4d0c15f9a0ebbbbd97993ec5e4..a1d3582f3d343a610f746cbf067a5842331a9700`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
