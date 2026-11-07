# Independent reviewer handoff — REQUEST ONLY / NOT AN APPROVAL

This maker-authored packet records the existing protected contract. It issues no verdict, attestation, reviewer identity, review ref or permission to retry. Qualified independently authorized reviewers must inspect the original evidence and reach their own conclusions. Engineering subagent review is not formal A1/protected binding.

## Distinct subjects

The current original draft PR384 subject remains `cbb581662e72942610ff85b0bf5e7e47ddddfa46`, tree `6b83fe004f9f62b1bccb52617b4ac4387562c2ea`. Remote main is `93e44475cbb0c27beb26e4dcb68e382096a4e212`, tree `fe30bedc11f231899418f845e57875c76c62c70c`. The preceding protection checkpoint is `a069b5e10a159efde25dd234b75dc9c13ce6944c`, tree `cb1447b45bf322bc0848a0819edfac669f7f44af`; this is not the PR subject. New frozen product source is **`c5cbf170b927155d5fabb040cbfcf3fd8fbbee94`**, tree **`482116bdb1e7ccaa2add79f61b815eef20ffde1f`**, runtime web tree `3e0a4ae72b42ca0cd30d248f99166b398c9045e4`. [Its separate validation receipt](SOURCE-COMPLETENESS.md) does not change the PR event subject. No equal-tree, ancestor, newer branch or engineering-test result can substitute for exact commit review.

All four identities above have measured active graph `c8576f1b60613ab0b424c9a6315ee64dee9c3d14d81c49dae10834bd66bc7e0a`, acceptance version `1.46.0`, script-value rows digest `77ffc8879d7cd473b2c822e1a03d310782e34e9967644a93cd5aad6fd42e5d69`. Equal active graph concerns only the cataloged authority; it is not equal product code or approval of unlisted vNext changes. The full intended source/range and vNext OpenSpec amendment require their own review.

## Observed missing binding

