# V3.20 exact implementation diff review — KOL claim-payload compaction

Date: 2026-08-30

Review authority: independent, read-only review of the complete protected-base
range and the focused candidate-claim repair. This review did not mutate the
production database, scheduler, Vercel projects, source providers, LINE,
dispatch, automatic trading, Promotion, or evaluation-governance state.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `4864777f258696710519d153d867f8caecf9f67c` / `094bc77ebf99335142827362f61c1a82e9ec44ae`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..4864777f258696710519d153d867f8caecf9f67c`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The repair replaces only the historical V3.15 candidate-claim transport.
  It preserves the established outer delegation and lease-handoff chain, but
  removes construction of the active-market `coarseUniverseRows` payload before
  worker heartbeats can begin.
- Candidate-funnel claims now carry the immutable source claims and their
  source cutoff only. KOL authority remains the sole nomination boundary;
  TWSE/TPEx data can corroborate facts and valuation after nomination but cannot
  expand the candidate universe.
- The SQL retains the same strict bounds, immutable predecessor references,
  `SECURITY DEFINER` ownership, and private predecessor functions. The runtime
  role continues to execute only the final public claim RPC; it receives no
  direct table or hidden-wrapper privilege.
- The repair adds an apply-time verifier that rejects any reinstatement of the
  coarse market payload and checks the complete delegation chain. The migration
  is additive, applies twice in rehearsal, and is registered in the reviewed
  operator plan and runtime postcondition set.
- The exact range passed `git diff --check`; 150/150 product-correctness tests
  including PCR-001 through PCR-031; migration contract and apply-twice
  rehearsal; source-led core; legacy V1/V2 regression; performance; typecheck;
  lint; and production build. The first complete-suite failure caused by two
  closed migration-list assertions was repaired in the same immutable tree and
  the full suite was rerun successfully.

## Closure

No P0, P1, or P2 finding remains. The reviewed source is eligible for the
normal protected Code Gate and then a bounded production migration/runtime run.
It does not authorize fabricated investment actions, full-market discovery,
credential rotation, LINE, dispatch, automatic trading, Promotion, or a change
to the blocked/non-fabricated evaluation-governance state.
