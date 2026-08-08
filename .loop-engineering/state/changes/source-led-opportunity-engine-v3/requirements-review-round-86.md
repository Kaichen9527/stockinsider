# StockInsider V3.11.1 — Requirements Gate Round 86

## Findings

### P1-1 — PCR-001…031 remain executable by generic self-attesting stubs

The repair does not establish independent semantic oracles for the 31
product-correctness cases.

The runtime exposes an implementation-owned executor result containing
`runtimeSurface`, `implementationRef`, and `observed` in
`web/src/lib/opportunity-v3/product-correctness-runtime.ts`. The test in
`scripts/opportunity-v3/product-correctness.test.mjs` verifies:

```ts
evaluation.execution.runtimeSurface === expectedRuntimeSurface[fixture.id]
Object.keys(evaluation.execution.observed).length > 0
```

It does not independently derive or validate the meaning of `observed`, verify that
the named runtime function executed, bind `implementationRef` to the expected
surface, or require distinct executor identities.

A disposable-copy exploit registered the same generic executor for all 31 IDs. It
only returned:

- the fixture-provided case ID and digest;
- the test-owned surface string selected by case ID;
- an arbitrary implementation path;
- `{claimed: "implemented"}` as the nonempty observation.

No product behavior was implemented or called. The exact ordinary package command
then reported:

```text
tests 31
pass 31
fail 0
skipped 0
todo 0
```

The implementation can therefore turn every PCR green by changing only the runtime
registry; canonical fixture and test bytes need not change. This recreates the Round
85 self-attestation defect in a slightly more structured form.

The baseline separation itself works:

- all 31 fixture-bound owner children passed with one exact pending marker;
- marker parsing requires exactly one canonical marker and rejects absent/duplicate
  markers;
- direct baseline mode without `OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD=true` failed;
- ambient baseline/owner/case variables could not make the ordinary package command
  green because the script clears them;
- the unmodified subject's ordinary command produced 31 failures, zero
  pass/skip/todo;
- the product aggregate includes that ordinary command, and the workflow invokes the
  product aggregate.

Those protections distinguish baseline evidence from ordinary execution, but they
do not make ordinary success semantic.

### P1-2 — GOV-004 consumes executable source before its clean-tree check and can be subverted into a false PASS

`scripts/opportunity-v3/acceptance-traceability.test.mjs` statically imports
`canonical.ts`, worker executors, scoring, evaluation, and other executable source
before `assertCleanReviewedExecutionRoot()` runs. The clean-tree checks therefore
execute under code that has already been loaded from the working tree.

A disposable clean subject checkout was adversarially modified at the imported,
non-active path:

```text
web/src/lib/opportunity-v3/canonical.ts
```

The modification monkeypatched the imported `execFileSync` and `spawnSync` bindings
so the later Git status/diff probes returned clean results. Immediately before
execution, real Git reported:

```text
 M web/src/lib/opportunity-v3/canonical.ts
```

Nevertheless, the targeted GOV-004 test reported:

```text
pass 1
fail 0
skipped 0
todo 0
```

This is a demonstrated false PASS, not a hypothetical race. The same run also showed
that ignored `node_modules` symlinks can be consumed before the check while porcelain
remains empty.

On an honest clean root, GOV-004 correctly validates:

- `HEAD^{tree}` equals the named/default tree;
- tracked and staged diffs against that tree;
- ordinary untracked status;
- tree/index/working equality for all 45 active files;
- the frozen active graph;
- one catalog mutation plus `45 × 4` row-member mutations, totaling 181.

The default fallback and `OPPORTUNITY_V3_REVIEWED_TREE` parsing are structurally
correct, but they execute too late. Consequently, non-active imported source and
ignored preload/module authority are not reliably bound before they can influence
the oracle.

A trustworthy boundary requires a minimal preflight process with no project imports,
a closed environment, and verification before dynamically loading any subject code.

## Round 85 closure assessment

| Round 85 finding | Round 86 result | Assessment |
|---|---|---|
| PCR executable authority, baseline isolation, duplicate markers, ordinary CI | **OPEN — P1-1** | Baseline isolation and CI inclusion are closed, but one generic self-attesting executor can make all 31 ordinary cases green without product behavior. |
| GOV-004 clean/named-tree execution | **OPEN — P1-2** | Honest drift is rejected, graph/181 mutations reproduce, but imported dirty source can subvert the later Git checks and obtain a false PASS. |
| Node 22 command authority | **CLOSED** | Strip-types literals, owner rows, package scripts, script catalog and workflow aggregates align; TypeScript loads on pinned Node 22.14.0. |

## Immutable review boundary and exact range

Reviewed immutable objects:

- Base Requirements tree: `6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf`
- Repaired subject tree: `be7c58009ba6d8ed36b0ea8a117ebedca10613a3`
- Evidence-only tree: `85d46718f101df611d1ccab9d36552dde68bc6bc`
- Exact repair range:
  `6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf..be7c58009ba6d8ed36b0ea8a117ebedca10613a3`

The range contains exactly 16 modified paths, 407 additions, and 268 deletions:

- 12 active Requirements/catalog/inventory Markdown or JSON files;
- `package.json`;
- `scripts/opportunity-v3/acceptance-traceability.test.mjs`;
- `scripts/opportunity-v3/product-correctness.test.mjs`;
- `web/src/lib/opportunity-v3/product-correctness-runtime.ts`.

There is no migration, deployment, scheduler, runtime installation, production-data,
or flag mutation in the range. `git diff --check` passed.

The dirty repository worktree and its current HEAD were not used as review authority.
All recomputations used the supplied Git tree objects; executable checks used
disposable copies outside the repository.

