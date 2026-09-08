# Exact implementation review — Vercel duration and writer isolation

Date: 2026-09-08

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f9041f3baa9426129b9da61a0a4e707b9b723ca9` / `0390d4da692e8cf90fb263e727ce83df35713f56`
- Full final range: `b865ea3126dfbde2221858169c9fed0daf3ff5f4..f9041f3baa9426129b9da61a0a4e707b9b723ca9`
- Active graph: `c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352`

## Review result

- Both long-running route declarations now fit the Vercel Hobby 300-second metadata limit, allowing the HTTPS OAuth and policy surface to deploy.
- Both routes reject the Vercel runtime before request parsing, lease acquisition, or pipeline execution.
- Non-Vercel callers additionally require the database-confirmed active writer release with `writer_kind=vps`; the production lease remains downstream of that gate.
- VPS systemd units are byte-identical and retain loopback execution, `flock`, the one-hour pipeline timeout, and the existing service timeout.
- The focused routing contract passed 2/2, targeted ESLint, TypeScript, and production build passed; independent exact diff and security reviews report no P0, P1, or P2 findings.
