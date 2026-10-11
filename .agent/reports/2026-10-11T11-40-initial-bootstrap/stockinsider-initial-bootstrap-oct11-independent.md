# Initial trusted bootstrap: independent bounded architecture audit

Observed: 2026-10-11T11:39:09Z. Unsigned architecture analysis; not a bootstrap approval or protected PASS. Only this report and its companion JSON were written. No source, main, ruleset, pin, credential, service or status was changed; no provider or failed CI was rerun.

## Decision

**There is no demonstrated way to land the first trusted bootstrap through the existing required check while all current prohibitions remain unchanged.** The human has now confirmed there is no existing recovery procedure. The previous request for an already-established recovery operator is therefore obsolete; it must not be repeated as though that operator exists.

This is a trust-transition deadlock, not a missing ordinary signature field. Product review evidence has already been accepted by the real base-owned exact-review job. Generating a key, adding a planner, opening another candidate PR, or running a differently named workflow does not teach the old trusted worker to accept a new execution environment.

Protected main is `169aad1b6cfa747f78ae3464b614f43c0749d806`; PR364 remains `2e078dfdd74272d3d50dffdd4cc6c14df3152c78`, tree `6ca9a7227cea6f8312ec5e2dffc9503023d1b7bd`. The worker, workflow, bootstrap registry and pin file are byte-identical between these subjects; their exact hashes are in the companion JSON.

## Concrete present boundary

Fresh authenticated GitHub checks for run38130037645 show requirements, architecture, exact-review and product-runtime-code-gate SUCCESS; bootstrap also SUCCESS. Model-runner-code-gate and aggregate remain FAILURE. This audit reused the parent's actual2e ENOENT diagnosis and independently retained the prior399 raw identical-boundary failure; it did not download or rerun the failed model job again. A separate diagnostic38130038830 failure was visible in the same metadata query but was not analyzed here; earlier ordinary CI success must not be generalized to every later workflow.

Base `scripts/opportunity-v3/protected-external-gate-worker.mjs:737–739` loads the fixture from the protected base. Lines781–807 use that fixture's old absolute Codex executable for sandbox invocation. Lines1110–1116 do so for the first `npm ci --ignore-scripts`, before model tests or live oracle. The known failure is `spawnSync /Applications/ChatGPT.app/Contents/Resources/codex ENOENT`.

The one-time transition map at838–855 has no outgoing entry for current listing `fafab4f391e8bc077a0e2ec7ed10d1f4afc02bfbc77006ccdb436640e5e77161`. Lines884–891 accept only the same listing or an exact base-approved successor. Candidate patches cannot replace the base-owned verifier. The old reusable oracle is consulted later, and its listing differs; it cannot repair the earlier sandbox failure.

The workflow `.github/workflows/source-led-opportunity-external-gate.yml` is `pull_request_target`, checks out `github.event.pull_request.base.sha`, and requires all five actual job results before aggregation. A successful workflow on a recovery PR's unprotected intermediate base is not authorization to land it onto main. A new `workflow_dispatch` added only to a candidate branch is not a preexisting trusted recovery ingress. Publishing another same-name success to satisfy branch protection would be check substitution, not this gate's success.

Fresh ruleset20177392 is active, targets the default branch, requires `stockinsider-v3-gate-root` from integration15368, has no bypass actors, and reports `current_user_can_bypass: never`. Admin permission to change a ruleset is a technical capability; it is not authorization to disregard the current no-bypass instruction.

## What the existing PRs actually provide

Fresh PR metadata confirms all six are open drafts. They form a dependency stack (288 targets main; 295→288; 311→295; 314→311; 317→314; 318→317), not six interchangeable bootstrap entry points.

| PR | Frozen head | Reusable part and limit |
|---|---|---|
| 288 | `e94d21f9fe05dc436211a2458ea59adb52195e26` | Recovery packet verifier, finite identity bindings, Sol6.1 maker/Astra reviewer routing. Historical native facts; no authority to install. |
| 295 | `73e0aed1b6303c0fc4470b85d751717d225d0fa4` | Nonexecuting installer proposal/negative tests. External adapters and establishment protocol absent. |
| 311 | `1d92e04e26c393c6d9c32b549854281e3f29f115` | October8 native successor/canary. Not October11 native; old facts cannot be activated. |
| 314 | `b1d96eb96156d3e1394615bb32c7a2d7ef90b661` | Exact1d92 plan and registry/CAS identity validator. Explicitly requires preexisting authority; cannot perform first bootstrap. |
| 317 | `1afdd69bcc3bedbeae4151a56a7b372f64b3a58f` | Strict JSONL FSM and negative tests; reusable source after final-source compatibility review. |
| 318 | `0825db4f5cb563d7760f8e4b0e087a9c9d4bf8e7` | Process lifecycle bounds/ownership-loss resource fence and tests; reusable source, not host recovery authority. |

