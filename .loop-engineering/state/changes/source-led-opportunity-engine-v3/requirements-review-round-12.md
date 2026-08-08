# Requirements Gate Review — Round 12

- Reviewer: fresh independent `gpt-5.6-sol`, `xhigh`, read-only session
- Reviewer session: `019f76db-7389-7513-a169-3578d4c2e616`
- Date: 2026-07-19 (Asia/Taipei)
- Reviewed range: `12c131aa50ca53268878e9f025973533ac100c49..88f4271f120f6ef345b292bec5d440fbc2f953fd`
- Verdict: `CHANGES_REQUIRED`
- Counts: `P0=0 P1=2 P2=0`
- Worktree at review: clean
- Architecture Gate performed: no

## Findings

1. **P1 — Public `asOf` status and warning projection is not point-in-time closed.** Attempt selection filters only `createdAt <= asOf`, then consumes each row's current mutable status and completed-stage metadata without requiring `terminalAt` or metadata completion time at/before `asOf`. An attempt created before cutoff T but terminalized after T can therefore appear successful/failed—or contribute later-completed warnings—to a projection nominally evaluated at T. The artifacts also do not decide how a request-specific `asOf` can differ from the immutable canonical payload bytes written before finalization. The contract requires exact historical visibility or immutable transition evidence, an explicit stored-run-payload versus request-envelope rule, and an executable post-cutoff-terminalization case.
2. **P1 — The exact valuation-verification expiry boundary lacks executable acceptance coverage.** The contract correctly requires `sourceCutoff < expiresAt` and states that an approval exactly 30 days old is expired, but the inventory does not require immediately-before, equality, and immediately-after fixtures. An implementation using `sourceCutoff <= expiresAt` could pass while retaining approval authority one instant too long.

## Independently Confirmed Closed

- The exact eleven-key adapter registry, revision-family collapse, post-collapse sentinel/count/cap and resumable roots are closed and covered.
- Discovery identity manifests and static funnel-policy hashes have distinct, correct comparison-key effects.
- Official roster alias seeding and signed manual alias approval use separate exact routes and principals.
- Prepare/seal ownership, atomic convergence, canonical/attempt identities and internal cleanup are exact.
- V3 detail has one exact 404 object, same-run isolation and exactly three ordered horizons.

## Inventory Validation

- Canonical version: `1.11.0`
- Declared/actual/unique cases: `167/167/167`
- Structurally complete records: `167`
- Duplicate, malformed or empty cases: `0`

Structural validation passed. Semantic one-to-one coverage failed on the two P1 findings above. Architecture Gate may not proceed until these requirements and acceptance gaps are repaired and a fresh Requirements Gate passes.
