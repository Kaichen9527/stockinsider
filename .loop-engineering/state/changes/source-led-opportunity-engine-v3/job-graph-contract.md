# Durable Job Graph and Payload Contract: source-led-opportunity-engine-v3

Version: `opportunity-job-graph-v3.15`

This contract is the sole authority for job creation, successor ordering, immutable job inputs and non-manifest staged outputs. A worker may execute one claimed unit, but it may never create, select, skip or reorder a job. Every job and its input payload are inserted in one database transaction by an already granted V3 RPC through the private successor helper below.

## Private successor authority

The migration creates exactly two private helper functions owned by `opportunity_v3_rpc_owner`:

```text
enqueue_next_opportunity_job_v3_internal(run_id uuid, predecessor_job_id uuid)
derive_manifest_page_descriptor_v3_internal(manifest_id uuid, section_key opportunity_manifest_section_key_v3, page_ordinal integer, first_row_ordinal bigint)
```

They are not PostgREST/RPC interfaces, are absent from `opportunity_rpc_function_name_v3`, receive no `service_role` execute grant, and revoke execute from `PUBLIC`, `anon`, `authenticated` and `service_role`. The relation/function owner may invoke them only while executing one of the 33 granted `SECURITY DEFINER` functions. The parent RPC's audit row owns the operation; the helpers never create a second audit record.

`enqueue_next_opportunity_job_v3_internal` takes a transaction-scoped advisory lock on the run UUID, re-derives the sole next unit from stored state and inserts exactly one job plus one payload or inserts nothing when the identical unit already exists. Its second argument has exactly two branches. Non-null is the successor branch: the identified predecessor must be terminal `succeeded`, and the helper derives the one next unit from that immutable result plus stored plan state. SQL `NULL` is the bootstrap branch: only `begin_opportunity_run_v3` may invoke it, the locked run must be newly inserted `preparing`, no job/payload/manifest may yet exist for it, upstream run/manifest bindings must already be complete, and the helper derives the first plan header listed below. A null call after any run-owned job/manifest exists, a non-null call without the exact succeeded predecessor, a second different bootstrap, or either branch in a failed/converged/success run raises `data_integrity_failure` and rolls back the parent RPC. No branch can create post-seal work for an unsealed run.

The bootstrap transaction already holds the `preparationKey` advisory lock from `begin`, then takes the run lock in the same global order used by every successor. It derives `manifestId`, `planOrdinal=0`, stage, shard key, header pairs, payload canonical bytes/hash, input hash and job UUID from the stored mode, cutoff, inputs and version table; callers supply none of them. The exact first build unit is `source_identity_allowlist` for `source_scan`, `peer_reviewer_allowlist` for `enrich_rank` after its six upstream manifests are bound, the first ordered required `sector_benchmark` or otherwise `outcome_input` for `label_outcomes`, and `evaluation_input` for `shadow_evaluate`. Unique `(run_id,stage,shard_key,input_hash)` collision is idempotent only when the derived job ID, payload kind/hash and empty ordered predecessor-hash array are byte-equal. Thus concurrent identical begin calls return the same active attempt and graph; a conflicting occupied identity fails rather than selecting a convention.

Manifest jobs use stage `authority_manifest` exactly for `source_identity_allowlist|publisher_verification_allowlist|instrument_roster|alias_authority|taxonomy_assignment|peer_reviewer_allowlist|peer_authority`; every other header/page/root uses `input_manifest_pages`. Within either stage, `shardKey` is `manifestKind:inputOrdinal:header`, `manifestKind:inputOrdinal:sectionKey:pageOrdinal`, or `manifestKind:inputOrdinal:root`. These values, plus `planOrdinal`, make bootstrap and every later manifest successor constructible without database row-order selection.

Job UUIDs are UUIDv5 values in the fixed namespace `7ad3ec9e-4db5-5e8a-b9a4-eab35ddc1a21` over the lowercase ASCII `inputHash`; no third V3 helper or extension is created. Preflight requires the already-installed extension named exactly `pgcrypto` to have `extnamespace=extensions` and exactly one `extensions.digest(bytea,text) RETURNS bytea` procedure; other legitimate pgcrypto overloads are allowed but unqualified/search-path resolution is forbidden. Inside each creating RPC, the inline expression concatenates the RFC-4122 network-order 16 namespace bytes with `UTF8(inputHash)`, computes `extensions.digest(...,'sha1')`, takes the first 16 bytes, sets the high nibble of octet 7 to binary `0101` and the high two bits of octet 9 to binary `10`, formats lowercase hexadecimal exactly `8-4-4-4-12`, and casts that text to `uuid`. Preflight proves the standard DNS vector `uuidv5(6ba7b810-9dad-11d1-80b4-00c04fd430c8,"www.widgets.com")=21f7f8de-8051-5b89-8680-0195ef798b6a` and the job vector `uuidv5(7ad3ec9e-4db5-5e8a-b9a4-eab35ddc1a21,"0000000000000000000000000000000000000000000000000000000000000000")=5a7bd9c3-2aa1-5dd0-9e18-b4e4d3401e69`. Missing/wrong extension schema or signature, an impostor resolution or a vector mismatch aborts migration before any V3 object. `inputHash = SHA256(UTF8(RFC8785(["opportunity-job-input-v3.3",runId,stage,shardKey,payloadHash,orderedPredecessorOutputHashes])))`. Bootstrap uses the literal empty array; every other unit uses the exact ordered successful predecessor hashes. The same logical unit therefore has one ID under every retry/interruption schedule.

## Immutable input and result relations

`opportunity_job_payloads_v3` is one-to-one with a job:

```text
(job_id uuid PRIMARY KEY,
 run_id uuid NOT NULL,
 payload_kind opportunity_job_payload_kind_v3 NOT NULL,
 payload_canonical bytea NOT NULL,
 payload_json jsonb NOT NULL,
 payload_hash text NOT NULL,
 recorded_at timestamptz NOT NULL)
```