PR295 `openspec/changes/host-recovery-installation-proposal-v1/spec.md` R3–R6 explicitly requires external authority and denies installation by the validator. PR314 `docs/engineering/host-recovery-20261008/successor-installation/README.md` explicitly requires `externally_authenticated_preexisting_registry_and_host_recovery_scope`; its CAS/install/publication adapters are absent. Now that no such establishment exists, their premise cannot truthfully be filled. Do not label a newly generated registry “preexisting.” Reuse their canonical binding and negative-test ideas under a separately reviewed initial-establishment contract if selected; do not mutate the old packets or pretend their successful dry run confers authority.

The retained October11 observation identifies a different native SHA `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28` at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`. That is timestamped earlier evidence, not a fresh probe or asserted version. The old October8 host packet and exact1d92 planner cannot be reused for it. Parser317 and lifecycle318 are source candidates to integrate and re-review, not installation grants.

## Necessary human governance decision

There are two honest choices under the known facts:

1. **Keep no-bypass/no-direct-main absolute.** Main merge remains blocked. Only genuine restoration of the entire previously trusted execution environment could preserve the old gate unchanged. No qualifying backup/image has been supplied, and no recovery procedure exists. Replacing a binary, symlinking paths or fabricating inode/device identity is not this option. This audit does not ask for a nonexistent operator or assume restoration is feasible.
2. **Explicitly establish a first trust transition as a new, narrow governance exception.** The owner must knowingly amend the present prohibition for that one reviewed bootstrap-only transition and name how it will be executed. A temporary authorized PR bypass or an out-of-band protected-ref update would both be exceptions to the current rules; neither may be described as “no bypass” or silently inferred from the general request to fix/merge/deploy. No such operation is currently authorized here. If the owner refuses every such exception and the original environment cannot be restored, first establishment cannot proceed.

The minimum decision is not “give the agent a key.” It must identify the accountable GitHub-authenticated owner, independent reviewers, exact bootstrap-only subject and predecessor, permitted one-time mutations, expiry, evidence retention, and the execution/recovery mechanism. GitHub's existing authenticated owner account and durable PR/review/audit trail can be explicitly chosen as the initial governance anchor; cryptographic reviewer keys are an optional protocol design, not a newly invented requirement of product exact review. If the signed packet protocol is selected, key enrollment/provenance and a real verifier consumer must themselves be reviewed and explicitly established first.

Do not include product changes or production deployment in that exception. PR364's genuine independent review remains evidence, but product merge must wait for the newly established trusted gate to execute its real required tracks. The old model failure remains failure permanently in history.

## Minimum reviewable bootstrap package

Prepare one bounded bootstrap-only PR/RFC, not another generic planner:

1. **Governance amendment:** exact predecessor main/listing; explicit rule exception if chosen; named owner/reviewers and auth method; exact permitted ref, workflow, worker, registry and host-install targets; single-use/expiry and no delegated general bypass; old failure retained.
2. **Exact successor source:** integrate only required current-native compatibility and reviewed parser/lifecycle changes. Pin final commit/tree/complete listing, host release hash/signature/version facts and one-launch identity checks. Map the new graph to genuine requirements/architecture/exact reviews. Preserve old packets.
3. **Executable ingress and durable transition:** specify and implement the actual operator/control-plane adapter with least privileges. Define predecessor CAS, artifact staging/readback, state transitions, retry/ABA/replay handling, failure quarantine and rollback/re-establishment policy. Git-ref CAS plus host filesystem changes are not one atomic transaction: identify ordering and recovery at every interruption. An in-memory `trusted` object is not this implementation.
4. **Independent validation:** final-source packet/parser/lifecycle and boundary regressions; stale predecessor, altered bytes, wrong actor/graph/native, concurrent consumption, interrupted install, loss of process ownership and retry tests. Fresh actual host sandbox/permission/live-oracle evidence when separately authorized; no fixture-only success substituted.
5. **One-time execution plan:** operator-reviewed exact commands and preconditions for the chosen governance method, durable audit outputs, immediate restoration of permanent protection if an exception changes it, then real protected checks from the newly trusted base. Establishment completion requires verified installed identities and authentic gate results; it does not write a synthetic success for the broken predecessor.

Steps1–4 can be prepared on isolated ordinary branches within an explicitly reviewed implementation scope. The dangerous step5 cannot be filled with operational commands until the owner selects and approves the concrete exception/control plane; presenting one now would invent authority. Current authorization permits this audit and preparatory work, not changing ruleset20177392 or writing main.

## Status and next bounded increment

**Can prepare:** the governance amendment and a narrow current-native successor assembly/review scope from288/317/318; reuse295/314 binding tests without claiming existing registry authority. **Can execute now:** read-only verification and authorized isolated tests/reviews; preserve product review and continue independent deployment preparation. **Requires new explicit authorization:** the initial trust-transfer method and exact one-time exception, if any. **Not implemented:** authentic initial ingress, durable external CAS/install adapter, new base activation and fresh protected model/root success.

The smallest useful next action is an owner decision on item1 followed by independent review of that exact governance/transition contract. It is not another search for an old operator, another key generator, another parameter-only planner or another identical failed protected run.

## Retained evidence

- `/tmp/stockinsider-trusted-recovery-oct11.md`: 10933 bytes, SHA256 `d5d47f38df5aae83290a08e382f01d6a74ac7f60c8500c84c933a14b4b64c449`.
- `/tmp/stockinsider-full-review-fge-oct11-protected399-native-blocker.md`: 8081 bytes, SHA256 `a6147aad0361c33e468c696483d2a54a08d000367900c4875a831bbd23641748`.
- `/tmp/stockinsider-protected399-model-runner-failure-oct11.log`: 20033 bytes, SHA256 `2b8c7861da63ecc49f27e27302ccde6101b3d8de3d689ef3427d3d176d229cc9`.

The earlier native probes were only summarized in the retained recovery report; no original raw host-probe file exists. Fresh GitHub metadata and immutable-source checks from this audit are summarized in the companion JSON, not claimed as separately saved HTTP response captures.

## Addendum: exact revised decision draft

Read-only architecture review of `docs/operations/2026-10-11/initial-bootstrap-decision.md` in the cached research-author-result worktree, exact SHA256 `e616b295c8b91d4a2685b610e9110076868aad9b6f62b631a0ca4dc1b6b52a5d`. No source changes or tests were performed. The earlier47ba draft was read, then the author revised it; this conclusion binds only the new hash above.

**Decision-stage architecture conclusion: no remaining misleading-authority or disguised-bypass finding in this bounded proposal.** OptionA explicitly requires a new human governance decision and changes the old landing condition only for a separately frozen recovery PR; applicationPR364 is excluded. OptionB honestly retains the block. GitHub's lack of native one-PR/SHA bypass restriction is disclosed. The text neither creates an exception nor claims the old failed model track passed.

The revised minimum is appropriately smaller: prepare a narrowly reviewed worker/fixture/registry transition plus genuine current-native harness evidence. A general recovery service, new key hierarchy and cross-host installer are not prerequisites to the initial decision. PR288 protocol/routing and317/318 parser/lifecycle attribution is now correct. Step5 now explicitly requires selection and proof of an actual predecessor CAS primitive and does not confuse candidate-head checking with atomic base+candidate CAS; unavailable capability remains a block. Step6 still requires the owner to review the concrete exact operation and any real broader administrative scope before execution.

This is approval of the honesty and bounded architecture of the decision proposal only, not a signed/protected approval, implementable CAS proof, execution authorization or runtime acceptance. The first human action is choosing whether the one-time exception is acceptable at all and which real administrative scope is acceptable. A complete candidate/harness and exact landing operation must then be reviewed; the present text alone is not an executable procedure. After any base transition, fresh product review bindings and protected checks must use the new base; old169→2e evidence must not be relabeled, even if application source bytes remain unchanged.

Parent-supplied fresh native measurements are `codex-cli0.162.0-alpha.17.2`, SHA256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`, strict signature PASS. This audit did not repeat those host probes and does not infer authentication, live oracle or installation authority from them.
