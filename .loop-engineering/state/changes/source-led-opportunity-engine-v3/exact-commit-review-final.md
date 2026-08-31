# Exact implementation review — candidate-first scheduled core pipeline

Date: 2026-08-31

Review authority: read-only review of the complete immutable diff, scheduled/manual
mode boundaries, candidate research data ownership, regression tests, and the
unchanged product/runtime graph.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `afcf5157725a9a4ad6b63cc18ec792b486e0518e` / `bab3889c04d098b5038c603cadf0199c5c054a4e`
- Full final range: `701a0e0749452b2126137c681ac699acf250b0ba..afcf5157725a9a4ad6b63cc18ec792b486e0518e`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- Scheduled `core` mode no longer runs the legacy fixed-seed ingestion batch or
  legacy revenue batch before candidate research. This removes duplicated work
  that previously consumed most of the production request deadline.
- Manual `full` mode still runs both legacy phases. The change therefore does not
  delete the compatibility workflow or silently change an operator-requested full
  rebuild.
- The candidate research cycle remains the scheduled owner for the complete recent
  source universe and obtains its own official price history, chip flows, revenue,
  EPS, valuation inputs, market regime, classification, publication, and shadow
  observation. Skipping legacy seed work does not omit a candidate input.
- Active-source refresh remains a separately scheduled and independently locked
  workflow. Threads remains disabled and outside the production SLA.
- The patch does not change `found`, `waiting`, or `actionable` thresholds, two-day
  confirmation, data-confidence requirements, last-good publication behavior, or
  the non-fabricated 30-trading-day shadow rule.
- The contract test proves the scheduled core path is candidate-first and the
  manual full path retains legacy ingestion and revenue behavior.
- Candidate/shadow contract tests, TypeScript, lint, production build, and diff
  hygiene passed on the exact subject. The protected product/runtime track remains
  responsible for the complete graph verification.
- The Opportunity V3 active graph is unchanged and all 31 PCR fulfillment rows
  remain bound to the reviewed tree.

## Closure

No P0, P1, or P2 code finding remains. The subject is ready for protected checks,
rebase merge, atomic VPS release, and a controlled production research cycle.
