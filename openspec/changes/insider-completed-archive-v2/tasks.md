# Tasks — proposed archive V2

- [x] Read d274 capacity/immutability/reader behavior and existing private artifact/receipt/backup code.
- [x] Record the finite six-cycle/maximum-payload two-cycle boundary and proposed storage separation.
- [x] Draft spec, implementation plan and operation handoff. No runtime files changed.
- [ ] Independent requirements review of spec ARC-01..ARC-12; record exact reviewed commit.
- [ ] Independent design review of hot transition, private receipt authority, lock/restart flow and shared budget formulas; record exact reviewed commit.
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
