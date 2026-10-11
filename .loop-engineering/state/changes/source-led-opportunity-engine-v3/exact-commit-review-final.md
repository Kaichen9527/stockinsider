# Exact implementation review: bounded calendar and research inbox lease

Result: `PASS`

P0=0 P1=0

- Final reviewed repair/tree: `b43c041448a19eb7f5cb025b4fab8e7ab9cefd75` / `5b533b93b853a514b020c0fc927fbf63a4c53f01`
- Full final range: `169aad1b6cfa747f78ae3464b614f43c0749d806..b43c041448a19eb7f5cb025b4fab8e7ab9cefd75`
- Active graph: `722095adecd208b54cc794f72e262dd5b77ed970da80f0ab5771a55259651625`

The root reviewer did not implement the four production/test changes authored by the existing Cloud task. This is a separate engineering review of that task's exact published commit, not a human approval, a native host attestation, or a claim that protected release checks have passed. The two production files, their tests, and operational notes were read against main. Added raw VM receipts were hash checked rather than treated as review instructions.

## Findings and verification

Calendar acquisition retains all point-in-time filters and freezes completed date heads only after finishing their revision boundary. Ordering includes recorded-at precision and deterministic ID ties; conflicting tied heads reject, and a cancelled latest head does not revive a previous completed revision. Page, aggregate, row and monotonic deadline limits reject before a backfill run is created. Logical JSON accounting is not a wire-body limit. Offset pagination assumes immutable revisions bounded by the captured recorded-at cutoff, as documented.

An independent, read-only export of actual production calendar rows at `2026-10-11T14:39:10.496655+00:00` was replayed through the real new function with an in-memory paged query adapter. Both TWSE and TPEX had 14,277 raw rows. The old 3,000-row prefix contained 125 dates and 120 completed heads; the repair selected 240 completed heads in 15 pages, covering 2025-10-15 through 2026-10-08. This is not a live PostgREST acquisition, a production migration, or a database write.

Inbox authentication, count/shape validation, deterministic revision construction and dedup keys remain unchanged. The route acquires the existing production writer lease before obtaining the write client, rejects busy/unavailable acquisition, and releases only its acquired owner in finally. Database/client exceptions retain failure responses; a failed cleanup after a successful write reports uncertainty instead of claiming rollback or complete success. The existing lease helper and SQL authority were not changed. The route harness tests the real transpiled route and real validators with synthetic lease/database boundaries; production inbox integration must still be verified after deployment.

Root verification: 33 specific calendar/inbox tests passed, zero failures/skips. The canonical product correctness command passed 155 tests, including all 31 acceptance PCR cases, zero failures/skips/todos. Its raw stdout and command hash bind the fulfillment record. That diagnostic run initially reused local Next16.3.8 dependencies; the main lock pins16.3.4. Exact web dependencies were subsequently installed with `npm --prefix web ci --ignore-scripts`, and the normal pinned Next16.3.4 production build passed. Dependency reuse is disclosed, not represented as protected canonical CI. Root also verified all75 raw VM files and10 changed-source/lock manifest hashes; the VM's126 related tests and build receipts remain separate evidence.

Pinned `npm --prefix web run typecheck` and `npm --prefix web run lint` also exited0; lint reported0 errors and33 existing warnings. Original RED results are preserved: missing generated bridge modules, out-of-root node_modules symlink rejection, missing root pg dependency, lease timing failure, and an overlapping independent build. The successful rerun followed actual environment corrections; no test assertion, timing constant, package script, lockfile, fixture catalog or protected harness was weakened. A combined read-only source diagnostic exceeded its10-second statement timeout; no empty-source conclusion was drawn from that failure. Raw stdout whitespace is preserved; non-receipt diff whitespace checks passed.

Durable root raw checks and calendar replay are in progress commit `f4aef471` on `codex/research-release-review-evidence-oct11`, under `.agent/reports/2026-10-11T14-46-calendar-inbox-independent-review`. Further pinned build/type/lint receipts are appended there. The current app remains main169 pending required checks, merge and actual deployment.

## Scope and remaining release conditions

No schema, migration, strategy, protected workflow, model runner, active requirement graph, source policy or canonical script changes are present. Existing requirements and architecture evidence can be reused only through the protected base's own graph-equality verification. This review does not authorize a runner rotation or repair failed native trust by assertion. The protected checks must execute against this subject, and any failed check continues to block merging.

Candidate source admission, stale per-stock prices and misleading historical P/B Base labels are separate active work. They do not change this bounded repair's release conditions, and unfinished platform validation is not added as a release blocker. The completed343-stock full refresh is not repeated. One-month Docker retention remains in force; no Docker cache was deleted during this review.
