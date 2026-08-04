# Requirements Review — Round 53

Date: 2026-07-26
Immutable tree: `0fef7818851136ac71a6f9aed560fe89ae2ab445`
Base: `1fe429d3a91359cd2d6d07c89441ebb66d9ccc5d`
Verdict: `CHANGES_REQUIRED`
Counts: `P0=2 P1=4 P2=1`

This was an independent fresh read-only Sol xhigh review of only the named immutable Git tree. The reviewer used an isolated export, did not read or modify the mutable worktree, and excluded only committed dependency/virtual-environment bloat from its local execution copy.

## Findings

1. `P0` — 117 acceptance cases were generic suite aliases with null executors, so the registry could pass without executing their claimed behavior.
2. `P0` — The model runner did not consume the Sol-maker waiver, enforce allowed operation starting states, pass reasoning effort to Codex, or revalidate the exact host identity at every spawn boundary.
3. `P1` — Acceptance 1.41.0 and runtime v3.11 literals remained in active owners while the graph requires acceptance 1.42.0 and runtime v3.12.
4. `P1` — The runner-ingestion catalog was inconsistently described as seven rather than eight routes and the financial-fact body omitted `estimateKind` and `estimateHorizon`.
5. `P1` — Exact-object checks validated keys but not value schemas before remote client/RPC acquisition, allowing malformed signed bodies to consume authority.
6. `P1` — The product acceptance schema-key oracle compared sorted actual keys with an unsorted expected list.
7. `P2` — The signing example used a non-UUID principal although the database principal identity is UUID-typed.

## Independent execution evidence

- Migration passed `16/16`; typecheck, lint and production build passed.
- Model runner passed `14/14`; doctor and the host fixture passed.
- Signed-request secrecy and the immutable diff checks passed.
- The isolated product run passed 172 cases and failed only the two schema-key ordering assertions described above.
- Missing elapsed production cohorts remained the approved evaluation-governance blocker and were not counted as a Requirements defect.

## Repair incorporated after this immutable tree

- Every suite-backed acceptance ID now has a case-specific, named owner variant and a non-null executor; the meta-test verifies the exact variant and executes the owning non-recursive TypeScript, PostgreSQL or model-runner suite for the selected verification track.
- Sol-only make now requires and consumes a canonical, owner-controlled, expiring waiver outside the repository. The sealed request carries only its digest and expiry.
- Operation entry states are enforced before reservation; Codex receives the exact routed reasoning effort; the pinned host is revalidated before, immediately after and after completion of both permission-probe and model spawns. Negative state, waiver, effort and race tests are part of the unchanged 14-test runner suite.
- Active acceptance/runtime literals, OPS-036 and the eight-route runner-ingestion catalog are aligned; financial-fact input owns both estimate fields.
- Closed per-route value schemas validate all eight ingestion routes, seven human authority routes and blinded assignment/label bodies before client acquisition or nonce consumption, including UUID, finite-number, nested union and four-digit-symbol boundaries.
- The schema oracle order and the signed UUID example/helper are corrected and covered by positive, negative and secrecy checks.

Repair checks pass typecheck, focused product tests `46/46`, model runner `14/14`, and the product acceptance command with the exact `130/130` registry plus its concrete owner suites. Architecture remains locked until a new immutable repair tree receives a fresh Requirements PASS.
