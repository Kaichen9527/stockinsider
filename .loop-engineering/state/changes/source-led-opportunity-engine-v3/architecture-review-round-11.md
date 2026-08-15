# V3.16.2 fresh Architecture activation-window evidence

Date: 2026-08-15
Review authority: fresh Architecture Round 56, independently reviewing the
Requirements Round 175 carrier and activation-window repair closure.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf`
- Requirements implementation commit: `d67041c422bb1c73b1af9c8a3ade611fa2041b49`
- Requirements evidence carrier: `18d7f075720f4df23a1e51ae4ee4c9488fd172f9`
- Final repair-closure commit/tree: `18d7f075720f4df23a1e51ae4ee4c9488fd172f9` / `51f60257a916dd54440e5f313a40640023087133`
- Full reviewed implementation range: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf..18d7f075720f4df23a1e51ae4ee4c9488fd172f9`
- Active graph: `b01991fd587c395c20438b824aa23f5e84b851ee0a5f46cbc2a00fd79419fbc8`

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
are unchanged. No new scheduler,
RPC, public mutation surface, provider, decision heuristic, action quota or release
compatibility path is introduced. Requirements Round 175 is PASS at
P0=0/P1=0/P2=0, `git diff --check` passes, and product correctness is `106/106`.
The protected gate must still run all authoritative tracks against this exact carrier.
Evaluation governance remains honestly blocked for non-fabricated elapsed cohorts
and is not treated as evidence of future returns.