It has composite FK `(run_id,job_id)` to `opportunity_run_jobs_v3(run_id,job_id)` `ON DELETE RESTRICT`, unique `(run_id,job_id,payload_hash)`, canonical/JSON structural equality, `extensions.digest(payload_canonical,'sha256')=payload_hash`, lowercase 64-hex and a 3,145,728-byte bound on each representation and their unencoded combined bundle. A deferred constraint trigger on every inserted job requires exactly one byte-matching payload before commit; the payload FK rejects the inverse orphan. Job and payload therefore insert atomically and neither may exist alone at commit. Every field is immutable.

`opportunity_job_results_v3` stores the immutable accepted non-manifest output:

```text
(job_id uuid PRIMARY KEY,
 run_id uuid NOT NULL,
 output_kind opportunity_job_output_kind_v3 NOT NULL,
 output_canonical bytea NOT NULL,
 output_json jsonb NOT NULL,
 output_hash text NOT NULL,
 output_counts opportunity_job_counts_v3 NOT NULL,
 recorded_at timestamptz NOT NULL)
```

It has the same composite job FK and hash/canonical/bundle checks. `complete_opportunity_job_v3` alone inserts it from the sole live staging row in the same transaction as normalized terminal rows, warning facts, job success and the next job. Manifest lifecycle, seal and finalize jobs do not create a generic result row; their exact output hashes/counts remain on the job. Reaping may delete only nonterminal `opportunity_job_staging_v3`, never payloads or results.

## Canonical job payload envelope

Every `payload_json` is exactly this array and `payload_canonical` is its RFC-8785 UTF-8 encoding:

```text
["opportunity-job-payload-v3.3",payloadKind,runId,stage,shardKey,body]
```

No object/extra member is allowed. `body` is exactly one tuple below:

| payloadKind | Exact body |
|---|---|
| `manifest_header` | `[planOrdinal,manifestId,manifestKind,contractVersion,sourceCutoffOrNull,headerPairs]` |
| `manifest_page` | `[planOrdinal,manifestId,manifestKind,contractVersion,sourceCutoffOrNull,sectionKey,pageOrdinal,firstRowOrdinal,previousPageIdOrNull,previousPageHashOrNull,afterIdentityOrNull]` |
| `manifest_root` | `[planOrdinal,manifestId,manifestKind,contractVersion,sourceCutoffOrNull]` |
| `seal` | `[orderedRunInputs,orderedManifestInputs]` |
| `source_parse_batch` | `[sourceDatasetManifestId,sourceKey,firstSelectionOrdinal,lastSelectionOrdinalExclusive,revisionRows]` |
| `source_connector_summary` | `[sourceDatasetManifestId,sourceKey]` |
| `market_context_snapshot` | `[marketReferenceManifestId,orderedCandidateSymbols]` |
| `shallow_candidate_batch` | `[firstCandidateOrdinal,lastCandidateOrdinalExclusive,orderedCandidateSymbols,orderedRequiredManifestIds]` |
| `sector_cycle_batch` | `[firstSectorOrdinal,lastSectorOrdinalExclusive,orderedCanonicalSectorKeys,sectorScoringReferenceManifestId]` |
| `deep_candidate_batch` | `[firstCandidateOrdinal,lastCandidateOrdinalExclusive,orderedCandidateSymbols,orderedRequiredManifestIds]` |
| `portfolio_allocation_batch` | `[orderedDeepSuccessSymbols,orderedDeepResultJobIds]` |
| `projection_bundle` | `[orderedCandidateSymbols,marketResultJobId,orderedSectorResultJobIds,orderedDeepResultJobIds,portfolioResultJobId,"verified-change-brief-v3.0"]` |
| `outcome_batch` | `[outcomeInputManifestId,firstInputOrdinal,lastInputOrdinalExclusive]` |
| `evaluation_bundle` | `[evaluationInputManifestId,linkAuditSampleManifestId,linkAuditResolutionManifestId,["official_only","source_led","hybrid"]]` |
| `finalize` | `[orderedRequiredJobIds,orderedRequiredOutputHashes]` |

`headerPairs` and manifest/page identities are exact values from `manifest-storage-contract.md`. A source `revisionRows` value is exactly one `[revisionId,selectionOrdinal,rawCodePointCount]` row; therefore `lastSelectionOrdinalExclusive=firstSelectionOrdinal+1`. Candidate/sector batches contain 1..5 values, an outcome batch contains 1..200 input rows, and every other ordered list uses the bound in its domain contract. A payload containing a live-row value instead of an immutable ID/hash/ref is invalid.

Projection completion derives the sizing-omitted public cards, exact verified-change workspace and homepage summary in one transaction from the same run-owned native candidate/score/evidence rows. The stored detail for each symbol includes the byte-equal public card and its workspace brief or null. Evaluation completion stores the three fixed strategy rows from `shadow-evaluation-contract.md`; no successor, table or promotion rule depends on their metric values.

`claim_opportunity_job_v3` returns these stored payload bytes/hash directly with the
lease. For a payload kind with a database read unit, the same security-definer claim
also derives and returns that job's one closed read bundle while it holds the job and
run locks. It never returns or resolves an open `payload_ref`, and a worker never
performs a second unbound payload/read lookup.

## Pre-seal manifest plan

At creation, `begin_opportunity_run_v3` binds all server-selected upstream run inputs before it enqueues the first manifest header. `opportunity_run_inputs.input_role` is the exact enum in `postgres-type-contract.md`. Existing upstream manifests are inserted into `opportunity_run_manifest_inputs` with `input_role` equal to their `opportunity_manifest_kind_v3` and the ordinal rules below; only complete exact kind/version/cutoff manifests may bind. Newly built manifests are added by root completion. A different existing binding is integrity failure.

