# Candidate detail: pinned-source audit and same-clone read-only discovery

The genuine A/B evidence remains the exact7811aaa real-backup receipt copied from
3e49dfd23aba8c74d4cd36b74f9946992495dc6e. It verifies daily stale-readonly behavior,
home/static liveness and rollback, not stock detail. The initial intermittent
startup failure and later canonical passes are retained separately in
T18-STARTUP-REGISTRATION.md. The coordinator also reported exactcc0 admission
exit0 in16.118 seconds, three UID/cgroup/private cookie, no backup key, unchanged
formal signatures and cleaned staging resources. Native A/B versions during
admission are asset metadata, not another HTTP exercise.

This subject adds only a bounded detail observation AFTER the existing daily A/B
exercise and before the SAME validated clone is deleted. It does not grant table
columns, add a role, execute/grant an RPC, open a detail endpoint or alter the
existing two-table proxy/raw3301 scope. Its sibling candidateDetailObservation
cannot be used as runtime permission. Full detail HTTP/enriched/business/action
acceptance remains NOT_RUN; all T17/root/FD/HOLD gates remain.

## Observed pinned application source

The following files were fetched independently from BOTH immutable source refs:
169aad1b6cfa747f78ae3464b614f43c0749d806 and
 dd59817f750684b093965f539dd4de466be13077. Each pair is byte-identical:

| Path | Git blob |
| --- | --- |
| web/src/lib/candidate-detail.ts | 37cb3fa5ad0046db3a03c5a73a3670fe2e16af56 |
| web/src/lib/candidate-detail.test.ts | 37466dee9724c947ad75e12ef0211ef5f2eb183c |
| web/src/app/api/stocks/[symbol]/candidate-detail/route.ts | 3b06b3833a409830b9e4879ab68197c9ba7d2b02 |
| web/src/app/stock/[symbol]/page.tsx | c84c39a0d49e0a23f1bef54c7c60feddd2d2ac9a |

The exact loader projections below total46 columns. Filters also require stocks.market
and dossiers.detail_snapshot_id, so a later direct column grant cannot stop at46.
These are descriptions of required source reads, not an installed allowlist:

| Fixed resource | Exact projected columns | Fixed scope/order/limit |
| --- | --- | --- |
| stocks | id,symbol,name | symbol=pin; market=TW; maybeSingle |
| candidate_detail_snapshots | id,stock_id,session_date,lifecycle_stage,detail_kind,title,summary,sections,fact_ids,source_links,valuation,technical,as_of,available_at,publication_phase,provenance | stock_id=pin; id=exact revision; session_date/available_at/id DESC; limit1 |
| candidate_research_dossiers | id,narrative_kind,content,validation_status,bundle_id,bundle_hash,input_hash,published_at,created_at | detail_snapshot_id=pin; codex_enriched; valid; created_at DESC; limit1 |
| candidate_dossier_submission_receipts | dossier_id,bundle_id,revision_id,input_hash,status,received_at | revision_id=pin; accepted; received_at DESC; limit20 |
| candidate_official_facts | fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation | only adopted fact IDs; dedup batches40 (helper maximum50); period_end DESC; limit=batch size |

The loader also uses POST /rest/v1/rpc/read_taiwan_data_publication_metadata_v5
with exactly p_session_date=the detail session and p_publication_phase=final.
It is a read operation despite POST. The historical SQL function is STABLE
SECURITY DEFINER, granted to service_role, and reads the metadata table by date
and phase. Current stage reader/proxy denies it. This subject does NOT execute it
or grant that definer to any reader. Catalog signature/class/body hash is only an
inventory: a malicious STABLE definer fixture is deliberately never called.
Presence/STABLE bits/body hash are not a known-safe execution proof.

Exact future HTTP routes differ: stock page uses
/stock/<symbol>?candidateRevision=<uuid>; the API uses
/api/stocks/<symbol>/candidate-detail?revision=<uuid>. Unknown/duplicate/invalid
revision parameters must not silently select latest. HTTP200 can still be an
unavailable shell; later acceptance must check the actual detail payload/revision.

Existing candidate-detail.test.ts checks bounded fact batches, not genuine HTTP,
permissions or the whole query closure. Source contract/revision tests were run,
and the new PG17 tests separately exercise real schema/data counterexamples.
No actual Next package bytes, modes, pins or product source are modified.

## Read-only same-clone contract

The private validated-clone handle issues one source-fixed SQL observation through
its existing owned backend. REPEATABLE READ + READ ONLY, pg_catalog search path,
UTC,5-second statement and1-second lock limits are enforced. No caller stock,
revision, query, SQL, connection, callback or readiness override enters a public
CLI. The handle is revoked when the engine closes it. The old DB-only entry is
unchanged.

