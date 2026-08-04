# StockInsider V3.11.1 — Requirements Gate Round 89

## Result

`CHANGES_REQUIRED` — `P0=0 P1=6 P2=0`

This was an independent fresh Sol XHigh review of immutable Requirements subject
`238446073445fb4651f1770986507a050ea6b959`. The Round 88 repair narrative was treated
as a claim to verify, not as review authority. Read-only review used clean detached
carrier `d62d36e24363f2e8fd43712fb665dd9a014d94f9`, whose tree is exactly the reviewed
subject. Adversarial changes were made only in separate disposable worktrees and commits.
The repository's dirty working tree was not used as the reviewed subject.

Architecture Round 10 and implementation remain locked.

## Findings

### P1-1 — The gate bootstrap remains controlled by the subject it is meant to judge

`acceptance-evidence-contract.md:139-151` calls the reviewed runner the pre-subject
authority, and the frozen package value in `package.json:125` reads that runner from
`HEAD`. This closes dirty-worktree substitution, but `HEAD` is still the PR/subject
commit. No protected base-branch workflow, reviewer-owned harness, required external
check or independently pinned bootstrap validates the runner before executing it.

A disposable clean detached commit changed only
`scripts/opportunity-v3/acceptance-gate-runner.mjs` by adding `process.exit(0)` after
its imports. Because the modified bytes were committed, the reviewed-blob pipeline
executed them as authority. The unmodified package command returned:

```text
HEAD 34f0e6fcff5e42dfc80c0bce616501b2389b4c1e
tree 3ba74d1bcb1bab25101e4d5b1bbfce76ab37f550
tests 50
pass 50
fail 0
skipped 0
todo 0
PROBE_RC=0
```

Zero trace cases executed. A clean committed malicious runner therefore establishes the
same false green that Round 88 required an outside-PR trust root to prevent.

Repair must put the initial checkout/tree/runner/subject validation and required result
parsing in authority that the PR cannot replace, such as a protected reusable workflow
or reviewer-owned check runner whose identity is bound by Requirements evidence. The
subject runner may revalidate as defense in depth but cannot select its own authority.

### P1-2 — The PCR “real owner” map is semantically false and some consumer edges are vacuous

The contract says every full canonical fixture is bound to its exact production owner
and exact runtime-consumer edge. The map in
`scripts/opportunity-v3/product-correctness.test.mjs:76-107` instead selects symbols that
are merely present in plausible files:

- PCR-007's 2,549-row ordered cursor, root, shard, payload and conservation fixture is
  assigned to `source.ts#normalizeCanonicalUrl`, a URL-normalization function with no
  cursor, pagination, root, shard or conservation behavior.
- PCR-010's live-roster/seed-outage behavior is assigned to `boundedCandidates`.
- PCR-015's point-in-time company-specific evidence authority is assigned to
  `verificationFresh`, a timestamp predicate.
- PCR-023's complete gate-evidence/aggregate/checkout mutation surface is assigned to
  `evaluation.ts#evaluatePromotion`.
- PCR-024's accessibility matrix is accepted by checking only that `page.tsx` is
  nonempty.

For PCR-010, PCR-015, PCR-023 and PCR-026, owner and consumer paths are the same file.
The regex at lines 126-131 therefore finds the export declaration itself and calls that
an external consumer edge. It proves no runtime call or result dependency.

The exact PCR-007 Requirements baseline passed `1/1` even though its selected owner is
only the 41-line URL normalizer:

```text
PCR_BASELINE_RESULT ... "id":"PCR-007" ...
tests 1
pass 1
fail 0
PCR007_BASELINE_RC=0
```

Repair must map each PCR to a constructible future behavior boundary, not an unrelated
existing symbol. Every mapping needs the owned API/state transition, real caller and
result dependency needed to implement the full fixture. A same-file token occurrence,
nonempty page or broad dispatcher is not an owner edge.

### P1-3 — The mandatory RED-to-green PCR transition invalidates the gate graph it must preserve

Ordinary PCR execution is hard-coded to `assert.fail` at
`product-correctness.test.mjs:145-158`; current evidence correctly reports 0/31 pass and
31/31 fail. The contract requires implementation to replace that assertion with complete
fixture execution. However the same PCR harness hash is frozen in
`acceptance-tests.json.gateAuthorityRows`, and `acceptance-tests.json` is an active graph
member. `acceptance-traceability.test.mjs:288-297` rejects any harness change, while
`acceptance-evidence-contract.md:237-252` permits reusing Requirements/Architecture PASS
only when the implementation commit reproduces the reviewed active graph.

