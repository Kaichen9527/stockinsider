# V3.16.1 fresh Requirements heartbeat-resume evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 172, independently reviewing the
threaded heartbeat repair after the main-thread timer production replay.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `0a7f4d9355e2f4c121e394623502ceda9c4fc80a`
- Final repair-closure commit/tree: `0f6f1f67fcc116c002f8a881bd328bb4ab9a0a26` / `88d184a5098684744083f7af5cc87e42625c82d0`
- Full reviewed range: `0a7f4d9355e2f4c121e394623502ceda9c4fc80a..0f6f1f67fcc116c002f8a881bd328bb4ab9a0a26`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Requirements closure

The preceding referenced-timer repair passed Code Gate but production proved that
CPU-bound official parsing can prevent every main-event-loop timer from running.
After 3,426 succeeded jobs, the `facts_refresh` lease again remained at claim time,
expired with zero official chunks written, and activation restored the prior
runtime. This is a stronger verified lifecycle defect, not a credential or
market-data conclusion.

Production PostgreSQL heartbeat work now runs on a dedicated worker thread with its
own event loop and connection. Secret connection and owner-token values cross only
worker memory. Long handlers require at least one successful pulse, and lost/error/
no-pulse outcomes fail closed before completion. Scheduler ownership, rollback
journaling, one-producer authority, 60→30→20 candidate bounds, point-in-time facts,
decision thresholds and public API behavior are unchanged. The repair neither
resets nor exposes credentials and does not enable LINE, dispatch, automatic trading
or Promotion.

`git diff --check`, syntax checks, CPU-blocked threaded-pulse/loss regressions and
credential-source boundary pass. The complete product correctness suite is `106/106`.
The protected gate must still rerun every authoritative track against the final
Architecture carrier.
Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS does
not claim proven future returns.
