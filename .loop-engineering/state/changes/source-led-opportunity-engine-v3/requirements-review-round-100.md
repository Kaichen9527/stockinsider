# V3.16.1 fresh Requirements heartbeat-resume evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 171, independently reviewing the
production heartbeat-resume repair after the observed long-handler lease expiry.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `d3449f04aaf45c2db95f8132810d593d24adc672`
- Final repair-closure commit/tree: `f6e795707a320f8554b99e4dd7556be88642a97d` / `5caa9e6ed7436ed8179728a3dee766cf7e5c12b0`
- Full reviewed range: `d3449f04aaf45c2db95f8132810d593d24adc672..f6e795707a320f8554b99e4dd7556be88642a97d`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Requirements closure

The repair addresses the reproduced production failure without weakening data,
decision or release authority. The tracked producer reached `facts_refresh` after
3,426 succeeded jobs, then its heartbeat remained at claim time throughout a
long-lived official acquisition. The 120-second lease expired with zero official
chunks written, and activation restored the prior runtime. This is a verified
runtime-lifecycle defect, not a credential or market-data conclusion.

The heartbeat timer now stays referenced during the handler and is cleared at
termination. The direct adapter exposes two bounded PostgreSQL connections so a
heartbeat is not queued behind the one official ingestion write. Scheduler
ownership, rollback journaling, one-producer authority, 60→30→20 candidate bounds,
point-in-time facts, decision thresholds and public API behavior are unchanged. The
repair neither resets nor exposes credentials and does not enable LINE, dispatch,
automatic trading or Promotion.

`git diff --check`, syntax checks, the referenced-timer/cleanup regression and the
two-connection boundary pass. The complete product correctness suite is `106/106`.
The protected gate must still rerun every authoritative track against the final
Architecture carrier.
Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`; this Requirements PASS does
not claim proven future returns.