The first retained fatal is [run39996616648/job120561768044](https://github.com/Kaichen9527/stockinsider/actions/runs/39996616648), requirements / `Retrieve bootstrap and prepare detached subject`: it could not find `refs/heads/evidence/source-led-opportunity-v3-exact-review-cbb581662e72942610ff85b0bf5e7e47ddddfa46`. A current exact `git ls-remote` again returns no matching ref. This establishes that missing prerequisite for the observed subject, not the exclusive cause of every historical failure.

For this active graph, the unchanged base worker selects the requirements and architecture refs below. Remote tips are observed; their review bytes/authority have not been newly validated in this VM (objects are not present locally). Remote existence alone does not establish a passing legal binding.

| Check | Selected remote ref | Observed tip |
|---|---|---|
| requirements | `refs/heads/evidence/source-led-opportunity-v3-requirements-v325-digest` | `cf942588ffa03c81c4af384bb7cc4442468cf13d` |
| architecture | `refs/heads/evidence/source-led-opportunity-v3-architecture-v325-digest` | `2a710eab65e8c60204493ae08848d47fec3faa9c` |
| exact-review for current PR | `refs/heads/evidence/source-led-opportunity-v3-exact-review-cbb581662e72942610ff85b0bf5e7e47ddddfa46` | MISSING |

## Existing validation contract

Authority is the protected base `93e44475…`, not this packet: `.github/workflows/source-led-opportunity-external-gate.yml`, `.github/actions/prepare-source-led-external-subject/action.yml`, and `scripts/opportunity-v3/protected-external-gate-worker.mjs` (`reviewSource`, `treeIdentity`, `captureReview`, `prepare`). Also inspect `scripts/runtime/reviewed-runtime-release.js` (regular-file mode and reviewed-range ancestry) and the existing `gate-evidence.mjs` PCR fulfillment validator. The worker blob is `a707430e0ea1912282ab8d30c5c2fb06834fa9db` in both protected base and preceding protection checkpoint. Pins, graph registration, workflow, guards and selectors are unchanged.

The existing exact-review evidence commit must have exactly one parent, the exact reviewed subject commit. Its entire diff must be exactly three **added** regular files, with no product changes:

- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/exact-commit-review-final.md`
- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/pcr-fulfillment-record-v1.json`
- `.loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-review-attestation.json`

The worker requires the review's real passing verdict with zero P0/P1; exact subject commit/tree; full reviewed base..subject range; and measured active graph. The canonical one-line attestation must bind schema, baseSha, headSha, treeSha, range, actual verdict/findings, reviewedAt and SHA256 of the review bytes. PCR bytes are also retained/bound by the protected envelope. Merely satisfying syntax cannot establish reviewer independence, competence, evidence access or truthful PCR fulfillment. This packet supplies no fabricated PASS text or filled attestation.

Requirements/architecture have different existing graph-bound evidence refs and direct-parent requirements, exact source-specific file paths and carried-byte equality. Their paths in the same change directory are `requirements-review-v325-digest.md` and `architecture-review-v325-digest.md`. Both use the `Final reviewed implementation commit/tree` field; requirements uses `Full reviewed range`, architecture uses `Full reviewed implementation range`. Exact review uses `Final reviewed repair/tree` and `Full final range`. These are existing parser labels, not an approval template. A new independent reviewer must inspect those bytes and the full intended scope. Do not overwrite/repoint an old ref, select another graph or alter the base registry to make review pass. Future exact-subject evidence for a newer protection source would be a different independently reviewed commit/ref; it does not repair the current PR's cbb binding by itself.

## Safe read-only verification commands

Use an existing authorized repository checkout with the objects available; these commands neither create reviewer evidence nor run the protected pipeline. Full IDs are intentional. Do not substitute `HEAD` for the intended subject.

```sh
git ls-remote origin refs/heads/main refs/pull/384/head refs/heads/codex/stockinsider-v2-cloud-nov07
git ls-remote origin refs/heads/evidence/source-led-opportunity-v3-exact-review-cbb581662e72942610ff85b0bf5e7e47ddddfa46 refs/heads/evidence/source-led-opportunity-v3-requirements-v325-digest refs/heads/evidence/source-led-opportunity-v3-architecture-v325-digest
git rev-parse 'cbb581662e72942610ff85b0bf5e7e47ddddfa46^{tree}'
git merge-base --is-ancestor 93e44475cbb0c27beb26e4dcb68e382096a4e212 cbb581662e72942610ff85b0bf5e7e47ddddfa46
git diff --stat 93e44475cbb0c27beb26e4dcb68e382096a4e212 cbb581662e72942610ff85b0bf5e7e47ddddfa46
git rev-parse 'c5cbf170b927155d5fabb040cbfcf3fd8fbbee94^{tree}'
git diff --stat a069b5e10a159efde25dd234b75dc9c13ce6944c c5cbf170b927155d5fabb040cbfcf3fd8fbbee94
git diff 93e44475cbb0c27beb26e4dcb68e382096a4e212 c5cbf170b927155d5fabb040cbfcf3fd8fbbee94 -- scripts/opportunity-v3/protected-external-gate-worker.mjs scripts/runtime/reviewed-runtime-release.js .github/workflows/source-led-opportunity-external-gate.yml .github/actions/prepare-source-led-external-subject/action.yml
git show 93e44475cbb0c27beb26e4dcb68e382096a4e212:scripts/opportunity-v3/protected-external-gate-worker.mjs
git show 93e44475cbb0c27beb26e4dcb68e382096a4e212:.github/workflows/source-led-opportunity-external-gate.yml
git show 93e44475cbb0c27beb26e4dcb68e382096a4e212:.github/actions/prepare-source-led-external-subject/action.yml
```

Once a genuinely independent reviewer supplies an evidence commit ID, verify its parent, full changed-path/status/mode set, review content, canonical attestation digest and identity using the existing protected implementation. Do not use a bare review-file existence check as approval. Object retrieval must use the normal supported repository path; no signed-log URL renewal or credential workaround is required by this packet.

In the following read-only argument arrays, `REVIEWER_EVIDENCE_SHA` means the actual reviewer-supplied 40-hex commit, not a ref created by the maker: `git show -s --format=%H:%P REVIEWER_EVIDENCE_SHA`; `git diff-tree --no-commit-id --name-status -r cbb581662e72942610ff85b0bf5e7e47ddddfa46 REVIEWER_EVIDENCE_SHA`; `git ls-tree -r REVIEWER_EVIDENCE_SHA -- .loop-engineering/state/changes/source-led-opportunity-engine-v3/exact-commit-review-final.md .loop-engineering/state/changes/source-led-opportunity-engine-v3/pcr-fulfillment-record-v1.json .loop-engineering/state/changes/source-led-opportunity-engine-v3/runtime-review-attestation.json`. Only substitute a real supplied commit after checking the intended subject; these inspection commands do not create a verdict or execute the gate.

## Allowed scope / next legitimate gate

This batch permits read-only source/evidence inspection, review discussion, bounded non-native source/mock VM checks and preparation of a reviewer-owned handoff. It does not authorize the maker to sign, publish reviewer evidence, create/move protected refs, release native HOLD or change PR head. No `prepare`, `review`, `track`, root workflow, migration or live validation is executed as part of this handoff. Their names describe existing protected workflow steps, not commands to run now.

Reviewer must assess VN01–VN20, the actual vNext amendment, unchanged writer/ledger/RLS/rights/current qualification and remaining source/history/time semantics, with source-bound tests and original failures. Native same_failure_limit=2 and max_task_iterations=5 remain; only substantive correction plus qualified independent authorization through the existing process can permit a separately admitted retry. Formal A1, actual source/model rights, two adjacent real post-close sessions, CI/staging/restore and release gates remain incomplete. The current protected workflow includes a macOS model track; under this user's VM-only instruction it must not be triggered here or silently called fulfilled. Resolving that execution-route conflict requires the authorized owner/reviewer process, not changing pins or borrowing a host.
