# V3.16.2 fresh Architecture activation-window evidence

Date: 2026-08-15
Review authority: fresh Architecture Round 54, independently reviewing the
Requirements Round 173 carrier and activation-window repair.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf`
- Implementation commit: `97f99ffd3505cb915716633cadd2b17c19cb658d`
- Requirements evidence carrier: `9e8769736af17205ccb7beab6e452c64cec145f1`
- Requirements carrier tree: `1468d79094ad8ea61f21945a8ebdc4b295906c9c`
- Full reviewed implementation/evidence range: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf..9e8769736af17205ccb7beab6e452c64cec145f1`

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

The 20-symbol price and 252-session authority bounds are unchanged. No new scheduler,
RPC, public mutation surface, provider, decision heuristic, action quota or release
compatibility path is introduced. Requirements Round 173 is PASS at
P0=0/P1=0/P2=0, `git diff --check` passes, and product correctness is `106/106`.
The protected gate must still run all authoritative tracks against this exact carrier.
Evaluation governance remains honestly blocked for non-fabricated elapsed cohorts
and is not treated as evidence of future returns.