The build plan is sequential and exact:

- `source_scan`: `source_identity_allowlist`, `publisher_verification_allowlist`, `instrument_roster`, `alias_authority`, `taxonomy_assignment`, eleven `source_eligible` manifests in `source_key_v3` enum order, then `source_dataset`.
- `enrich_rank`: first bind from its sole `upstream_source_scan` the exact `source_identity_allowlist`, `publisher_verification_allowlist`, `instrument_roster`, `alias_authority`, `taxonomy_assignment` and `source_dataset` manifests; then build `peer_reviewer_allowlist`, `peer_authority`, `sector_valuation_reference`, `factor_scoring_reference`, `bias_reference`, `candidate_financial`, `technical_history_reference`, `reported_pe_reference`, `sector_scoring_reference`, one through five `mover_price_reference` manifests for the most recent completed Taiwan sessions, then `market_reference`. `bias_reference` is roster-first and must complete before the deep-symbol history plan; `candidate_financial` selects the ordered deep list, and both `technical_history_reference` and `reported_pe_reference` bind that exact ordered list, current session and prior roots. Mover input ordinals are zero through `min(5,completedSessionCount)-1` in audited-session descending order; ordinal zero is the selected current audit/root. Candidate financial therefore binds an already complete sector-valuation root, while reported PE/BIAS cannot be built from a live price or fact read, and market reference starts only after every planned mover root/audit exists and binds ordinal zero's audit/root.
- `label_outcomes`: bind every `outcome_enrich` input run ordered run UUID, build one `sector_benchmark` for each required `(canonicalSector,entrySession)` ordered sector then entry session, then build `outcome_input`.
- `shadow_evaluate`: bind `evaluation_enrich` inputs by trading date/run UUID and `evaluation_outcome` inputs by maturity/run UUID, then build `evaluation_input`, `link_audit_sample` and `link_audit_resolution` in that exact order. The resolution header cannot begin before the complete sample root exists.

The `planOrdinal` is zero-based over the exact mode list after existing bindings are excluded and includes every repeated item. The manifest input ordinal is zero for a singleton; `source_eligible` uses source-key enum ordinal; `mover_price_reference` uses the audited-session-descending ordinal above; `sector_benchmark` uses its zero-based ordered pair ordinal. No other repeated manifest role is valid. `manifestId` is deterministic UUIDv5 in namespace `51689af8-f3fe-5d1e-a18f-c667ddee224a` over RFC-8785 `[runId,manifestKind,inputOrdinal,contractVersion]`. Header/root successor derivation uses this plan ordinal and cannot advance until every dependency named by that header is a bound terminal complete manifest.

Header completion checks the first section with an indexed `EXISTS` query. It skips only sections proven empty and enqueues either the first page descriptor or the root descriptor. A page descriptor is a database-owned cursor, not caller page data. For the first page its predecessor members are null. Otherwise `previousPageId`, `previousPageHash` and `afterIdentity` identify the immediately preceding stored page and its last row; the worker loads that one bound row and applies the domain contract's exact native comparator strictly after its full stored native payload. It then queries at most the next 2,001 native rows from that indexed selector, greedily constructs the largest valid consecutive page under the universal byte/count bounds, and submits it to `append_opportunity_manifest_page_v3`. A caller-supplied identity by itself is never an ordering cursor.

The page RPC re-derives the predecessor page from `(manifestId,sectionKey,pageOrdinal-1)`, requires its deterministic ID/hash/last identity to match the immutable descriptor, loads that last row's stored native payload, re-runs the same bounded strictly-after selector, compares every supplied native JSON row, ordinal, identity and terminal code, and proves that the chosen final row is the greatest valid greedy boundary. Page IDs are UUIDv5 in namespace `51689af8-f3fe-5d1e-a18f-c667ddee224a` over `UTF8(RFC8785([manifestId,sectionKey,pageOrdinal]))` using the identical inline SHA-1/version/variant/format operation and preflight above; the page golden vector for name `["00000000-0000-0000-0000-000000000000","rows",0]` is `9b46c201-57ed-59cc-987c-98da5efc80ad`, and no page helper exists. The RPC then atomically commits page/rows, succeeds the page job and enqueues exactly one of: the next page descriptor bound to the new page ID/hash/last identity; the first page of the next nonempty section with null predecessor; or the root descriptor. It never trusts a worker `hasMore` flag. One oversized first row fails `bound_violation`. Empty sections have no job/page. Root completion binds the manifest and enqueues the next plan header or the seal job. For `mover_price_reference`, root completion first performs the exact mover-audit snapshot transaction below and only then enqueues the next session's mover header or, after the final planned session, `market_reference`; there is no audit-less successor. Crash before successor commit rolls back predecessor success, manifest completion, audit and successor; crash after commit leaves all of them durable.

### Mover-audit root side effect

`complete_opportunity_manifest_v3` is the sole mover-audit writer; the public 33-RPC catalog and output-kind catalog do not expand. When and only when its owning root is kind/version `mover_price_reference/mover-audit-price-v3.3`, it locks the enrich run and its one successful upstream source-scan run, verifies the exact source-dataset and price roots including every trusted adjusted-price evidence tuple, ranks the root's included native rows by return descending, turnover descending and symbol ascending, and selects `min(20,eligibleUniverseCount)`. It derives `auditId` as UUIDv5 in namespace `0e7d59d4-cebe-5bb1-91b7-a737c0e709d8` over RFC-8785 `["opportunity-mover-audit-v3.3",auditedSession,auditedSessionAuthorityHash,previousSessionAuthorityHash,recentSessionPlanHash,sourceCutoff,priceManifestHash,sourceDatasetManifestHash]`.

