# Exact implementation review — official calendar and source projection v15

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `fe107bafb066aa74cbe12af2c6f85b06ea9cceb7` / `0fb206e82fb24ab08b6e1a23ab735b51e630e5ee`
- Full final range: `7cf61dfbef6c42a6a1d92ba00d48f180bb373292..fe107bafb066aa74cbe12af2c6f85b06ea9cceb7`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The public connector projection no longer invents `records_written` as a stock symbol; only unique four-digit, non-year symbols are emitted.
- The stock-master job no longer treats the TWSE annual holiday schedule as completed-session evidence.
- A dedicated calendar sync fetches the current and prior month from official TWSE and TPEx index-history endpoints, hashes the exact response bodies, and submits each cross-market pair to the existing validated calendar endpoint.
- The calendar sync is serialized by the production writer lock and runs at 06:05 and 18:20 Asia/Taipei, before dependent daily processing.
- The standalone release allowlist and its package fixture include the calendar sync, so the installed timer cannot reference an omitted runtime file.

## Security and correctness reasoning

- Provider URLs are fixed HTTPS exchange endpoints; callers cannot supply an arbitrary URL.
- Raw official pages are bounded to 500,000 bytes, reject HTML, carry response SHA-256, and remain subject to the endpoint's exact schema, cross-market intersection, active-writer, and date checks.
- The internal key is loaded only from `/etc/stockinsider/stockinsider.env`; it is not embedded in the unit, repository, URL, process arguments, or log output.
- Both the stock-master job and calendar job use `stockinsider-production-write.lock`, preventing overlap with other production writers.
- Failed or divergent exchange evidence exits non-zero and cannot append a synthetic weekday or fabricate an open session.
- Standalone packaging verifies the source and packager commits, rejects dirty tracked tooling, and hashes the included calendar worker into the release manifest.

## Verification

- Source-health tests: 10 passed, 0 failed.
- Official-calendar parser tests: 1 passed, 0 failed.
- Taiwan provider and scheduler contract tests: 10 passed, 0 failed.
- Standalone package tests: 4 passed, 0 failed.
- Full product-correctness suite: 154 passed, 0 failed.
- TypeScript passed; ESLint passed with 33 pre-existing warnings and zero errors.
- Production build passed.
- `systemd-analyze verify` accepted the new service and timer on Contabo.
- Live read-only provider probe parsed nine matching TWSE/TPEx sessions for 2026-09-01 through 2026-09-11.
- `git diff --check 7cf61dfbef6c42a6a1d92ba00d48f180bb373292..fe107bafb066aa74cbe12af2c6f85b06ea9cceb7` passed.

This review covers the exact implementation commit. Deployment, timer activation, production calendar write, history-backfill canary, and public status verification remain separate rollout gates.
