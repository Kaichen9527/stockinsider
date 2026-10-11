# Existing VPS schema installation fixture (2026-10-11)

This is a **schema-only existing-deployment baseline**, not a fresh Supabase
installer and not production publication/strategy authority.

- Source: read-only `pg_dump --schema-only --no-comments --no-security-labels
  --schema=public --schema=extensions --schema=auth stockinsider` on the existing
  VPS, PostgreSQL 17.11. No data rows, passwords, cookies or login credentials.
- Uncompressed snapshot SHA-256:
  `a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731`.
- `vps-schema-20261011.sql.gz` retains the actual schema declarations, including
  the prerequisites missing from a vanilla empty database. The native test
  restores it only into its own temporary cluster. `pg_dump --schema` excludes
  extension-owned objects; the existing VPS bootstrap supplies pgcrypto and its
  schema is moved back at the captured schema marker. No synthetic table/RPC
  stubs replace prerequisites.
- The bootstrap's NOLOGIN compatibility role does **not** satisfy the existing
  migration contract. The test proves rejection, then tests the explicit
  operator role amendment in isolation, including rollback and repeat rejection.
  It does not claim the production amendment or peer transport was executed.
- The base 48-file ordered digest remains
  `37dfacc252ec24a719b898b2b3ea31fc77c1631db083211f1f171c956772c613`.
  The 73-file extended plan applies 72 files; the existing reviewed successor
  detector skips the one superseded V3.19.2 projection rewrite.

`publication-catalog-20261011.json.gz` records the full non-secret catalog
expectations captured from that isolated restoration and complete SQL chain.
`research-publication-install-profile.json` contains their readable named
fingerprints and fixed scopes. The native test verifies their agreement and
recomputes every catalog fingerprint from PostgreSQL; production never generates
or accepts its own expected profile. Changes require independent source/profile
review. OIDs in definitions are converted to qualified object/role names.

The profile covers columns/defaults, validated constraints/indexes, enabled
trigger bindings, RLS/policies, function definitions/owners/configuration,
raw and effective ACLs including column grants, reachable role memberships,
schema grants, and recursive enum/domain/composite inputs. It checks existing
prerequisites before any mutation, research prerequisites before the new 18
migrations, and the complete installed profile before COMMIT.

Run with Node 22, PostgreSQL 17 native tools and the locked dependencies:

```sh
node --test scripts/opportunity-v3/research-publication-full-chain.test.mjs
```

The test additionally checks unknown prerequisites, changed composite inputs,
role/schema grants, RLS/trigger/column-ACL/overload mutations, full rollback,
connection loss and competing installers. Passing this fixture does not replace
protected exact-commit review, production authority, live-data migration checks,
real authors/reviewers or article acceptance.
