# Exact implementation review — capacity-safe Contabo cutover completion

Date: 2026-09-12

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `80e122faf99f1a4a0f82d587c5e18b11a8d104ee` / `9817048b389ba852751315c2074a23d16f928ccd`
- Full final range: `fa2e32e1c3d27baf4114e11c3434ff6982f7af6f..80e122faf99f1a4a0f82d587c5e18b11a8d104ee`
- Active graph: `10ddc6020b010a557f2ad000e11df7ebb2413432bb63351d3a4a5bdba26c46bf`

## Review result

- Reviewed the complete nine-commit range and the final tree. PostgreSQL 17 uses a dedicated named cluster, Unix-socket peer authentication, bounded WAL, loopback-only PostgREST and a loopback-only Nginx `/rest/v1/` compatibility boundary. Preparation and restore do not replace production implicitly.
- Reviewed capacity and restore failure semantics. Unknown budgets fail closed; the measured database, document, WAL, temporary, deployment and 30-day growth allocations all count against the 15 GiB reserve. A staged database is promoted only after the portable application contract succeeds, and every unverified final or staged cluster is stopped on failure.
- Reviewed credential handling. Database URI, JWT signing secret, service-role JWT and provider root key enter the VPS only through stdin, are encrypted and verified before publication, are never placed in argv or the journal, and the standalone process reads them through systemd credentials. Private artifacts remain immutable, hash-addressed and outside release directories.
- Reviewed the writer transition. Initial activation clears the copied Supabase lease, registers the exact reviewed VPS release and enables the backend identity fence in one transaction. Later release activation atomically registers the successor and rotates the same exact backend/principal identity, preventing a half-registered writer. The standalone service requires PostgREST, while all scheduled writers require the standalone service and the reviewed Contabo principal.
- Reviewed rollback and public availability. The cutover script validates the exact current release and local database before stopping the legacy web service, starts only the private data plane and standalone web service, requires a Radar canary, and restores the legacy service if activation fails. Installation alone leaves both new services disabled.
- Reviewed cleanup boundaries. The SOHO policy names exact obsolete and retained image identities; no volume, running container, shared layer or unverified model cleanup is authorized. Image deletion remains gated by encrypted export and isolated restore verification.
- Final subject verification passed: product correctness 151/151, Contabo data-plane tests 29/29, capacity/backup tests 47/47, candidate scheduling contracts 14/14, TypeScript, ESLint with zero errors, production build and full-range whitespace validation.
- Production database export/restore, measured image cleanup, capacity recheck, migration application, writer cutover, external canary, seven-day Supabase read-only observation and subscription cancellation remain operational gates. This code review does not represent them as completed.
- No unresolved P0, P1 or P2 finding remains.
