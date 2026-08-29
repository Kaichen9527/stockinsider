# V3.20 exact implementation diff review — KOL-first candidate-funnel repair

Date: 2026-08-29

Review authority: read-only examination of the full immutable V3.20 protected-base
range and the focused runtime-recovery delta. This review did not mutate production
data, runtime, scheduler, Vercel, source providers, LINE, dispatch, automatic
trading, Promotion, or evaluation governance.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `779d1db2e6d3e25a75c59410e920a7519fe9e0b2` / `630c236d07aebb356818d3fb4c59dc7d03066c50`
- Full final range: `7f461e74dc7d786a455106e20551df13d2c9131f..779d1db2e6d3e25a75c59410e920a7519fe9e0b2`
- Active graph: `329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64`

## Review result

- The candidate funnel no longer issues an `official_coarse_market` acquisition
  or factor-ranks the Taiwan-wide universe. A reviewed 3,000-symbol fixture
  proves it performs zero official fetches and still promotes an authorized
  InvestAnchors KOL claim. The retired factor field remains an explicit,
  zero-card compatibility marker rather than a hidden nominee source.
- Official TWSE/TPEx acquisition remains in `facts_refresh`, where it is bounded
  to source-led candidates and their peers. The frozen provider lineage now
  requires `approved_sources` and `official_tw_market`; an unrelated coarse
  market scan cannot disable an otherwise complete, source-led decision.
- Existing additive lineage migration support for historical
  `coarseProviderAcquisition` remains read-compatible. This repair adds no SQL,
  table access, RPC grant, public mutation endpoint, credential handling, or
  release activation surface.
- The reviewed tree passed `git diff --check`, 76/76 migration-contract tests,
  and 150/150 product-correctness tests, including all 31 PCR cases. Existing
  KOL nomination, 2605 false-positive rejection, metadata-only exclusion,
  valuation, technical geometry, research-only fallback, and disabled V3 public
  endpoint controls remain intact.
- Output remains research-only until verified official facts, valuation,
  technical authority, and runtime health exist. No target price or buy action
  is fabricated, and evaluation governance remains non-fabricated/blocked.

## Closure

No P0, P1, or P2 finding remains. This reviewed tree is ready for the normal
protected Code Gate, followed by bounded runtime recovery and read-only
production verification.
