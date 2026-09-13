# Exact implementation review — Taiwan provider persistence and index fallback

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `768b60f36b3a19ec11a55206257c734b127c0c61` / `5fcb921cdd282bd0a03cd9ebed6008b0247caf96`
- Full final range: `30fe8d89b3dba7acb875edc89a87dd18a58d7741..768b60f36b3a19ec11a55206257c734b127c0c61`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The loopback-only Nginx data-plane proxy now accepts request bodies up to eight MiB. The public web server is unchanged. This admits the observed one-to-four MiB canonical provider results and research receipts while keeping the internal boundary finite.
- The FinMind total-return-index fallback now sends the required explicit `TAIEX` or `TPEx` index identity whenever the exchange-wide market-index job has no company symbol.
- The immutable Taiwan provider contract is advanced to v7, ensuring repaired requests receive new queue identities instead of reusing terminal v6 attempts.
- Contract and provider tests bind the Nginx limit, exchange identity, and provider-version behavior.

## Security and correctness reasoning

- `client_max_body_size 8m` appears only in the loopback server that listens on `127.0.0.1:3302`; no external route or general upload surface is enlarged.
- The new limit is above the largest observed valid payload (3.68 MiB) but remains bounded. Existing authentication, service-role grants, writer lease, and PostgREST path restrictions are unchanged.
- Index identities are closed constants selected from the already validated exchange enum; user input cannot choose an arbitrary FinMind data identifier or host.
- The provider-generation bump preserves prior attempts as audit evidence and prevents a repaired adapter from treating stale failure records as current success.
- No schema deletion, privilege broadening, secret output, source retirement, or classification-threshold change is present in the reviewed range.

## Verification

- `node --test --experimental-strip-types web/src/lib/taiwan-data-provider.test.ts web/src/lib/taiwan-candidate-refresh.test.ts` — 25 passed, 0 failed.
- `node --test scripts/contabo-data-plane-contract.test.mjs scripts/taiwan-data-provider-contract.test.mjs scripts/taiwan-candidate-refresh-queue-postgres.test.mjs` — 14 passed, 0 failed.
- `npm run test:candidate-shadow-performance` — evidence, runtime, contracts, financial completion, and reconciliation suites passed.
- `npm run test:source-led-opportunity-v3:product-correctness` — 154 passed, 0 failed.
- ESLint completed with 0 errors and only pre-existing warnings; TypeScript and the Next.js production build passed.
- `git diff --check 30fe8d89b3dba7acb875edc89a87dd18a58d7741..768b60f36b3a19ec11a55206257c734b127c0c61` — passed.

This review covers the exact implementation commit and does not claim that deployment, provider acquisition, research publication, or public canary validation has already occurred. Those remain separate rollout gates.
