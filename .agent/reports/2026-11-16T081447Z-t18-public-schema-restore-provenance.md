# T18 public schema permissions and restore provenance

2026-11-16 UTC. Authentic 2026-09-19 encrypted Contabo backup and a separate PostgreSQL 17 native control.

The previous evidence attributed too much to the schema ACL difference. The reviewed first predecessor digest covers relations, routines, roles, and types. The separate scoped catalog fingerprint covers schema ACLs. The existing protected installer tests both stages in that order.

The reference control recreates the public schema using the captured October schema. The portable backup starts with the initialized database's public schema. The native control confirmed that a fresh database grants PUBLIC USAGE, that a dump can have no public-schema ACL entry, and that an ACL entry can revoke that default on restore. It also confirmed that revoking only PUBLIC USAGE preserves grants made explicitly to the application roles.

The authentic archive inspection was restricted to counts and direct grant booleans.

| Restore checkpoint | Direct PUBLIC USAGE |
| :-- | :-- |
| Fresh database | true |
| After pinned bootstrap | true |
| After pg_restore | true |
| After pinned compatibility migration | true |

Archive table of contents public-schema ACL entries before and after filtering were 1 and 1.

In the restored clone, the diagnostic matched the exact earlier grant fingerprint and 20 reviewed role differences before testing the one-schema revoke.

| Check | Result |
| :-- | :-- |
| namespaceUnchanged | true |
| publicUsageRemoved | true |
| recognized | true |
| reviewedRolesEquivalent | true |
| rollbackRestoredOriginal | true |
| scopedAclEqual | true |
| tested | true |

The diagnostic transaction rolled back before the unmodified protected entry check. The protected check returned `publication_tail_predecessor_namespace_mismatch`. The full authenticated latest-version rollback remains `NOT_RUN`.

The isolated restore verified 288 foreign keys and 193 RLS-enabled tables. The protected database and service signatures matched, all staging units were inactive after cleanup, and the comparison scratch was removed. Minimum headroom was 16.12 GiB disk and 3.95 GiB memory.

Next evidence needed includes the exact legacy extension catalog and historical valuation bridge under the same authenticated archive path. Compare it with the full protected predecessor contract before seeking independent review of a compatibility path.

PostgreSQL describes the initial PUBLIC USAGE grant in [Schemas and Privileges](https://www.postgresql.org/docs/17/ddl-schemas.html#DDL-SCHEMAS-PRIV).
