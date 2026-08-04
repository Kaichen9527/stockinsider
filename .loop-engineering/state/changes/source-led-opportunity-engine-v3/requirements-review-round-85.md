# Requirements Gate Round 85 — StockInsider V3.11.1

## Findings

### P1-1 — PCR-001..031 remain a self-attesting placeholder authority, and the Requirements-only mode is externally reachable

**Confidence: 10/10**

The repair correctly constructs all 31 canonical
`[id,requirement,layer,setup,expected]` fixtures and binds each to a SHA-256. The
reviewer executed every named PCR owner child independently:

- children executed: 31
- passing structured-baseline children: 31
- exact expected markers: 31
- wrong/missing child records: 0
- skips/todos: 0

The ordinary product-correctness command remained nonzero with exactly 31 tests, zero
passes, 31 failures, zero skips and zero todos. Its failures include each fixture's
actual setup and expected text.

That mechanical RED shape does not provide semantic executable authority. The sole
implementation seam is one generic function:

```ts
export function evaluateProductCorrectnessFixture(fixture) {
  return {
    state: 'preimplementation_pending',
    id: fixture.id,
    fixtureSha256: fixture.fixtureSha256,
    reason: 'product_runtime_behavior_not_implemented',
    implementationBoundary: 'source-led-opportunity-engine-v3.11',
  };
}
```

Evidence:
`6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf:web/src/lib/opportunity-v3/product-correctness-runtime.ts:35-44`.

The test accepts an `implemented` response solely by trusting five fields returned by
that same seam:

```js
assert.equal(evaluation.state, 'implemented');
assert.equal(evaluation.id, fixture.id);
assert.equal(evaluation.fixtureSha256, fixture.fixtureSha256);
assert.equal(evaluation.evidence.setupVerified, true);
assert.equal(evaluation.evidence.expectedVerified, true);
assert.match(evaluation.evidence.implementationRef, /\S/u);
```

Evidence:
`6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf:scripts/opportunity-v3/product-correctness.test.mjs:64-88`.

There is no case-specific dispatcher, product call, output comparison, negative oracle,
fixture mutation or independent verification of the setup/expected behavior for any
PCR. In a disposable copy, the reviewer changed only this seam to return:

```ts
{
  state: 'implemented',
  id: fixture.id,
  fixtureSha256: fixture.fixtureSha256,
  evidence: {
    setupVerified: true,
    expectedVerified: true,
    implementationRef: 'self-attesting-stub',
  },
}
```

The canonical test and inventory SHA-256 values remained unchanged, while the ordinary
command reported 31/31 passing. No PCR behavior was implemented. This demonstrates
that the seam is an attestation façade, not an executable product oracle.

Two further bypasses reinforce the finding:

1. Baseline mode checks only the two public environment values at
   `product-correctness.test.mjs:16-23`. It does not require
   `OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD=true`, validate
   `OPPORTUNITY_V3_ACCEPTANCE_CASE`, or authenticate the parent process. Running the
   ordinary file with the two baseline variables in ambient CI produced 31/31 passes.
2. The product CI aggregate omits
   `test:source-led-opportunity-v3:product-correctness` entirely. `package.json:133`
   runs typecheck, lint, the source-led suite, migration and build;
   `.github/workflows/source-led-opportunity-v3.yml:56-57` invokes that incomplete
   aggregate. The source-led suite exercises PCRs only through the
   Requirements-baseline parent children, so the workflow does not require ordinary
   implemented mode despite the Code Gate contract requiring it at
   `acceptance-evidence-contract.md:140-150`.

The parent distinguishes nonzero child exit, missing marker and wrong JSON fields, IDs,
hashes or reasons through `execFileSync` and exact `deepEqual`. It does not, however,
enforce exactly one marker: `output.match(...)` accepts the first matching marker
without rejecting additional markers (`acceptance-traceability.test.mjs:2303-2307`).

Round 84 P1-1 remains open.

### P1-2 — GOV-004 freezes the active graph but does not establish the claimed clean named-tree execution boundary

**Confidence: 9/10**

The graph mechanics are repaired correctly:

- the named value resolves to a Git tree;
- every one of the 45 active paths compares tree OID to stage-zero index OID;
- active working bytes compare to named-tree blob bytes;
- the graph is compared to the frozen digest;
- all 181 catalog/row perturbations change the digest.

Evidence:
`6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf:scripts/opportunity-v3/acceptance-traceability.test.mjs:103-206`.

