# Exact commit review: official market host serialization

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `4970aa3c1c7fecb907e000ced67f4bb9b36ab831..07c556f5bbb4c9371e13310e314a3ffc15e5d564` and reviewed tree `ec40152cb287861ae7a7c6931433e70ddf7b5eea`.
- `web/src/lib/tw-market.ts` and its regression tests only.
- Official-host request ordering, retryable versus non-retryable terminal handling, circuit-breaker conservation, response parsing, and candidate fail-closed behavior.

## Findings

- No P0/P1/P2 findings remain. The per-host lease now spans the complete request, so queued TWSE calls cannot burst concurrently after only their start times have been paced.
- A circuit opened by three consecutive retryable failures remains authoritative for requests that were queued before it opened; a queued request can no longer clear that circuit without a real completed host response.
- A completed successful or non-retryable response still resets the consecutive-failure counter. A single transient error therefore does not suppress the next reachable stock.
- The change adds focused regression coverage for a queued open circuit and same-host serialization, in addition to the existing transient and non-retryable response coverage.

## Verification

- `node --experimental-strip-types --test web/src/lib/tw-market.test.ts`: 10/10 passed.
- `cd web && npm run typecheck`: passed.
- `npm run test:candidate-shadow-performance`: 28 TypeScript tests and 13 contract tests passed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 150/150 passed with no failed, skipped, or TODO tests.

## Evidence

- Final reviewed repair/tree: `07c556f5bbb4c9371e13310e314a3ffc15e5d564` / `ec40152cb287861ae7a7c6931433e70ddf7b5eea`
- Full final range: `4970aa3c1c7fecb907e000ced67f4bb9b36ab831..07c556f5bbb4c9371e13310e314a3ffc15e5d564`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`
