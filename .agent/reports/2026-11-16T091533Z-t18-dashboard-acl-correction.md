# T18 staged dashboard privilege correction

2026-11-16 UTC. Authentic 2026-09-19 Contabo backup. The isolated restore verified 288 foreign keys and 193 RLS-enabled tables.

An independent native PostgreSQL 17 control executed statistics reads and UUID generation under the dashboard and a stand-in API role after the narrow revoke. The statistics reset routine was never invoked.

The genuine clone reproduced the pinned pre-change namespace and exact dashboard ACL deltas. A rollback-only transaction applied the narrow public-schema and historical valuation corrections plus the targeted dashboard ACL revoke on two statistics views and thirteen routines.

| Check | Result |
| :-- | :-- |
| Dashboard statistics-reset permission absent | yes |
| Existing statistics read and UUID permissions retained | yes |
| Default ACL settings unchanged by the named-object correction | yes |
| Dashboard default ACL entries in the global and extensions scopes | none |
| Remaining extension differences limited to the explicit owner grant option with no effective permission difference | yes |
| In-memory reference namespace reproduced | yes |
| Original guard inside the corrected transaction | `publication_tail_predecessor_namespace_mismatch` |
| Rollback restored exact original namespace and dashboard grant | yes |

The in-memory fingerprint is diagnostic evidence. It was never supplied to the original migration gate, and no extension was dropped. The raw precursor catalog remains a different versioned shape.

The original unmodified publication attempt returned `publication_tail_predecessor_namespace_mismatch`. The 26 publication steps and combined latest-version rollback remain pending. All formal host signatures matched and 5 temporary roots were cleaned.

The next engineering candidate can bind to the exact raw historical namespace and its exact corrected fingerprint while also requiring the unmodified scoped-catalog fingerprint. Such a compatibility profile needs its own non-production acceptance and independent review. [PostgreSQL default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html)
