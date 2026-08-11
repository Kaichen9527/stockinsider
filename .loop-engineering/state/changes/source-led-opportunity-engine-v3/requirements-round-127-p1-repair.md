# Requirements Round 127 P1 Repair

Round 127 reviewed commit `5829f2e3d6413230b00fc9988f929d2254d577c1`
(tree `025e15c4c2dc5dda9ed1aa2910a42c7479133f43`) and returned
`CHANGES_REQUIRED P0=0 P1=2 P2=0`.

The repair closes both findings at their shared authority boundaries:

- `entryPlan` is now a discriminated union in TypeScript and an identical closed
  validator in Runtime, Web and SQL. `below_support|reclaim_required` require a
  `reclaim` trigger with null geometry; `breakout_pending` requires a `breakout`
  trigger and valid long geometry; `extended` requires a `pullback` trigger with null
  geometry; `invalidated` requires no trigger or geometry; tradable confirmed/support
  states carry valid geometry and no pending trigger. Numeric, arbitrary and wrong-
  state triggers fail. Missing kinds, unknown trigger members and unknown entry-plan
  members also fail; SQL uses null-safe kind comparison so JSON missing a discriminator
  cannot pass through PostgreSQL three-valued logic.
- Conditional valuation now carries `official-relative-pe-evidence-v1`: exact roots
  for the current observation, the ascending 252-session same-stock membership, the
  sorted same-session/same-exchange/same-sector peer membership, and their combined
  evidence preimage. Counts must equal the bound memberships. Runtime and Web require
  the evidence roots; SQL completion reconstructs the evidence from the exact
  cutoff-resolved official plane and compares every multiple, count and root before
  persisting a conditional decision.

Applied PostgreSQL coverage constructs 252 official subject sessions and eight peers,
proves byte-identical SQL/Node roots, accepts the authentic authority, and rejects one
forgery that changes both multiples/counts and all roots. The Runtime/Web/SQL negative
matrix rejects wrong trigger kinds and invalidated triggers. A V3.12 compatibility
regression also proves that an older scalar-only sector reference remains usable for a
research score but cannot manufacture V3.13 valuation evidence.

Complete post-repair diagnostic results: typecheck, lint and production build pass; base `61/61`,
product/V3.13 `49/49`, applied migration `48/48`, legacy `2/2`, Playwright `3/3` and
performance `4/4` pass. Model runner passes `17/17`; doctor returns `pass` for disabled
deployment with `model-runner-host-pins-v3.7`. The protected external attestation is
not claimed by this local repair run. No production operation was performed.