A disposable clean commit removed only the unconditional RED assertion:

```text
HEAD 2dca512d097af1b2ff17cf965d4e8f31655504b1
ordinary PCR: 31 pass, 0 fail, exit 0
GOV-004: fail
actual harness SHA 504ce31483aa2900b30bfdb45e7e88a182caf350a17d7aa8d9bd4ed348ba0763
expected harness SHA cf0677fd9b63546970a66571661d235444b926de6dfc5747e897f0434db5cc18
```

Updating the frozen row would change active `acceptance-tests.json`, and therefore the
active graph, invalidating the Requirements and Architecture evidence needed by Code
Gate. Leaving the row unchanged makes Code Gate fail. The stated sequence is thus
unconstructible.

Repair must separate immutable requirement fixtures/owner declarations from
implementation-time executable test bytes, or define and test a review-evidence
transition that permits only the exact implementation test/owner changes without
weakening the reviewed requirement graph. The plan must make the post-Architecture
implementation commit capable of reaching PCR green while retaining valid gate lineage.

### P1-4 — The required model-runner and aggregate evidence path is still bypassable and incomplete

The thirteen frozen `scriptValueRows` include `test:model-runner-v3` and `v3:doctor`,
but omit the workflow-invoked
`verify:source-led-opportunity-v3:model-runner` value at `package.json:135`.
`HYB-006` checks only that the workflow contains that script name and that model-runner
is not a PR aggregate dependency. It never verifies the aggregate's exact command.

A disposable clean commit changed only that omitted package value to `true`:

```text
HEAD e8ebbaab57c059bdb264f76f10faea1bf8d73c5e
npm run verify:source-led-opportunity-v3:model-runner: exit 0
focused HYB-006: 1 pass, 0 fail, exit 0
```

No model trace, 14-test suite or doctor ran. In addition, the repository contains no
non-document implementation of `opportunity-gate-result-v1`, no writer for the required
Requirements/Architecture/product/model/exact-review evidence objects, and no
`code-gate-aggregate` command/check. The workflow exposes only
`pr-product-runtime-gate`, while the contract calls six other names “required PR
checks.” `tasks.md:1039` says only “Repair CI into ... partitions” and leaves evidence
location, protected producer, digest resolution, exact-subject reconciliation and
aggregate invocation implementation-selected.

Repair must freeze the complete model-runner aggregate, make its workflow invoke only
that exact authority, and specify one executable canonical evidence writer/validator
plus constructible check-run/artifact flow for every required Code input and aggregate.
Mutation probes must prove that `true`, omitted doctor/trace/tests, missing evidence,
cross-tree evidence and a skipped model input cannot pass.

### P1-5 — Doctor reports host-pin PASS while the mandatory host preflight fails

`acceptance-evidence-contract.md:194-201` requires doctor to reproduce the exact
`model-runner-host-pins-v3.4` host, including
`codex-cli 0.146.0-alpha.3.1`. `doctor.mjs:73-89` only hashes the fixture file and checks
that the caller supplied the literal fixture-version string. It never verifies the
actual Codex path, file SHA/stat, signing identity, Node/Git file identities or bundle.

On the current approved host:

```text
doctor status: pass
doctor exit: 0
real host preflight: ROUTING_BLOCKED
real host preflight exit: 1
fixture Codex SHA-256: 6d8be49e49751554df16572369e636cbe02c84b208cad3dc35528c846eeca223
actual Codex SHA-256:  fb2b6b35789e59c885cf4d2aee12475809dd67b2c10df580e638122fd6b3438e
fixture device/inode: 16777231 / 68349510
actual device/inode:  16777234 / 72378541
```

The visible version string still matches, which is exactly why the rest of the pin must
be checked. The active amendment says any stat/digest mismatch blocks the runner, yet
the required Code Gate doctor produces PASS.

Repair must either call the same fail-closed host preflight used by the runner or share
one typed host-verification function. Regenerate the compatibility amendment/fixture
only from explicitly reviewed current-host observations; do not learn replacement pins
inside doctor.

### P1-6 — Current tasks still define the superseded 290/141 partition

The active hybrid owner now correctly states 297 IDs, but durable current planning still
contradicts it:

- `tasks.md:133-135` calls 290 the current V3.11 Code Gate;
- `tasks.md:345-349` calls 290/143/141/6 the exact current V3.11 registry.

The canonical inventory is 297/143/148/6. These are not labeled as a past 1.43.x
snapshot; both explicitly say “current.” Later Round 88 task prose acknowledges the
290/297 defect, so the same file contains both the defect and the claimed repair.

