# Historical cash core: exact workflow-trigger follow-up

**Scoped CODE PASS. P0=0, P1=0, P2=0.** This six-file source review is complete; new-head ordinary quality/build, protected gates, release and formal research qualification remain **PENDING**. No CI execution or success is inferred from a path-filter change.

## Subjects and independently performed checks

- New head: `b7796da8a92b99284b133a7a622e490a23bad11b`.
- Prior reviewed head: `b89e3dde9d885c92041c5164313b36be30258746`.
- Specified approved base and actual merge base: `69b9734c5766b2e196e8133d63df1f1148959046`.
- Worktree: `/tmp/stockinsider-discovery-release-root-review-oct14`; exact HEAD and clean status verified.
- Review timestamp: `2026-10-14T05:25:15Z`.

I read the **complete base→new-head six-file diff**, including all 493 fixture lines, the core, tests, arithmetic workflow, full handoff and four ordinary-workflow additions. I also read the entire resulting `source-led-opportunity-v3.yml`, traced its product diagnostic command to unchanged `package.json`, and inspected the complete prior-head→new-head diff. This is not merely a new label attached to the old review.

Actual read-only assertions verified:

1. The prior-head delta contains exactly `.github/workflows/source-led-opportunity-v3.yml` and the handoff document.
2. Each of the four added path lines occurs exactly once. Removing only those lines restores **byte-identical** workflow text at both prior head and approved base. All jobs, conditions, permissions, commands, action references and manual-dispatch behavior are therefore unchanged.
3. The core, test, numeric fixture and new arithmetic workflow are byte-for-byte identical between prior and new heads, with matching Git blobs and SHA256 identities below.
4. All four corresponding changed file paths match the added exact path or bounded fixture-directory glob.
5. `package.json` is byte-identical to base; its diagnostic command chain was read, not executed.
6. `git diff --check BASE NEW_HEAD` exited 0. Base→head is six changed files, 785 insertions, no deletions; five new files and the existing ordinary workflow's four-line addition.

The previous review remains intact at `/tmp/stockinsider-historical-cash-core-independent-review-b89e3dde-oct14.md`, SHA256 `bbca3d9267806385021d9cbb7ca9de99835a8c50c50e285c74f5a79a0572e5f7`. Its actual 14-case suite, 94 corrected supplemental checks, 170-cell source equality and strict module-only typecheck apply to the unchanged blobs. **None was rerun in this follow-up.** The original reviewer overflow-probe RED remains recorded there: the first alleged overflow actually equaled MAX_SAFE_INTEGER; corrected boundary and actual-overflow probes passed. Neither that history nor the maker's earlier fixture-grain RED was erased or reclassified.

The review skill's required repository checklist remains absent, confirmed by a read-only existence check. As before, this is a direct scoped review fallback, not completion of its full workflow. No skill registry, telemetry, project or source files were written.

## Trigger and workflow safety findings

No actionable finding. At the new head, `.github/workflows/source-led-opportunity-v3.yml` adds:

| New line | Path filter | Actual branch file covered |
| --- | --- | --- |
| 20 | `scripts/research-historical-cash-core.test.mjs` | The arithmetic test |
| 21 | `scripts/fixtures/research-historical-cash/**` | `operands-and-decimal-vectors.json` within that directory |
| 22 | `.github/workflows/research-historical-cash-quality.yml` | The arithmetic workflow itself |
| 45 | `web/src/lib/research-historical-cash-core.ts` | The pure TypeScript core |

These are positive filters inside the existing `on.pull_request.paths` list, with no negating entry or branch restriction introduced. For this branch's diff, ordinary PR event path matching includes the new arithmetic material. Editing only the handoff later is not newly made a product-test trigger; that is consistent with the requested four-entry scope. Normal platform approval/event requirements still apply, so matching filters are not proof that a run has started or will succeed.

