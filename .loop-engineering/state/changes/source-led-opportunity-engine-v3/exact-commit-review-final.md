# Exact commit review: bounded candidate fundamental history reads

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `bdbcaff1396afcca568e5add5741bbaa3b022a4c..7fd3f7f88d8be568acb3467c7b00229258edcd88` and reviewed tree `97581d7c5480398c04f63c994a39a07355c24e10`.
- Candidate five-year fundamental and official multiple history reads across PostgREST URL and 1,000-row response limits.
- Batch bounds, pagination, deterministic ordering, error semantics, scoring invariants and Shadow accounting.
- Candidate/shadow contracts, full product correctness, TypeScript, ESLint and the production Next.js build.

## Findings

- No P0/P1/P2 findings remain.
- The production canary passed the repaired 1,320-session calendar read, then rejected a single large `stock_id in (...)` fundamental-history query with `Bad Request` / `fetch failed`.
- The repaired reader limits each request to 20 stock identifiers and independently paginates each response, preserving all available 60-month evidence without constructing an oversized URL.
- Each batch retains stable `stock_id,as_of_date` ordering, the five-year point-in-time bounds, and official-source filtering at the consumer boundary.
- Transport and PostgREST failures now retain the named `candidate_fundamental_history_read_failed` prerequisite reason.
- No source policy, scoring threshold, valuation formula, target price, market regime, actionable quota or historical Shadow observation is changed.

## Verification

- Candidate, market, source, valuation and Shadow tests: 51/51 passed.
- Candidate/shadow contract tests: 17/17 passed.
- Product correctness: 150/150 passed.
- TypeScript and production Next.js build: passed.
- ESLint: passed with only the repository's pre-existing warnings.

## Evidence

- Final reviewed repair/tree: `7fd3f7f88d8be568acb3467c7b00229258edcd88` / `97581d7c5480398c04f63c994a39a07355c24e10`
- Full final range: `bdbcaff1396afcca568e5add5741bbaa3b022a4c..7fd3f7f88d8be568acb3467c7b00229258edcd88`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`
