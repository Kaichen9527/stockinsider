# Architecture and security review — active V3 graph registration for PR #279

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: Codex architecture review of the already merged main graph; this session did not author the V3.18 host-pin implementation.

## Exact reviewed identity

- Final reviewed implementation commit/tree: `9fd86fe620ccc63c89c4acd208327bf2c4e15332` / `f446e78fc3a67ff73bf6cff167d1174fb634e467`
- Full reviewed implementation range: `c7b477607d044e339c3787b763a8408ee6a8d473..9fd86fe620ccc63c89c4acd208327bf2c4e15332`
- Active graph: `da0305fd3f28b39964617a4b6eb4fce7bd94d3db0884d0b4b3d47a3c0f047fd0`
- Prior independently reviewed baseline: `c7b477607d044e339c3787b763a8408ee6a8d473`. The review covers the active V3 graph and coupled model-runner/protected-oracle implementation delta; unrelated AUO code in the Git range has its own product review path.

## Architecture assessment

The host-pin rotation changes exact accepted identities, not the permission or execution model. `hostPreflight.js` still verifies canonical fixture bytes, exact path/stat/hash/version and signing identity, and rejects mismatches before model execution. `runner.js`, `execution.js` and `journalStore.js` use the same 886-byte runner identity digest; journal and request binding therefore reject mixed old/new identities rather than silently resuming. `model-runner-v3.test.js` checks the new version and pin. The protected base model-oracle transition remains closed to the one recorded V3.17-to-V3.18 listing and does not accept arbitrary subject changes.

The V3 graph still separates model-runner, product-runtime and historical evaluation-governance evidence. The protected root requires Requirements, Architecture, exact review and both Code Gate envelopes before aggregate PASS. The current defect is a missing *registration* for this already active graph in `graphBoundReviewSources`; adding one exact graph-to-immutable-review mapping does not weaken any check, change candidate execution, allow self-selected review refs, or grant publication authority. Requirements/Architecture evidence remains a direct child of the reviewed main commit and must be carried byte-for-byte in the PR subject. Exact review remains bound to each final PR subject commit.

The current machine passed the disabled-mode host doctor against V3.18, and all 21 model-runner tests passed, including the pinned Codex JSONL parser and sandbox/network-denial tests. The 16 protected-worker fixture tests passed. `treeIdentity` produced the same active graph for protected main and PR #279; the proposed mapping is limited to that 64-byte digest and two immutable evidence refs. No V3.15/V3.16/V3.17 predecessor mapping is removed or generalized.

## Boundary

This architecture review does not validate the PR #279 product implementation, production data quality, Contabo capacity, backup, migration, merge or cutover. Those require their own exact review, Code Gate and release checks. A protected-base registration change should be merged only through a separately reviewable repair PR; until it lands, this review cannot make the existing protected gate pass.