The `product-runtime` job (lines 63–107) remains a hosted Ubuntu job, with its original dependency installation and product diagnostic command. `package.json:162` still chains typecheck, lint, candidate shadow-performance, build, source-led tests, product correctness, migration, legacy regression, browser correctness and performance. Nothing was replaced with a lightweight arithmetic-only substitute. The separate new arithmetic workflow remains the prior reviewed dependency-free 14-case command.

The ordinary workflow retains contents:read at lines 59–60. Its diagnostic gate at lines 142–151 still requires `product-runtime` success. The evaluation-governance job remains manual-dispatch-only (line 110); the self-hosted model-runner remains gated by manual dispatch **and** its existing variable (line 128). Adding PR paths does not enable those jobs on pull requests. No credentials, new environment values, write grants, shell interpolation, deployments or attestation commands were added.

For clarity, this existing ordinary workflow still uses its inherited `actions/checkout@v4`, `actions/setup-node@v4` and `actions/setup-python@v5` references. They were not changed to the SHA-pinned references used by the separate arithmetic workflow, and this review does not imply they were. Byte-equivalence after removing the four path lines establishes preservation, not a new broad hardening claim.

The handoff's added paragraph accurately describes trigger coverage and explicitly disclaims a pre-execution passing CI result. Its statement about product quality/build/browser work is supported by the unchanged package command chain. The existing ordinary diagnostic is explicitly **not authoritative Code Gate evidence**, as the workflow's step label states.

## Complete six-file identity index

| File | Git blob at new head | SHA256 |
| --- | --- | --- |
| `.github/workflows/research-historical-cash-quality.yml` | `2285fffc0e4a066b3c0ec4968567bafd2126ef9a` | `8fb73bfa86104026548dbe9ebdfe6c3b566415393d3d345ac9ca4472699c89c5` |
| `.github/workflows/source-led-opportunity-v3.yml` | `c1155632a340bce18664e4b96cec19b87606d6e9` | `c47a58d5ef45b7806fcc22f25007d3242210de38be140a3b4cc3480ce6418b4b` |
| `docs/operations/2026-10-14/historical-cash-core-handoff.md` | `37caf7eb931b6aa498f67c0127a9b566938df9e4` | `5e7f6dcfb4994e2351ddcbd7045c53bb12fed48896fa37d08a8b140bc89044dd` |
| `scripts/fixtures/research-historical-cash/operands-and-decimal-vectors.json` | `088e920e42e777b6ae149cd7162fca3163eb255d` | `d581bd42715ff491552dc7e21ab94ac3536609e72feae55750143f68c446d0cb` |
| `scripts/research-historical-cash-core.test.mjs` | `c8f59a826032166a7e7c685678d4662d54ea660a` | `fa67c47c836f2622ffee4544e0a86abc7c5222fac5bfc81077ec6a6e216fa649` |
| `web/src/lib/research-historical-cash-core.ts` | `37aa911d5289faabf9a604d0768fe821a43b6487` | `157fbe7b680bf94a601d0ba785d06582c8b9c817c285ee97cf113f454c2b8790` |

## Non-effects and remaining gates

All prior code/numeric boundary analysis remains applicable to the unchanged arithmetic blobs: calculation-only, finite 52/33 two-period inputs, exact integer intermediates, explicit partial EMC component coverage, no source-authentication/clock/admission claims and false qualification flags. Full v3 reader/provenance/schema/replay/article/publication integration is still deferred, not supplied by this trigger follow-up.

No protected/oracle file, SQL/default48/49/50, authority/pin, old v2 mapping/replay, reader/observation cap, package lock, consumer or Cloud-owned work changed anywhere in the complete base→head diff. No source modifications, test/build/typecheck reruns, PG, VPS, HTTP, PR actions, pushes, exact evidence refs, dispatches, reassignments or approvals were performed. The only new persistent output is this report. Genuine new-head ordinary quality/build and protected results are still required; this scoped code review is not release permission, a human/third-party signature or formal author/reviewer/publication/investment qualification.
