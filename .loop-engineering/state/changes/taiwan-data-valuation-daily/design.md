# Design: taiwan-data-valuation-daily

Status: approved by the user on 2026-09-06.

## Data flow

1. Dataset registry selects an official primary adapter and records the expected trading/reporting period.
2. A validated FinMind request is issued only for a recorded official gap or bounded daily cross-check.
3. Normalization retains provider, upstream provider, market, symbol, period/session, available-at, fetched-at, unit, precision, revision, provenance and use basis.
4. Conflicts and terminal dispositions are appended to the run ledger; only validated facts enter point-in-time research.
5. Durable financial/IR queue workers progress independently of the candidate run and yield to final market publication.
6. Final candidate inputs are frozen, classified, published and replayed from the saved manifest before Shadow records a qualifying day.

## Valuation routes

- General issuers: product/demand/volume/ASP to revenue, margin, operating profit, tax, attributable profit, diluted shares and next-twelve-month EPS.
- Cyclical issuers: normalized-cycle earnings plus EV/EBITDA and PB cross-checks.
- Financial issuers: common equity, BVPS, average-equity ROE and capital-quality-aware PB.
- Loss-making issuers: documented commercialization/turnaround and dilution analysis; otherwise a dated, evidenced no-defensible-method result.

## Publication

- Preliminary publication exposes current completeness and may remove invalidated actionability, but cannot create new actionable authority.
- Final publication binds the card, valuation, article and classification to the same immutable revision.
- Public detail renders human-readable citations and calculations; UUIDs remain in internal audit payloads only.
