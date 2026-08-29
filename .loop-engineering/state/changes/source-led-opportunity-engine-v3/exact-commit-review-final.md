# V3.20 exact repair diff review — compact projection SSR fallback

Date: 2026-08-30

Review authority: independent, read-only review of the bounded V3.20 web
repair. It records no production database, runtime scheduler, source,
credential, LINE, dispatch, automatic-trading, Promotion, or
evaluation-governance change.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `a9a773e71dd3ca636ee66844cd62230541ceae16` / `7a4c2088d446c8523111d9052c079c9f1c1e972c`
- Focused repair range: `c00f4b321a45aef3650f8752e7820306628e51f3..a9a773e71dd3ca636ee66844cd62230541ceae16`
- Previous V3.20 implementation/tree: `c00f4b321a45aef3650f8752e7820306628e51f3` / `cf523950610d7a4e8c9980c57ad8183a84eaaed1`

## Review result

- The reviewed deployment reproduced a server-side rendering failure when a
  compact V3.20 radar payload omitted the legacy `agentStatus` and
  `connectorStatus` diagnostics. Radar API reads remained valid, but the
  homepage dereferenced `agentStatus.lastSuccessfulRunAt` and returned HTTP
  500.
- The repair supplies local, read-only null/empty fallbacks only at the legacy
  presentation boundary. It preserves all radar cards and does not invent a
  runtime result, connector result, investment action, valuation, or source.
- The regression asserts both fallbacks and rejects future direct accesses to
  either optional legacy field. Focused source-led tests (63/63), the complete
  product-correctness suite (150/150), typecheck, lint, and production build
  passed on this exact tree.

## Closure

No P0, P1, or P2 finding remains. The normal protected Code Gate remains the
authority for merge eligibility. This repair does not change KOL-first
nomination authority or relax the blocked non-fabricated evaluation-governance
state.