The same transaction inserts or byte-identically reuses one immutable audit header and its complete ranked symbol set and binds the completed price manifest. Ordinal zero additionally sets the enrich run's initially-null `selected_mover_audit_id`; every later ordinal must leave it byte-identical. The transaction succeeds the root job and enqueues either the next audited-session mover header or, after the final planned mover root, the `market_reference` header whose header/payload includes ordinal zero's audit ID and price root. A different audit/header/symbol payload at the deterministic ID or unique input tuple is `data_integrity_failure` and rolls back all effects. `auditWindowClosesAt` is audited official close plus exactly 72 hours and `sourceCollectionCutoff=min(sourceCutoff,auditWindowClosesAt)`. Status is `pending` iff `sourceCutoff<auditWindowClosesAt`, otherwise `matured`; pending has null recall, matured has recall equal to later-mentioned count divided by mover count and null only when mover count is zero. `laterMentioned` is derived solely from cutoff-valid normalized mentions in the exact upstream source run with both publication and collection strictly after audited close and at/before source collection cutoff. A snapshot never changes status or symbols; because each completed session remains in the five-session plan, a later cutoff appends its matured snapshot even after a newer session becomes ordinal zero. Price movement never creates a candidate.

## Post-seal graph

`seal_opportunity_run_inputs_v3` verifies the complete ordered plan. On a non-converged seal it atomically succeeds the seal job, changes the run to `running` and enqueues the first post-seal unit. The mode graphs are:

1. `source_scan`: select the newest at-most-1,000 eligible revision-family heads per source under the source-eligible freshness order, then assign `source_dataset.selected_revision_rows` ordinals by source key followed by ascending `effectiveAt = publishedAt || collectedAt`, canonical document ID and original eligible-row ordinal. For each source key in enum order, execute exactly one sequential `source_parse_batch` unit per selected revision in that canonical ordinal order, followed by exactly one `source_connector_summary`; after all eleven summaries, `finalize`. The predecessor-only enqueue makes an earlier canonical occurrence durable before its successor can be leased. One-revision sharding is a byte-authority rule, not an implementation tuning choice.
2. `enrich_rank`: one `market_context_snapshot`; zero through six `shallow_candidate_batch` units in candidate ordinal order; zero through the required number of `sector_cycle_batch` units in unique sector order; zero through four `deep_candidate_batch` units in deep-candidate order; exactly one `portfolio_allocation_batch`; exactly one `projection_bundle`; `finalize`.
3. `label_outcomes`: zero or more `outcome_batch` units in outcome-input ordinal order; `finalize`.
4. `shadow_evaluate`: exactly one `evaluation_bundle`; `finalize`.

When a stage can contain zero work, the private helper advances to its first nonempty successor in the same transaction. At most one successor exists at a time; there is no fan-out insertion, database-row-order queue or hidden scheduler. Thus interruption anywhere produces the same linked graph. `shardKey` is exactly `kind:ordinal` where kind is the payload kind and ordinal is its zero-based position, except singleton/finalize keys are `kind:0`.

Every successful non-manifest completion calls the private helper while holding the run lock. The helper enqueues the next same-stage shard, the first next-stage shard or finalizer. A retryable failure creates no successor. A terminal failure atomically fails the run and leaves no claimable successor. Reaping requeues only the same job; it never advances the graph. The finalizer is an ordinary leased `finalize` job; `finalize_opportunity_run_v3(job_id,owner_token)` validates its payload/owner and atomically terminalizes both job and run. No unowned follow-up HTTP call is required.

## Exact non-manifest output envelope

Every staging/result payload is exactly:

```text
["opportunity-job-output-v3.3",outputKind,runId,jobId,inputHash,body,warnings]
```

`warnings` is a unique array in `opportunity_engine_warning_v3` enum order, excludes `shadow_only`, and has at most six values. The exact bodies are:

