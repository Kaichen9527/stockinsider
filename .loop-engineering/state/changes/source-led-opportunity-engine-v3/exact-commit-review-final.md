# V3.20 exact-commit review — KOL-first projection boundary repair

Date: 2026-08-29

Review authority: independent, read-only exact-range review of the immutable
V3.20 root repair. This review did not mutate production database state, start
or stop a scheduler, call a provider, deploy Web, or enable LINE, dispatch,
automatic trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `128c01109bafadb298bf0df71238dd2b08e0f5cb`
- Final reviewed repair/tree: `67e0ae78a6f77365761d1747df7cb42c25a1b8a9` / `94a0e49d4a8c7cf55bb7a9ecd110702cfd94c908`
- Full final range: `128c01109bafadb298bf0df71238dd2b08e0f5cb..67e0ae78a6f77365761d1747df7cb42c25a1b8a9`
- Active graph: `5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e`

## Review result

The previous V3.20 run was correctly rolled back after live smoke showed that
its compact projection still reused legacy official-market cards. This exact
repair removes that circular producer dependency: `source_sync` now acquires
only the bounded approved-source envelope and carries an explicit immutable
KOL-first marker with an empty legacy compatibility shell.

The compact projection has an independent KOL-first boundary. It clears
legacy card buckets and admits source signals only when the candidate itself,
or its source evidence, has one of the closed nomination authorities. This
means a stale prior payload cannot revive an `official_market_factor` card,
while a properly attested Telegram, transcript, Threads, InvestAnchors, or
Research Inbox candidate remains visible.

The additive migration modifies only the authoritative predecessor that
constructs `compact_projection_input`. It uses a closed predecessor grammar,
rechecks the postcondition after `CREATE OR REPLACE`, and restores the
temporary owner CREATE grant before commit. The reviewed migration applier
also verifies the propagated marker; it grants no runtime table privilege and
does not alter existing credentials or data rows.

The range was inspected for nomination-authority widening, source retention,
SQL injection/privilege changes, stale-action authority, backward schema
compatibility, deterministic frozen acquisition retries, and UI data leakage.
No P0, P1, or P2 finding remains.

## Executable evidence

- Product correctness: `149/149` PASS, including all PCRs, source connector
  conservation, 2605 false-positive rejection, lease recovery, and the new
  old-Radar exclusion / KOL projection boundary regression.
- Migration contract: `74/74` PASS, including apply-twice and production-like
  predecessor delegation.
- Source-led core: `63/63` PASS; legacy V1/V2: `2/2` PASS; model-runner:
  `20/20` PASS; browser correctness: `9/9` PASS; performance: `5/5` PASS.
- Typecheck, lint, production build, and `git diff --check` PASS.

Evaluation governance remains
`blocked/non_fabricated_elapsed_cohorts_unavailable`. It is not represented as
evidence of future returns.
