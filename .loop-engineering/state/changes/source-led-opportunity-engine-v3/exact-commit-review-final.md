# V3.20 exact-commit review — KOL-first runtime recovery

Date: 2026-08-29

Review authority: independent exact-range review of the immutable V3.20
implementation, its three repaired P1 findings, and the protected-gate
compatibility ancestry bridge. No production database, runtime, Vercel project,
provider, LINE, dispatch, auto-trading or Promotion setting was mutated.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `6aaa017618f15a0082efb2cafe8c08b32947be1c`
- Final reviewed repair/tree: `ecabca237bcc702accc41d382ae88c6ae2ffa2d8` / `ad5267442c52874509c3e111eb958a328f4124bd`
- Full final range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..ecabca237bcc702accc41d382ae88c6ae2ffa2d8`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Review conclusion

The original implementation range added an identity-guarded expired-run reaper,
durable lease-loss diagnostics and resumable small-batch facts refresh. It
replaced full-market nomination with a closed KOL/rightful-claim authority,
evicted retained official-only candidates, added five connector terminal
outcomes, and rejected the `新興市場 ETF` false positive for 2605. It also
preserved research visibility while disabling action authority for stale
projections and bound every card to one readiness lane and revision detail.

The first review found that lease loss could return with an indeterminate
`running` state. The first repair terminalized it durably. The second found
that Telegram provenance could be labelled as a structured claim and source
published time could be invented from collection time. The second repair
requires a public cursor and preserves typed provenance. The third found that
the final database wrapper failed to carry rights-attested InvestAnchors
structured-claim authority into the frozen revision. The final repair carries
that authority explicitly. Regression coverage closes all three P1 root causes.

The subject's additional parents and two compatibility documents carry the
review into the base-owned V3.19 gate source without force-pushing a protected
branch or trusting candidate gate code. The V3.20 source worker advances the
base gate to the V3.20 evidence refs after merge. This bridge changes no product
or runtime bytes. Review of the bridge range and the full range found no P0,
P1 or P2. `git diff --check` passes.

## Executable evidence

- Migration contracts: `74/74` PASS.
- Product-correctness contracts: `146/146` PASS.
- V3 runtime contracts: `63/63` PASS.
- Legacy regression: `2/2` PASS.
- Performance: `5/5` PASS.
- Typecheck, lint and production build: PASS.
- Protected external worker contracts: `9/9` PASS.

The reviewed release may proceed only after protected Code Gate PASS. Evaluation
governance remains `blocked/non_fabricated_elapsed_cohorts_unavailable`.
