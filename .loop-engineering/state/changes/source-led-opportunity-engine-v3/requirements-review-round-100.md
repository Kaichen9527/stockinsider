# V3.16.1 fresh Requirements runtime-resume evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 169, independently reviewing the
production runtime-resume repair after the observed facts-refresh claim timeout.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `d2767236dbb3cfce5bb37a30daf8aa952697262e`
- Final repair-closure commit/tree: `f67f2af77b42ee4b2c0386a4c542ecb7bbce6eaf` / `de89c5fd9cec3809fba9d29a0f3011c7afde2680`
- Full reviewed range: `d2767236dbb3cfce5bb37a30daf8aa952697262e..f67f2af77b42ee4b2c0386a4c542ecb7bbce6eaf`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Requirements closure

The repair addresses the reproduced production failure without weakening data,
decision or release authority. The tracked producer now uses the reviewed direct
PostgreSQL adapter for durable claim and completion work, retaining the same
Keychain-only database reference. HTTP remains limited to read-only Web capture and
external source APIs. A restarted process retains the immutable run authority from
lease acquisition through terminal completion, including when it resumes at a
non-source barrier whose claim omits authority pages.

The reviewed activation wait remains bounded but admits up to 60 minutes for the
first official backfill instead of rolling back near the end of the 3,426-job source
phase. Scheduler ownership, rollback journaling, one-producer authority, 60→30→20
candidate bounds, point-in-time facts, decision thresholds and public API behavior
are unchanged. The repair does not reset or expose credentials and does not enable
LINE, dispatch, automatic trading or Promotion.

`git diff --check`, syntax checks, focused PCR-002/PCR-005 and the complete product
correctness suite pass `106/106`. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS does
not claim proven future returns.
