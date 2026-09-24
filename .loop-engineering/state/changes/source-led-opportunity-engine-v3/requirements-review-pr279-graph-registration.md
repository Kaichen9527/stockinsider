# Requirements review — active V3 graph registration for PR #279

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: Codex release review of the already merged main graph; this session did not author the V3.18 host-pin graph change.

## Exact reviewed identity

- Final reviewed implementation commit/tree: `9fd86fe620ccc63c89c4acd208327bf2c4e15332` / `f446e78fc3a67ff73bf6cff167d1174fb634e467`
- Full reviewed range: `c7b477607d044e339c3787b763a8408ee6a8d473..9fd86fe620ccc63c89c4acd208327bf2c4e15332`
- Active graph: `da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`
- Baseline: the separately reviewed V3 graph at `c7b477607d044e339c3787b763a8408ee6a8d473`; this review examines all active-graph changes from that baseline and checks the resulting full graph identity. Unrelated AUO application files in the Git range are outside this V3 graph review.

## Requirements assessment

The catalog remains the closed V2 topology: 55 active files, 45 owner rows, three incorporated files and one historical audit-only file. The 320-case acceptance inventory remains version `1.46.0`, with 272 product-runtime, 28 model-runner and 20 evaluation-governance cases. Its classification counts remain 143 semantic automated, 171 suite-backed and six structural/meta. No case was removed or reclassified by the host-pin rotation.

The normative delta is the exact V3.18 Codex/ChatGPT host identity. The model-runner contract and host compatibility amendment now require `codex-cli 0.155.0-alpha.16.3`, the 2,143-byte canonical fixture with SHA-256 `4e3a508b5120903ec7364771ba1aea8b98bd43e1d58f0ed1fcee1faaf8457008`, and the 886-byte runner identity with SHA-256 `ba88a6551f8640036ecc4d31c4217fb8a55a10c44e82636e4b9739781068d9cf`. MR3-019 and the exact command catalog changed consistently. The active catalog and both GOV-004 authority comments bind the updated bytes. No acceptance statement permits an unknown host, fallback binary, broader version range, model influence without Code Gate, or alternate promotion source.

`treeIdentity` independently recomputed the protected main tree and PR #279 tree as the same active graph `da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`. The PR subject may therefore carry this review unchanged; it does not get to select its own Requirements source.

## Verification and boundary

- Exact normative and model-runner implementation diff from the prior reviewed graph inspected; `git diff --check` passed.
- `npm run test:model-runner-v3`: 21 passed, zero failed/skipped/todo.
- `npm run v3:doctor -- --expect-mode disabled --require-host-pin model-runner-host-pins-v3.18`: passed on the current pinned host; production mutation remains disabled.
- Protected external worker fixture tests: 16 passed, zero failed/skipped/todo.

This review approves the active Requirements graph identity only. It does not approve the PR #279 product diff, exact commit review, production migration, merge or deployment. Those remain separate gates.
