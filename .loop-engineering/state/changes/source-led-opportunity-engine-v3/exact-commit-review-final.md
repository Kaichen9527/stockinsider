# Exact implementation review — Contabo private data plane after gate recovery

Date: 2026-09-12

Final verdict: `PASS`

Findings: `P0=0 P1=0 P2=0`

## Immutable subject

- Final reviewed repair/tree: `f715adffe7908bc4c48315e79bf8ce59c815d2ce` / `ef59f85f33a90775eb79cd6ad4bcd5cadb08d31b`
- Full final range: `623a2dcf397297c806aeddd6dd4e5f60254e92c3..f715adffe7908bc4c48315e79bf8ce59c815d2ce`
- Active graph: `dea5f4dee7aadf11435bd95f5f0d8024605e5f298f9a02645aa9352865099b7f`

## Review result

- Reviewed the complete branch range and the final merge with protected `main`. The merge adds only the already-reviewed closed v3.16 to v3.17 signed-host rotation and its graph-bound requirements and architecture evidence; it does not weaken the Contabo data-plane constraints.
- The Supabase project-host and key-digest guard remains fail-closed. Contabo accepts only the fixed `127.0.0.1:3302` SDK compatibility boundary, a full release identity, backend and principal UUIDs, and a pinned JWT supplied through systemd credentials.
- Raw PostgREST remains loopback-only on 3301 and the dedicated Nginx compatibility listener remains loopback-only on 3302. Only `/rest/v1/` is forwarded with the prefix removed; all other paths are rejected.
- Database URI, PostgREST signing secret, service-role JWT and provider root key remain encrypted systemd credentials. Installation validates ownership and Nginx syntax but does not activate the production writer before the reviewed cutover.
- The portable backup rehearsal still verifies schema, owners, ACL, RLS, RPC, application tables/functions, encrypted archive identity, storage inventory and provider recovery material before a backup set can become complete.
- Provider credentials remain identity-bound AES-256-GCM records with generation compare-and-swap and revocation-race protection. Private artifacts remain immutable, hash-addressed, traversal-safe and verified after publication.
- The final subject passed the 151-test product-correctness suite, 25 Contabo data-plane tests and 46 capacity/backup tests. The protected model and product gates remain authoritative for the complete acceptance inventory.
- Production migration, final credential transfer, writer activation, VPS canary and the seven-day Supabase read-only observation remain operational deployment gates and are not represented as completed by this code review.
- No unresolved P0, P1 or P2 finding remains.
