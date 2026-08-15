# V3.16.1 fresh Architecture heartbeat-resume evidence

Date: 2026-08-15
Review authority: fresh Architecture Round 52, independently reviewing the
Requirements Round 171 carrier and durable heartbeat repair.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `d3449f04aaf45c2db95f8132810d593d24adc672`
- Requirements implementation commit: `f6e795707a320f8554b99e4dd7556be88642a97d`
- Requirements evidence carrier: `d70c7f6305fe08636934e29520b227aa308867a0`
- Final repair-closure commit/tree: `d70c7f6305fe08636934e29520b227aa308867a0` / `6b58d3e72e8bd9555dbd30d780bbe167b9ef7f96`
- Full reviewed implementation range: `d3449f04aaf45c2db95f8132810d593d24adc672..d70c7f6305fe08636934e29520b227aa308867a0`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Architecture closure

The repair preserves the single tracked producer, immutable run/job graph,
idempotency and rollback boundaries. The heartbeat is a referenced lifecycle task
owned by the active handler and is cleared deterministically at termination. A
second, bounded PostgreSQL pool connection isolates heartbeats from the one active
ingestion write; it does not add a producer, scheduler, role, credential or public
mutation surface.

Direct PostgreSQL remains confined to the reviewed local runtime and the same
Keychain reference. Failure or heartbeat loss still prevents completion and restores
the prior scheduler and runtime pointer. The release remains compatible with the
existing additive schema and keeps V3, LINE, dispatch, automatic trading and
Promotion disabled.

The timer/pool delta changes no bounded chunk schema, hash, item order, database
authority, decision heuristic or candidate quota. Requirements Round 171 is PASS at
P0=0/P1=0/P2=0, focused runtime regression passes, and product correctness is
106/106. The complete authoritative workflow must still rerun product/runtime,
model-runner, migration, browser, performance and structural owners against the
exact Architecture carrier before merge. Evaluation governance remains honestly
blocked for non-fabricated elapsed cohorts and is not treated as evidence of future
returns.
