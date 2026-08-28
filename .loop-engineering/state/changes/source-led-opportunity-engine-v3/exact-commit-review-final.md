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
- Final reviewed repair/tree: `128c01109bafadb298bf0df71238dd2b08e0f5cb` / `477b71bfcfe1fe2eb0e41cde8c9c29f538edabea`
- Full final range: `f96bd632603deb22339e076060774ae9c0c83403..128c01109bafadb298bf0df71238dd2b08e0f5cb`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Review result

This repair restores the protected evidence topology without changing the
reviewed implementation tree. The prior, superseded exact-review carrier is
removed before this single, subject-bound evidence child is added; no source
code, migration, fixture, runtime policy, or active Loop artifact changes in
that topology correction.

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
  regression (`2/2`), model-runner (`20/20`), disabled doctor, and performance
  (`5/5`) all PASS.
- `git diff --check` and an independent full exact-range inspection PASS.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`. It is not presented as
proof of future returns.
