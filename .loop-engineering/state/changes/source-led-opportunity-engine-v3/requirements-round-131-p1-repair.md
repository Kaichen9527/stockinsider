# StockInsider V3.14 — Requirements Round 131 P1 Repair

Round 131 reviewed commit `2aefcf2fdb81f8a751f90bd3626192c6fd6cc113`,
tree `29532559faafd3154af743c592a6c68e943e03eb`, and returned
`CHANGES_REQUIRED P0=0 P1=4 P2=0`.

The repair closes all four roots together:

- official acquisition chunks now stage their exact JSON payload append-only;
  no official authority table changes before a unique, contiguous and bounded
  terminal manifest is validated;
- the existing V3.13 completion wrapper is extended in place and remains the
  completion authority for every stage; after it validates the live lease and
  persists the V3.13 decision/revision contract, private official chunk apply runs
  in the same transaction, so any failure rolls everything back;
- MOPS segment, scenario, explicit-member and typed-member contexts are rejected,
  preventing dimensional facts from winning over consolidated issuer facts;
- valuation requests are deduplicated and bounded after union at 252 sessions per
  exchange, while corporate-action acquisition receives only the latest 130
  completed sessions per exchange even when the annual calendar is larger.

New executable regressions cover pre-terminal zero-write behavior, the actual
PostgreSQL apply-twice/private-function boundary, dimensional MOPS contexts, and
the 504/260 effective request limits. Local targeted evidence passes V3.14
`23/23`, the combined product suite `75/75`, and applied migration `49/49`.

This is repair evidence, not a gate PASS. A new immutable tree and independent
fresh Requirements Round 132 remain mandatory. No production state changed.
