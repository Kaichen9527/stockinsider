# Current-prefix raw-source prerequisite — review-required LOCAL candidate

The mandatory positive raw-source case remains RED. It is not skipped, converted
to a negative case or waived. Original production permissions have not been
observed; this is an isolated captured-prefix dependency investigation.

## Exact actual predecessor, not historical candidate36

Normal run39959307306/job120432957199, source
`ccc127179d881dfce2afe9edefb1c131c8aa1851`, runtime
`4204ce5e158a78411cfbfe01d7940b25c2fdeb19`, full tree
`4bcb5dd09c61662b080159dff05b1cda2a0dcadd`, observed the distinct
REPEATABLE READ READ ONLY observer and the original unmodified publication
catalog/namespace codecs. Public finite hashes are:

| Inventory | SHA256 |
| --- | --- |
| Complete current scope | 530bc6a701e824f06071c37850801a2b5a0dedd4f66affd94477e2382aae6185 |
| Full namespace | 16054f4e6542fa1adc697eda2a8429e356feb7798e50495fd23f10867117b842 |
| Full catalog | e11aa5072518b8590c416d1d76f64c093d0632c75dbddaf17d3c8d40f0dd8b2d |

Actual sourceOwnerUsage=false and inputOwnerUsage=false. Full catalog and raw
rows remain runner-private; only these finite annotations were retrieved here.
The existing catalogs resolve OIDs to names, so the proposed candidate also
compares actual OIDs/default ACLs/role settings within its own transaction.

`20261009_research_publication_source_fence_v2.sql` gives the NOLOGIN source
owner its own fence/seal tables, SELECT on source_raw_documents and EXECUTE on
research_source_root_v2(jsonb), but no public-schema USAGE. Its definer trigger
calls the qualified root helper. Table/function grants do not substitute for
schema USAGE. The original positive INSERT actually failed42501; the new
read-only check confirms the missing role privilege before repeating that write.
The historical6e0 LOCAL profile adds two owners' USAGE but guards a different
candidate36 predecessor. It is not imported, applied or re-pinned. This vNext
source cache path needs only the source-fence owner; no input-owner grant is
proposed.

## Finite new candidate, deliberately not wired or applied

`scripts/vnext-source-namespace-candidate.mjs` has no CLI/network/connection or
production runner. Its engineering-only apply function is exported for review
but no worker, test entry, workflow or migration installer imports it. The only
permission statement is:

```sql
GRANT USAGE ON SCHEMA public TO research_source_fence_owner_v2
```

All three exact current hashes must match before that statement is reachable.
The target must remain NOLOGIN/nonprivileged, with no membership/config, no
CREATE and no existing USAGE. READ COMMITTED/30s statement/2s lock bounds,
existing installer session lock and source610091002 -> publication2409/6002 ->
vNext64221022 locks are retained. Unknown predecessor or already-installed state
rejects; there is no fallback or generic caller schema/role/hash override.

The hypothetical successor adds precisely the owner's non-grantable USAGE ACL
row and flips only that role's effective USAGE. PG's original ordering derives
the proposed ACL through a SELECT; no invented post hash is supplied. After an
eventual actual grant, the complete catalog must equal that derived projection,
full namespace must remain equal, and all actual raw catalog fields/OIDs/default
ACLs/roles/memberships/settings must remain byte-canonical-equal except the one
already checked public nspacl field. Any error rolls back and preserves the
primary error; unlock/rollback uncertainty is not success.

## Review and execution still necessary

Independent review must check the fixed predecessor, grantor semantics and
reachable existing EXECUTE/table rights exposed by schema USAGE, plus the lock
order and full metadata comparison. No maker self-approval is asserted. This is
not production migration authority. After review, a separate fresh isolated
fixture must prove before/after catalog and independent observer visibility,
actual only-one-ACL delta/unchanged defaults and OIDs, repeat/drift/busy/rollback
rejection and real raw INSERT/source-extract HTTP/cursor/replay. The current
positive case must stay mandatory. Native grammar/permission/COMMIT for this
candidate, derived-post hash, source-window native positive and over200-native
coverage remain NOT_RUN. If any other missing privilege appears, retain RED;
do not expand the grant or replace the exact profile.

Current ccc actual suite is7tests/5PASS/2FAIL. The real120second server deadline,
charged expiry/no refund, one idempotent retry and second claim passed with
2started attempts/0provider calls; second expiry remains NOT_RUN. Overall suite
is still FAIL solely at its mandatory raw-source prerequisite plus parent. Raw
TAP/rows were not downloaded; no old whole-tree success is transferred.

Original VM source checks are separate from hosted native: focused projection,
extra privilege/member/drift rejection and frozen entry/source boundaries only.
No local PG/container/build/browser/grant was run. Original floor8GiB plus
workset/RSS limits remain; formal source/model/semantic/Contabo, remaining
28day/fiscal/share/rebase/matrices/protected gates and full release are open.
