# Exact commit review: batch candidate price history from official TWSE market data

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `14b8f6b7ffaf33e993c05279927dd202290ef767..ff92727c6d7096eca1d53b31934c35638c85b4ba` and reviewed tree `5dc8e54d6382c2ba408049b2bcb46f2dd1da5c78`.
- `web/src/lib/tw-market.ts`, `web/src/lib/candidate-research.ts`, and the focused regression tests only.
- Official endpoint authority, one-request-per-session caching, TWSE/TPEx routing, CDN challenge handling, and candidate fail-closed behavior.

## Findings

- No P0/P1/P2 findings remain. Candidate research supplies its authoritative completed-session calendar and reads TWSE price bars from the official all-stock `exchangeReport/MI_INDEX` JSON response once per session, shared across the entire in-process universe.
- The change avoids the JavaScript-gated per-symbol `/rwd` path without browser automation, cookies, private APIs, third-party prices, or unauthenticated HTTP.
- TPEx symbols retain their official TPEx monthly endpoint path; an empty TWSE all-stock result cannot fabricate a TWSE price for them.
- HTTP 428 CDN challenge responses now count as retryable source failure. The host circuit opens after the bounded threshold, rather than silently treating a challenge document as a stock-specific data absence.
- Regression tests cover all-stock endpoint selection, shared session data parsing, and CDN challenge circuit behavior. Host serialization remains in place.

## Verification

- `node --experimental-strip-types --test web/src/lib/tw-market.test.ts`: 12/12 passed.
- `cd web && npm run typecheck`: passed.
- `cd web && npm run lint`: passed with 30 pre-existing warnings and zero errors.
- `npm run test:candidate-shadow-performance`: 30 TypeScript tests and 13 contract tests passed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 150/150 passed with no failed, skipped, or TODO tests.

## Evidence

- Final reviewed repair/tree: `ff92727c6d7096eca1d53b31934c35638c85b4ba` / `5dc8e54d6382c2ba408049b2bcb46f2dd1da5c78`
- Full final range: `14b8f6b7ffaf33e993c05279927dd202290ef767..ff92727c6d7096eca1d53b31934c35638c85b4ba`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`
