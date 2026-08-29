# V3.20 exact implementation diff review — protected-base closure

Date: 2026-08-29

Review authority: read-only examination of the complete immutable V3.20 range,
the marker repair range, the protected-base host-oracle bootstrap, and the
combined product/runtime test results. This review did not mutate production
data, runtime, scheduler, Vercel, source providers, LINE, dispatch, automatic
trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `7f461e74dc7d786a455106e20551df13d2c9131f` / `c578a2249f2a402f617c0ede8b968498e43dff18`
- Repair range: `0dbc1d85d11a9bd16457a380b42cebfcf2f93b6a..18bed007486a81db4a4c1a7ee144d0b6c5b7a88f`
- Full final range: `181d76aadf3da84dea28aa3e560fded4992b1674..7f461e74dc7d786a455106e20551df13d2c9131f`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The complete range and repair range pass `git diff --check`.
- V3.20 keeps candidate nomination KOL-first: approved connector evidence can
  nominate; official market, seed, valuation, dislocation, and peer evidence
  can only validate or veto. The source funnel stays bounded at 60→30→20 and
  source terminal outcomes remain typed and conserved.
- The expired-run reaper requires the exact owner, commit, worker, and config
  identity. Lease loss becomes a durable typed outcome, so a stale run cannot
  retain action authority or hide a resume path.
- The projection-marker migration accepts only four complete canonical deployed
  predecessor fragments. A read-only deployed-wrapper preflight selected one
  fragment; unknown grammar remains fail-closed. Contract tests require exactly
  two marker keys, one accessor, and no predecessor literal after two applies.
- The protected-base bootstrap preserves the operating-system authentication
  check, then gives only the pinned helper a freshly-created 0700 scratch cache.
  It does not expose the credential-bearing HOME, weaken candidate sandboxing,
  or alter product/runtime authority.
- The merged implementation passes full product/runtime: typecheck, lint,
  production build, 63/63 core tests, 31/31 PCR product-correctness tests,
  74/74 migration tests, 2/2 legacy regressions, 9/9 Playwright tests, and 5/5
  projection-performance tests. The merged model-runner suite passes 21/21.
- This evidence does not itself authorize activation. Release still requires
  normal protected checks, the reviewed additive migration, runtime, Vercel,
  and read-only smoke gates.

## Closure

No P0, P1, or P2 finding remains. The prior protected host preflight failure
has a root-cause repair and regression test; the repaired tree is ready for
the normal protected Code Gate.
