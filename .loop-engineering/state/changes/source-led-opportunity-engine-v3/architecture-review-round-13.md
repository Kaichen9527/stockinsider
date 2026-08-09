# Fresh Architecture Gate Review — Round 13 Product Value Recovery

Date: 2026-08-09
Reviewer: Codex independent read-only architecture review
Result: `PASS`
Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Requirements code subject: `fca7063442a5ea65b9bd6280837db1f9cc27fcbc`
- Code tree: `376d4cb5835af9f611dc6c62131dca4d41f9f4ab`
- Protected base: `15553f795d06c5d57ec90ef816c5f5cea41a8608`
- Requirements evidence: `requirements-review-round-102.md`, `PASS P0=0 P1=0 P2=0`

## Architecture decision

The repair preserves one bounded producer DAG and one compact read-only Vercel
consumer. The additive legacy bridge selects effective point-in-time authority rows,
adds a bounded full-sector roster, and leaves candidate deep research capped at the
existing 60-to-30-to-20 funnel. Expensive official fetches remain outside request
paths and are cached per source cutoff inside a run.

Official feeds degrade independently and expose typed partial status. Public cards
carry only bounded research evidence: exact exchange/date provenance, PE history,
BIAS/technical state, fundamental movement, risks and material-change metadata.
The compact projection remains deterministic and within its payload budget.

Research prioritization is separated from trade authority. Low-quality cards are
excluded from the best-research lane, while missing or disputed formal valuation
continues to force `valuation_review`, null target price and no buy-like geometry.
V3 API/ranking remains disabled; migration and tracked legacy producer activation do
not grant V3 Promotion authority.

## Failure and recovery map

| Failure | Closed behavior |
|---|---|
| One official endpoint fails | Other official evidence survives; typed partial status is retained |
| Duplicate append-only roster rows | One latest valid row at cutoff is selected |
| Sector roster exceeds 3,000 rows | Bridge raises `bound_violation` |
| PE provenance is missing | Exchange/date display is omitted rather than inferred |
| Aggregate score is weak | Card is `avoid` even if technical state says reclaim |
| Formal valuation is incomplete | No target price or buy action is produced |
| Real cohorts are immature | Promotion remains blocked without synthetic substitutes |

## Decision

`PASS P0=0 P1=0 P2=0`. The code subject may proceed to exact repair/full-range review
closure and authoritative Code Gate.

