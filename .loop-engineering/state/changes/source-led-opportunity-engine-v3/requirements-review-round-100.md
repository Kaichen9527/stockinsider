# V3.16 fresh Requirements repair-closure evidence

Date: 2026-08-15
Review authority: fresh Requirements Round 168, independently reviewing the
fully rebased V3.16 implementation after the protected v3.9 structural repair.
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected implementation parent: `ca7a077741692692cbe9d8e481825f188f1affe6`
- Final repair-closure commit/tree: `240a46c0bcc02406481f26b45e682033a984cba3` / `fa3ed430b462458721566b8638280ef09d0e68d4`
- Full reviewed range: `ca7a077741692692cbe9d8e481825f188f1affe6..240a46c0bcc02406481f26b45e682033a984cba3`
- Active graph: `7f3a17fdd3a86fadfe583216a7f846da6e4102f9d649aeaf268c5a2d34f55cb0`

## Requirements closure

The implementation preserves last-good research visibility while disabling actions
when authority is stale or incomplete; separates research ranking from the sole
decision authority; repairs official point-in-time acquisition and valuation inputs;
surfaces near-buy, waiting and typed data blockers without a buy quota; and prevents
one incomplete cited brief from aborting the projection. It does not enable LINE,
dispatch, automatic trading or Promotion.

The protected product-runtime failure was limited to three structural owners that
still asserted the pre-v3.9 active catalog, script-value rows, amendment version and
Codex version. The repair reconciles those exact immutable bytes with the reviewed
v3.9 oracle for `codex-cli 0.148.0-alpha.9`. A clean detached subject rerun of
`HYB-007`, `GOV-004` and `GOV-001` passes 3/3. Product semantic execution had already
passed 269/272 before the structural assertions, while the ordinary full diagnostic
product track and protected model-runner track both passed.

The requirements, decision thresholds, SQL mutation authority and all 31 PCR
boundaries are otherwise unchanged. Evaluation governance remains honestly
`blocked/non_fabricated_elapsed_cohorts_unavailable`. This PASS covers requirements
completeness and code authority only; it does not claim proven future returns.
