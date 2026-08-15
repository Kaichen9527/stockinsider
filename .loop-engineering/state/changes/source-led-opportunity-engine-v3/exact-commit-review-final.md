# V3.16.4 exact-commit heartbeat recovery closure review

Date: 2026-08-15
Reviewer: Sol exact-range production lease-integrity review
Final verdict: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Reviewed base: `834f2f64c8016a8703d04913f739f3a073f167d3`
- Initial implementation/tree: `2108f390aa389a0652d58e94db12024b7ceb6c8d` / `d105cd4f095ee32c290bc2efa830aa922cd44d5a`
- Final reviewed repair/tree: `3e7b3f714bdc8128b18a56c42c7dbfd9031b3972` / `529555d798ecbd3adea736dafc42de101b38f249`
- Repair closure range: `2108f390aa389a0652d58e94db12024b7ceb6c8d..3e7b3f714bdc8128b18a56c42c7dbfd9031b3972`
- Full final range: `834f2f64c8016a8703d04913f739f3a073f167d3..3e7b3f714bdc8128b18a56c42c7dbfd9031b3972`
- Active graph: `71abf84b4ae6b4703fd0559807fba15553c1f5a68c56e19039aae44173727b9d`

## Production RED and root cause

Reviewed V3.16.3 activation run `38e5d5e1-8c8a-a88d-c67e-215b62e7f9e1`
completed 3,426 of 3,427 bounded jobs and then rolled back safely. The dedicated
PostgreSQL heartbeat worker stopped renewing the 120-second lease after the pooler
rotated its connection. The worker had no idle `error` listener or reconnect path,
while the parent could still report the thread as healthy after an unexpected exit.
The remaining `facts_refresh` barrier later observed the expired lease, and its
PT403/PT409 symptom could mask the earlier lease-authority loss.

No partial runtime installation survived: the activation journal is terminal
`rolled_back`, the previous manifest and scheduler owner remain the rollback target,
and no password reset was required or performed.

## Review and repair closure

Initial implementation `2108f390` adds bounded PostgreSQL heartbeat recovery with
connect, query and statement timeouts, an idle connection error listener, and retry
delays of 250, 500, 1,000, 2,000, 4,000 and 8,000 milliseconds. Its worst-case
recovery budget remains below 91 seconds, leaving more than 29 seconds inside the
reviewed 120-second lease. Client shutdown is bounded to one second, and connection
or SQL details never cross the Worker trust boundary.

Exact review found one P1 evidence gap in the initial commit: mocked parent-state
tests did not execute the actual Worker reconnect path or prove that unexpected
Worker `error`/`exit` events cannot remain healthy. Repair `3e7b3f7` adds atomic
fail-closed parent handlers, gives heartbeat loss precedence over a later handler
failure, and executes the real Worker against a mocked `pg` module that emits a
pooler error and verifies renewed pulses after reconnect. It also covers the combined
PT409-plus-heartbeat-error path as `producer_lease_lost`.

Repair-range and full-range reviews are PASS with no unresolved finding. The final
tree passes `git diff --check`, typecheck, lint, production build, migration `53/53`,
core product/runtime `61/61`, model-runner `18/18`, and complete product correctness
`106/106`. The final 106-test output is bound by SHA-256 in the PCR fulfillment
record.

Requirements Round 176 and Architecture Round 57 remain applicable because the
reviewed active contract graph is byte-identical. The protected workflow must rerun
both reviews and every authoritative code track against this exact source commit.

Evaluation governance remains `blocked/non_fabricated_elapsed_cohorts_unavailable`.
No password reset, V3 promotion, LINE, dispatch or automatic trading is authorized.
