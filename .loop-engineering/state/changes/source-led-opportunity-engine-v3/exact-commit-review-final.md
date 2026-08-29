# V3.20 exact repair diff review — activation terminal boundary

Date: 2026-08-30

Review authority: independent, read-only review of the bounded V3.20 runtime
repair. It records no production database, scheduler, source acquisition,
credential, LINE, dispatch, automatic-trading, Promotion, or
evaluation-governance change.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `741dbca0edefe71785b53184963e01952b4c2ff9` / `559b31642fa1fb8a66d2e02a25ef058875a712a9`
- Full final range: `83d72000244869ee36cf3d361b105c337295f743..741dbca0edefe71785b53184963e01952b4c2ff9`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- A previous activation could read a failed or cancelled terminal run from the
  same reviewed commit and treat it as the result of a newly started
  activation. This caused a false scheduler-activation failure before the new
  worker could establish its own heartbeat.
- The repair establishes an activation-time boundary. A terminal result is
  decisive only when its terminal timestamp is at or after the activation;
  a current non-terminal run remains a valid first heartbeat. This preserves
  fail-closed treatment of a genuine new failure without allowing stale state
  to short-circuit a replacement activation.
- The regression supplies a stale same-commit failed terminal result followed
  by a current active run and verifies that the installer polls twice instead
  of returning the stale failure. Complete product-correctness tests (150/150),
  typecheck, and lint passed on this exact tree.

## Closure

No P0, P1, or P2 finding remains. The normal protected Code Gate remains the
authority for merge eligibility. This repair does not change KOL-first
nomination authority or relax the blocked non-fabricated evaluation-governance
state.
