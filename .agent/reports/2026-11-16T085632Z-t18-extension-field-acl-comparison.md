# T18 extension metadata and permission comparison

2026-11-16 UTC. Contabo isolated staging. The 2026-09-19 backup was authenticated and the clone verified 288 foreign keys and 193 RLS-enabled tables.

The PostgreSQL 17 native control pinned pg_stat_statements 1.11 and uuid-ossp 1.1 and compared the same 30 reviewed database roles. Object fields were individually fingerprinted. The test also compared canonical explicit grants, object-level permission and grant options, and relation column permissions requiring namespace access.

| Member group | Objects with metadata differences | Changed fields | Objects with different effective grants | Objects with different direct grants |
| :-- | --: | :-- | --: | --: |
| relations | 2 | acl 2 | 2 | 2 |
| routines | 13 | acl 13 | 1 | 13 |
| types | 0 | none | 0 | 0 |

The authenticated extension difference was outside the measured equivalence conditions.
A reconstructed namespace fingerprint was unavailable.
The scoped catalog matched the reviewed reference after the narrow public-schema correction and historical valuation bridge. Rollback restored the starting scoped-catalog fingerprint.

The original unmodified publication guard returned `publication_tail_predecessor_namespace_mismatch`. The 26 publication migrations and newest combined Next.js rollback are still pending.

The initial attempt stopped at `fixed_db_unit_registration_timeout` before key consumption. All three units subsequently passed the cleanup check, and the retry used the same guard and input versions. The final isolated cleanup removed 5 comparison roots. The formal service, database, timers and release signatures matched.

The authentic backup grants `dashboard_user` additional object-level permissions on two statistics views and effective `EXECUTE` on one routine, `pg_stat_statements_reset`. The recorded ACL check does not execute that routine or exercise view writes. The original extension documentation lists the ordinary reset access behavior. [PostgreSQL statistics functions](https://www.postgresql.org/docs/17/pgstatstatements.html#PGSTATSTATEMENTS-FUNCTIONS)

A second isolated native control reproduced the explicit grants. Revoking just the fixed `dashboard_user` grants on the two views and thirteen routines restored the baseline effective permission checks while preserving statistics reads and UUID function access via the baseline grants. The fixture proved rollback and idempotence. The authenticated archive was used only for the ACL comparison during this run. The targeted correction is ready for isolated authentic replay, including a check of the extension default privileges before any independent review of a release compatibility change.
