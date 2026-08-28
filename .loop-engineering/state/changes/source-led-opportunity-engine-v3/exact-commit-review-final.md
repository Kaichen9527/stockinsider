# V3.20 exact-commit review — KOL source-authority recovery

Date: 2026-08-29

Review authority: independent, read-only review of the immutable V3.20 repair.
This review does not alter database credentials, start a scheduler, call a
provider, deploy Web, or enable LINE, dispatch, automatic trading, Promotion,
or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `0fa9aeef745417120d7ffd7f343651aa4a33e571` / `477b71bfcfe1fe2eb0e41cde8c9c29f538edabea`
- Full final range: `4d0a1f982ac338b9c5fe0346d77d5db9783d797e..0fa9aeef745417120d7ffd7f343651aa4a33e571`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Review result

The repaired runtime consumes an immutable provider envelope through a
deterministic, per-connector bounded view. It never refetches or rewrites the
frozen acquisition evidence; it preserves each retained document/item pair and
derives matching connector/profile counters before persistence.

Live collection has the same closed 5/2/3/10/10 connector bounds. This prevents
the previous twenty-document Telegram/structured-claim input from violating the
durable source contract while preserving the newest bounded KOL evidence.

The additive migration is transactionally idempotent. It rejects conflicting
identity or reviewer-binding data, creates only the four reviewed Telegram and
InvestAnchors source identities, binds the fixed source-reviewer principal, and
revokes execution from public and runtime roles. Official market data remains a
verifier and cannot nominate a candidate.

The reviewed range was checked for SQL privilege expansion, security-definer
search paths, source-authority scope, immutable retry behavior, KOL-first
candidate nomination, counter conservation, point-in-time implications, and
reader-facing compatibility. No P0, P1, or P2 issue remains.

## Executable evidence

- Product-correctness: `148/148` PASS, including all 31 PCRs, V3.20 KOL
  authority, 2605 false-positive rejection, source completion, lease recovery,
  production build and Playwright coverage.
- Migration contract: `74/74` PASS, including apply-twice, the zero-argument
  non-public source-authority seed, and the source-reviewer binding.
- Typecheck, lint, production build, core gate tests (`63/63`), legacy V1/V2
  regression (`2/2`), and performance (`5/5`) all PASS.
- `git diff --check` and an independent full exact-range inspection PASS.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`. It is not presented as
proof of future returns.
