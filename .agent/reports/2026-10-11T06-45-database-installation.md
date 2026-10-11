# Database installation continuation

The existing-deployment installation chain now includes all18 omitted successors and executes the real final PostgreSQL verifier inside one transaction. The48-file base SQL/digest is unchanged;73 selected files apply72 with one reviewed superseded rewrite. This is a schema-only restoration of the actual VPS baseline, not a fresh Supabase installer or production migration.

Mac regression22/22, zero skips, normal build, typecheck and lint passed. Actual tests cover prerequisites, role/bootstrap rollback, ACL/RLS/trigger/overload mutations, connection loss, concurrent installers, pgpass challenge rejection and the on-disk-versus-loaded HBA counterexample. Independent WIP review found two P2 transport defects; both were repaired and final exact scoped review is pending. Read-only VPS probes confirm `peer:postgres` and an actual local runtime HBA reject. No production role/schema/data changed.

The27 raw Cloud files (44,875bytes) in244eccba were independently hash-verified. Their original empty-PG `auth` schema RED is retained; it is not a live-production missing-schema claim. The new full baseline still needs Linux verification at its exact final code.

Protected review remains a separate requirement: missing final exact-review ref/full PCR evidence and a trusted runner pin targeting a removed Codex path. A candidate signature or ordinary GitHub admin access cannot manufacture approved recovery authority. This report is engineering evidence, not a protected release attestation. AUO remains a demonstration; real publication, strategy adoption and schedule acceptance remain unfinished.
