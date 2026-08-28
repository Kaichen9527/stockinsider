# V3.20 exact-commit closure review — source-sync recovery and evidence addressing

Date: 2026-08-29

Review authority: independent exact-range review of the V3.20 runtime root
repair and its protected evidence-addressing closure. This review is read-only:
it does not reset a database credential, alter a scheduler, deploy Web, invoke
a provider, or change LINE, dispatch, automatic trading, Promotion or
evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `4d0a1f982ac338b9c5fe0346d77d5db9783d797e` / `b0710793d1598bd65da33f70497e6cce3953142c`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..4d0a1f982ac338b9c5fe0346d77d5db9783d797e`
- Repair range: `f35b217467293c588e062fa6d3949c2f1cac71fd..4d0a1f982ac338b9c5fe0346d77d5db9783d797e`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Root-cause closure

`source_sync` no longer treats a predecessor Web Radar response as a required
frozen acquisition. A predecessor 503 therefore produces a bounded readonly
compatibility shell while approved-source acquisition remains mandatory.
`legacy_radar` is excluded from nomination and action authority; official
market verification remains required for formal action.

The protected review gate now derives its exact-review evidence ref from the
base-issued immutable subject SHA. This makes each review evidence commit a
unique direct child of the reviewed subject without moving a shared evidence
ref. Requirements and Architecture evidence remain separately pinned to their
static, base-owned V3.20 refs.

## Executable evidence

- Full product-correctness suite: `146/146` PASS, including PCR-001 through
  PCR-031 and V3.20 KOL, 2605 entity, source-completion, lease-loss and
  recovery regressions.
- Protected worker tests: `9/9` PASS, including the subject-addressed evidence
  retrieval and the exact direct-parent invariant.
- Typecheck, lint, production build and `git diff --check`: PASS for the
  runtime repair; the protected Code Gate reruns the full final subject.
- The full final range and both closure commits were inspected for SQL,
  concurrency, shell/LLM trust boundaries, enum consumers, source authority,
  exact-review provenance and release-identity effects. No P0, P1 or P2
  finding remains.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; it is not represented as
future-return validation.
