# Exact implementation review — PostgreSQL reviewed TOC permissions

Date: 2026-09-13

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `e68a50db1679114f95679e33d7734d68aaa750dc` / `79418d679cf9db1530b36fefa9edeca4e00ba0fd`
- Full final range: `d03dd543ebe3053d7f608c80228525e79d95dc8b..e68a50db1679114f95679e33d7734d68aaa750dc`
- Active graph: `c563d77e416fdc2284b7aba50ca2eb03fd5f4cbed44f4edb1c918c63db96e3a2`

## Review result

- Reviewed the complete two-file repair against the current protected `main`; the production change is limited to the staged PostgreSQL restore TOC ownership and mode check, with an exact contract assertion.
- The TOC remains root-owned and non-writable by the database process, while `root:postgres 0640` permits the `postgres` identity running `pg_restore` to read the reviewed list. Other users receive no access.
- The restore still requires an exact 40-character release-bound path, rejects symlinks and unexpected ownership or mode, consumes the archive from stdin, restores only into a stage database, and refuses to replace an existing database.
- The live failed attempt stopped before any production database was named, PostgREST was activated, Web traffic was switched, or schedules were resumed. The disposable partial stage database was explicitly identified and removed before retry.
- The Contabo production restore contract passed, the exact product-correctness suite passed 151/151, and the production Web build passed.
- The active V3 product graph is unchanged. No migration, data model, credential, network-listener, source-ranking, valuation, research, classification or public-decision behavior is modified.
- No secrets, plaintext credentials, database rows or connection strings are committed or emitted. The protected ruleset remains active and this evidence does not itself merge, deploy, restore data, activate PostgREST, switch Web traffic or cancel Supabase.
- No unresolved P0, P1 or P2 finding remains.