Repair every current-count statement to 297/143/148/6 or label the 290/143/141/6 rows
with their exact historical acceptance version and supersession boundary. Add an oracle
that rejects another unversioned “current” partition count in status/tasks/gate prose.

## Round 88 closure assessment

| Round 88 finding | Round 89 result | Assessment |
|---|---|---|
| Shallow compact PCR vectors | **OPEN — P1-2/P1-3** | Compact success vectors were removed, but unrelated symbol declarations are called exact owners and the hard-coded RED harness cannot transition to Code Gate green without invalidating reviewed graph identity. |
| Disconnected semantic sidecars | **CLOSED** | Sidecars and inert marker imports are deleted; no live reference remains. |
| Self-attesting pre-subject runner | **OPEN — P1-1** | Dirty runner substitution is closed, but a clean committed PR-controlled runner can still exit before all checks and return package success. |
| Incomplete/impossible Code Gate commands | **PARTIAL — P1-4/P1-5** | Product command ordering and PR dependency deadlock are repaired. The workflow model aggregate remains unfrozen/bypassable, canonical aggregate production is absent and doctor does not validate the host. |
| 290/297 conflict | **PARTIAL — P1-6** | Active hybrid prose is corrected; two durable task statements still assert the superseded current total/classification. |
| Durable Round 85-88 lineage | **CLOSED** | Review/repair evidence, next-work status and recent tasks are carried in the subject. |

## Immutable review boundary

- Base Round 88 subject: `f913b8725c36663906aa890b767aaa9ccf6473ca`
- Reviewed Round 89 subject: `238446073445fb4651f1770986507a050ea6b959`
- Clean review carrier: `d62d36e24363f2e8fd43712fb665dd9a014d94f9`
- Exact reviewed range:
  `f913b8725c36663906aa890b767aaa9ccf6473ca..238446073445fb4651f1770986507a050ea6b959`
- Range: 41 paths, 1,897 additions, 659 deletions

`git diff --check` passes. The range contains no migration application, deployment,
scheduler activation, production-data, flag, merge, push, package lock, `node_modules`
or other environment-artifact change.

## Independent recomputations and executable evidence

| Authority | Recomputed result |
|---|---|
| Active catalog | 4,134 bytes; SHA-256 `93294d3ea825e9578b5440d034c56ebee4f847102bf13d57ff2e57f42dba14fb` |
| Active graph | 45 files; 37 owners; SHA-256 `e307c67fb116237880bb04dfbdfe7913b779cdcea9275f6f8a7b1605bdd8f0d3` |
| Acceptance inventory | `1.44.1`; 297 cases |
| Classification | 143 `semantic_automated`; 148 `semantic_suite_backed`; 6 `structural_meta` |
| Track partition | 249 product/runtime; 28 model runner; 20 evaluation governance |
| Owner rows | 297; SHA-256 `a320495355c90c3ff6adac29d7af8c6d355c8af75fed2857ba0f439db3902dbf` |
| Script-value rows | 13; SHA-256 `ab02c72adb6b658d71cb2d061871c9de09739d6b44b4bfcbee786a798831a697` |
| Gate-authority rows | 18; SHA-256 `d4af9808195fc9e3f5f7958e79797bae5a03fe1e705d075d0def648d543611e9` |
| Ordinary PCR | intentional RED: 0/31 pass, 31/31 fail; no skip/todo |
| PCR-007 baseline | false ownership green: 1/1 pass while selected owner has no fixture pagination/conservation behavior |
| Clean committed runner-bypass probe | false green: package exit 0, 50/50 ordinary tests pass, zero trace cases |
| Clean committed model-aggregate probe | false green: model aggregate exit 0 and HYB-006 pass with zero model/doctor execution |
| PCR transition probe | ordinary PCR 31/31 pass, then GOV-004 fails solely because required harness edit changed frozen hash |
| Doctor/host probe | doctor exit 0/pass; actual `verifyCurrentNode` exit 1/`ROUTING_BLOCKED` |

No full product/runtime Code Gate was claimed or run: ordinary PCR is intentionally RED
and this checkpoint is Requirements review, not implementation or Verification.

## Required next step

Switch to Terra XHigh. Repair all six P1 findings into one new immutable tree. Then
switch back to Sol XHigh for independent fresh Requirements Round 90.

Architecture Round 10, implementation, exact commit/review, Verification, migration,
runtime installation, shadow activation, promotion, PR mutation and every production
action remain blocked.
