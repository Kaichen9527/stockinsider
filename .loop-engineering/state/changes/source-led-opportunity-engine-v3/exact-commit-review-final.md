# Exact implementation review — Taiwan official market endpoints

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `643973f585853756220d95ff677d1384d3cd6b40` / `0ebc64333a22ac8a1d22350e3a4295c4b4c04b43`
- Full final range: `62562d7ec0b97285f2285e7e009ff86797394637..643973f585853756220d95ff677d1384d3cd6b40`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed both changed files against the protected base. The four final-market jobs were blocked by retired endpoint identities: TWSE legacy routes returned redirects and the old TPEx valuation/index routes returned 404.
- TWSE datasets now use the canonical `rwd/zh` routes. TPEx exchange-wide valuation and index datasets use the official OpenAPI endpoints documented by the exchange.
- TPEx top-level arrays remain bounded by the existing two-megabyte response limit, are stored as object-shaped durable attempts, and are promoted only after the requested official trading date and required fields are present.
- Compact ROC and Gregorian dates are normalized explicitly. A response for another trading day is rejected rather than relabelled, and FinMind remains an identified fallback rather than being presented as official exchange evidence.
- The targeted provider tests passed 15/15; TypeScript, lint with zero errors, and the full production build passed. A live official smoke for 2026-09-11 returned 1,080 TWSE valuation rows, 9 TWSE index rows, 885 TPEx valuation rows and 1 TPEx index row, all with HTTP 200 and complete canonical output.
- No write authorization, credential destination, database schema, source policy or scheduler boundary changed. No unresolved P0, P1 or P2 finding remains.

## Production boundary

This review authorizes the official Taiwan market endpoint repair only after all protected checks pass and the PR is merged normally. Ruleset `20177392` remains enabled.
