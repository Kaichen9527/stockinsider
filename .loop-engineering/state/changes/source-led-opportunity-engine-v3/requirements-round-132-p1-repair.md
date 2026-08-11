# StockInsider V3.14 — Requirements Round 132 P1 Repair

Round 132 reviewed commit `f259bade55361fb507da977fdddd4d366df677e2`,
tree `077e2992fa5c7406cffb6a268bd832837b8ac1ef`, and returned
`CHANGES_REQUIRED P0=0 P1=7 P2=0`.

The repair replaces the seven acceptance-owner false greens with executed evidence:

- REC-003 removes each of the five ranking axes independently and proves both score
  and coverage decrease, while retaining the cheap-but-low-quality boundary;
- REC-004 invokes the real Playwright V3.12 compatibility fixture and observes all
  46 unique stocks, all 30 source signals and the report link in the DOM;
- REC-008 executes schema, identity, consumer, runtime-manifest and migration
  mismatch cases, then proves the tracked runtime health evaluator maps every
  non-compatible state to `consumer_producer_incompatible`;
- REC-009 consumes the applied PostgreSQL suite and binds helper coverage to empty-
  plane staging, pre-completion zero write, terminal-atomic apply, idempotent replay
  and a subsequent-cutoff DB reread;
- REC-010 retains all ten action fixtures and adds an official four-quarter facts +
  252-session + eight-peer flow through valuation, V3.14 `buy`, compact projection,
  checksum and the Web publication trust boundary;
- REC-011 executes mixed `auth_failed`, `missing_endpoint`, `provider_failed`,
  `metadata_only` and `items_found` outcomes while binding all 51 attempts to the
  applied database conservation owner;
- REC-012 invokes fresh migration apply/apply-twice, catalog/grant/private-boundary
  and official terminal-apply tests rather than accepting SQL regex alone.

Because Playwright-owning PCRs and the new REC-004 owner both build the same Next.js
workspace, the combined product suite now uses Node test concurrency 1. This removes
the `.next` build-lock race without weakening either owner.

Local evidence passes V3.14 `23/23`, combined product correctness `75/75`, and the
applied migration suite transitively with zero failures and zero skips. This is
repair evidence, not a gate PASS. A new immutable tree and independent fresh
Requirements Round 133 remain mandatory. No production state changed.
