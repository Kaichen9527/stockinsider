# Exact implementation review — financial backlog throughput v13

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `47f96b9852d255903c420eb7807ca58e34a8f717` / `faacabbb3409f3991ecf8a5813bd639a135e3bf7`
- Full final range: `fd687e5ffa689fa39a18e66f259f236dff2f699c..47f96b9852d255903c420eb7807ca58e34a8f717`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The internal candidate-financial drain request ceiling increases from 20 to 240 queued work items per invocation.
- The acquisition implementation still caps each TPEx endpoint claim at 60 and MOPS network work at two concurrent requests; the change raises backlog throughput without raising per-provider concurrency.
- The VPS queue-drain service adopts the new batch size while retaining its 900-second request timeout and the shared production writer file lock.
- Provider transports, financial validation admission, accounting rules, valuation methods, classification thresholds, grants, and writer identity are unchanged.

## Security and correctness reasoning

- The endpoint remains protected by exact internal bearer authentication and the active VPS writer lease.
- The request body remains closed to the single integer `limit`; values outside 1–240 are rejected.
- Existing bounded official transports, response-size limits, provider timeouts, durable job leases, retry accounting, and per-item terminal outcomes remain authoritative.
- Larger batches do not bypass validation: transport and parsing success still cannot mark financial facts verified without the existing provenance and accounting checks.
- The production write lock prevents the expanded batch from overlapping source, market, research, or publication writers.

## Verification

- Taiwan data provider contract tests: 10 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- TypeScript passed; ESLint passed with 33 pre-existing warnings and zero errors.
- `git diff --check fd687e5ffa689fa39a18e66f259f236dff2f699c..47f96b9852d255903c420eb7807ca58e34a8f717` passed.
- The preceding v12 production canary completed a 20-job financial batch with 88 facts written and no acquisition or validation failure, establishing the provider transport used by the expanded batch.

This review covers the exact implementation commit. Deployment, expanded-batch production drain, research publication, and the seven-day Supabase read-only observation remain separately measured rollout gates.