- `source_parse_batch`: `[documentRows,claimRows,mentionRows]`. `documentRows` has exactly one row `[sourceKey,revisionId,selectionOrdinal,canonicalDocumentIdOrNull,effectiveAt,outcome,contentHashOrNull,extractedClaimCount,rawMentionCount]`. A claim row is `[revisionId,claimOrdinal,canonicalClaimId,outcome,priorRevisionIdOrNull,priorClaimOrdinalOrNull,evidenceRootId,effectiveAt,claimConfidence,sourceRef,verificationTier,claimEvidenceStance]`; the last two enums are derived exactly by `source-matrix.md` and `claim-evidence-stance-v3.0`, are persisted with the normalized claim, and may never be recomputed by a later stage. The worker's one-document duplicate value is provisional only until the same transaction commits against earlier canonical source-parse predecessors. `complete_opportunity_job_v3` resolves same-run cross-document duplicate outcome/prior identity, mention outcome/reason, rewrites the staged canonical envelope to those persisted rows, and stores byte-equal staging and immutable job-result envelopes/hashes before enqueueing the successor. A mention row is `[revisionId,claimOrdinal,mentionOrdinal,normalizedToken,startOffset,endOffset,reviewContext,reviewMentionStartOffset,reviewMentionEndOffset,linkMode,stockIdOrNull,symbolOrNull,outcome,reason,confidence]`; the three review fields are the exact private 28-code-point slice owned by `entity-link-contract.md` v3.1. Entity parsing discards empty-normalized/no-occurrence segments before ordinal/count assignment and guarantees at most 200 emitted claims and 1,000 mentions for that one revision. UUID/hash/timestamp/enum fields have their fixed encodings, symbol is 4 ASCII digits, normalized token is at most 40 Unicode code points, `reviewContext` is at most 96 code points/384 UTF-8 bytes and `sourceRef` is at most 120 Unicode code points. The maximum four-byte UTF-8 fixture for every variable field, including 1,000 maximum review slices, must keep the complete canonical-plus-canonicalized-JSON staging bundle <=3,145,728 bytes; this is a migration/contract assertion, not a runtime truncation branch.
- `source_connector_summary`: one exact `SourceConnectorAccountingV3` object from `data-contract.md`; every closed count-map member including zero is present.
- `market_context_snapshot`: one exact `MarketContextV3` object from `data-contract.md`.
- `shallow_candidate_batch`: ordered rows `[stockId,symbol,directSource,candidateOrigin,anchorClaimIdOrNull,sourcePriority,priceVolumeFactor,chipFactor,liquidityFactor,canonicalSectorKey,shallowStatus,failureCodeOrNull,evidenceRefs]`; `directSource/candidateOrigin/anchorClaimIdOrNull` is exactly `true/direct_candidate/non-null` or `false/comparison_only/null`, numeric factors are finite 0..100 and refs are unique/capped under the data contract. A comparison-only row may be deferred or shallow-failed; after successful calculation its only success payload is `enriched_observation`, and it is never scheduled into a deep batch.
- `sector_cycle_batch`: ordered `[canonicalSectorKey,SectorCycleV3]` rows using the exact public type from `data-contract.md`.
- `deep_candidate_batch`: ordered direct-candidate rows `[stockId,symbol,true,'direct_candidate',anchorClaimId,canonicalSectorKey,formalResearchStatus,valuationDistribution,internalActionDecision,initialPositionPct,maximumPositionPct,scoreRows,verifiedEvidenceRows,factorCorrectness,failureCodeOrNull]`; `anchorClaimId` is non-null and satisfies the same-run candidate-linked mention invariant in `storage-schema-contract.md`, while a comparison-only identity is invalid input. `internalActionDecision` is the exact single `InternalActionDecisionV3` authority from `data-contract.md`; fields 9/10 are byte-equal numeric mirrors of its initial/maximum percentages and no other action owner is permitted. A successful row has exactly three `[horizon,batchRank,score,scoreConfidence,availableWeight,factorPlane]` tuples in horizon order; `batchRank` is deterministic within the at-most-five worker bundle, while projection completion recomputes the durable/public global horizon rank across every deep-success row before inserting immutable score snapshots. `factorPlane` has the six exact factor keys, each mapped to `{value:number|null,status:'available'|'stale'|'missing',contribution:number,evidenceRefs:string[]}`. It also carries verified-evidence rows exactly `[sourceSelectionOrdinal,claimOrdinal,evidenceRef,evidenceRootId,sourceClass,sourceKey,effectiveAt,freshness,verificationTier,stance,sourceRunId,revisionId,stockId,symbol,mentionOutcome,claimId,computedConfidence,canonicalClaimId,mentionReason]`, bounded and ordered under `hybrid-product-amendment.md`, one exact factor-correctness object containing research maturity, fundamental explanation, typed technical decision/BIAS, four factor axes, relative-multiple lineage, evaluation/revision timestamps and material-change identity, plus null failure. Every verified evidence row is backed by a same-run linked mention whose stock and symbol equal this candidate; cross-symbol evidence is invalid. A failed row has null formal/valuation/decision/position/score/evidence/factor-correctness fields and one non-null `opportunity_failure_code_v3`. Decoder counts are row count, successful-row count and failed-row count; they must conserve exactly, and only successful rows create score snapshots at projection completion.
- `portfolio_allocation_batch`: ordered rows `[symbol,finalActionDecisionV3]` with the exact `ActionDecisionV3` object from `data-contract.md`; every deep-success symbol appears once and no other symbol appears.
- `projection_bundle`: `[candidateRows,publicProjection,detailProjections]`. Each candidate row is `[stockId,symbol,directSource,candidateOrigin,anchorClaimIdOrNull,shallowStatus,deepStatus,payload]`; the three origin fields are exactly `true/direct_candidate/non-null` or `false/comparison_only/null`. `payload` is exactly one of `{state:'deferred_before_shallow',reason}`, `{state:'shallow_failed',failureCode}`, `{state:'enriched_observation',shallowResultJobId}`, `{state:'deep_failed',failureCode}`, or `{state:'deep_succeeded',card}` and `card` is exact `OpportunityCardV3`. Only a direct candidate may have a deep-failed or deep-succeeded branch; a comparison-only row may use a deferred or shallow-failed branch, while its sole successful branch is the shallow `enriched_observation`. It appears in neither public/detail projection nor any score or verified-change brief. `publicProjection` is exact `OpportunityEngineAvailableV3`; detail rows are exact `OpportunityDetailV3` values ordered symbol.
- `outcome_batch`: exact ordered outcome-input rows augmented only with the finite result/MFE/MAE fields from `shadow-evaluation-contract.md`.
- `evaluation_bundle`: one exact evaluation result containing the frozen manifest IDs/hashes, `backtestCount`, `liveCount`, both engines' macro Precision@20/NDCG@20/worst-decile MAE objects or literal null together when `backtestCount<120`, link precision/recall when available, the three ordered non-authoritative strategy rows, every conjunctive boolean, ordered gate facts including `insufficient_backtest_dates|insufficient_live_dates`, and final `pass|fail` status. A partial evaluation is always `fail` and remains shadow; strategy metrics are descriptive only and the result contains no model bytes or promotion mutation.

Unknown keys, tuple members or alternative layouts fail staging. `stage_opportunity_job_output_v3` validates the envelope and exact body schema before storing it. `complete_opportunity_job_v3` repeats validation, resolves generated UUID/FK identities transactionally, recomputes `opportunity_job_counts_v3`, writes only the normalized rows authorized by the output kind, copies the accepted bytes to `opportunity_job_results_v3`, succeeds the job and advances the graph atomically.

## Worker HTTP contract

`POST /api/internal/opportunity-worker-v3` has no query, requires `Content-Type: application/json`, raw body <=128 bytes, and exact body `{runId}` with one lowercase UUID string and no duplicate/unknown member. It requires an exact `Authorization: Bearer $INTERNAL_API_KEY`, calls the unchanged `requireInternalAuth()` helper and uses only the server-fixed `opportunity_runner` principal; `CRON_SECRET`, `X-Internal-Key` and a request actor cannot authorize it.

