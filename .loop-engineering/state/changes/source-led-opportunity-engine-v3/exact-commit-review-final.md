# Exact commit review: canonical official market evidence and history fallback

Result: `PASS`

P0=0 P1=0 P2=0

## Scope reviewed

- Exact implementation range `8bacc6ddffc529dcd386bcec1e8de4158c0d5ba1..0b0592362622c6f8081574223b321274112eff6f` and reviewed tree `e5621485efdc0c361f8f10ed332beffd83edf86c`.
- `web/src/lib/market-evidence.ts`, `web/src/lib/tw-market.ts`, their focused tests, and additive migration `20260902_official_market_evidence_history.sql`.
- Official endpoint authority, 520-session market coverage, breadth roster coverage, five-session foreign flow, last-good retention, price-history fallback, and fail-closed classification behavior.

## Findings

- No P0/P1/P2 findings remain. TWSE and TPEx index, breadth, and foreign-flow evidence is fetched only from official HTTPS endpoints and persisted with `as_of`, `available_at`, provenance, and source URLs.
- Market state remains `data_incomplete` with a null risk budget unless both 520-session index histories, both active-common breadth rows, and both exchanges' five-session foreign flows are present.
- A partial official refresh now retains every prior non-null field instead of overwriting last-good evidence with nulls. Missing or challenged responses therefore cannot manufacture completeness or erase valid evidence.
- TWSE historical stock bars use the official `rwd` all-market archive first, retain the bounded legacy official endpoint as fallback, and merge a short fragment with official monthly history before the MA240 gate.
- The migration is additive, enables RLS, grants application access only to `service_role`, and does not delete historical rows.

## Verification

- `npm exec tsx -- --test $(find src -name '*.test.ts' -print)`: 141/141 passed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 150/150 passed after installing the repository lockfile dependencies.
- Focused final-head market evidence tests: 3/3 passed.
- `cd web && npm run typecheck`: passed.
- `cd web && npm run lint`: passed with pre-existing warnings and zero errors.
- `cd web && npm run build`: passed.

## Evidence

- Final reviewed repair/tree: `0b0592362622c6f8081574223b321274112eff6f` / `e5621485efdc0c361f8f10ed332beffd83edf86c`
- Full final range: `8bacc6ddffc529dcd386bcec1e8de4158c0d5ba1..0b0592362622c6f8081574223b321274112eff6f`
- Active graph: `81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4`
