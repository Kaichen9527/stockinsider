# V3.20 independent Architecture review — KOL-first runtime recovery

Date: 2026-08-28

Review authority: one independent, read-only Architecture review following the
V3.20 fresh Requirements PASS. No production database, scheduler, Vercel,
source connector or browser session was mutated for this review.

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Parent commit/tree: `6aaa017618f15a0082efb2cafe8c08b32947be1c` /
  `dccb0b789e576d4a0448c00d46a793903a48cad5`
- Final reviewed implementation commit/tree: `42f15635438afe82cb0424b58171eb195abb3e4a` / `f339f81b4a77e2429bb8c06ef60e52dce1f8a03d`
- Full reviewed implementation range: `6aaa017618f15a0082efb2cafe8c08b32947be1c..42f15635438afe82cb0424b58171eb195abb3e4a`
- Active graph: `4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b`

## Architecture closure

The runtime recovery path stays narrow. A new worker first asks the database to
reap at most one expired lease with its exact reviewed identity, then acquires a
new lease. The terminalizer takes row locks on the running run and leased job,
writes a fixed-shape redacted diagnostic through the owner boundary, cancels
only remaining queued/retryable jobs for that run and terminalizes the run.
The runtime role receives RPC execution only, not table or schema privileges;
the migration verifier follows the actual predecessor wrapper chain instead of
requiring provider lineage text in a delegating wrapper.

Candidate authority is a one-way graph. The KOL nomination set is closed in
one small module, checked both for new observations and prior-ledger retention.
An official observation is admitted only as corroboration for a same-stock KOL
nomination already present in the current bounded selection, and the candidate
representative remains the KOL source. This prevents full-market factors,
price dislocations, peers, seeds and low-multiple scans from re-entering the
funnel through ranking or retention.

The five connector acquisition layer keeps provider concerns isolated. Each
profile gets one outcome per source key regardless of missing endpoint or
credential; source documents are durable only when analyzable. Public Telegram
is restricted to its public mirror, and structured InvestAnchors claims remain
bounded/citation-bearing without retaining member text. Entity-link context is
validated before the candidate layer, including the 2605 generic ETF guard.

The projection contract is additive. V3.20 identity is accepted by the
runtime, Web and health readers. Freshness is a health overlay, not a mutation
of the decision envelope: the UI disables action authority while preserving the
original revision-bound dossier and citations. The compact request path remains
projection-only and the full dossier remains behind its revision URL.

No public mutating endpoint, credential reset, dispatch, LINE, automatic trade,
Promotion or evaluation shortcut is introduced. The additive migration preserves
the older V3.13 51-row source contract for its old schema and enforces 85 rows
only for the V3.20 schema, so historic payloads do not become invalid.

## Evidence examined

- Product/runtime: `146/146` PASS; migration: `74/74` PASS; source-led:
  `63/63` PASS; legacy: `2/2` PASS; performance: `5/5` PASS.
- Browser: `9/9` PASS, including keyboard, zoom, reduced-motion and theme
  cases; TypeScript typecheck and production build PASS; lint has zero errors.
- Static review: additive migration only, exact identity reaper, no table DML
  grant to the runtime role, no `official_market_factor` nomination branch,
  and `git diff --check` PASS.

This Architecture PASS authorizes an exact implementation commit and one
exact-range review. Production activity remains separately gated.
