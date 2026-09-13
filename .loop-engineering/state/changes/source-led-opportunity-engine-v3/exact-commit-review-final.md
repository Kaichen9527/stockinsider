# Exact implementation review — candidate live revenue acquisition

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3e57075fc0607bdba818ffd42cc633d590521696` / `de5049cf7e478f8df2fb70a716d2809d24929186`
- Full final range: `3f8e8c62dc611f1a82e0045f027a7047990343e4..3e57075fc0607bdba818ffd42cc633d590521696`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Candidate research live revenue acquisition and its separation from durable official-history backfill.
- Point-in-time valuation behavior when the live lookup is empty or the official endpoint times out.
- The structural regression test that prevents the daily publication lane from returning to a sixteen-month per-stock scan.

## Production evidence and reasoning

- The 2026-09-13 production cycle spent about forty-seven minutes in live per-candidate acquisition after its durable financial and historical queues had already run.
- `fetchTwStockRevenue(symbol, 16)` can attempt sixteen 2.5-second official requests for each candidate. With 280 candidates and four-way concurrency, this duplicated historical work and consumed most of the bounded pipeline deadline.
- The durable financial acquisition and candidate history backfill remain unchanged and continue to own multi-period evidence. The live lookup still covers four recent months, which is sufficient for ordinary publication lag and returns null rather than inventing a value when no official row is available.
- No valuation, source, stage-promotion, writer-identity, or fail-closed gate is weakened.

## Verification

- `npx tsx --test src/lib/candidate-research.test.ts` — 26 passed, 0 failed.
- `npm run typecheck` — passed.
- `git diff --check 3f8e8c62dc611f1a82e0045f027a7047990343e4..3e57075fc0607bdba818ffd42cc633d590521696` — passed.
- Manual review of the live/durable responsibility boundary, timeout behavior, and null-data valuation path — passed.

This repair removes repeated deep scanning from the publication-critical path while preserving complete official backfill and evidence requirements.
