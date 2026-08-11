# StockInsider V3.13 — Architecture Gate Round 13

## Subject identity

- Requirements evidence carrier: `790f2d63cee6d85a6a4823f0bdf6203d8c930f02`
- Subject tree: `4fefb62e09aa17e368c5dcae6c545a8096529519`
- Direct parent: `793701b9d26239530450ab8a4ae4650a3d61fdc7`
- Direct-parent tree: `e6b9a733e9033a7f5aeb4a08f713ee06875055e2`
- Requirements Round 130: `PASS P0=0 P1=0 P2=0`

## Verdict

`CHANGES_REQUIRED P0=0 P1=5 P2=0`

This was an independent, read-only, offline Sol XHigh architecture review. It did
not run tests, mutate the repository, or authorize any production operation.

## Findings

### SI-V313-AG13-P1-001 — Source-only Landing cards are not constructible

Shallow, deferred and dislocation candidates enter compact projection without a
fully cited Decision Brief, while the publication invariant required every source
signal to have one. A valid source-only item could therefore abort all projections.

Closure: define a closed `available | unavailable` Decision Brief union. Available
briefs require the complete cited three-thesis/three-risk payload; unavailable
briefs require an exact evidence blocker and no synthetic padding. Preserve
citations and navigable provenance in both states.

### SI-V313-AG13-P1-002 — Unchanged analysis discards current disclosure state

The unchanged-analysis path replaced the current decision with historical facts,
discarding price-only disclosure changes and preventing a new disclosure revision.

Closure: retain historical analysis/narrative authority while composing the
current decision, price and disclosure state. Generate a new Decision revision
when that disclosure payload changes, but retain analysis identity for heartbeat
only evaluations.

### SI-V313-AG13-P1-003 — Future reported facts can enter valuation

Neither append nor selection consistently bounded reported `period_end` by filing,
source and cutoff dates. A malformed future quarter could dominate point-in-time
selection and authorize a formal valuation early.

Closure: reject future reported periods at table, RPC, runtime and read-plane
boundaries, and fail migration rehearsal on incompatible existing rows.

### SI-V313-AG13-P1-004 — Gate ordering creates invalid wait envelopes

Technical wait-state selection preceded quality and market failures, producing
wait envelopes with blockers that Runtime, Web and SQL reject. Compact then
silently replaced a malformed present envelope with a generic unavailable result.

Closure: quality and market authority failures take precedence and emit one typed
unavailable envelope. A malformed present envelope fails closed; compact only
constructs missing authority when the envelope is absent.

### SI-V313-AG13-P1-005 — Negative half-tie rounding differs across layers

JavaScript `Math.round` and PostgreSQL numeric `round` disagree on negative half
ties, so an envelope accepted by Runtime/Web could be rolled back by SQL.

Closure: Runtime and Web use the canonical half-away-from-zero rule and share
positive/negative boundary fixtures with SQL.

## Limitations and authority

Evaluation governance may remain honestly blocked as
`blocked/non_fabricated_elapsed_cohorts_unavailable`. This review grants no
production migration, credential installation, runtime/source write, V3
activation, LINE/dispatch, ranking promotion, deployment, or rollback authority.
