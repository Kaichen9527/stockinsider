# 2026-09-26 Chat resume: execution repair, not a release claim

This checkpoint resumes actual head `8809cfaa981dae53205d65aaaa6336163c194c15`,
not the outdated PR-body checkpoint `6f5b2ff`. The Mac is now actually connected;
all work uses a new isolated checkout. Existing user working copies, credentials,
application environments, production data and branch protection were not changed.

## Verified findings

- The previous independently accepted R1–R4 run 36204406775 attempt 2 did not
  succeed: all 15 R1 paths failed input validation and 16 R3/R4 paths were blocked.
  Its successful process exit was a reporting defect. That failed evidence stays
  immutable. The new CLI exits 2 after retaining failed results; duplicate/missing
  path IDs, false equality checks and contradictory counts cannot manufacture a
  successful execution. R2 financial checks are deliberately not forced to pass.
- Exact restored input inspection found one event, ticker 1216 on 2023-08-03,
  outside the recorded calendar. `action_calendar_audit.py` reports its source
  identity and neighboring recorded dates without generating historical signals,
  simulating, or silently modifying a date. The error now includes symbol/date.
- Fresh official TWSE and DGPA records support one explicit closure correction.
  See `research/tw-strategy-lab/CALENDAR_REPAIR.md` and its frozen amendment hash.
  It retains the original CSV/manifest identity and records a distinct in-memory
  action digest. It cannot run without an additional independent exact-head
  acceptance. The original 15 full R1 canonical comparisons are NOT relaxed;
  any mismatch still blocks all 16 new R3/R4 paths. No result is presumed here.
- Actual `verifyCurrentNode` failed with ROUTING_BLOCKED on the connected Mac.
  The authentic signed CLI has advanced to .16.4, while the protected v3.18 fixture
  requires .16.3 and different executable/bundle identities. See the separate
  actual preflight JSON. No executable was swapped, no pin or protected gate
  modified and no model invocation was attempted through the blocked host path.
- Fresh read-only SSH filesystem measurement at 2026-09-26T01:35:47.136844Z:
  14,098,493,440 bytes available, below 16,106,127,360 bytes (15 GiB), even before
  staging. The deficit is 2,007,633,920 bytes. No cleanup, expansion or deployment
  occurred. The old projected 9.9 GiB figure is not a current measurement.

## Delivered content and actual tests

`research/current-editorial/reports/20260926-terminal-220/` contains 220 actual
company-specific factual revenue briefs, the manifest, captured-run projection
and 11,560 missing field/period rows. All 220 issuer/revision/numerical checks
passed against the fixed terminal run and retained official August 2026 CSVs.
Six missing segment periods remain symbolic, not fabricated calendar dates.
These are factual revenue briefs: **zero full investment articles accepted and
zero published**. A complete P/B reference on 14 run items is not complete
quarterly financial evidence. The observed run contains 220 items (14 successful,
206 partial), not a claim that all present or future App candidates are complete.

Actual validation before this checkpoint: 237 research tests, 32 editorial tests,
6 process-completion tests and 20 candidate-export tests passed. The web production
build passed in the isolated Mac checkout. Its old default Python 3.8 failed;
that failure is not counted as a pass. A private workspace Python 3.12.13 then ran
the successful research/editorial suites without changing the user's default
Python. GitHub CI on this new source must be checked separately.

## Remaining release boundaries

This is not main merge, production migration, financial backfill, publication,
strategy promotion or deployment. Genuine final-source review is still required.
The protected owner must separately approve any host-identity rotation under the
existing amendment process; this author must not self-authorize a new executable.
Existing protection must remain intact. A Work switch alone does not fix a .16.4
versus .16.3 identity mismatch or insufficient disk space.

The finite study may proceed only after its actual native review accepts both
frozen v2.1 hashes and the new calendar amendment. Final results will be recorded
in the PR with the actual source/run IDs, never substituted for signed-host release
approval. S5/S7 still require eligible historical publication/rights evidence;
missing source history cannot be reconstructed by inventing records.
