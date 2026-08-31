# Exact implementation review — completed-session candidate research safeguards

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, official roster
normalization, completed-session cutoff, scheduled-core isolation, fail-closed
research behavior, regression tests, and the unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `9aeee820e1be2c53775b2bf8286574f88e18552a` / `62b5c33a19b756e0be88995d6c19307d492fb30d`
- Full final range: `18c425b243e1c773ed9788b517bb1557d557103f..9aeee820e1be2c53775b2bf8286574f88e18552a`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The candidate scheduler now normalizes a source-created placeholder name from the
  official TWSE/TPEx stock roster before it requests the stock's historical bars.
  A temporary price-data outage therefore cannot expose a bare ticker as the company
  name in a fail-closed `found` card.
- The official roster remains the only name authority. This change does not infer a
  company name from social content, aliases, broker text, or an unverified source.
- A failed official-name database update still takes the existing per-stock
  fail-closed path; it cannot promote or reuse a stale `waiting` or `actionable`
  decision. Successful normalization is deliberately independent of price,
  valuation, technical, financial, and two-day confirmation outcomes.
- Candidate price bars are filtered to the latest completed official session before
  calculating technical features. A provisional or future feed date cannot create a
  stage snapshot, advance the two-adjacent-close streak, or be recorded as a shadow
  trading day.
- The VPS scheduled `core` run now skips the legacy seed/story recommendation batch.
  That batch stays available to manual `full` recovery, while its historical
  upsert fault cannot add a misleading non-critical failure to candidate research.
- The patch does not change lifecycle thresholds, valuation formulae, official
  calendar authority, source policy, publication semantics, or the non-fabricated
  30-trading-day shadow rule. Threads remains outside the scheduler and SLA.
- No schema change, direct table write bypass, unbounded source fan-out, public RPC
  grant, credential, or fallback pricing source was introduced.
- The ordering contracts prove normalization precedes the missing-price gate,
  technical bars are bound to completed official sessions, and scheduled core
  bypasses legacy recommendation work. Candidate/shadow tests, TypeScript, lint,
  production build, and diff hygiene passed on the exact subject. The protected
  product/runtime track remains responsible for complete graph verification.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and the next controlled production research cycle.
