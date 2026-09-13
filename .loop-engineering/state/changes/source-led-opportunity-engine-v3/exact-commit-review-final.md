# Exact implementation review — bounded candidate run finalization

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3879f770bb151b04a62d6017ce9c2753cc1c4dc2` / `bb4b6b9bd55570984d32ef08e5337c55c34df584`
- Full final range: `04a60c39e240760aded34e026e825f851e5c1907..3879f770bb151b04a62d6017ce9c2753cc1c4dc2`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Final candidate research run status and summary persistence.
- Separation between the canonical per-stock item ledger and bounded run-level operational aggregates.
- Preservation of market, acquisition, validation, cutoff, and remediation summary evidence.

## Production evidence and reasoning

- Production run `8ae8f602-37c4-4717-97d0-65aa09a1e0c1` wrote all 280 canonical item rows, then the final run-row PATCH received HTTP 413 because it duplicated every item's full metrics inside one JSONB summary.
- Per-stock evidence remains stored in `candidate_research_run_items`; the run row now stores only counts grouped by status, terminal reason, lifecycle stage, valuation status, and financial gap.
- The change does not delete or truncate the canonical item ledger and does not weaken evidence, valuation, stage, market, or fail-closed gates.
- The aggregate payload is bounded by finite category vocabularies and remains useful for operations without exceeding the private PostgREST proxy request limit.

## Verification

- `npx tsx --test src/lib/candidate-research.test.ts` — 28 passed, 0 failed.
- `npm run typecheck` — passed.
- `git diff --check 04a60c39e240760aded34e026e825f851e5c1907..3879f770bb151b04a62d6017ce9c2753cc1c4dc2` — passed.
- Manual review of run finalization, item-ledger authority, aggregate cardinality, and error handling — passed.

This repair lets a full candidate cohort reach a truthful terminal run status without copying its detailed evidence into an oversized request.
