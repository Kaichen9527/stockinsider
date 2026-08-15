# V3.16.1 fresh Architecture heartbeat-resume evidence

Date: 2026-08-15
Review authority: fresh Architecture Round 53, independently reviewing the
Requirements Round 172 carrier and threaded heartbeat repair.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `0a7f4d9355e2f4c121e394623502ceda9c4fc80a`
- Requirements implementation commit: `0f6f1f67fcc116c002f8a881bd328bb4ab9a0a26`
- Requirements evidence carrier: `de5960d660221f0d9f7f0af3ba0a7eaa000a8372`
- Final repair-closure commit/tree: `de5960d660221f0d9f7f0af3ba0a7eaa000a8372` / `656b20daa8b76cfc8dde95d92a0405aefc96dcdb`
- Full reviewed implementation range: `0a7f4d9355e2f4c121e394623502ceda9c4fc80a..de5960d660221f0d9f7f0af3ba0a7eaa000a8372`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Architecture closure

The repair preserves the single tracked producer, immutable run/job graph,
idempotency and rollback boundaries. PostgreSQL heartbeat work has a dedicated
worker-thread event loop and one job-scoped connection, so CPU-bound parsing on the
main thread cannot suspend lease authority. Shared atomic state reports healthy,
lost or error plus successful pulse count back to the handler before completion.

The worker receives the already resolved connection string and owner token only in
structured-clone memory; neither appears in argv, environment, disk, source text or
diagnostics. Direct PostgreSQL remains confined to the reviewed local runtime and
same Keychain reference. Failure, loss or a missing long-handler pulse prevents
completion and preserves rollback. No producer, scheduler, role, database schema or
public mutation surface is added.

The worker-thread delta changes no bounded chunk schema, hash, item order, database
authority, decision heuristic or candidate quota. Requirements Round 172 is PASS at
P0=0/P1=0/P2=0, focused runtime regression passes, and product correctness is
106/106. The complete authoritative workflow must still rerun product/runtime,
model-runner, migration, browser, performance and structural owners against the
exact Architecture carrier before merge. Evaluation governance remains honestly
blocked for non-fabricated elapsed cohorts and is not treated as evidence of future
returns.
