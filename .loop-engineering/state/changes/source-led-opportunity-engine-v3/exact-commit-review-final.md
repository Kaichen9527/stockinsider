# Exact implementation review — VPS caller and official valuation recovery

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, the VPS
systemd call boundary, official-market request controls, point-in-time multiple
history, valuation provenance, stale-data gates, regression tests, and the
unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `ead9730c42d717cf27edd73fa38dd10e55f3fc17` / `2cf50d576da532804fb42c0cffb2f2624bc4a7b7`
- Full final range: `74648b0fa75588b3dd2ae9f27877e229332b01be..ead9730c42d717cf27edd73fa38dd10e55f3fc17`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The internal caller replaces Node fetch's independent five-minute response
  header deadline with the configured absolute deadline. It retains exact
  canonical-origin and bearer validation, finite expiry, JSON validation, and
  fail-closed non-2xx/terminal handling.
- The research cycle now loads the official trading calendar and samples five
  years of monthly PE/PB evidence. TWSE daily all-stock data is supplemented by
  the official per-stock monthly history where the daily surface has shorter
  retention; TPEx uses its official daily historical table. No publisher HTML,
  unlicensed quote library, inferred historical multiple, or future value enters
  the distribution.
- The formerly misaligned node-twstock value parser is removed from candidate
  valuation and replaced globally by the exchange panels. Historical database
  rows are accepted only when their source URL identifies those official panel
  endpoints, preventing the previously misparsed dividend year from becoming PE.
- TWSE's published PE formula permits a current exchange-implied trailing EPS
  driver when a separately parsed MOPS EPS is unavailable. The evidence ledger
  labels that driver explicitly; a reported EPS, when present, is conservatively
  capped by the exchange-implied value. Missing PE and earnings still produce no
  target.
- Official calls use bounded concurrency, per-host pacing, retry only for
  transient/WAF responses, and per-request deadlines. One stock's unavailable
  history remains isolated; fewer than eight valid historical samples cannot
  create a valuation.
- A valuation observation must match the same latest official market session as
  price before data freshness can pass or an actionable stage can retain
  authority. Stale valuation evidence remains visible but fail-closed.
- Regression tests cover long-call success/deadline behavior, TWSE and TPEx panel
  parsing, ROC-date normalization, exchange-implied earnings, insufficient data,
  and conservative scenario math. Candidate/shadow contracts, TypeScript, lint,
  production build, and diff hygiene passed on the exact subject.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and a controlled candidate research retry.
