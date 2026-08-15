# V3.16.1 fresh Requirements JSONB-resume evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 170, independently reviewing the
production JSONB transport repair after the observed official-chunk rejection.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `0a0eeea1474c1c8e8999cf5822a1ffb9875de1a7`
- Final repair-closure commit/tree: `cbf24637f8d34b6a3c62f206a615831c8a95d9ec` / `5237b8488938dcd3db3f529a3ad35a27b9126e53`
- Full reviewed range: `0a0eeea1474c1c8e8999cf5822a1ffb9875de1a7..cbf24637f8d34b6a3c62f206a615831c8a95d9ec`
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

The direct adapter now serializes official item arrays explicitly as JSON before the
parameter reaches the JSONB RPC signature; node-postgres can no longer reinterpret
them as PostgreSQL array literals. `git diff --check`, syntax checks and focused
PCR-005 pass. The protected gate must rerun the complete `106/106` suite.
Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS does
not claim proven future returns.