It claims at most one job and its HTTP response never returns the internal owner
token, payload or read bundle. Exact canonical responses use
`Cache-Control: private, no-store`:

- `200` `{jobId,runId,runStatus,stage,status:'job_succeeded'}` after one committed success, including finalization;
- `202` `{failureCode,jobId,runId,stage,status:'job_retryable'}` after a committed retryable failure;
- `409` `{failureCode,jobId,runId,stage,status:'run_failed'}` after a committed terminal failure;
- `204` with zero bytes when no job is claimable because the run is terminal, another lease is active, or no queued/retryable unit exists;
- `422` `{code:'invalid_request',error:'opportunity_worker_request_rejected'}` for transport/body failure;
- `403` `{code:'authentication_rejected',error:'opportunity_worker_request_rejected'}` for authentication failure;
- `503` `{code:'v3_service_role_unavailable',error:'opportunity_worker_request_rejected'}` for offline/remote client rejection before a function executes;
- `500` `{code:'worker_internal_error',error:'opportunity_worker_request_rejected'}` for an unknown route/worker exception. If a claim already committed, its lease remains and only database-clock reaping may retry it.

Objects are RFC-8785 canonical with exactly the shown keys and UTF-8 bytes. Every non-204 response sets exactly `Content-Type: application/json; charset=utf-8` and `Cache-Control: private, no-store`; 204 has zero bytes, no `Content-Type`, and the same cache header. Validation precedes authentication, authentication precedes client acquisition, and acquisition precedes claim. Offline acquisition makes zero database calls/writes. Remote 401/403 rejection on claim makes one call, no lease/job write and returns the exact 503 body.

There is no open sequence of “bounded reads” and no worker-readable owner-rights
view. `claim_opportunity_job_v3` takes only the run ID and server-fixed runner
principal. After role/run/job/input validation, the security-definer function uses
`extensions.gen_random_bytes(32)` to generate a fresh unguessable 256-bit owner
token, stores only its SHA-256, atomically leases at most one job, returns the raw
token only to trusted server code, then derives
exactly one immutable-at-that-statement read bundle for payload kinds marked `read`
below. A retry receives a newly generated token and can claim only after database-time
reap; a hash collision is retried before lease commit and failure to obtain a unique
nonzero token fails the claim. Every later heartbeat/stage/complete/fail call with a
token for another job/run/input/principal, unknown read kind, missing/all-zero/reused
token fails before a read or write. Payload kinds with no read unit return null read
members.

The returned internal claim tuple is exactly
`(job_id,stage,shard_key,input_hash,owner_token,lease_expires_at,payload_kind,
payload_canonical,payload_json,payload_hash,read_kind,read_canonical,read_json,
read_hash)`, byte-for-byte matching the sole signature in
`runtime-transaction-contract.md` v3.17; the requested `run_id` is the function
argument and is not duplicated as a return column.
The owner token is visible only to trusted server code and is never serialized in the
HTTP response, logs, errors, staging or result bytes. The read bundle is exactly
`UTF8(RFC8785(["opportunity-worker-read-v3.5",readKind,runId,jobId,inputHash,
body]))`; JSON/canonical/hash copies agree and the complete PostgREST claim response
is <=5 MiB. The claim function's fixed CASE branches may read the three bounded
registries only for their exact source/authority/financial manifest-page payload
discriminators and indexed sentinels below. `service_role` receives EXECUTE on claim
but no registry or derived-view SELECT. Database work may aggregate or select from a
larger bound input, but the worker receives only its claimed job projection and
cannot enumerate retained jobs/runs through this surface.

`readKind` and body are closed:

