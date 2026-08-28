# StockInsider V3.20 — exact-commit diff review

Date: 2026-08-28

Review authority: independent, read-only exact-commit review of the immutable
V3.20 implementation. No production database, scheduler, Vercel deployment,
provider acquisition, Safari state, LINE, dispatch, automatic trading,
Promotion, or evaluation-governance state was mutated.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `501dc2fba28d06731a85469ba3fbc4b8f250528c`
- Final reviewed repair/tree: `f67df18313d5039b4ebb025875bd201a7a8bc3b8` / `d582660ea0e2b5f6e6dfbdd0fee76a569236290d`
- Full final range: `501dc2fba28d06731a85469ba3fbc4b8f250528c..f67df18313d5039b4ebb025875bd201a7a8bc3b8`
- Active graph: `13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587`

## Review conclusion

- Lease expiry is bounded to the exact run, leased job, commit, worker and
  scheduler-config identity. It produces an allowlisted durable diagnostic
  before terminalizing the run as recoverable; it cannot cancel a live or
  unrelated run.
- Candidate nomination is KOL-first. Official market factors, seeds,
  price dislocation and peers can corroborate or invalidate a KOL nomination,
  but cannot nominate or retain a card themselves. The compact projection
  repeats that boundary so a frozen legacy payload cannot revive an
  official-only card.
- The five connectors conserve one terminal outcome per approved
  profile/connector. Threads uses the official API, YouTube requires an
  authorized transcript, public Telegram is cursor-bounded, and InvestAnchors
  accepts only rights-attested structured claims with citations. No protected
  article body is persisted.
- Entity linking keeps the stock-code/name/context requirement and rejects a
  generic `新興市場 ETF` reference as a link to 新興 2605.
- The database changes are additive, restore temporary schema CREATE grants,
  retain closed SECURITY DEFINER ownership/execute boundaries, and verify the
  predecessor delegation chain rather than weakening the migration verifier.
- The Web recognises `legacy-radar-v3.20.0`, applies stale health as a
  read-only overlay without rewriting the immutable decision revision, and
  keeps each visible card in a safe readiness/detail representation.
- The V3.20 amendment is part of the active graph and the protected worker
  selects the matching Requirements and Architecture evidence rather than
  accepting V3.19 proof.

## Exact-tree verification

- `git diff --check`: PASS.
- Product/runtime diagnostic: PASS: typecheck, lint, production build,
  source-led core `63/63`, product correctness `149/149`, migration
  `74/74`, legacy `2/2`, Playwright `9/9`, performance `5/5`.
- Protected gate worker regression: `9/9` PASS.
- The exact PCR fulfillment record binds all `31` PCR entries to the exact
  source/tree/range and to product-correctness output SHA-256
  `3e90d0019d88d2a25a6fec78db303647eb7c7fa597ad3ab1c191a4536ea3468e`.

No P0/P1/P2 finding remains in the reviewed range. This review permits the
protected Code Gate and, only after it passes, the staged migration, reviewed
runtime activation, dual Web deployment and read-only smoke. It does not
authorize a database-password reset, LINE, dispatch, automatic trading,
Promotion or fabrication of evaluation cohorts.
