# StockInsider V3.20 — exact-commit diff review

Date: 2026-08-29

Review authority: independent, read-only review of the exact V3.20
implementation range. No production database, scheduler, provider acquisition,
Vercel deployment, Safari state, LINE, dispatch, automatic trading, Promotion,
or evaluation-governance state was mutated.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Protected base: `681abfb09e13596fe7185b1ae090229b2fd29a63`
- Final reviewed repair/tree: `59436c4220774d85a2396e9978270522e02cd762` / `7021a8c063accad2b754311a87619d09bb934106`
- Full final range: `681abfb09e13596fe7185b1ae090229b2fd29a63..59436c4220774d85a2396e9978270522e02cd762`
- Active graph: `13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587`

## Review conclusion

- Lease loss writes a durable, typed recovery outcome and only terminalizes an
  expired run whose owner, commit, worker and config identity match exactly.
  Catch-up resumes from the last completed stage instead of leaving a stuck run.
- Candidate nomination is KOL-first. Official market data, low valuation,
  price dislocation, seeds and peers can only validate or veto a candidate;
  they cannot nominate or retain one. The compact projection repeats this
  boundary so legacy official-only cards cannot return.
- The five connectors conserve a terminal outcome for every configured source.
  Metadata-only material cannot create a thesis; public Telegram is
  cursor-bounded; InvestAnchors persists only rights-attested structured claims
  and citations; restricted text is not persisted.
- Entity linking requires code, company name or explicit company context and
  rejects the `新興市場 ETF` false-positive link to 新興 2605.
- The migration is additive and the verified runtime/Web contract exposes
  `legacy-radar-v3.20.0`, one readiness lane per visible card, revision-bound
  research detail and disabled action authority when projection freshness is
  stale.

## Exact-tree verification

- `git diff --check`: PASS.
- Product/runtime diagnostic: PASS — typecheck, lint, production build,
  source-led core `63/63`, product correctness `149/149`, migration `74/74`,
  legacy `2/2`, Playwright `9/9`, performance `5/5`.
- Protected gate worker regression: `9/9` PASS.
- The exact PCR fulfillment record binds all `31` PCR entries to this exact
  commit/tree/range and to the product-correctness output SHA-256
  `5d24dae93f8ed14e4bd08bcee2ae0a719c1d8aa29f951ae38b67c3744219ca68`.

No P0/P1/P2 finding remains in the reviewed range. This review permits the
protected Code Gate and, only after it passes, the staged migration, reviewed
runtime activation, dual Web deployment and read-only smoke. It does not
authorize a database-password reset, LINE, dispatch, automatic trading,
Promotion or fabrication of evaluation cohorts.
