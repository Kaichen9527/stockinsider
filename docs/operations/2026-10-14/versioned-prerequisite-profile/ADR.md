# Local-only finite prerequisite for versioned input engineering

This candidate starts at36ea8f0c0f7e5c3f9d52499c97882be60acbf538 and references the read-only audit5b24dd0ee952c403637e534bde1ffe44fe19fe42. It is not installed on a VPS, added to a production plan, granted formal authority or independently approved by its maker.

## Exact authorized delta

`applyVersionedPrerequisiteEngineering` accepts an injected **fresh exclusive client outside any transaction**. It has no connection string, remote connection/production CLI, attestation bypass, caller-provided SQL or arbitrary grantee. It tries the original shared installer session lock before BEGIN, starts READ COMMITTED, validates the entire fixed predecessor/successor, and conditionally executes exactly:

```sql
GRANT USAGE ON SCHEMA public TO research_input_preparation_owner_v2,research_source_fence_owner_v2
```

The exact successor has two new nongrantable USAGE entries with grantor `pg_database_owner`. No PUBLIC/anon/authenticated/service_role/CREATE/extensions/table/function grant, role/member/LOGIN/owner alteration or revoke is introduced. Original SQL and installed catalog files remain byte-identical. Actual native output proved that this superuser-owned local engineering transaction records the required grantor; it is not inferred from flags.

The two role profiles retain their actual original difference: preparation INHERIT=false, source-fence INHERIT=true. Both retain NOLOGIN, no super/createRole/createDb/replication/BYPASSRLS, limit-1, null password/config/validUntil and no memberships involving either role. Password values are never selected. Unexpected/partial/duplicate ACL, grantor/grantability/CREATE, role or namespace/catalog drift is rejected before the grant. A complete successor is a strict no-GRANT replay.

## Independent finite descriptor; original catalog is not rewritten

The capture script was sealed before execution at61f599d6 and restored the exact schema-only gzip, original synthetic bootstrap, actual selected50, actual guarded26 and unchanged36 candidate migration. It then read catalog state only and stopped its cluster. The descriptor is a new local candidate profile, not a renamed prior installed profile.

It stores complete predecessor/successor public schema descriptors, exact role/membership fields, and canonical SHA256 of the actual namespace and full public catalog. The existing catalog reader is reused: tables/columns/column ACL/RLS/policies/constraints/indexes/triggers, function definitions/owner/config/security/ACL, types and schema ACL/effective privilege. Namespace inventory additionally detects unknown relations/routines/types and all role attributes in public/auth/extensions. Fixed descriptor file bytes are pinned in the new helper. The only generated successor transformation is adding the two explicit schema ACL entries and their corresponding schema effective-USAGE booleans; all other catalog and namespace bytes must match. This is not generic normalization or ignoring unknown entries.

Role/public/object OIDs and all detailed role fields are separately compared before/after within the real transaction. Unknown profile rejects; no current-state adoption or automatic re-baselining exists. Future changes to original code/profile/candidate SQL require a newly reviewed descriptor. Original installed-publication catalog checks are expected to distinguish this schema delta; this helper does not alter or claim equivalence with their old schema fingerprint.

Grant, verification and COMMIT share the transaction. Errors ROLLBACK; disconnect testing proves backend disappearance and server rollback. Cleanup errors are surfaced on the primary error. Client acquisition/transport trust remains an injected engineering boundary, not formal peer/HBA or production authorization.

## Actual original RPC fixture

The new fixture uses a retained1978-member packet generated with16 exact original2e inputs, including the original roster preparation function/classifier and both original public reconciliation JSON files. It does not replace roster validation or assert1978 through a stub. Its output hash is6910b7d8fe8bf4262168034daccc49f9ee6c6d64e0274186b5a26db5ba2ebc42; canonical packet1034189 bytes,1978 members/10 exclusions. This is retained public source input used in local engineering, not fresh live classification/authority.

Per isolated issuer, the test uses:

1. Original `admit_research_observed_roster_v1`, as existing service_role.
2. Original acquire/release production-data-plane lease RPC around one explicitly synthetic local retained source row, under original source triggers. Captured release-state tables are empty; no release/guard flag/authority is fabricated or activated.
3. Actual roster receipt, full1978 accounting rows, original `store_observed_research_priority_v1` (internal enqueue), then original `claim_research_observed_job_v2` (internal reservation and attempt). No direct job/reservation/attempt/preparation/sealed-row insert.
4. Existing candidate neutral preparation wrapper, actual unchanged common controller and same-owner fixed files. Local engineering registry rows pin the actual four-component native source/Node fingerprint; they are explicitly **partial engineering identity**, not whole S/C/B/Q/R/A, NextC or77b1.
5. AUO9-file v3 first seal and EMC6-file compatible first seal in separate disposable clusters, preserving global1/dayfit/daily/weekly/original deadlines and quotas rather than overlapping jobs.

The finite row registry remains a synthetic engineering fixture, not a reviewed formal registration. Full source/authority/protocol qualification flags remain false.
