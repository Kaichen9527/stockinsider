# StockInsider V3.11.1 — Requirements Gate Round 88

## Result

`CHANGES_REQUIRED` — `P0=0 P1=5 P2=1`

This was an independent fresh Sol XHigh review of immutable Requirements subject
`f913b8725c36663906aa890b767aaa9ccf6473ca`. The Round 87 repair narrative was treated
as a claim to verify, not as review authority. All executable checks used the exact Git
tree through clean detached commit
`a0789523c3f7649b7f15f5dc90790a9d2221dc8b` or disposable adversarial worktrees.
The repository's dirty working tree was not used as the reviewed subject.

Architecture Round 10 and implementation remain locked.

## Findings

### P1-1 — The compact PCR vectors do not prove their canonical fixture obligations

The canonical PCR fixtures describe large behavior surfaces. For example, PCR-007
requires three connectors with 2,549 rows, cursor/root retries, a 1,001-row
single-connector cap, 100,000-code-point input, 200 claims, 1,000 mentions, token-bound
shards, byte-identical replay, conservation hashes and payload-size bounds. The
ordinary PCR oracle reduces this to two inputs containing only three page row counts
and accepts `{rowsRead,disposition}` plus one caller-supplied observation.

A disposable-copy implementation replaced only
`source-semantics.ts#pcr007OrderedSourceCursor` with nine lines that summed
`input.pages[*].rows`, chose the expected operation name from whether the sum was
1,001, echoed the result to the observation port and returned it. It did not import or
execute the source adapter, cursor reader, database, job, shard, conservation or
payload logic. The unmodified exact PCR test reported:

```text
acceptance PCR-007  PASS
tests 1
pass 1
fail 0
skipped 0
todo 0
```

Hashing the full fixture proves only that the fixture prose is unchanged; there is no
executable mapping from that prose to the two compact vectors. Similar reductions exist
throughout PCR-001..031. A future implementation can therefore make all PCR tests green
without satisfying most canonical setup/expected obligations.

The repair must split every PCR into exhaustive behavior-specific cases or bind every
fixture clause to an already-executable integration/property/performance owner. Each
canonical obligation needs a positive, boundary, negative or mutation oracle; a
fixture hash plus two representative vectors is not semantic coverage.

### P1-2 — The new semantic owners are sidecars, not production behavior boundaries

The pure modules are loadable, but their named PCR functions are not invoked by the
runtime paths they are supposed to prove. `source-semantics.ts`,
`funnel-semantics.ts`, `valuation-semantics.ts`, `decision-semantics.ts`,
`market-semantics.ts`, `identity-semantics.ts` and `public-schema-semantics.ts` have no
non-test consumer. The worker, legacy radar domain, workspace page, doctor and
evaluation CLI consume only inert `*_SEMANTIC_BOUNDARY_V311` string constants through
`void`; they never call the named behaviors with production inputs or use their
results.

Consequently PCR behavior can be implemented entirely in test-side sidecars while
`source.ts`, `funnel.ts`, `valuation.ts`, `decision.ts`, the compact radar reader and
the producer remain unchanged. This contradicts the active contract's claim that the
pure boundary is consumed by the real surface and reopens Round 87's requirement to
bind PCRs to actual product behavior.

The repair must place the semantic operation in a domain module actually called by the
production surface, or make the real surface call the exact exported operation and
prove the call/result/state invariant. Importing or voiding a marker is not
consumption.

### P1-3 — The new pre-subject runner is still its own trust root

`acceptance-gate-runner.mjs` performs its first cleanliness and blob checks only after
Node has already executed that same working-tree file. Its own Git-blob assertion is
therefore self-attestation. `gateAuthorityRows` is checked only by the subject that the
runner decides whether to launch.

In a disposable detached copy, adding `process.exit(0)` immediately after the runner's
imports bypassed every runner and subject check. With normal Web dependencies present,
the exact frozen package command `npm run test:source-led-opportunity-v3` returned exit
zero and reported:

```text
tests 50
pass 50
fail 0
skipped 0
todo 0
```

No traceability test ran. The package aggregate validates only the runner exit code
before executing the two ordinary V3 test files, so it accepted a dirty authority file
and zero registered trace cases. The honest clean runner's 131/131 PASS does not close
this false-green path.

The trust bootstrap must be outside PR-controlled subject bytes, for example a
protected base-branch/reusable workflow or reviewer-owned harness that first validates
the detached commit/tree, runner blob and closed environment, then requires and parses
one canonical trace result with the exact registered/executed counts. The reviewed
runner may revalidate that boundary as defense in depth but cannot be the sole root.

### P1-4 — Frozen Code Gate commands omit mandatory checks and make the PR aggregate impossible

`acceptance-evidence-contract.md` requires the product/runtime Code Gate to run the
legacy V1/V2 regression, Playwright V3 correctness and performance harness in addition
to traceability, V3, PCR, migration, typecheck, lint and build. The frozen
`verify:source-led-opportunity-v3:product-runtime` value omits all three:

- `test:legacy-v1-v2-regression`;
- `web:test:e2e:v3-correctness`;
- `test:source-led-opportunity-v3:performance`.

The same contract requires model-runner traceability, the 14-test runner suite and
`v3:doctor -- --expect-mode disabled --require-host-pin
model-runner-host-pins-v3.4`; the frozen model-runner aggregate omits doctor entirely.