The remaining authority boundary is incomplete. The default merely resolves
`HEAD^{tree}` at lines 103-112; it never proves that the repository is clean.
Tree/index/worktree equality is checked only for the 45 active catalog members.
Meanwhile the same oracle and semantic registry consume many non-catalog files
directly from working bytes, including:

- imported product TypeScript modules;
- the SQL migration;
- `contracts.ts`, `identity.ts`, `control.ts`, `worker.ts` and worker executors;
- operator schemas/docs;
- model-runner code;
- workflow bytes;
- root and Web `package.json`.

Evidence:
`acceptance-traceability.test.mjs:54-91,443-464,510-520`.

Consequently, `OPPORTUNITY_V3_REVIEWED_TREE=<named tree>` can bind the frozen
Requirements graph while semantic executors, script checks and workflow checks borrow
modified non-active worktree bytes. The `HEAD^{tree}` fallback likewise passes with
dirty non-active authority. This contradicts the contract's clean `HEAD^{tree}`
default and does not prove that the code being executed belongs to the named reviewed
tree.

The exact graph digest and all row mutation checks are valid; the named-tree execution
identity is not. Round 84 P1-2 remains open.

### P1-3 — Frozen product and evaluation owner commands cannot load the acceptance oracle on pinned Node 22

**Confidence: 10/10**

The mandatory commands for the product direct/structural owners and all
evaluation-governance owners omit `--experimental-strip-types`:

```text
OPPORTUNITY_V3_ACCEPTANCE_TRACK=product_runtime node scripts/run-node22.js --test scripts/opportunity-v3/acceptance-traceability.test.mjs
OPPORTUNITY_V3_ACCEPTANCE_TRACK=evaluation_governance node scripts/run-node22.js --test scripts/opportunity-v3/acceptance-traceability.test.mjs
```

Evidence:
`6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf:.loop-engineering/state/changes/source-led-opportunity-engine-v3/acceptance-evidence-contract.md:73-80`.

