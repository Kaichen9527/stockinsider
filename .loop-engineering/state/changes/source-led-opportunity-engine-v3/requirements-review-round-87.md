# StockInsider V3.11.1 — Requirements Gate Round 87

## Result

`CHANGES_REQUIRED` — `P0=0 P1=3 P2=0`

This was an independent fresh Sol XHigh review of immutable Requirements subject
`2ab8dfc47a3a036f322830f4af9c7127d38079af`. Round 86 repair conclusions were not
accepted as review authority. All recomputations and executable probes used the Git
tree or disposable detached copies; the repository's dirty working tree was not used
as the reviewed subject.

Architecture Round 10 and implementation remain locked.

## Findings

### P1-1 — The PCR oracle still accepts a shared generic case-ID dispatcher that never executes product behavior

The old runtime registry is gone, and each PCR now maps to a named export in a product
source path. However, ordinary execution proves only that the named wrapper returns the
single expected object. The test passes `caseId`, fixture digest and one input vector,
then compares the wrapper's result with the public `semanticVectors[caseId].outcome`.
It does not prove that the input was consumed, that an existing domain operation ran,
that any product state/side effect occurred, or that wrappers do not delegate to one
generic dispatcher.

A disposable-copy exploit added one shared `round87GenericFake(scenario)` function. It
ignored `scenario.input`, selected a hard-coded result only by `scenario.caseId`, and
returned the expected envelope. Two distinct named wrappers in the exact required
`source.ts` product path delegated to it. The unmodified PCR test reported:

```text
acceptance PCR-007  PASS
acceptance PCR-008  PASS
tests 2
pass 2
fail 0
skipped 0
todo 0
```

No cursor page was read and no `stock_id` join occurred. This directly contradicts the
active contract's statement that a generic outcome which ignores the vector is invalid.
Checking `productBehavior.name === exportName` proves only the wrapper name; the code
does not enforce the contract's distinct-function/semantic-execution claim.

The repair must bind each PCR to real production behavior: behavior-specific typed
inputs, multiple positive/negative/mutation vectors, exact outputs and observable
state/call invariants. A synthetic `state: implemented` wrapper or `caseId` outcome
table must not be able to satisfy a semantic owner.

### P1-2 — Eight PCR owner paths cannot be loaded by their mandatory Node command

The contract says product implementation can add the named behavior to each selected
product path without changing canonical test bytes. The exact mandatory command cannot
load eight of those owners before it can resolve their named export:

| PCR cases | Selected owner | Actual load failure |
|---|---|---|
| `001,002,003,005,006,020` | `web/src/lib/opportunity-v3/worker.ts` | extensionless `./canonical` cannot resolve under native Node 22 strip-types |
| `022` | `web/src/app/api/radar/daily/route.ts` | native ESM cannot resolve `next/server` in this harness |
| `024` | `web/src/app/opportunity-v3/page.tsx` | Node strip-types rejects `.tsx` before evaluation |

Additionally, importing `doctor.mjs` for PCR-004 and
`evaluation-governance-gate.mjs` for PCR-023 executes their CLI main side effects before
the test even checks for the named export. The clean exact subject's ordinary command
therefore reports `31` tests, `0` pass and `31` fail, but several failures are harness
resolution/entrypoint effects rather than the promised case-specific missing behavior.

This is a Requirements constructibility defect, not downstream implementation RED.
Define pure `.ts` semantic modules that the real worker, route, page and CLI entrypoints
consume; bind PCR unit owners to those modules and retain separate Next/Playwright/CLI
integration owners for the actual surfaces. The frozen mandatory runner must be able to
load every owner before implementation begins.

### P1-3 — GOV-004's in-process bootstrap cannot attest itself and a self-erasing preload obtains a dirty false PASS

Moving project imports below `assertCleanReviewedExecutionRoot()` closes the exact dirty
`canonical.ts` exploit from Round 86 only when the traceability process starts honestly.
The subject script is itself loaded before the check and is the sole authority that
decides whether the check runs.

Two disposable-copy exploits produced a targeted GOV-004 false PASS:

