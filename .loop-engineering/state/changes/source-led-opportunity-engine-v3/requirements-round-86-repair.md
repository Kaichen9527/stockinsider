# Requirements Round 86 P1 Repair

This is repair evidence, not a Requirements PASS, Architecture PASS, Code Gate or
Verification Gate result. It records the Terra XHigh repair of the two P1 findings
from independent Requirements Round 86 and names the next immutable subject for an
independent Sol XHigh review.

## Immutable repair boundary

| Item | Identity |
|---|---|
| Round 86 reviewed subject | `be7c58009ba6d8ed36b0ea8a117ebedca10613a3` |
| Round 86 repair candidate | `2ab8dfc47a3a036f322830f4af9c7127d38079af` |
| Exact repair range | `be7c58009ba6d8ed36b0ea8a117ebedca10613a3..2ab8dfc47a3a036f322830f4af9c7127d38079af` |
| Active catalog SHA-256 | `0435fb014b76fcb0c901405ef44febf38304dc5b58e84fa84dd71f48a00ad295` |
| Active graph SHA-256 | `bb564b9e53adaa6ee956bc1985be88eef6b6f8cbf09570ba8c4aa978d6e97376` |

The candidate changes exactly ten paths: seven active Requirement/catalog/inventory
artifacts, the traceability and product-correctness test authorities, and deletion of
the old generic `product-correctness-runtime.ts` executor. It includes no migration,
deployment, scheduler, runtime installation, production-data, flag, package manifest
or `node_modules` change. `git diff --check` passes.

## P1-1 — PCR execution can no longer self-attest through a generic registry

The generic `evaluateProductCorrectnessFixture` registry was deleted. The ordinary
PCR test now owns a closed, ordered 31-row map of exact
`[product-source-path,named-product-behavior]` handles. For every case it dynamically
imports that named product module, resolves the exact named export, invokes it with a
test-owned adversarial input vector plus canonical identity/digests, and compares the
complete result to a separate typed expected outcome. The invoked code never receives
that outcome or fixture prose. It does not accept a returned implementation path,
runtime surface, nonempty `observed` object or any implementation-owned success marker.

The direct product source handle, named export and function identity are therefore
the execution authority. A central registry or arbitrary executor can no longer make
all 31 cases green merely by returning the caller's case ID/hash and a claimed result.
Until real product behaviors exist at those paths, ordinary execution is intentionally
RED.

Evidence from a clean checkout of the exact candidate:

```text
node scripts/run-node22.js --experimental-strip-types --test scripts/opportunity-v3/product-correctness.test.mjs
tests 31
pass 0
fail 31
skipped 0
todo 0
```

Failures are case-specific missing product exports or pre-existing native Node loading
boundaries in the selected product modules. They are honest implementation RED work;
they are not converted to a Requirements or Code Gate success.

The owner-child baseline remains separately fail-closed. The clean candidate's full
product-runtime traceability command completed successfully with its 31 exact pending
baseline children, while ordinary PCR mode above still fails all 31 cases. Baseline
mode cannot be selected by the ordinary package command.

## P1-2 — GOV-004 checks the reviewed root before project authority loads

`acceptance-traceability.test.mjs` now imports only Node built-ins at bootstrap. It
captures `execFileSync`/`spawnSync` before project authority exists, rejects inherited
`NODE_OPTIONS`, `NODE_PATH`, preload/loader switches and runs the reviewed-tree,
working-tree, index and untracked-file checks before every project import/file read.
Only after this check does it dynamically load V3 modules; it then repeats the captured
capability check and asserts that the active-graph subject remains the bootstrap tree.

Focused clean-candidate execution passed:

```text
OPPORTUNITY_V3_REVIEWED_TREE=2ab8dfc47a3a036f322830f4af9c7127d38079af \
  node scripts/run-node22.js --experimental-strip-types --test \
  --test-name-pattern='GOV-004' scripts/opportunity-v3/acceptance-traceability.test.mjs
tests 1
pass 1
fail 0
skipped 0
todo 0
```

Three adversarial executions against disposable copies of that candidate failed before
any V3 source import:

| Probe | Required result | Observed result |
|---|---|---|
| Modify `web/src/lib/opportunity-v3/canonical.ts` | reject reviewed-tree drift before dynamic import | `git diff --no-ext-diff --quiet …` exits 1 at bootstrap |
| Add untracked `adversarial-untracked-authority.js` | reject untracked authority drift | porcelain reports the exact `??` path at bootstrap |
| Set `NODE_OPTIONS=--trace-warnings` | reject inherited Node bootstrap authority | `GOV-004 rejects inherited NODE_OPTIONS` before tree probes |

The clean run uses a temporary detached clone of the candidate only; no current dirty
worktree was used as evidence authority and no production state was read or changed.

## Next gate and remaining blockers

This candidate must now receive independent **Sol XHigh Requirements Round 87**.
Only a fresh `P0=0 P1=0` result can unlock independent Architecture Round 10. The 31
real product behaviors, full product/runtime verification, migration rehearsal,
shadow activation evidence, Promotion Gate cohorts, exact implementation commit/review,
PR changes and all production actions remain downstream and untouched.
