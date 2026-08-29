# V3.20 exact repair diff review — KOL claim owner capability

Date: 2026-08-30

Review authority: independent, read-only review of the production-rehearsed
ownership repair. The migration attempt was transactionally rolled back by
PostgreSQL before writing anything because its owner handoff lacked the
destination role's temporary schema CREATE capability. This review did not
mutate the production database, scheduler, Vercel projects, source providers,
LINE, dispatch, automatic trading, Promotion, or evaluation-governance state.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f72ee1ada533e175b4a81081ed4e5a383619cb7d` / `7dd384f58a552a778f2d302ee176977717913e0b`
- Focused repair range: `4864777f258696710519d153d867f8caecf9f67c..f72ee1ada533e175b4a81081ed4e5a383619cb7d`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..f72ee1ada533e175b4a81081ed4e5a383619cb7d`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The focused repair is limited to the H18 compaction migration and its
  contract regression. It preserves the KOL-only compact claim transport,
  candidate source cutoff, hidden predecessor, runtime privilege boundary and
  all existing bounded payload checks.
- It grants CREATE on `public` only inside the transaction to the two existing
  function-owner roles, then revokes it before the postcondition block and
  commit. No login, table, sequence, schema-wide persistent CREATE, direct
  runtime-table privilege, or role membership is introduced.
- The retained H16 authoritative predecessor remains owned by
  `opportunity_v3_rpc_owner`; the v3.20 verifier remains owned by
  `legacy_correctness_rpc_owner`. This matches their established security
  boundaries instead of transferring the hidden predecessor to a broader
  correctness owner.
- The new regression asserts the exact temporary capability sequence, both
  final owners, and explicit postcondition checks that both CREATE grants were
  revoked. The exact tree passed 150/150 product-correctness PCR cases,
  `test:source-led-opportunity-v3:migration`, the V3.15 recovery suite, and
  `git diff --check`. The normal protected product/runtime gate will rerun the
  complete product suite before release.

## Closure

No P0, P1, or P2 finding remains. The reviewed source is eligible for the
normal protected Code Gate and then a bounded production migration/runtime run.
It does not authorize fabricated investment actions, full-market discovery,
credential rotation, LINE, dispatch, automatic trading, Promotion, or a change
to the blocked/non-fabricated evaluation-governance state.
