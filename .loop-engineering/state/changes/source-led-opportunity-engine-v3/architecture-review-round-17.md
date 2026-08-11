# StockInsider V3.14 — Fresh Architecture Gate Round 17

## Subject identity

- Subject commit: `d1ea2701ad46d21711da7fd4441c03be57ac25ad`
- Subject tree: `71700c03641ab3ddcc80ec17aaca17aaa40e24b6`
- Requirements evidence: `requirements-review-round-137.md`
- Review worktree/index: clean

## Verdict

`CHANGES_REQUIRED P0=0 P1=2 P2=0`

The data plane, bounded worker DAG, last-good compatibility adapter, decision
authority and migration schemas are coherent. Two release-boundary gaps prevent an
operable production architecture.

## Findings

1. **P1 — production migration had no reviewed executable seam.** The V3.14 status
   authorizes the additive four-file chain, but `db:v3:plan` returned
   `operator_must_supply_reviewed_dedicated_apply_procedure`. An operator therefore
   had to improvise credential handling, exact commit binding, attestation checks,
   ordering, locking and postconditions outside the reviewed tree.
2. **P1 — Web/runtime release identity was not an executable rollout invariant.**
   Web correctly disables action authority unless
   `STOCKINSIDER_REVIEWED_RELEASE_SHA` and
   `STOCKINSIDER_RUNTIME_MANIFEST_SHA256` equal the producer projection, but neither
   value nor the coordinated Web/runtime rollback order appeared in the active
   runbook. Following the documented procedure would leave every fresh V3.14 card
   read-only after a nominally successful deployment.

## Required closure

Add a clean-tree, direct-child-attestation, authority-bound and Keychain-only
migration CLI for the exact four-file additive chain. Make the migration plan name
that command. Document and test the exact Web release variables, two terminal
producer runs and coordinated alias/runtime/scheduler rollback. Review the resulting
new immutable tree independently.

No production state changed during this review.
