# V3.16.2 fresh Architecture activation-window evidence

Date: 2026-08-15
Review authority: fresh Architecture Round 57, independently reviewing the
Requirements Round 176 carrier and complete activation-window repair closure.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf`
- Requirements implementation commit: `c30727c03f3b9d81bf32a6decea0ce82780e6151`
- Requirements evidence carrier: `4296c551abfc967387ef9a7f6a0af75c14ff9186`
- Final repair-closure commit/tree: `4296c551abfc967387ef9a7f6a0af75c14ff9186` / `c15141174d88aaf93aff6f2051d88d2f68b840bb`
- Full reviewed implementation range: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf..4296c551abfc967387ef9a7f6a0af75c14ff9186`
- Active graph: `71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d`

## Architecture closure

The repair preserves the sole launchd owner, owner-only activation lock, captured
rollback package, fsynced activation journal and exact reviewed runtime pointer. It
extends only the finite period in which the installer observes the one-shot owner.
The wait performs no long-lived database transaction and grants no additional
database authority.

Database-clock leases remain independent and must be renewed by the worker-thread
heartbeat. A lost lease, missing pulse, worker error or nonzero launchd exit continues
to fail closed. If the owner is still nonterminal at 14,400 seconds, the same
`scheduler_activation_failed` inverse restores the captured scheduler and runtime.
Immutable ingestion chunks stay bound to run, job, cutoff, ordinal, hash and producer
SHA, so interruption and later resume cannot reinterpret or duplicate provider data.

The 20-symbol/260-retained-session price and 252-session valuation authority bounds
are unchanged. Runtime-installation v1.13 is consistently owned by its header,
catalog and every active cross-contract edge; catalog identity tags and the frozen
active graph resolve to the same reviewed subject. No new scheduler,
RPC, public mutation surface, provider, decision heuristic, action quota or release
compatibility path is introduced. Requirements Round 176 is PASS at
P0=0/P1=0/P2=0, `git diff --check` passes, and product correctness is `106/106`.
The protected gate must still run all authoritative tracks against this exact carrier.
Evaluation governance remains honestly blocked for non-fabricated elapsed cohorts
and is not treated as evidence of future returns.
