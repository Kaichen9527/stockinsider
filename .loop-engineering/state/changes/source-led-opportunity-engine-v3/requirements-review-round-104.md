# Fresh Requirements Review Round 104

- Reviewer: independent ephemeral Sol XHigh read-only session
- Subject commit: `92c30b7d59905700ce1908100ea913591f9b9346`
- Subject tree: `d9d49aca1c975636792f6b74818d34aaaf1d5b8d`
- Baseline commit: `1b714a4303c2a97ebb913dced8d9d607a4ac8951`
- Verdict: `CHANGES_REQUIRED`
- Findings: `P0=0`, `P1=6`, `P2=0`

## P1 findings

1. Active public/detail contracts still declare acceptance `1.44.6`; canonical V3.13 authority is `1.45.0`, 308 total and 260 product/runtime cases.
2. `evaluatedAt` is included in `decisionRevisionId`, and the production compact stage does not receive prior projections or material-change disposition, so a no-change heartbeat rewrites identity.
3. NAV and loss-company EV methods are not constructible through `valuationAuthorityInput`; their protected fixture bypasses the production builder.
4. DI-008 parses official rows separately from a database test that synthesizes its own rows; parser output does not traverse job completion, persistence and the later adjusted read.
5. Source processing lacks conserved per-document, per-claim and per-entity terminal outcomes for no-claim and rejection paths.
6. `/stock/{symbol}?decisionRevisionId=...` performs legacy refresh/deep-dive lookup before revision selection, while browser acceptance bypasses the route and the brief manufactures filler thesis/risk text.

## Gate disposition

The schedule-selection and sole-envelope-fallback classes from Round 103 are closed. Architecture review is blocked until all six findings are repaired in a new immutable tree and protected production-path regressions pass.
