# V3.16.2 fresh Requirements activation-window evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 173, independently reviewing the
activation-window repair after the V3.16.1 production replay.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf`
- Final implementation commit/tree: `97f99ffd3505cb915716633cadd2b17c19cb658d` / `19f03ab63c75ef92ecda164f24037b4254e85e33`
- Full reviewed range: `08b6816ac98efbcbfaba25cda6fc0be7af586cbf..97f99ffd3505cb915716633cadd2b17c19cb658d`
- Scheduler config SHA-256: `1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2`

## Requirements closure

Production run `8d98b930-46cb-428c-619d-d3c731850808` renewed its database
lease throughout `facts_refresh` and durably appended 960 trading sessions, 1,315
financial facts and 1,775 price observations. The installer then terminated the
healthy owner exactly at its fixed 3,600-second wait and executed the reviewed
rollback. There was no preceding heartbeat loss. The RED condition is therefore a
finite local activation-window defect, not a data, credential or decision-quality
finding.

The repair changes only the maximum one-shot owner wait from 3,600 to 14,400
seconds. The initial acquisition remains bounded to at most 20 price symbols, 260
retained price sessions per symbol and 252 valuation sessions per exchange.
Database leases continue to expire independently, long handlers still
require worker-thread pulses, nonzero launchd exit still fails immediately, and the
14,400-second ceiling still fails closed and restores the captured scheduler/runtime
state. A running job is never reclassified as terminal success.

The executable regression observes a successful exit only after crossing the former
one-hour boundary, while existing nonzero and timeout cases remain. `git diff
--check` passes and the complete product correctness suite passes `106/106`.
No database password rotation, V3 promotion, LINE, dispatch or automatic trading is
introduced. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable` and this PASS does not claim
proven future returns.