## Independent recomputations

| Authority | Independently recomputed result |
|---|---|
| Active catalog | 4,133 bytes; SHA-256 `c2886bf43a6675a476e6dbba7c406fc5e23aca388d588eb5dd8d5c194ee1a7b6` |
| Active graph | 45 files; 37 owners |
| Active graph RFC 8785 preimage | 6,710 bytes |
| Active graph SHA-256 | `bf2345315150fbf09ba8abee48fbba837b11cd6e486c203f30a359e60ebfc596` |
| Acceptance inventory | `1.44.1`; 297 cases |
| JSON/Markdown parity | Exact five-field, order-preserving parity across all 297 rows |
| Classification | 143 `semantic_automated`; 148 `semantic_suite_backed`; 6 `structural_meta` |
| Track partition | 249 product/runtime; 28 model runner; 20 evaluation governance |
| Owner rows | 297 rows; SHA-256 `0c673f082dd302446a73c9aeae4f1e46ddefb253d164152c7e4744454a352ff6` |
| Script-value rows | 13 rows; SHA-256 `af78e12050431628c527887322c3fc5e680e81d40ec02058157204f6e9154686` |
| Product traceability literals | 129 exact rows using `--experimental-strip-types` |
| Evaluation traceability literals | 20 exact rows using `--experimental-strip-types` |
| Static comparison | 41 ASCII-name-ordered members |
| Static comparison preimage | 2,729 bytes |
| Static comparison SHA-256 | `508e677459ce0212cb51253f51cc8df132876fd2a4d4ba4251ee303497d7623e` |

All 37 catalog owner headers reproduce. The active prose yielded 57 current
contract-version edges, all matching their catalog owners.

The active graph contains zero occurrences of the targeted stale identities:

- acceptance `1.44.0`;
- `opportunity-acceptance-evidence-v3.11.6`;
- `product-correctness-runtime-v3.11.3`.

The public acceptance literal is consistently `1.44.1` in the active data/detail
contracts, inventory, mirror, Requirements, design, runtime identity, and
traceability assertions.

Older identities still present in implementation source, such as the pre-amendment
comparison identity in `identity.ts`, are downstream implementation RED evidence.
They do not contradict the structured Requirements baseline while implementation is
explicitly pending.

## Prohibited artifacts

The repaired subject contains:

| Prohibited class | Tracked members |
|---|---:|
| Any `node_modules/**` | 0 |
| `scraper/venv/**` | 0 |
| `.agent/reports/**` | 0 |
| `__pycache__/**` or `*.pyc` | 0 |

No deletion outside those previously identified artifact classes appears in the
repair range.

## Node 22 and command authority

The pinned executable resolved as:

```text
/usr/local/bin/node
v22.14.0
```

Command reconciliation confirmed:

- all 149 product/evaluation traceability owner rows use the exact strip-types
  literals;
- all 13 script values exactly match root or Web package authority;
- the product aggregate includes the ordinary PCR command;
- the evaluation package value applies strip-types both to traceability and the named
  TypeScript product/evaluation tests;
- the workflow invokes the corresponding product and evaluation aggregates.

The exact evaluation traceability literal completed on Node 22.14.0 with:

```text
tests 22
pass 22
fail 0
skipped 0
todo 0
```

This consisted of inventory parity, the PCR baseline oracle, and all 20 evaluation
owners. It did not fail at TypeScript loading.

The product literal also loaded TypeScript successfully. A dependency-free clean
archive stopped at missing `@supabase/supabase-js`, not at `.ts` extension handling;
targeted product GOV/PCR executions succeeded after resolving the existing dependency
installation. The previously reported missing `estree`, `json-schema`, `json5`,
`node`, `phoenix`, `react`, `react-dom`, and `ws` type definitions are therefore
downstream installation/typecheck evidence, not a defect in the Requirements command
authority. No dependency was installed or changed during this review.

These checks do not establish Code Gate PASS. The ordinary subject PCR suite remains
31-case RED, and the full product/typecheck/build/migration track was not represented
as passing evidence.

## Evidence-tree validation

The exact subject-to-evidence diff is limited to four paths:

1. added `requirements-round-85-repair.md`;
2. modified `status.json`;
3. modified `tasks.md`;
4. modified `gate-summary.md`.

No active catalog member changes between the subject and evidence tree. The evidence
tree consequently reproduces the same active graph, but it cannot substitute for
subject authority:

- the reviewed Requirements subject remains tree
  `be7c58009ba6d8ed36b0ea8a117ebedca10613a3`;
- the repair report exists only in the later evidence tree;
- its assertions are historical evidence, not executable proof;
- Round 86 must bind its own findings directly to the supplied subject tree.

## Gate separation and final assessment

The structured Requirements baseline is not a Code Gate or Verification claim. The
following downstream blockers remain legitimate:

- all 31 real PCR runtime executors are still pending;
- product/runtime implementation and full CI repair remain incomplete;
- Architecture Round 10 remains locked;
- evaluation governance remains blocked on non-fabricated
  120-backtest/20-live elapsed cohorts;
- no production migration, runtime installation, scheduler mutation, activation,
  merge, push, or deployment is authorized.

The acceptance bump, hashes, traceability rows, Node 22 strip-types authority,
prohibited-artifact cleanup, and evidence-only boundary are internally consistent.
Requirements Gate nevertheless fails because both the ordinary PCR semantic authority
and clean named-tree execution boundary admit demonstrated false-positive paths.

VERDICT: CHANGES_REQUIRED P0=0 P1=2 P2=0