| readKind | Exact body |
|---|---|
| `manifest_page_rows` | `[previousPageDescriptorOrNull,nextNativeRows]`, where the descriptor is the payload-bound preceding page ID/hash/last stored native tuple and `nextNativeRows` is the owning domain's next at-most-2,001 exact native tuples under its full comparator |
| `manifest_root_pages` | `[headerPairs,sectionDescriptors]`, where every descriptor is `[sectionKey,totalRowCount,orderedPageDescriptors]` and a page descriptor is `[pageOrdinal,firstRowOrdinal,rowCount,firstIdentity,lastIdentity,pageHash]` |
| `source_parse_rows` | exactly one `[revisionId,selectionOrdinal,sourceKey,approvedSourceIdentityId,stableConnectorDocumentId,normalizedCanonicalUrlOrNull,publishedAtOrNull,collectedAt,rawFieldPayload,rawCodePointCount,adapterVersion,acquisitionStatus,ingestionCanonicalContentHashV3OrNull,sourceClass,distributionIdentity,linkAuthorityRows,priorDocumentIdentityRows]` row for the payload's sole revision. Every metadata member is byte-equal to the selected source-dataset tuple and its bound source-identity authority. `linkAuthorityRows` is the symbol-then-stock-ID ordered, at-most-256 cutoff-valid projection `[stockId,symbol,exchange,instrumentType,listingStatus,officialNameOrNull,orderedActiveAliases,canonicalSectorKey]` containing every bound instrument that has an exact four-ASCII-digit ticker, exact official-name, exact active-alias, or bounded normalized similarity candidate in the raw fields. It is derived only from the bound roster/alias/taxonomy authorities; duplicate symbols or more than 256 projected candidates fail closed. `priorDocumentIdentityRows` is the selected-manifest-ordinal ordered, at-most-999 projection of every earlier selected revision in this run with the same `[sourceKey,approvedSourceIdentityId]`, as `[canonicalDocumentId,canonicalContentHashV3OrNull]`. It is computed from the bound `source_dataset` manifest only; a repeated identifier is integrity failure, while repeated hashes remain the retained duplicate evidence. The parser tests the canonical document ID before decoding, then the canonical content hash after exact normalized keyed-field/transcript hashing and before claim splitting; either match returns `duplicate_document` with zero claims/mentions. Projection eligibility never authorizes a fuzzy auto-link: the parser still applies the closed exact-ticker/exact-unique-alias rules and emits typed ambiguous or `fuzzy_below_auto_threshold` outcomes for every other candidate. |
| `source_connector_accounting` | exactly one database-computed `SourceConnectorAccountingV3` object. SQL derives every closed document/claim/mention/reason count and distinct linked-candidate count from the run/source normalized rows, verifies selected/deferred conservation against the bound source-dataset manifest and verifies that every parse predecessor succeeded; no document/claim/mention row is returned |
| `market_context_rows` | exact ordered included/excluded/conservation native rows from the bound market-reference root, capped at its 1,024 terminal rows plus 64 conservation rows |
| `shallow_candidate_rows` | `[candidateLedgerRows,factorReferenceRows,sectorReferenceRows,peerRows]` containing only the payload's at-most-five candidates, their twelve feature terminal rows each, their applicable sector aggregate rows and their at-most-three bound comparison peers each; no unrelated roster row is returned |
| `sector_cycle_rows` | exact bound sector-reference native rows for the payload's at-most-five sectors only |
| `deep_candidate_rows` | `[candidateRows,financialRows,factorRows,sectorRows,valuationVerificationRows,sourceEvidenceRows,biasReferenceBundle,technicalHistoryReferenceBundle,reportedPeReferenceBundle]`; each 20-member candidate row appends the prior comparable card's null-or-exact `[materialChangeHash,analysisGeneratedAt]`, and each source-evidence row is the exact 19-member tuple owned by the deep output contract. The bundle is for the payload's at-most-five direct candidates only, under each owning contract's per-candidate fact/evidence cap. Every candidate is `true/direct_candidate/non-null-anchor`, every evidence claim owns a same-run linked mention whose stock/symbol equals that candidate, and no comparison-only or unrelated reference-population row is returned. Each of the final three members is exactly `[manifestId,manifestHash,orderedSectionRows]`; section rows are the candidate/sector-owned native rows plus their conservation row from the bound complete manifest, never a live-table fallback. Claim rechecks all three manifest identities against the job payload/run bindings, and the complete canonical claim response remains within 5 MiB. |
| `portfolio_rows` | exact ordered rows `[symbol,canonicalSectorKey,primaryHorizonScore,newPositionBudgetPct,internalActionDecision]` in payload job-ID order. The score is selected from the deep row by `internalActionDecision.primaryHorizon`; market budget comes from the exact same-run hash-valid `market-context-v3.6` snapshot. A missing/malformed market authority, absent primary-horizon score, duplicate symbol or sizing/decision mirror mismatch yields no usable read. |
| `projection_rows` | `[candidateRows,marketResultRow,sectorResultRows,deepResultRows,portfolioResultRow,moverAuditHeaderAndRows,briefDerivationRows,discoveryAuthorityRows]` in payload order. `discoveryAuthorityRows` is the exact ordered current/exit authority used to derive public `sourceSignals` and `discoveryDelta`, including each row's typed change/rejection reason and optional source-signal metadata; it is not inferred from seed symbols. `briefDerivationRows` is symbol ascending and contains exactly one exact sole derivation tuple from `hybrid-product-amendment.md` for every direct-candidate deep-success symbol and none for comparison-only observations. Each tuple already contains its current run ID, validated detail path and null-or-one comparison-key-equal prior tuple including prior valuation status. SQL joins only the current successful deep rows, claims backed by same-run linked mentions whose stock/symbol equals the candidate, and the prior successful stored projection selected under `data-contract.md`; cross-symbol evidence, a missing/duplicate current row, duplicate symbol or multiple prior lineage values yields no usable read. There is no second outer prior representation. |
| `outcome_computation_rows` | at most 200 rows in input-manifest order, one per payload input ordinal: `[inputIdentity,entryAndMaturityAuthorityHashes,entryAndOutcomePriceRefs,returnPct,sectorRelativeReturnPct,mfePct,maePct,sectorRelativeMfePct,sectorBenchmarkManifestHash]`. The security-barrier SQL verifies the bound benchmark manifest and derives the exact metrics from only rows reached through the generic manifest row table's database-derived `(manifestId,section,lookupSymbol,lookupSession)` indexes; it never scans or returns the full benchmark |
| `evaluation_computation_summary` | exactly one `[evaluationInputManifestHash,linkAuditSampleManifestHash,linkAuditResolutionManifestHash,orderedInputRunAndManifestHashes,backtestCount,liveCount,v3MetricsOrNull,legacyMetricsOrNull,linkPrecisionOrNull,linkRecallOrNull,strategyPopulationSummary,strategyRows,gateBooleans,gateFacts,status]` row. Security-barrier SQL applies every cohort/conservation/metric formula in `shadow-evaluation-contract.md` and the complete candidate-brief/strategy formula in `hybrid-product-amendment.md` to the bound normalized rows/manifests. `strategyPopulationSummary` carries pre-cap count/hash/deferred count and the retained count <=400; `strategyRows` is the three fully computed fixed-order rows including only the identical bounded candidate identities/exclusions and contains no raw source text. Reviewer-resolution members read only the bound immutable resolution manifest; current mutable labels are not joined. Both promotion metric objects are null when `backtestCount<120`, the two insufficient-count facts and false booleans are deterministic, and no raw cohort, outcome, mention or label population is returned |

