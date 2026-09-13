# Exact implementation review — pre-listing financial gaps and TPEx resilience

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e3db5d858935cd405ac1f3946a1c8beb202919ed` / `e619a187d9b4b8f2a7a343a201075e6c43ea87b9`
- Full final range: `d474ff81230c537bf3cd2e1324449b02182882be..e3db5d858935cd405ac1f3946a1c8beb202919ed`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Official listing authority is read point-in-time from `stock_instruments_v3` and carried into both candidate research and the queue-drain path.
- Financial periods ending before the first official listing date are excluded from new work and existing leased jobs are closed through a database-validated service-role RPC.
- TPEx JSON transport uses bounded retries, identity encoding, connection close, verified response length, and exact byte-range reconstruction before accepting a payload.
- Regression coverage verifies the listing boundary, service-role/lease boundary, missing-versus-not-applicable semantics, and rejection of partial range bodies.

## Security and correctness reasoning

- The application cannot invent the listing cutoff: PostgreSQL re-reads official instrument authority and rejects terminalization unless the claimed period is strictly before listing.
- The terminalization RPC requires a live matching lease, grants execution only to `service_role`, and preserves failed/partial semantics for every period that is not demonstrably pre-listing.
- Transport retries stay bounded and never accept truncated data; the range fallback checks status, `Content-Range`, chunk length, total length, and complete JSON bytes.
- One issuer's unavailable pre-listing history or TPEx transport error remains isolated from other candidates and cannot create valuation facts or a false research upgrade.

## Verification

- `node --test scripts/candidate-financial-prelisting-v7.test.mjs` — 3 passed, 0 failed.
- `npm run test:financial-evidence-completion` — 90 passed, 0 failed.
- `npm run test:financial-reconciliation` — 3 passed, 0 failed.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — production build passed.
- `git diff --check d474ff81230c537bf3cd2e1324449b02182882be..e3db5d858935cd405ac1f3946a1c8beb202919ed` — passed.

The reviewed commit closes only periods that official listing authority proves cannot exist and improves TPEx delivery resilience without weakening evidence, provenance, or upgrade gates.
