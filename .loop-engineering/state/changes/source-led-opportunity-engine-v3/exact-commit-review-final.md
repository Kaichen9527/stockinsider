# Exact implementation review — Taiwan provider completion hotfix

Date: 2026-09-06

Review authority: independent read-only review of the complete immutable diff,
the provider-attempt persistence contract, completed-session selection, internal
writer authentication, queue identity, migrations, and focused regressions.

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e22600e3cf5ec921d735c81c6fa018f48dbd0a5b` / `bbbca8c5bd42098f7ee71f14f9169f0414999639`
- Full final range: `35c66d4628513a624382bfc60cf319d9e26ada1a..e22600e3cf5ec921d735c81c6fa018f48dbd0a5b`
- Active graph: `1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc`

## Review result

- JSON `null` provider metadata is converted to SQL `NULL` before insertion.
  Object-valued API usage and normalized payloads remain unchanged, so the
  database constraints retain their fail-closed validation.
- An omitted close-data date now resolves through the latest completed,
  already-closed authoritative Taiwan trading session. Explicit historical
  dates remain stable, and stock-master/calendar-only jobs keep their requested
  calendar date.
- The resolved session is bound into both the durable queue key and stored job
  identity, preventing a weekend request from being persisted under a different
  canonical date.
- Resolution happens only after exact internal bearer authentication and the
  active VPS writer lease. A missing or failed calendar authority returns a
  terminal non-2xx response rather than guessing a trading day.
- Focused provider tests passed 12/12 and migration/provider contracts passed
  7/7. The exact diff contains no credential, public trust-boundary expansion,
  destructive schema change, or permissive valuation fallback.

## Closure

Independent exact-diff and security review found no remaining P0, P1 or P2
release blocker in this hotfix. It is safe to merge and deploy after the
additive `CREATE OR REPLACE` migration is applied and the production queue
canary confirms terminal attempts can be persisted.
