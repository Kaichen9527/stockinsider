# Tasks — proposed archive V2

- [x] Read d274 capacity/immutability/reader behavior and existing private artifact/receipt/backup code.
- [x] Record the finite six-cycle/maximum-payload two-cycle boundary and proposed storage separation.
- [x] Draft spec, implementation plan and operation handoff. No runtime files changed.
- [x] Root-relayed unsigned independent requirements review PASS on ccb004a7ed92f8df2b60d1c91f716dcb8bbabd53 (not protected authority).
- [x] Root-relayed unsigned independent design PASS on the same ccb004a source; required measured quota/lease/persistence integration evidence remains outstanding.
- [x] Amend proposed exact backend/lease/attempt fencing after root-relayed independent e8 P2; add A→B takeover, disabled/NULL fence and old-verification replay cases. Successor ccb unsigned requirements/design re-review passed as relayed by root.
- [ ] Resolve design decisions in plan before implementation; do not mark a placeholder quota or persistence claim approved.
- [ ] Implement additive SQL only after both reviews; preserve original migration and all existing rows/ownership.
- [ ] Implement bounded private-store archive and V2 archived reader/replay under existing guards/leases.
- [ ] Implement/review shared source-evidence budget participation and conservative reservations; coordinate files outside snapshot ownership with root.
- [ ] Execute portable meaningful red→green and unchanged d274 regressions.
- [ ] VM actual PG/private artifact/guarded HTTP tests for every ARC ID, no skips; archive corruption, crash, quota and more-than32/128-history fixtures included.
- [ ] Measure whole-process resource/disk/WAL and exact persistent restore evidence; distinguish synthetic local fixture from production.
- [ ] Independent exact-code/security review; resolve all findings.
- [ ] Root reviews release-plan/identity integration, production migration/installation and opt-in rollout separately. None completed by this proposal.

No cancellation, automatic expiry/deletion, new provider, public artifact access, source freshness reset or daily schedule activation is part of these tasks.

## Isolated component slice

- [x] Implement closed finite codec and streaming byte-identical restore, without SQL/route wiring.
- [x] Implement archive-only nonblocking/no-follow descriptor reads, create-only private-store publication, fsync and independent readback. No shared helper edits.
- [x] Run synthetic lightweight adversarial codec/real-FD tests and targeted type/lint checks; preserve initial red logs. See operation handoff for exact evidence and limits.
- [ ] Independent exact-code review of this component candidate.
- [ ] VM queue full types/build and unchanged snapshot regressions.
- [ ] Actual lease/transfer/revocation lock inventory, fixed allocation reservation profile and shared-writer protocol before any DB finalize/takeover or capacity integration.

These component checkboxes do not complete ARC-06 or the end-to-end archive/restore/eviction milestone. No DB state has changed.