The observer checks60 exact source-supported columns over seven ordinary tables:
the five loader tables, metadata table and published radar snapshots. Stock text
supports only TEXT or original VARCHAR20/255/10 widths; UUID/date/timestamp/jsonb/
numeric types are exact. Views, partitions, domains, missing/wrong columns reject
to GAP_SCHEMA. The schema requirement is intentionally independent of an app
credential's privileges.

The newest valid DAILY publication must be unique at its published timestamp,
contain at most2 MiB, have nonfuture content dates and at most1000 stage cards.
Only actual stages.found/waiting/actionable cards with a four-digit symbol,
UUID detailRevisionId and matching canonical detailHref can supply a pin.
There is no latest-private-research fallback. Among public revisions matching a
TW stock and a detail available/as-of no later than publication, the observer
chooses lexicographically first symbol/revision. It reports this deterministic
single probe, not a claim that all stocks have detail.

The chosen stock must be unambiguous. Title/summary and section key/title/body
must be real nonblank strings, section factIds arrays must contain strings, and
adopted detail fact IDs must be a nonempty UUID list of at most2000. Missing,
duplicate, cross-stock, future-available or paid-source/provenance facts are GAP.
This explicit closure is needed because the pinned loader queries facts only by
ID; its later hash sanitizer does not sanitize every returned payload.facts row.
Original rows are never changed, validated, backfilled or replaced.

The revision_context v1 four bounded scores/risk envelope and genuine final
metadata row are required for this conservative observed-scope profile. Missing
context is GAP_REVISION_CONTEXT, not artificial scores. Dossier and accepted
receipt rows may be absent: deterministic_fact is a legitimate source fallback.
No enriched input-hash acceptance is inferred. Snapshot/fact hashes use PG17
canonical projection hashes; they are NOT the pinned JS localeCompare/stableJSON
candidateDossierInputHash or the legacy revision_hash MD5 backfill.

The metadata inventory reads the exact table row without executing the definer.
It does not reinterpret shadowEligible, invent provider completeness, classify
issuer financial completeness from market-wide metadata, or require a metadata
recording timestamp earlier than the detail (the pinned RPC has no such cutoff).

Output contains fixed counts, original dates, the PUBLIC symbol/revision route
pair and hashes only. No title, article, section, fact value, URL, raw row, SQL,
function body, credential or log is returned. A second exact-field/type/privacy
projection in the entry rejects unexpected data. Query/lock budget exhaustion is
GAP_QUERY_BUDGET; missing real schema/pin/data/context/metadata has a named GAP.
A GAP does not overwrite the independent daily rollback outcome. An OBSERVED
scope still grants no HTTP/RPC permission or action authority.

## Next permission slice must remain closed until actual observation

After the coordinator observes a true pin/GAP on this exact subject, any reader
implementation must reobserve the live clone itself; it must not consume a receipt
or caller Boolean as authority. A candidate design is a private invoker facade
with exact selected row/column/fact closure, restrictive base RLS and no owner/
write/sequence privileges. Original SECURITY DEFINER RPC EXECUTE must stay closed;
a separately reviewed fixed invoker read facade can preserve the wire shape for
one date/phase. Private raw3301 exposure must also be constrained, not merely the
3302 parser. Nothing in this document installs or authorizes that design.

A future proxy must accept only the exact pinned requests/batches and one bounded
read RPC request, reject arbitrary columns/operators/stock/revision/date, writes,
other RPCs and alternate schemas/URLs. Genuine data absence is GAP. The detail
loader does NOT inherit daily's age guard; old final metadata can look confirmed
and lifecycle_stage is copied from the stored row. Stale dates, action-disabled
behavior, unavailable/enriched paths and real detail JSON require their own HTTP
checks on both pinned packages, not home liveness or replacement data.

## Onsite staging

Start with the46 verifiedcc0 blobs. Apply the two replacements and add one module
from t18-candidate-detail-stage-manifest.json; total47. The root launcher remains
exactly the cc0 startup-reviewed hash. Its admission/invalid/real commands,
manifest digest and local stdin key channel are unchanged. No Cloud backup/key,
SSH, deployment, production operation or new PR head is involved.

The original three-unit/FS/FD9/GCM/PG/RLS gates run first. The current A/B daily
exercise remains identical; only afterwards is candidateDetailObservation read
from the still-owned clone before cleanup. Stage-role column grants remain11,
public routine grants0, and all eight old negative HTTP checks remain.