1. The traceability script was dirty and changed its own
   `assertCleanReviewedExecutionRoot()` to return immediately. Real Git reported the
   modified script, but GOV-004 reported `pass 1 / fail 0`.
2. A `NODE_OPTIONS=--import=...` preload ran before the subject script, replaced the
   Node child-process Git probes, deleted `NODE_OPTIONS` in the Node test child, and
   left `canonical.ts` dirty. The script then saw neither the inherited preload nor the
   dirty source and again reported `pass 1 / fail 0`.

`process.execArgv` does not expose a preload inherited through `NODE_OPTIONS`, and an
already-running preload can erase the environment before the script inspects it.
Capturing Node bindings inside the subject process is therefore not a trust boundary.

The clean subject still passes GOV-004 `1/1`, and ordinary unmodified dirty/untracked
files are rejected. Those are useful defense-in-depth checks, but they cannot be the
sole gate evidence. A gate runner outside the reviewed subject must first validate the
detached tree/status and launch the subject with a closed, explicitly constructed
environment and no inherited Node bootstrap. The in-process check may then revalidate
the boundary. The exact runner/preflight authority and its bytes must be frozen by the
gate contract.

## Round 86 closure assessment

| Round 86 finding | Round 87 result | Assessment |
|---|---|---|
| Generic/self-attesting PCR success | **OPEN — P1-1** | The registry was deleted and vectors are test-owned, but a shared generic dispatcher which ignores input passes multiple named owners. |
| Pre-import GOV-004 clean-tree authority | **OPEN — P1-3** | Dirty project imports are delayed, but the subject process cannot attest its own script or prior preload authority; two false PASS paths reproduce. |
| Node 22 command authority | **CLOSED, with new constructibility defect P1-2** | The command is pinned and loads the test itself, but eight selected product owners are not loadable under that exact command. |

## Immutable review boundary

- Base Round 86 subject: `be7c58009ba6d8ed36b0ea8a117ebedca10613a3`
- Reviewed Round 87 subject: `2ab8dfc47a3a036f322830f4af9c7127d38079af`
- Exact reviewed range:
  `be7c58009ba6d8ed36b0ea8a117ebedca10613a3..2ab8dfc47a3a036f322830f4af9c7127d38079af`
- Range: 10 paths, 326 additions, 285 deletions

There is no migration, deployment, scheduler, runtime installation, production-data,
flag, package-manifest or `node_modules` change in the range. `git diff --check` passes.

## Independent recomputations

| Authority | Recomputed result |
|---|---|
| Active catalog | 4,133 bytes; SHA-256 `0435fb014b76fcb0c901405ef44febf38304dc5b58e84fa84dd71f48a00ad295` |
| Active graph | 45 files; 37 owners; SHA-256 `bb564b9e53adaa6ee956bc1985be88eef6b6f8cbf09570ba8c4aa978d6e97376` |
| Acceptance inventory | `1.44.1`; 297 cases |
| Classification | 143 `semantic_automated`; 148 `semantic_suite_backed`; 6 `structural_meta` |
| Track partition | 249 product/runtime; 28 model runner; 20 evaluation governance |
| Owner rows | 297; SHA-256 `0c673f082dd302446a73c9aeae4f1e46ddefb253d164152c7e4744454a352ff6` |
| Script-value rows | 13; SHA-256 `af78e12050431628c527887322c3fc5e680e81d40ec02058157204f6e9154686` |
| Prohibited tracked artifacts | 0 |

The clean exact subject's focused GOV-004 command passed `1/1`. Its full
product-runtime traceability/baseline command completed with exit code `0`. These
results prove the honest-path structure only; the false-green probes above prevent a
Requirements PASS and do not establish Code Gate or Verification PASS.

## Required next step

Use Terra XHigh to repair all three P1 findings into a new immutable tree. Then switch
back to Sol XHigh for independent fresh Requirements Round 88. Architecture Round 10,
implementation, exact commit/review, Verification, migration, shadow activation,
promotion, PR changes and every production action remain blocked.