The PR workflow also declares model-runner a required Code input while its job has
`github.event_name == 'workflow_dispatch'`, so it is always skipped on
`pull_request`; `verification-gate` nevertheless requires
`MODEL_RUNNER_RESULT=success`. A PR can therefore never produce the required aggregate
described by the active contract.

These values are frozen into `scriptValueRows`, so postponing the fix until
implementation would change the Requirements active graph. The complete aggregates
and a constructible required-PR model-runner strategy must be specified and frozen
now, with an executable meta-oracle that rejects any missing command or impossible
skip/success condition.

### P1-5 — The active hybrid owner still defines a 290-case partition while the canonical inventory has 297

`hybrid-product-amendment.md` is an active owner and says twice that the verification
partition contains exactly 290 IDs. The active acceptance owner, JSON inventory,
Markdown mirror and executable oracle instead define 297 IDs:

```text
143 semantic_automated
148 semantic_suite_backed
6 structural_meta
249 product_runtime
28 model_runner
20 evaluation_governance
```

The counts sum to 297. The active contract therefore has two incompatible totals, and
the meta-test does not scan the active hybrid owner for the stale `290` assertions.
Align the active owner and current task statements to 297 and make the executable
active-graph oracle reject a stale competing partition total.

### P2-1 — The immutable subject's durable Loop status still stops at Round 84/85

The reviewed tree's `status.json` says Round 84 repairs are pending Round 85, and its
`tasks.md` still leaves Round 85 unchecked, while the same tree carries a Round 87
repair document requesting Round 88. Review/repair evidence for Rounds 85–87 exists
only outside the reviewed tree.

This does not change the 45-file active semantic graph, so it is not independently a
P1 product-contract blocker. It does undermine the repository's durable audit trail
and contradicts the stated meta-test promise to reject task/status next-work drift.
The next evidence/repair tree must carry the complete evidence-only lineage and make
the status/task assertion executable.

## Round 87 closure assessment

| Round 87 finding | Round 88 result | Assessment |
|---|---|---|
| Generic case-ID PCR dispatcher | **OPEN — P1-1/P1-2** | Case ID and fixture digest are no longer inputs, but a tiny disconnected semantic sidecar can satisfy the compact vectors without the canonical product behavior. |
| Eight Node-unloadable owners | **CLOSED** | All 31 pure semantic modules/exports load under the mandatory Node 22 strip-types baseline; 31/31 exact pending markers pass. |
| In-process GOV trust bootstrap | **OPEN — P1-3** | The check moved outside the trace subject, but the PR-controlled runner still executes before any external authority validates its own bytes and can suppress the entire trace. |

## Immutable review boundary

- Base Round 87 subject: `2ab8dfc47a3a036f322830f4af9c7127d38079af`
- Reviewed Round 88 subject: `f913b8725c36663906aa890b767aaa9ccf6473ca`
- Exact reviewed range:
  `2ab8dfc47a3a036f322830f4af9c7127d38079af..f913b8725c36663906aa890b767aaa9ccf6473ca`
- Range: 30 paths, 785 additions, 283 deletions

`git diff --check` passes. The range contains no migration, deployment, scheduler
activation, production-data, flag, merge, push, package lock, `node_modules` or other
environment-artifact change.

## Independent recomputations and executable evidence

| Authority | Recomputed result |
|---|---|
| Active catalog | 4,133 bytes; SHA-256 `58889cc26e4321dbdfca7c191b0e468ac11b540dc6c5f2abaad3b6640b9cf9e4` |
| Active graph | 45 files; 37 owners; SHA-256 `1bb1128bb1e7fcab1a367dc91abed315963740e09efd208329c85eb373c39187` |
| Acceptance inventory | `1.44.1`; 297 cases |
| Classification | 143 `semantic_automated`; 148 `semantic_suite_backed`; 6 `structural_meta` |
| Track partition | 249 product/runtime; 28 model runner; 20 evaluation governance |
| Owner rows | 297; SHA-256 `ff453cc9b5f28a43e1b146d45f841c95d561c70e1eafe3d877f6a244d4770eec` |
| Script-value rows | 13; SHA-256 `a55e9fd6e7e47386f907c9f24610607222c5f6d9473b6ebe523d1654abd830bd` |
| Gate-authority rows | 21; SHA-256 `3da5ab8186248c71629f8b76e1f82c370859166593996061ef9223e7ae5190bc` |
| Clean external product trace | exit 0; 131/131 pass; 0 fail/skip/todo; 510,972 ms |
| Requirements PCR owner baseline | 31/31 modules and exact pending markers pass |
| Ordinary PCR | intentional RED: 0/31 pass, 31/31 fail with the named not-implemented reason |
| PCR-007 shallow-sidecar probe | false green: 1/1 pass without source product behavior |
| Dirty-runner package probe | false green: package exit 0, 50/50 ordinary tests pass, trace cases executed = 0 |

## Required next step

Switch to Terra XHigh. Repair all five P1 findings and the P2 durable-state defect into
one new immutable tree. Then switch back to Sol XHigh for independent fresh
Requirements Round 89.

Architecture Round 10, implementation, exact commit/review, Verification, migration,
runtime installation, shadow activation, promotion, PR mutation and every production
action remain blocked.
