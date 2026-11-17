# T18 combined historical predecessor comparison

2026-11-16 UTC. The genuine 2026-09-19 Contabo archive was authenticated and restored with the isolated T18 harness. The clone verified 288 foreign keys and 193 RLS-enabled tables.

The reference was PostgreSQL 17.11 (Ubuntu 17.11-1.pgdg24.04+2) using the reviewed schema-only Post-50 predecessor. A transaction installed only pg_stat_statements 1.11 and uuid-ossp 1.1. The membership comparison found two relations, thirteen routines and four derived types. A counterfactual edit to one routine body changed the profile hash. The native reference transaction rolled back, and the original 26-step native publication control still passed.

On the restored clone, the diagnostic matched the known public schema ACL, tried revoking its direct PUBLIC grant, and then ran the pinned historical valuation SQL in the same transaction. The verification matched three CHECK constraints and unchanged table counts.

| Check | Result |
| :-- | :-- |
| Scoped catalog categories differing before the valuation bridge | tables |
| Scoped catalog categories differing after the valuation bridge | none |
| Exact native extension metadata | no |
| Extension metadata differences | relations 2, routines 13, types 0 |
| Reconstructed namespace equals reviewed digest | unavailable |
| Actual namespace was identical before and after the trial changes | yes |
| Exact original scoped catalog restored by rollback | yes |

The diagnostic changed no production data and never altered catalog rows to reproduce the reference ACL representation. The reconstructed namespace was computed in memory only, and no extension members were dropped. The unchanged publication guard returned `publication_tail_predecessor_namespace_mismatch`. Publication committed `false`, newest full rollback `NOT_RUN`, and release HOLD retained `true`.

The production service, database, timers and release-signature comparison matched. Cleanup verified the isolated units inactive and removed 5 scratch roots.

PostgreSQL catalogs document [extension versions and schemas](https://www.postgresql.org/docs/17/catalog-pg-extension.html) and [extension membership](https://www.postgresql.org/docs/17/catalog-pg-depend.html).

The remaining comparison is exact per-field analysis of the two relations and thirteen routines. The extension-version and membership checks passed before the metadata mismatch. Treat no member as interchangeable until the property differences have been identified and independently reviewed.
