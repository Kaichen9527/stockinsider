# V3.20 exact-commit repair closure review — legacy Radar bootstrap cycle

Date: 2026-08-29

Review authority: independent exact-range review of the sole V3.20 root repair
after the production `source_sync` incident. This review is read-only: it does
not reset a database credential, alter a scheduler, deploy Web, invoke a
provider, or change LINE, dispatch, automatic trading, Promotion or evaluation
governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed implementation/tree: `f35b217467293c588e062fa6d3949c2f1cac71fd` / `82cac7589c4de21d89c681c6a2193540cc1d0f1d`
- Full reviewed range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..f35b217467293c588e062fa6d3949c2f1cac71fd`
- Repair range: `2b2fa1967d6300d2fa0b5358532418097ed8875f..f35b217467293c588e062fa6d3949c2f1cac71fd`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Root-cause closure

`source_sync` previously treated the predecessor Web Radar response as a
required frozen acquisition. A stale predecessor API therefore made a new
KOL-first runtime unable to produce the projection required to replace that
API. The repair still freezes the typed `legacy_radar` outcome, but replaces an
unavailable predecessor response with a bounded empty compatibility payload.

Approved-source acquisition remains required. The lineage health calculation
excludes `legacy_radar` from both nomination and action authority while keeping
the raw frozen-row shape fail-closed. Formal action continues to require the
official coarse-market and TWSE verification rows. Thus a Web 503 can no longer
create a deployment cycle, but it cannot fabricate a candidate, a valuation or
a buy action.

## Executable evidence

- Full product-correctness suite: `146/146` PASS, including PCR-001 through
  PCR-031 and V3.20 KOL, 2605 entity, source-completion, lease-loss and recovery
  regressions.
- Typecheck, lint, production build and `git diff --check`: PASS.
- The focused unavailable-Radar source-sync regression proves a 503 produces a
  typed readonly shell while preserving mandatory approved-source acquisition.
- The full final range and the one-commit repair range were inspected for SQL,
  concurrency, shell/LLM trust boundaries, enum consumers, source authority and
  release-identity effects. No P0, P1 or P2 finding remains.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`; it is not represented as
future-return validation.
