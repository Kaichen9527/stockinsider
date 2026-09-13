# Exact implementation review — TPEx bounded range transport v11

Date: 2026-09-14

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e40b59340a66613b3496fc238cd04f80a9da0fa1` / `3e08951c1f16458b16cf49b8d4d3d9a1dd46d008`
- Full final range: `01c47e59e9de5613c63db21f7108cc328cf387fd..e40b59340a66613b3496fc238cd04f80a9da0fa1`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Scope reviewed

- The fixed-host TPEx transport now requests the official OpenAPI object in 200,000-byte HTTP Range chunks because the production edge advertises the complete `Content-Length` but closes ordinary response bodies early.
- Chunks remain in memory, are joined as bytes before UTF-8 decoding, and are bounded by the existing five-megabyte provider ceiling.
- Only HTTP `200` or `206` bodies enter canonical parsing; a terminal `416` is accepted only after at least one complete chunk, and all other statuses remain explicit provider outcomes.
- Provider contract v11 creates a fresh immutable scope instead of reusing v10 retry rows.

## Security and correctness reasoning

- The executable remains fixed at `/usr/bin/curl`; the adapter still accepts only HTTPS `www.tpex.org.tw`, with no port, URL credentials, request body, authorization header, or cookie.
- Redirect protocols remain HTTPS-only. Each subprocess is limited to one 200,000-byte range, a five-second connection timeout, an eight-second transfer timeout, and a bounded output buffer.
- Byte buffers avoid corruption when a range boundary splits a multibyte Chinese character. The assembled body is decoded only after the total-size check.
- FinMind remains on the ordinary fetch transport, so its bearer token cannot enter subprocess arguments or journals.
- Database grants, writer leases, classification thresholds, source policies, and destructive-cleanup authority are unchanged.

## Verification

- Targeted provider, refresh, and bounded-range tests: 31 passed, 0 failed.
- `npm run test:source-led-opportunity-v3:product-correctness`: 154 passed, 0 failed.
- Provider and migration contract suite: 44 passed, 0 failed.
- TypeScript and ESLint passed; ESLint reported only pre-existing warnings.
- Next.js production build passed and generated 89 routes.
- Live Contabo evidence: ordinary TPEx responses closed early with curl error 18; three explicit byte ranges returned complete `206` payloads with the declared total length.
- `git diff --check 01c47e59e9de5613c63db21f7108cc328cf387fd..e40b59340a66613b3496fc238cd04f80a9da0fa1` passed.

This review covers the exact implementation commit. Deployment, the v11 provider canary, research publication, and the seven-day Supabase read-only observation remain separately measured rollout gates.
