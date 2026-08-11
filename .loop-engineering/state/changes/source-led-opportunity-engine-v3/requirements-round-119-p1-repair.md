# Requirements Round 119 — P1 Repair Evidence

Round 119 subject: `f29b9d70d7d6230e09a8612ff50b6b743ee92995` / tree
`d13edef2c4bdcba18e73cb951959e5cb78967506`.

## Root closure

1. Runtime now collapses each official fact identity by the complete precedence head,
   treats differing equal-head normalized values as `authority_conflict`, exposes no
   winner lineage and is permutation-independent. Candidate and peer EV selectors use
   equal-head aggregation rather than `DISTINCT ON` winner selection.
2. The candidate fact plane ranks complete fact identities by the contract's per-series
   limits and retains all revisions at the selected head; the raw 256-row truncation is
   gone. Official acquisition rejects an over-bound array before persistence and no
   longer slices member 601 or any other official array in memory.
3. Dispatch now uses only canonical sectors and the closed first-eligible rules:
   finance residual-income/PB, construction NAV, all ten cyclical normalized-PE sectors,
   ordinary PE and the loss-company EV paths. Runtime supplies twelve-quarter cycle,
   eight-quarter ROE and PE/EV cross-check inputs rather than fixture-only values.
4. Per-share book value is no longer emitted as NAV. Official total NAV uses a monetary
   unit, append validates that unit, and construction valuation divides total NAV by
   diluted shares before applying the fixed `0.65/0.80/0.95` discounts. NAV and residual
   income are official formula paths and do not require fabricated peer multiples.
5. Acquisition observes normalized code point 100001 and emits `content_overflow` with
   count 100001 and null payload/hashes. Persistence uses a separate terminal identity,
   allowing the typed revision to be conserved without inventing a canonical content
   hash; SQL validates the exact complete/overflow union.

## Regression evidence before freeze

- V3.13 decision-integrity tests: `11/11 PASS`.
- Applied PostgreSQL migration suite: `46/46 PASS`, including candidate EV conflict
  closure and twelve-period fact-plane selection retaining both latest equal-head rows.
- The source-plane catalog oracle was updated for nullable canonical hashes and the
  separate terminal identity.
- Full product/runtime, Web, model-runner, browser, accessibility and performance
  verification remains pending after Requirements and Architecture gates.

These are repair diagnostics, not a Requirements verdict. A new immutable subject and
an independent fresh Requirements review are still required. No production migration,
runtime activation, connector installation, Web publication or source write occurred.
