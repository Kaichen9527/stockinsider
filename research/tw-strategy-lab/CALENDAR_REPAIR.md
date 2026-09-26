# 2026-09-26 — explicit closure correction and truthful execution status

The former `24d3e24` run (`36204406775`, attempt 2) acquired a genuine exact-head
review and the byte-identical normalized dataset, but **completed zero simulation
paths**: 15 R1 failures (`action_not_on_calendar`) and 16 blocked R3/R4 paths.
Its GitHub wrapper incorrectly returned success. The artifact is retained:
`10893388144`, SHA256
`231ac3563021f0a39452d8db19c52b999aef9694a1da3bf7604c46187273d61f`.

The new CLI returns exit 2 for incomplete/failed executed studies after preserving
results. Inspection-only R2 output is still a successful diagnostic operation,
not a claim that S3 satisfies its investment checks. A complete execution requires
31 distinct registered paths, every actual result, and all 15 original R1 full
canonical result/signal/ledger checks. Profitability is never forced to pass.

## Root cause and source-backed amendment

The exact input audit found **one affected event**, not 1,216 events: stock 1216
(Uni-President), reported ex-date 2023-08-03. It is absent from the recorded market
calendar; adjacent recorded sessions are August 2 and August 4. Missing data alone
is insufficient to infer a date change.

Four fresh official receipts resolve the case: the dated DGPA closure archive
confirms Taipei offices closed August 3 and reopened August 4; TWSE disaster FAQ
Q2/Q5 explains market closure and the ex-date opening-reference treatment; the
specific 1216 ex-rights row gives the August 3 nominal date and 3.15 dividend; the
August price table first reopens on August 4 at 73.10. The complete source URLs,
actual observation timestamps, byte counts, hashes and narrowly extracted facts
are in `proposals/action-calendar-amendment-v1.json`. The annual holiday calendar
alone is NOT evidence of an unscheduled typhoon closure. Rolling *current* EPS/BVPS
columns appended by the historical endpoint are excluded from all study inputs.

The amendment is a new independently reviewed object, NOT a rewrite of v2.1:
`df9113b7fd64fda6e8e7efd204d193c93a0cc70a8c6154d08f2088ff4936ed54`.
It changes only the in-memory `session` of that exact action to 2023-08-04. The
reported source date, raw CSVs, original manifest, baseline results, immutable
trial ledger and source-availability metadata are not overwritten. The complete
before/after included-action digests are different and recorded separately.
Unexpected other anomalies, modified amounts/factors, changed adjacent bars or a
target-date collision fail closed. No generic nearest-date fallback exists.

**All original R1 equality expectations remain binding.** A difference in any
result, signal or ledger field still fails R1 and blocks the 16 new R3/R4 paths.
The amendment cannot certify a successful replay in advance, and the earlier
failed run remains failed. Source reconstruction today is not historical PIT
capture, confirmed auction execution or actual dividend-payment timing.

## Reproduction and admission

```sh
python3 -m unittest discover -s research/tw-strategy-lab -p 'test_*.py'
python3 research/tw-strategy-lab/action_calendar_audit.py \
  --data /exact/recovered/replay-recovery --output /new/input-audit.json
```
The original input audit intentionally exits 2 and saves the identified problem.
It performs zero signal generations and zero simulations.

The live native reviewer must accept the exact current implementation, both
original contract hashes, AND the amendment. The following lines describe the
machine-readable contract, **not an author-generated approval**:

```
ROBUSTNESS_V2_1_ACCEPTED 4379960b4d1406bee97fcf54fa0f99e832abdefa1ed9a5111d04f2d25748270a f44e230f54a13251c51c6919aea7e78088d7ecc6508bb51a3c4a2a88e430d8af
CALENDAR_AMENDMENT_ACCEPTED df9113b7fd64fda6e8e7efd204d193c93a0cc70a8c6154d08f2088ff4936ed54
```

After genuine independent acceptance, in a clean actual Git checkout:

```sh
python3 research/tw-strategy-lab/run_robustness.py --execute \
  --apply-reviewed-calendar-amendment --data /exact/recovered/replay-recovery \
  --review-id NATIVE_REVIEW_ID --review-comment-id NATIVE_INLINE_COMMENT_ID \
  --output /new/immutable-study-output
```
Omit `--review-comment-id` only when the genuine submitted review body contains
both acceptance lines. The CLI obtains native review objects from GitHub itself;
no local receipt file, caller-selected source commit, new dataset or copied old
approval is accepted. The flag cannot be used in inspection mode. Without it,
the original uncorrected input keeps its explicit failure.

This finite research is separate from signed-host release approval. It provides
no permission to merge, deploy, publish, write production financial facts or trade.
