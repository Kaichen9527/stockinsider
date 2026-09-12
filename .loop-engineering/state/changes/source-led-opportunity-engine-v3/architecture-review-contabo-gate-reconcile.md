# Independent architecture/security review — Contabo private data plane

Result: `PASS`

Findings: `P0=0 P1=0 P2=0`

Reviewer: isolated architecture/security review of the exact immutable subject

## Exact reviewed identity

- Final reviewed implementation commit/tree: `b5dbac60f3de302d3883ada5dd62a5b51b264e34` / `7eb28c7326de509ad7e7e4913539a75b2b868f55`
- Full reviewed implementation range: `c17b0e00eb32892a2b557189cdf525ef8a23a388..b5dbac60f3de302d3883ada5dd62a5b51b264e34`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`
- Checkout: clean
- `git diff --check`: pass

## Review conclusion

The subject introduces a private, portable PostgreSQL/PostgREST data plane
without exposing the database publicly or weakening StockInsider's writer and
principal boundaries. It is deployable independently from production
activation and preserves a fail-closed path back to the last-good public
snapshot during cutover.

### Network and identity boundary

PostgreSQL and raw PostgREST are loopback-only. A dedicated loopback Nginx
listener provides the exact `/rest/v1/` SDK compatibility path and rejects
unrelated routes. The runtime rejects remote hosts, missing release identities,
malformed principal IDs and unpinned credentials. Existing Supabase mode keeps
its exact project-host and service-key digest guard.

### Secret and artifact boundary

Database URI, PostgREST signing material, service JWT and provider root key are
loaded as systemd credentials rather than command-line, repository or journal
values. Provider ciphertext uses identity-bound AES-256-GCM with fresh nonces,
generation compare-and-swap and revocation-race protection. Private documents
are stored outside release directories by content hash with verified immutable
publication and traversal/symlink defenses.

### Restore and activation boundary

The portable restore path streams authenticated encrypted input over a local
socket and excludes provider-managed Vault objects replaced by reviewed local
primitives. Rehearsal verifies roles, ACL/RLS, functions, triggers, tables and
application access. The installer validates ownership and Nginx configuration
but does not grant the production writer lease; activation is a distinct SQL
operation for the maintenance window.

### Gate reconciliation

The subject replaces stale v3.17 inventory mirrors with their exact canonical
values and removes all one-commit transition normalization. Canonical authority
tags, Markdown/JSON mirrors and script-value rows return to strict equality.
The protected worker maps only the recomputed active graph
`c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`
to these fixed direct-child review refs.

## Verification performed

The exact commit passed 151 product-correctness tests, 25 Contabo data-plane
tests, 46 capacity/backup tests, 15 protected-worker tests and the three
structural gate checks. `git diff --check` is clean. Review found no plaintext
secret persistence, public database listener, destructive schema migration,
volume deletion or automatic writer activation.

## Boundaries

This PASS approves only the exact source subject. Production database restore,
final credential transfer, writer cutover, canary, seven-day Supabase read-only
observation and subscription cancellation are operational gates and are not
asserted complete here.
