# Exact implementation review — bounded candidate acquisition and PIT reads

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `81864957633edb654d668b27cb2d8efca90313d7` / `0e91fe281afb870041f4ca657fadc683aeaff07c`
- Full final range: `3f8e8c62dc611f1a82e0045f027a7047990343e4..81864957633edb654d668b27cb2d8efca90313d7`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Candidate live revenue acquisition and its separation from durable official-history backfill.
- Point-in-time financial fact reads for the coverage batch and per-stock research path.
- Service-role permissions, bounded stock-set input, validation receipt selection, issuer-document structural proof, and fail-closed valuation behavior.

## Production evidence and reasoning

- The 2026-09-13 production cycle spent about forty-seven minutes in live acquisition because each candidate could scan sixteen 2.5-second monthly-revenue requests after durable history work had already run.
- The same cycle then saturated all four VPS CPUs with four concurrent `read_financial_facts_as_of` queries. The old set-returning RPC scanned the full financial fact plane before PostgREST applied each stock filter.
- The live lookup now covers four recent months, while the unchanged durable queue remains responsible for long-range evidence.
- The new service-role-only RPC accepts one to twenty stock UUIDs and applies `stock_id = ANY(p_stock_ids)` inside SQL before joining validation receipts and evaluating issuer-document structural proof. Existing point-in-time cutoffs and effective validation semantics are preserved.
- No source, valuation, stage-promotion, writer-identity, RLS, or fail-closed research gate is weakened.

## Verification

- `npx tsx --test src/lib/candidate-research.test.ts` — 26 passed, 0 failed.
- `npm run typecheck` — passed.
- `git diff --check 3f8e8c62dc611f1a82e0045f027a7047990343e4..81864957633edb654d668b27cb2d8efca90313d7` — passed.
- Manual SQL review of the bounded input, authority role, validation-receipt cutoff, structural-proof predicate, and caller contracts — passed.

This repair removes repeated deep HTTP scans and full-table PIT fact rescans from the publication-critical path while preserving complete official backfill and evidence requirements.
