# Exact implementation review — candidate history authority reconciliation

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `9b0f3fe5d233c04efad60259aa5300a2b7387c63` / `f8f66fd9e82ce7236233514d9c911a632727993c`
- Full final range: `571ffd80a55070e7edd5e6a7be3e34a83eb5c521..9b0f3fe5d233c04efad60259aa5300a2b7387c63`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Deep candidate history acquisition now starts at the oldest missing month. The bounded worker no longer lets a mutable current-month response starve five-year price and 60-month multiple acquisition.
- A complete exchange-owner response may replace a legacy non-authoritative cache row. The displaced value, provenance, source, replacement and reason are retained append-only in `candidate_history_authority_reconciliations_v1`.
- An exchange-owner versus exchange-owner disagreement remains quarantined. A provider conflict remains sticky and cannot be cleared by an unrelated later download.
- TPEx monthly lot volume is treated as equivalent only to an already authoritative exact-share row in the same thousand-share bucket. A non-authoritative mirror is still replaced and provenance-upgraded even when its rounded value is equivalent.
- TWSE CDN terminal status 307 is reported as `official_security_block` and participates in the endpoint circuit breaker instead of masquerading as a generic HTTP error.

## Production evidence reviewed

- The failed production backfill attempted 80 jobs without progress while current-month checkpoints recorded `official_history_existing_row_conflict`; one observed example combined a FinMind 49,382-share cache row with TPEx's official 49-lot monthly row.
- A transaction-rollback test against the real Contabo schema reconciled that 9951 example to the TPEx value, emitted the complete terminal, retained the old/new audit pair and then rolled the entire test back.
- Direct Contabo requests to TWSE's per-stock archive currently receive the exchange CDN bilingual security page with terminal HTTP 307. The same official endpoint succeeds from the operator host, so deployment must keep this transport block explicit and use a controlled operator-side historical canary for the one-time archive fill.

## Security and correctness reasoning

- Only rows submitted through the existing authenticated, release-fenced completion RPC and bound to an allowlisted HTTPS exchange URL can adjudicate a mirror row.
- No historical row is deleted. Replacement is performed under the issuer/dataset/month advisory transaction lock and records both sides before changing the live authority row.
- RLS remains enabled; public, anonymous and authenticated roles receive no table or function privilege. Only `service_role` retains RPC execution and audit reads.
- Existing official-source contradictions, explicit provider conflicts, malformed provenance and invalid OHLC/period/unit inputs remain fail-closed.

## Verification

- Exact-commit product-correctness suite: 154 passed, 0 failed; captured output SHA-256 `04e6528ac430e89cea5e29604eeb971774fb6ee94374bc82090730aebcb40d4c`.
- Full product/runtime diagnostic completed successfully, including TypeScript, ESLint, production build, migration/PostgreSQL contracts, nine Playwright end-to-end tests and the controlled performance oracle.
- Focused history, research and market tests passed 63/63 before the full diagnostic.
- The additive SQL migration parsed against the real Contabo catalog inside a rolled-back transaction; its real-row adjudication canary also completed and rolled back.
- `git diff --check` passed.

This review covers the exact implementation commit. Merge, production migration, exact-merge packaging, Contabo deployment and the post-deploy history canary remain separate rollout gates.
