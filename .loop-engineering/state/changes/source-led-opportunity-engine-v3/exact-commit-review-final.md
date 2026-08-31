# Exact commit review: stable official TWSE daily endpoint

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `14b8f6b7ffaf33e993c05279927dd202290ef767..f3c81f2d800946ecf1b8a8d7c862bcdd68e3ff43` and reviewed tree `6b1641236327e4d1d66f701a6fd7619324f85415`.
- `web/src/lib/tw-market.ts` and its regression tests only.
- TWSE daily-bar endpoint authority, machine-readability, response parsing, and fail-closed candidate behavior.

## Findings

- No P0/P1/P2 findings remain. The replaced endpoint is the official TWSE `exchangeReport/STOCK_DAY` JSON API; no browser challenge, session cookie, private API, or non-official provider is introduced.
- The VPS can obtain the same official per-stock data from this endpoint, while the previous `/rwd` path returns a CDN JavaScript anti-DDoS document that cannot be parsed as source data.
- The request continues through the bounded official-host pacing and circuit-breaker path, so the endpoint correction does not weaken failure isolation or permit request bursts.
- The regression test asserts that monthly price history calls use the stable endpoint and retain the symbol and JSON response parameters.

## Verification

- `node --experimental-strip-types --test web/src/lib/tw-market.test.ts`: 11/11 passed.
- `cd web && npm run typecheck`: passed.
- `cd web && npm run lint`: passed with 30 pre-existing warnings and zero errors.
- `npm run test:candidate-shadow-performance`: 29 TypeScript tests and 13 contract tests passed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 150/150 passed with no failed, skipped, or TODO tests.

## Evidence

- Final reviewed repair/tree: `f3c81f2d800946ecf1b8a8d7c862bcdd68e3ff43` / `6b1641236327e4d1d66f701a6fd7619324f85415`
- Full final range: `14b8f6b7ffaf33e993c05279927dd202290ef767..f3c81f2d800946ecf1b8a8d7c862bcdd68e3ff43`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`
