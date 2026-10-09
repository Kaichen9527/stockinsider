# Tasks — proposed archive fence and measurement slice

- [x] Read frozen5f46 source; inventory tracked lease acquire/release/recovery, deployment rotation, source fence, principal append and actual shared-store writers with exact line references.
- [x] Document acquired_at/owner ABA limitation, separate controlled archive binding/generation, retained history/reservations and additive observer integration boundary.
- [x] Propose lock/predicate profile, finite isolated PG/FD measurements, AFM-01..AFM-11 and honest negative-control/report semantics.
- [ ] Independent requirements/design review of this exact documentation commit; resolve amendments before code.
- [ ] Implement only declared isolated harness/fixture paths after review; preserve meaningful REDs and no shared runtime changes.
- [ ] Lightweight local fixtures, child lifecycle and report-failure tests.
- [ ] Independent exact harness/fixture code review.
- [ ] Root VM queue actual PostgreSQL17 concurrent lock/ABA/principal tests and WAL/heap/TOAST/index/private-FD measurements; no skips or substituted mock PASS.
- [ ] Record measured bounds, uncovered writers/privileges/persistence and source/profile/tool identities; productionReady remains false.
- [ ] Separately reviewed production lease observer/binding migration and shared-writer reservation design, if requested. Not authorized by harness review.

No hot deletion, automatic pending cancellation, production source acquisition, protected authority, new credential, actual migration or daily archive activation is completed here.
