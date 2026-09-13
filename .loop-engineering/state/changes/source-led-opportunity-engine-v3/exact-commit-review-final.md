# Exact implementation review — bounded candidate acquisition, PIT reads, and fact binding

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `d05db9f08fadc4ffcb7f59a4ee452ae5ddb3478c` / `b13ce08ebd2d10d1fad0b328e299f4a2423aad36`
- Full final range: `3f8e8c62dc611f1a82e0045f027a7047990343e4..d05db9f08fadc4ffcb7f59a4ee452ae5ddb3478c`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Candidate live revenue acquisition and its separation from durable official-history backfill.
- Point-in-time financial fact reads for the coverage batch and per-stock research path.
- Service-role permissions, bounded stock-set input, validation receipt selection, issuer-document structural proof, and fail-closed valuation behavior.
- Candidate detail fact revision binding when the historical fact store contains duplicate rows for the same fact identity.

## Production evidence and reasoning

- The 2026-09-13 production cycle spent about forty-seven minutes in live acquisition because each candidate could scan sixteen 2.5-second monthly-revenue requests after durable history work had already run.
- The same cycle then saturated all four VPS CPUs with four concurrent `read_financial_facts_as_of` queries. The old set-returning RPC scanned the full financial fact plane before PostgREST applied each stock filter.
- The live lookup now covers four recent months, while the unchanged durable queue remains responsible for long-range evidence.
- The new service-role-only RPC accepts one to twenty stock UUIDs and applies `stock_id = ANY(p_stock_ids)` inside SQL before joining validation receipts and evaluating issuer-document structural proof. Existing point-in-time cutoffs and effective validation semantics are preserved.
- Candidate detail binding now collapses duplicate historical rows by stable fact identity. It still verifies that every requested identity is present and fails closed when any required fact is genuinely absent.
- No source, valuation, stage-promotion, writer-identity, RLS, or fail-closed research gate is weakened.

## Verification

- `npx tsx --test src/lib/candidate-research.test.ts` — 27 passed, 0 failed.
- `npm run typecheck` — passed.
- `git diff --check 3f8e8c62dc611f1a82e0045f027a7047990343e4..d05db9f08fadc4ffcb7f59a4ee452ae5ddb3478c` — passed.
- Manual SQL review of the bounded input, authority role, validation-receipt cutoff, structural-proof predicate, fact-identity completeness check, and caller contracts — passed.

This repair removes repeated deep HTTP scans, full-table PIT fact rescans, and false detail failures caused by duplicate historical rows while preserving complete official backfill and evidence requirements.