`acceptance-traceability.test.mjs` statically imports `.ts` modules beginning with
`canonical.ts`. Running both exact commands from the immutable subject with the
repository-pinned Node 22.14.0 exited 1 before any oracle executed:

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
.../web/src/lib/opportunity-v3/canonical.ts
Node.js v22.14.0
```

Scope:

- 129 product-runtime owner rows carry the broken product literal.
- All 20 evaluation-governance owner rows carry the broken evaluation literal.
- `verify:source-led-opportunity-v3:evaluation-governance` repeats the broken command
  at `package.json:134`.
- The Code Gate contract separately requires the broken product command as its first
  step.

The model-runner track is not affected: its 28 owner rows invoke the plain JavaScript
model-runner test, while `verify:source-led-opportunity-v3:model-runner` runs
traceability with `--experimental-strip-types` at `package.json:135`. The broader
`test:source-led-opportunity-v3` script also includes the flag, but that does not
repair the exact mandatory product/evaluation commands.

This is a fresh P1 acceptance-command inconsistency.

## Round 84 closure assessment

| Round 84 finding | Round 85 status | Assessment |
|---|---|---|
| PCR-001..031 executable RED authority | **OPEN — P1-1** | All fixtures, hashes and pending records are exact, and ordinary mode is 31 RED. The generic seam can nevertheless self-attest all 31 green without exercising product behavior; ambient variables expose baseline mode, and the product CI aggregate omits ordinary PCR mode. |
| GOV-004 immutable graph authority | **OPEN — P1-2** | Frozen graph digest, 45 tree/index/working rows and 181 mutations are correct. Clean/named-tree execution identity remains incomplete because non-active executable authority is read from unchecked working bytes. |
| Reported-PE `authority_conflict` | **CLOSED** | The closed reason union includes `authority_conflict`; current, own-history and sector unavailable variants share it; valuation review preserves it; the selector requires unchanged propagation; PCR-030 mirrors the branch. |
| Prohibited immutable artifacts | **CLOSED** | Subject counts are zero for all four prohibited classes. |

## Immutable review boundary and exact range

- Base object: `58516bb987d808eb7d24d8aa613c887764aa7f2a` — verified Git tree.
- Subject object: `6cf22c1de2ca3ab74252e9cc92df2c72dec4e5cf` — verified Git tree.
- Review source: Git object reads and a disposable archive of the exact subject tree.
- Repository worktree/index were not edited or used as review authority.
- No dependency installation, migration, deployment, runtime mutation, commit, push or
  repair occurred.
- The disposable extraction and mutation harness were removed after review.

Exact repair range:

- 29 paths total.
- 13 text/source/evidence paths modified or added.
- 16 tracked `scraper/**/__pycache__/*.pyc` blobs deleted.
- Text delta: 1,454 additions, 128 deletions.
- Binary paths: 16 deletions.
- `git diff --check 58516bb... 6cf22c1...`: PASS.
- No deletion outside the prohibited cache class.
- No migration, deployment, installation, scheduler, flag or production mutation.

## Independent identity recomputations

| Check | Result |
|---|---|
| Catalog bytes | `4,133` |
| Catalog SHA-256 | `92c2b9ba9705c95dfc17d5b398b5e87811430a2f65cb1022bcf01b1e5f52d792` |
| Active files | `45`, unique, strict ASCII order |
| Owners | `37`, unique, strict ASCII order, all active |
| Owner headers | `37/37` exact |
| Active reference edges | `57`, with `0` stale/unknown |
| Tree blob rows | `45/45` regular, nonempty; OID/length/SHA independently reproduced |
| Graph canonical preimage | `6,710` bytes |
| Active graph SHA-256 | `a93a85312b2b5d924d58da4c7ba2e19657018ea0991e236fbd14eb4472e1ea40` |
| Graph mutation checks | `181/181` changed digest |
| First graph row | `acceptance-evidence-contract.md`, blob `545b2bd20c934cbee39e5b193b684f8b436b7239`, 21,223 bytes, SHA `eb64f2ef0c04eccb3cc6156092bd0927280aa5eacb36f7830f995271a0306cf0` |
| Last graph row | `valuation-contract.md`, blob `c69d2fcc34f64adfdbcfc6b54c020ff03b6c8e8c`, 25,222 bytes, SHA `778835eb4e8cc00384284ac71e119da5a98b96f6122d1bd4a9eef1a871eeebfe` |

## Acceptance authority recomputation

| Check | Result |
|---|---|
| Inventory | version `1.44.0`; declared/actual/unique `297/297/297` |
| JSON/Markdown parity | Exact ordered parity, 297 rows |
| Classifications | `semantic_automated=143`, `semantic_suite_backed=148`, `structural_meta=6` |
| Tracks | `product_runtime=249`, `evaluation_governance=20`, `model_runner=28` |
| Owner rows | 297 unique, strict ASCII order; 0 classification/track/owner-handle mismatches |
| Owner digest | `43054d1bccb016d37cb24e999cb9179a88acaa1ab6356498b81ec6096d6048f4` |
| Script rows | 12 unique, strict ASCII order; 0 package-value mismatches |
| Script digest | `d6caeb641cde6a2f07480704a6fe768f5dc4978d92bc958f0f2874cb94fbcd3e` |
| PCR declarations | Exact ordered `PCR-001..PCR-031`, no skip/todo declarations |
| PCR baseline children | 31/31 pass individually with one exact pending record each |
| Ordinary PCR mode | 31 tests, 0 pass, 31 fail, 0 skip, 0 todo |
| TypeScript loading | Product-correctness test parses/runs under pinned Node 22 with strip mode |
| Evaluation governance state | Legitimately remains `blocked/non_fabricated_elapsed_cohorts_unavailable` |

The owner/script digests are internally correct but freeze the defective command values
described in P1-3.

## Reported-PE closure evidence

`ReportedPeUnavailableReasonV311` includes `authority_conflict` at
`data-contract.md:189`. The same reason type is used by:

- current reported PE at lines 207-209;
- own history at lines 210-212;
- sector comparison at lines 213-215.

The valuation axis preserves `authority_conflict` at lines 198-200.
`financial-data-contract.md:123-159` constructs conflicts from official observation
and shares selectors and requires unchanged propagation to current/history/sector plus
valuation review. PCR-030 contains the exact setup and expected preservation at
`acceptance-tests.md:352`.

This closes the former non-constructible public outcome. Runtime implementation and
executable PCR-030 remain legitimate downstream Code Gate work.

## Prohibited artifact recomputation

| Prohibited subject path class | Count |
|---|---:|
| `node_modules/**` | 0 |
| `scraper/venv/**` | 0 |
| `scraper/**/__pycache__/*.pyc` | 0 |
| `.agent/reports/**` | 0 |

## Gate separation

The subject correctly records Requirements Round 84 as `CHANGES_REQUIRED`, V3.11
implementation as not started, prior code evidence as historical and evaluation
governance as blocked on non-fabricated elapsed cohorts. Those downstream states are
not Requirements, Code Gate or Verification PASS.

The 31 pending implementations and elapsed-cohort blocker remain legitimate downstream
blockers. They do not excuse the three P1 acceptance-authority defects above.

No independent P0 or P2 finding was identified.

VERDICT: CHANGES_REQUIRED P0=0 P1=3 P2=0
