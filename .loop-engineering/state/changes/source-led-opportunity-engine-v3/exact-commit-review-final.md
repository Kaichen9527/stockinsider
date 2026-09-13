# Exact implementation review — Taiwan provider retry and TPEx evidence repair

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f2f7beadd32436bc4be8e19e3f182448fdab5e7a` / `22c2923ec8eeecd6dd0ebced9c83a10b9924b3a6`
- Full final range: `3ea46b46c5610b11976203bf61a5d68fcd4df9cf..f2f7beadd32436bc4be8e19e3f182448fdab5e7a`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- Taiwan provider queue identities now bind the explicit provider/parser contract generation, so a repaired adapter creates a new immutable attempt instead of reusing a stale terminal job.
- The registered active scope replaces stale expected keys only when the contract generation changes; concurrent schedules in the same generation continue to merge under a row lock.
- TPEx institutional flow and margin evidence use the current official OpenAPI endpoints, and the object-row adapters require the requested official trading session and four-digit common-stock identity.
- Company-specific price, valuation, revenue and margin gaps remain explicit fail-closed per-company results, while exchange-wide index, institutional-flow, stock-master and trading-calendar failures remain global research blockers.

## Security and correctness reasoning

- The migration is additive and does not delete or update immutable queue audit rows. Existing v5 scope rows receive an explicit v5 default before the v6 generation is registered.
- The registration RPC validates date, phase, cutoff, queue-key hashes and a non-null closed provider version, locks the active scope row, caps the merged scope and remains executable only by `service_role`.
- A terminal company-data gap can never count as complete data or promote the affected stock. Missing, queued, running or retrying work and every critical market-evidence failure continue to block research.
- Official provider URLs are hard-coded allowlist entries. Production-VPS probes downloaded the full TPEx institutional, margin and monthly-revenue responses over HTTPS without credentials.
- TWSE margin and monthly-revenue edge-security failures remain visible dataset gaps; the repair does not relabel a blocked response as official evidence.

## Verification

- `node --test --experimental-strip-types web/src/lib/taiwan-data-provider.test.ts web/src/lib/taiwan-candidate-refresh.test.ts` — 25 passed, 0 failed.
- `node --test scripts/taiwan-data-provider-contract.test.mjs scripts/taiwan-candidate-refresh-queue-postgres.test.mjs` — 10 passed, 0 failed, including concurrent registration, generation replacement, null-contract rejection and service-role privileges on a fresh PostgreSQL cluster.
- `npm run test:candidate-shadow-performance` — runtime 220 passed and 1 environment-only skip; evidence recovery 41/41, contracts 43/43, financial completion 90/90 and reconciliation 3/3 passed.
- `npm run test:source-led-opportunity-v3:product-correctness` — 154 passed, 0 failed.
- ESLint completed with 0 errors and only pre-existing warnings; TypeScript and the Next.js production build passed.
- `git diff --check 3ea46b46c5610b11976203bf61a5d68fcd4df9cf..f2f7beadd32436bc4be8e19e3f182448fdab5e7a` — passed.

This review covers the exact implementation commit and does not claim that migration application, deployment, source acquisition or later research publication has already occurred. Those are separately verified rollout steps.