Every named nested row is the exact normalized/native tuple already defined by its owning normative contract; the fixed claim branch cannot add a wrapper or omit/reorder a field. Its definition has one discriminator branch per read kind, applies the job's stored cutoff/manifest IDs and all domain sentinels, and returns no raw text except the sole approved complete revision payload for `source_parse_rows` and the <=384-byte private `reviewContext` already bound inside each `link_audit_sample` native manifest row. The latter is visible only to that manifest's page worker and the dual-controlled assignment RPC; it never enters another read kind or public serializer. The connector, outcome and evaluation branches perform deterministic database aggregation over their bound normalized inputs and include exact conservation/hash checks before returning their bounded result. Unknown read kinds or an over-bound bundle yield no usable row and the worker invokes the single expected `fail_opportunity_job_v3(...,bound_violation)` continuation at the next ordinal.

Maximum valid projections are closed: `source_parse_rows` is one <=100,000-code-point revision; connector accounting is one <=64-KiB object even at 1,000 documents/200,000 claims/1,000,000 mentions; outcome computation is <=200 rows and <=1 MiB; evaluation computation is one <=262,144-byte row because its three strategy partitions share the common <=400-candidate population and closed short reason codes. Manifest page/root obey their universal bounds; every other branch above is <=2 MiB from its exact candidate/sector/public caps. The claim function checks canonical and JSON byte sizes before it commits the lease or returns. Acceptance must build the maximum four-byte UTF-8/native-row fixture and prove every valid maximum stays below its cap rather than treating a valid maximum as `bound_violation`.

The complete successful call catalog is:

| payloadKind | Ordered database calls |
|---|---|
| `manifest_header` | `1 claim`, `2 create_opportunity_manifest_v3` |
| `manifest_page` | `1 claim+read/manifest_page_rows`, `2 append_opportunity_manifest_page_v3` |
| `manifest_root` | `1 claim+read/manifest_root_pages`, `2 complete_opportunity_manifest_v3` |
| `seal` | `1 claim`, `2 seal_opportunity_run_inputs_v3` |
| `source_parse_batch` | `1 claim+read/source_parse_rows`, `2 stage_opportunity_job_output_v3`, `3 complete_opportunity_job_v3` |
| `source_connector_summary` | `1 claim+read/source_connector_accounting`, `2 stage`, `3 complete` |
| `market_context_snapshot` | `1 claim+read/market_context_rows`, `2 stage`, `3 complete` |
| `shallow_candidate_batch` | `1 claim+read/shallow_candidate_rows`, `2 stage`, `3 complete` |
| `sector_cycle_batch` | `1 claim+read/sector_cycle_rows`, `2 stage`, `3 complete` |
| `deep_candidate_batch` | `1 claim+read/deep_candidate_rows`, `2 stage`, `3 complete` |
| `portfolio_allocation_batch` | `1 claim+read/portfolio_rows`, `2 stage`, `3 complete` |
| `projection_bundle` | `1 claim+read/projection_rows`, `2 stage`, `3 complete` |
| `outcome_batch` | `1 claim+read/outcome_computation_rows`, `2 stage`, `3 complete` |
| `evaluation_bundle` | `1 claim+read/evaluation_computation_summary`, `2 stage`, `3 complete` |
| `finalize` | `1 claim`, `2 finalize_opportunity_run_v3` |

An expected page/root computation or provider failure after its acknowledged read replaces ordinal 3 with `fail_opportunity_manifest_v3`; the header kind has no read/provider computation and therefore no such variation before create. Another expected computation/provider failure replaces stage/complete with one `fail_opportunity_job_v3` immediately after its acknowledged read. A rejected/malformed lifecycle RPC follows the non-credential ordinal rule below and never triggers a speculative second mutation. A no-read seal/finalize integrity failure is returned solely by its matching call and triggers no speculative fail. This is the only call-plan variation.

A remote 401/403 at any numbered position returns the same exact 503 body and stops immediately. Its total call count equals the rejected ordinal; the rejected call writes nothing, a committed claim/lease remains, an acknowledged stage at ordinal 2 remains, and no best-effort fail/lease-clear call occurs. No rejected call can create an authoritative result, manifest transition, job success/failure, successor or run terminal mutation.

An expected computation/provider failure returns 202 or 409 solely from the committed fail status. An unknown local exception after claim invokes no continuation and returns the exact 500 body with the lease retained. A non-credential timeout, 5xx or malformed response at every numbered position returns 500 and performs no speculative follow-up: acknowledged earlier calls remain, a read failure writes nothing, and an ambiguous mutating target transaction has only the PostgreSQL-atomic outcomes fully rolled back or fully committed once. Idempotent replay or database reaping observes and converges either state. This 15-second route never calls heartbeat; an unfinished unit leaves the lease for database-clock reaping. The tabled ordinals and effects are exhaustive.

## Acceptance obligations

Executable tests must interrupt before and after every predecessor/successor commit, including begin-to-null-predecessor bootstrap, header-to-first-page, page-to-page, last-page-to-root, root-to-next topological header, mover-root/audit/market-header atomicity, final-root-to-seal, seal-to-first mode job, every same-stage boundary, last-stage-to-finalizer and finalizer terminalization. Concurrent duplicate/null-after-bootstrap/conflicting callers must produce one byte-identical graph or the exact integrity failure. Tests enumerate every tabled payload/call ordinal and inject remote 401/403 plus timeout, 5xx, malformed response and unknown local failure at each applicable position, proving exact response bytes/headers, call count, lease/staging durability and result/successor state. They also prove single-revision parse output at maximum code-point/claim/mention/UTF-8 size, bounded connector aggregation over maximum normalized counts, 200-row outcome precomputation over a five-million-row benchmark manifest, bounded evaluation precomputation, claim-read zero/duplicate/hash/size failure, wrong/reused/all-zero token, other-job/principal enumeration denial, cursor replay/different-page rejection, empty-section skipping, oversized first-row failure, payload/result immutability, no ungranted helper invocation, claim-without-payload impossibility and equivalence across every interruption schedule.
