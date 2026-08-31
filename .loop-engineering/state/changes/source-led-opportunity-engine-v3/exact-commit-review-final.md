# Exact implementation review — normalize official names before research gates

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, official roster
normalization order, fail-closed research behavior, regression tests, and the
unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `9f4715e0caec63f92310186b241c7ae613e8f89a` / `f452a5b9991f1b8c1068601fcfb1d87560857914`
- Full final range: `18c425b243e1c773ed9788b517bb1557d557103f..9f4715e0caec63f92310186b241c7ae613e8f89a`
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
- The patch does not change lifecycle thresholds, valuation formulae, official
  calendar behavior, source policy, publication semantics, or the non-fabricated
  30-trading-day shadow rule. Threads remains outside the scheduler and SLA.
- No schema change, direct table write bypass, unbounded source fan-out, public RPC
  grant, credential, or fallback pricing source was introduced.
- The ordering contract proves normalization precedes the missing-price gate.
  Candidate/shadow tests, TypeScript, lint, production build, and diff hygiene
  passed on the exact subject. The protected product/runtime track remains
  responsible for complete graph verification.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and the next controlled production research cycle.
