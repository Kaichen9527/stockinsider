# Exact implementation review — research decision workspace

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `3d87824ebb24d2e8c3344f28fd413c4e80132844` / `f1c803d8de767b26af51bc26d164e111dc463357`
- Full final range: `9551cb1663974bfb30e55d3b45d382e4defb3c07..3d87824ebb24d2e8c3344f28fd413c4e80132844`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Homepage three-stage research desk, authoritative totals, complete-snapshot pagination, filters, and fail-closed closest-waiting behavior.
- Candidate detail revision binding, separated daily/monthly history, and true month-end trading dates.
- Browser-local watchlist, simulation, and decision storage, including import/export/clear behavior and separation from shared research classification.
- Responsive layout and compact public snapshot compatibility for existing Radar consumers.
- Production-standalone browser fixture startup and the readonly compatibility route exercised by the protected product runtime suite.

## Findings resolved before attestation

1. The actionable tab previously substituted waiting candidates when filters alone produced zero actionable rows. It now uses the authoritative actionable-stage total, so waiting candidates appear only when the real third stage is empty.
2. Imported browser-local research data previously accepted unbounded record maps and mismatched symbol/revision keys. Imports are now limited to 2 MB, record collections are capped, and each key must match its validated symbol and revision.
3. The rebased UI added unused market, legacy mention-count, and per-source timestamp fields to every public card. Those fields were removed while retaining the sector needed for full-snapshot filtering, restoring the compact transport contract.
4. The Playwright product runtime fixture used `next start`, which is unsupported by the repository's standalone output, and the readonly page no longer exposed the compatibility phrase asserted by the protected contract. The fixture now boots the standalone server with static assets copied into place, and the explicit Chinese readonly marker is restored.

## Verification

- `npm run typecheck` — passed.
- Focused local-state and stage-view tests — 7 passed, 0 failed.
- Candidate revision/history/public snapshot suite — 8 passed, 0 failed.
- `npm run test:e2e:v3-correctness` — 9 passed, 0 failed against a production standalone build.
- `npm run lint` — 0 errors; 33 pre-existing warnings outside this change's correctness scope.
- `npm run build` — passed, 89 routes generated.
- `git diff --check 9551cb1663974bfb30e55d3b45d382e4defb3c07..3d87824ebb24d2e8c3344f28fd413c4e80132844` — passed.

The reviewed commit preserves fail-closed research semantics: missing valuation, market, or risk evidence is not presented as passed, local decisions never alter server classification, and a detail link remains bound to its source snapshot revision.
