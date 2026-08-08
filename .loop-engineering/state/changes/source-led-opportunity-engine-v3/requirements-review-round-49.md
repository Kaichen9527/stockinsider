# Requirements Review — Round 49

Date: 2026-07-24
Verdict: `CHANGES_REQUIRED`

This is a fresh read-only requirements audit of the user-approved hybrid plan and the implementation worktree. It does not inherit an earlier approval.

## Blockers

1. `P0` — Source linking and duplicate handling were not semantic. The worker extracted bare four-digit tokens, lacked exact active-alias context handling, treated year-like values as tickers, and emitted every claim as unique.
2. `P0` — Several DAG read bodies were incompatible with the worker or returned hard-coded placeholders instead of database-derived bounded inputs.
3. `P0` — Factor and sector selectors did not construct the four chip inputs, breadth, market benchmarks, or sector/candidate excess returns required by the scoring contract.
4. `P0` — Outcome/evaluation did not bind adjusted-price evidence to entry and maturity authority, did not construct identical V3/legacy cohorts, and left all promotion measures unavailable.
5. `P0` — The 266-case acceptance claim was not meaningful: many cases were token/regex checks or unique wrapper functions around shared generic checks rather than case-specific runtime or applied-database scenarios.
6. `P1` — Analyst and broker observations lacked immutable estimate kind/horizon and discarded institution identity and selection disposition before deep valuation.
7. `P1` — Blinded link-review submission accepted caller-selected slots and did not enforce database-owned assignment, sequence, disagreement, and adjudication rules.
8. `P2` — `status.json` described obsolete migration-catalog gaps and review rounds.

## Required repair sequence

- Repair runtime semantics and immutable input schemas without weakening any acceptance requirement.
- Demonstrate non-empty applied PostgreSQL execution and TypeScript worker compatibility.
- Replace claimed semantic acceptance evidence with case-specific runtime/applied-database evidence; classify pure graph/inventory checks only as structural/meta.
- Re-run an independent fresh Requirements review. Architecture review remains locked until Requirements passes.
