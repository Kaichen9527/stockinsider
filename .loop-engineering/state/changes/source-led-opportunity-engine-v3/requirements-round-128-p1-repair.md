# Requirements Round 128 P1 Repair

Round 128 reviewed commit `834c140e82b9c8acd022f1ed71cadf0a016d3c21`
(tree `cca6e72aa7fb97b9e3baaf02b02dfab74e968d7f`) and returned
`CHANGES_REQUIRED P0=0 P1=2 P2=0`.

The repair closes both authority roots:

- Runtime current/history/peer selection and SQL append/reconstruction now share the
  same closed TWSE/TPEx source-reference grammars and PE/PB ranges. Current and peer
  evidence is official OpenAPI; bounded history also permits the two official RWD
  forms. SQL rejects non-positive or PE over 200, PB over 100, arbitrary prefixes and
  malformed source identities.
- SQL completion compares both raw multiples exactly. The applied PostgreSQL fixture
  places authentic current PE exactly on the 15% discount boundary, then rejects
  unchanged-root `12.7500000000001` and reference-multiple drift. It also proves the
  append RPC rejects out-of-range PE and noncanonical source references.
- The user-approved V3.13 plan is recorded as DI-004 acceptance-change authority. JSON
  and Markdown now identically require absent revision selection to use only the
  current validated `DecisionEnvelopeV313`, never an independent legacy heuristic.
- One pure query parser now owns absent, valid, malformed, uppercase, truncated,
  duplicate and conflicting revisions. The exact DI-004 TAP owner executes that matrix,
  FULL/LIGHT null authority, unique current-card selection and legacy-bypass guards.

Focused evidence after repair: DI-003 passes `1/1`, DI-004 passes `1/1`, and the full
applied migration contract passes `48/48`, including the four new negative authority
probes. Complete post-repair diagnostics also pass: typecheck, lint, production build,
base `61/61`, product/V3.13 `49/49`, legacy `2/2`, Playwright `3/3`, performance `4/4`,
model runner `17/17`, and disabled-mode doctor `pass` with host pin v3.7. Protected
external attestation is not claimed by this local run. No production operation was
performed.
