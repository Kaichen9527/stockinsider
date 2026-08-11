# Runtime, Transaction and Resource Contract: source-led-opportunity-engine-v3

Version: `opportunity-runtime-v3.17`

## Placement

Vercel routes are control plane and bounded single-job executors; one request never owns an entire opportunity run. Durable run/job state lives in PostgreSQL. The existing GitHub Actions or local launchd worker repeatedly calls the authenticated drain route and may stop/restart without losing progress. No correctness state lives in process memory, `/tmp`, a browser session or a GitHub artifact.

Work placement is fixed:

- PostgreSQL applies cutoff/index predicates, sentinel counts, window ranks, uniqueness/conservation checks, job leases and terminal transactions.
- TypeScript workers perform exact Unicode/entity parsing, RFC 8785 serialization, SHA-256 page/preimage hashing, score/valuation/decision math and bounded public serialization.
- The six Vercel begin/status/cron routes are exactly `control-plane-contract.md` version `opportunity-control-v3.3`; each authenticates, performs only its closed database calls and never synchronously drains jobs.
- Vercel `POST /api/internal/opportunity-worker-v3` claims at most one job, executes one bounded unit and commits through the complete/fail RPC. A GitHub/local worker may loop calls, but each call is independent.
- No runtime downloads arbitrary datasets or model artifacts. Full-roster facts must already exist in additive V3 observation tables through guarded ingestion.

`job-graph-contract.md` version `opportunity-job-graph-v3.15` is the sole authority for bootstrap/successor creation, inline UUIDv5, immutable payload/result bytes, manifest cursors, mode-specific stage order, token-bound database aggregation projections and the worker HTTP wire contract. `trading-calendar-contract.md` version `tw-trading-calendar-v3.4` is the sole completed-session authority. This file owns leases, transactions, failure/reaping and resource envelopes. A conflict is a Gate failure; implementation may not improvise an enqueue path, calendar or read sequence.

## Run and job state

`opportunity_runs.status` is exactly `preparing|running|success|failed|converged`. `preparing` means required input-manifest jobs are incomplete and `logicalKey` is still null; it is owned by the immutable `preparationKey` defined below. `running` begins only after every input manifest is frozen and the final `logicalKey` is atomically sealed. Both are currently active and project as `matching_run_in_progress` for a current cutoff. `success`, `failed` and `converged` are terminal and immutable. `converged` is an audit-only attempt whose sealed logical key already belongs to another immutable `success`; it requires non-null `canonicalRunId` referencing that success, owns no terminal result/projection rows and is never itself selected as public success or failure.

The current status value is not historical projection authority. Begin sets database-owned immutable `createdAt`; a successful seal sets write-once `sealedAt`; convergence/failure/finalize set write-once `terminalAt`. All use one transition-local database timestamp and obey `createdAt <= sealedAt <= terminalAt` where present. At projection cutoff C, a terminal kind is visible only at `terminalAt <= C`; before that same row is historically active, `running` iff `sealedAt <= C` and otherwise `preparing`. Exact equality is visible and terminal takes precedence. This remains true after the row's current status has advanced.

`opportunity_run_jobs_v3.status` is exactly `queued|leased|succeeded|retryable|failed|cancelled`. Job identity is `(runId,stage,shardKey,inputHash)` with one row. Stages are ordered `authority_manifest,input_manifest_pages,seal_inputs,source_documents,shallow_enrich,deep_research,portfolio_allocate,project,label,evaluate,finalize`. The applicable `authority_manifest`/`input_manifest_pages` jobs create headers, pages and roots for the exact closed `manifestKind` set in `manifest-storage-contract.md`; `seal_inputs` invokes the seal RPC; `finalize` invokes the finalize RPC. Preparing and post-seal graphs, payload schemas, exact dependencies and successor creation are closed by `job-graph-contract.md`. A job is claimable only with its immutable one-to-one payload; no job can exist without one and no stage can be selected from database row order or worker input.

Each lease has a fresh random 256-bit `ownerToken`, `leaseExpiresAt`, heartbeat timestamp and attempt number. The token is lowercase 64-hex encoded for the `text` RPC arguments. Owner tokens are returned once to the authenticated worker, stored only as SHA-256 in the DB and required by heartbeat/complete/fail. Lease duration is 90 seconds; heartbeat may extend it by 90 seconds but never beyond 15 minutes for one attempt. A job may attempt at most five times. Exact same `(job,inputHash)` completion is idempotent; different output after a recorded success is integrity failure.

## Database RPCs

All 33 granted RPCs are `SECURITY DEFINER`, set an empty trusted `search_path`, fully qualify objects, revoke execution from `public/anon/authenticated`, grant execution only to `service_role`, validate enums/domains and write an audit row on every successful/idempotent/terminal mutation. Standalone nonce consumption commits one nonce plus its success audit atomically; a later separate append commits a second append audit on success or retains only the earlier nonce/audit on failure. A runner-ingestion append is one no-nonce RPC transaction. `begin`, `claim` and `reap` independently require the passed caller/worker principal to have the exact active `opportunity_runner` binding in app-immutable `internal_principal_role_bindings_v3` at the captured database transaction timestamp; a bare UUID is insufficient. Owner-token continuations (`seal`, `heartbeat`, `stage`, manifest lifecycle, job complete/fail and finalize) inherit authorization only from a job/run created or claimed by a bound runner and verify the stored unguessable owner-token hash, so they accept no caller UUID. The two private successor helpers in `job-graph-contract.md` have no client execute grant and are not additional RPCs. All functions are correct under exact PostgREST transaction isolation `READ COMMITTED`: no invariant relies on a cross-request MVCC snapshot. Database-generated knowledge time plus the historical cutoff freezes eligible authority/observation rows; advisory/row locks, unique constraints and terminal canonical bytes protect mutable orchestration state.

The following are exact PostgreSQL signatures and exact `RETURNS TABLE` column declarations. Every named enum/composite and label is fixed by `postgres-type-contract.md`; built-in nullable return columns are governed by the branch prose below. Anonymous records, generic enums, overloads and default arguments are forbidden.

```text
begin_opportunity_run_v3(
  mode opportunity_mode_v3,
  run_purpose opportunity_run_purpose_v3, source_cutoff timestamptz,
  expected_taiwan_session_authority_hash text, caller_principal uuid
) RETURNS TABLE(
  disposition opportunity_begin_disposition_v3, run_id uuid,
  attempt_run_id uuid, attempt integer, status opportunity_run_status_v3
)

seal_opportunity_run_inputs_v3(requested_run_id uuid,owner_token text)
  RETURNS TABLE(disposition opportunity_seal_disposition_v3,run_id uuid,
                attempt_run_id uuid,logical_key text,status opportunity_run_status_v3)

claim_opportunity_job_v3(run_id uuid,worker_principal uuid)
  RETURNS TABLE(job_id uuid,stage opportunity_job_stage_v3,shard_key text,
                input_hash text,owner_token text,lease_expires_at timestamptz,
                payload_kind opportunity_job_payload_kind_v3,
                payload_canonical bytea,payload_json jsonb,payload_hash text,
                read_kind opportunity_worker_read_kind_v3,
                read_canonical bytea,read_json jsonb,read_hash text)

heartbeat_opportunity_job_v3(job_id uuid,owner_token text)
  RETURNS TABLE(lease_expires_at timestamptz)

stage_opportunity_job_output_v3(
  job_id uuid,owner_token text,output_kind opportunity_job_output_kind_v3,
  output_canonical bytea,output_json jsonb,output_hash text,
  counts opportunity_job_counts_v3
) RETURNS TABLE(status opportunity_staging_status_v3,staged_hash text)

create_opportunity_manifest_v3(
  job_id uuid,owner_token text,requested_manifest_id uuid,
  manifest_kind opportunity_manifest_kind_v3,contract_version text,
  source_cutoff timestamptz,header_canonical bytea,header_json jsonb
) RETURNS TABLE(status opportunity_manifest_status_v3,manifest_id uuid)

append_opportunity_manifest_page_v3(
  job_id uuid,owner_token text,requested_manifest_id uuid,
  section_key opportunity_manifest_section_key_v3,
  page_ordinal integer,first_row_ordinal bigint,
  page_canonical bytea,page_json jsonb,requested_page_hash text,
  rows opportunity_manifest_row_input_v3[]
) RETURNS TABLE(status opportunity_manifest_page_status_v3,page_id uuid,row_count integer,page_hash text)

complete_opportunity_manifest_v3(
  job_id uuid,owner_token text,requested_manifest_id uuid,requested_row_count bigint,
  root_canonical bytea,root_json jsonb,requested_manifest_hash text
) RETURNS TABLE(status opportunity_manifest_status_v3,manifest_hash text,
                row_count bigint,terminal_at timestamptz)

fail_opportunity_manifest_v3(
  job_id uuid,owner_token text,requested_manifest_id uuid,
  requested_failure_code opportunity_manifest_failure_code_v3
) RETURNS TABLE(status opportunity_manifest_status_v3,
                failure_code opportunity_manifest_failure_code_v3,
                terminal_at timestamptz)

complete_opportunity_job_v3(
  job_id uuid,owner_token text,output_hash text,counts opportunity_job_counts_v3
) RETURNS TABLE(status opportunity_job_status_v3)

fail_opportunity_job_v3(
  job_id uuid,owner_token text,failure_code opportunity_failure_code_v3
) RETURNS TABLE(status opportunity_job_status_v3)

reap_opportunity_jobs_v3(caller_principal uuid)
  RETURNS TABLE(requeued integer,failed integer,runs_failed integer)

finalize_opportunity_run_v3(job_id uuid,owner_token text)
  RETURNS TABLE(run_id uuid,status opportunity_run_status_v3,
                failure_code opportunity_failure_code_v3,
                terminal_at timestamptz)

select_opportunity_public_projection_v3(request_cutoff timestamptz)
  RETURNS TABLE(availability text,unavailable_reason text,selected_run_id uuid,
                warnings opportunity_engine_warning_v3[],payload_canonical bytea,
                payload_json jsonb,payload_hash text)
```

`opportunity_manifest_row_input_v3` and `opportunity_job_counts_v3` are the exact named composites in `postgres-type-contract.md`; no JSON-only row/count input exists. Every job input and non-manifest output uses the exact envelope/body in `job-graph-contract.md`. A page's canonical bytes are <=786,432 and its complete unencoded canonical/JSON bundle is <=3,145,728; encoded request is <=5 MiB. A root's canonical/JSON request is <=3,145,728. The RPC recomputes hashes and canonical/JSON equivalence and compares every root descriptor against stored pages before terminalization.

## Exact run-identity preimages

This section is the sole byte authority for `comparisonContractKey`, `preparationKey` and `logicalKey`. All three are lowercase hex `SHA256(UTF8(RFC8785(preimage)))`. The preimage is a JSON array, every named member is a two-item `[name,value]` array in the exact order shown, no member is omitted, JSON null is used only where stated, and empty collections are literal `[]`. UUIDs are lowercase canonical 36-byte strings; hashes are lowercase 64-hex; `sourceCutoff` is the already validated exact 20-byte UTC whole-second string `YYYY-MM-DDTHH:MM:SSZ`; enum/version strings are the literal labels below. There is no Unicode, timestamp, UUID, numeric or key-name normalization after validation.

`staticIdentityMembers` is the following exact 41-member ASCII-name-ordered array. The six `*Hash` values are the deployed lowercase 64-hex results owned by their named source-matrix/adapter/market/taxonomy contracts; every other value is the literal shown. The migration embeds this tuple as database-owned constants and acceptance compares every name/value/order; a missing, extra, null, reordered or differently versioned member is `data_integrity_failure`.

```text
[
 ["acceptanceVersion","1.46.0"],
 ["analysisRevisionContractVersion","stock-analysis-revision-v3.11.2"],
 ["authoritySupersessionContractVersion","authority-supersession-v3.2"],
 ["controlPlaneContractVersion","opportunity-control-v3.3"],
 ["dataContractVersion","source-led-opportunity-v3.6"],
 ["decisionContractVersion","opportunity-decisions-v3.3"],
 ["detailContractVersion","opportunity-detail-v3.3"],
 ["discoveryCorrectnessContractVersion","stock-discovery-v3.11.1"],
 ["entityLinkContractVersion","entity-link-v3.1"],
 ["evaluationContractVersion","source-led-eval-v3.7"],
 ["factorCorrectnessContractVersion","opportunity-factor-correctness-v3.11.6"],
 ["featureScoringContractVersion","opportunity-features-v3.2"],
 ["financialInputContractVersion","opportunity-financial-inputs-v3.3"],
 ["hybridProductVersion","hybrid-product-v3.2"],
 ["instrumentRosterContractVersion","tw-instrument-roster-v3.0"],
 ["internalPrincipalContractVersion","internal-principal-v3.8"],
 ["jobGraphContractVersion","opportunity-job-graph-v3.15"],
 ["legacyCompatibilityContractVersion","legacy-compatibility-v3.2"],
 ["manifestStorageContractVersion","opportunity-manifest-storage-v3.10"],
 ["marketContextContractVersion","market-context-v3.6"],
 ["moverAuditPriceContractVersion","mover-audit-price-v3.3"],
 ["portfolioContextContractVersion","research-basket-v3.0"],
 ["postgresTypeContractVersion","opportunity-postgres-types-v3.22"],
 ["priceProviderAllowlistHash",priceProviderAllowlistHash],
 ["providerFieldAllowlistHash",providerFieldAllowlistHash],
 ["publisherVerificationPolicyHash",publisherVerificationPolicyHash],
 ["runtimeContractVersion","opportunity-runtime-v3.17"],
 ["sectorBenchmarkContractVersion","sector-benchmark-v3.1"],
 ["sectorCycleContractVersion","sector-cycle-v3.0"],
 ["sectorReferenceContractVersion","sector-reference-v3.1"],
 ["sectorTaxonomyContractVersion","tw-sector-taxonomy-v3.0"],
 ["sourceAdapterContractVersion","source-adapter-v3.3"],
 ["sourceAdapterRegistryHash",sourceAdapterRegistryHash],
 ["sourceDatasetContractVersion","source-dataset-v3.3"],
 ["sourceFunnelContractVersion","source-funnel-v3.0"],
 ["sourceFunnelPolicyHash",sourceFunnelPolicyHash],
 ["storageContractVersion","opportunity-storage-v3.25"],
 ["taxonomyMapHash",taxonomyMapHash],
 ["technicalDecisionContractVersion","opportunity-technical-decision-v3.11.1"],
 ["tradingCalendarContractVersion","tw-trading-calendar-v3.4"],
 ["valuationContractVersion","opportunity-valuation-v3.4"]
]
```

The resolved 41-member comparison preimage is exactly 2,729 UTF-8 bytes and has SHA-256 `c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729`. Its active RFC 8785 owner values are `priceProviderAllowlistHash=48fa54ee9f0e3a0b888ac0dc17eda8ad5bb746106a6fe4395eb50a5865e4e44e`, `providerFieldAllowlistHash=fe78e0f8c5b0846f822f72c6b2356cac35ed5c00dd0bcd06f9a75b7c5b21d3f7`, `publisherVerificationPolicyHash=2c4746cb02d98d402ecd1d0d980c91632b8105ab9fd2aec198e7789da603abba`, `sourceAdapterRegistryHash=a14d4753f221a43fb0422710e705ee00f529d9f31653a142211fe94596da80fe`, `sourceFunnelPolicyHash=6893fb5f265edc10eea8222a560f9afdcc4342f72b1d7d39d5723ec0056bc105` and `taxonomyMapHash=6b28d85903d7a410eef29386de011c71aa789dc0ce3231df38cb4e085181060c`. This is the static identity before purpose-owned input-manifest and calendar bindings; any member omission, reordering, null or factor-correctness version mutation is rejected or produces a different identity.

The comparison preimage is exactly:

```text
[
 "opportunity-comparison-contract-v3.0",
 ["staticIdentityMembers",staticIdentityMembers]
]
```

It deliberately contains no mode, purpose, cutoff, run ID, point-in-time manifest, session/window hash or mutable authority row. The preparation preimage is exactly:

Before either mode-owned key is computed, begin derives `evaluationDatasetLockHashOrNull` without a caller value. It is JSON null exactly for `runPurpose='ad_hoc_shadow'`; for `production_shadow_daily|backtest_daily_primary|outcome_label_daily|shadow_evaluation_daily` it is the one deployed lowercase 64-hex approval hash owned by `source-led-eval-v3.7`. A mode/purpose pair whose stored value violates that nullability or whose daily input run has a different non-null hash is `data_integrity_failure`. The lock remains deliberately separate from `comparisonContractKey`: it partitions daily dataset approval and reuse without changing the static comparison baseline.

```text
[
 "opportunity-preparation-v3.0",
 ["mode",mode],
 ["runPurpose",runPurpose],
 ["sourceCutoff",sourceCutoff],
 ["inputRunIds",orderedInputRunIds],
 ["comparisonContractKey",comparisonContractKey],
 ["evaluationDatasetLockHash",evaluationDatasetLockHashOrNull],
 ["staticIdentityMembers",staticIdentityMembers]
]
```

`orderedInputRunIds` is the exact step-5 UUID sequence, including `[]` for source scan and empty label/evaluation branches. Repeating `staticIdentityMembers` is intentional: begin recomputes the comparison hash and rejects disagreement before hashing the preparation preimage.

At seal, `manifestBindings` is every bound complete manifest in deterministic job-graph plan order as `[manifestKind,ordinal,manifestHash]`; ordinals start at zero per kind, are consecutive, and a kind absent for the mode contributes no row. For `shadow_evaluate` this necessarily includes `evaluation_input`, `link_audit_sample` and `link_audit_resolution` in that order, so the cutoff-visible reviewer dispositions are part of the final logical identity and cannot be replaced by a later current-label read. `calendarBindings` has one row for each manifest binding in the same order: `[manifestKind,ordinal,sessionAuthorityHashes,calendarWindowHashes,recentSessionPlanHashes]`. Each of its three arrays contains the applicable manifest-header hash fields in ASCII header-field-name order, preserves duplicates and is `[]` when none applies. Calendar hashes carried only by native rows remain transitively bound by `manifestHash` and are not duplicated. When enrich has a selected mover audit, one final calendar row `["mover_audit",0,[auditedSessionAuthorityHash,previousSessionAuthorityHash],[],[recentSessionPlanHash]]` follows all manifest rows; otherwise no mover-audit row exists. The logical preimage is exactly:

```text
[
 "opportunity-logical-run-v3.0",
 ["mode",mode],
 ["runPurpose",runPurpose],
 ["sourceCutoff",sourceCutoff],
 ["inputRunIds",orderedInputRunIds],
 ["comparisonContractKey",comparisonContractKey],
 ["evaluationDatasetLockHash",evaluationDatasetLockHashOrNull],
 ["staticIdentityMembers",staticIdentityMembers],
 ["manifestBindings",manifestBindings],
 ["calendarBindings",calendarBindings],
 ["selectedMoverAuditId",selectedMoverAuditIdOrNull]
]
```

`selectedMoverAuditId` is a lowercase UUID exactly for enrich and JSON null otherwise. Seal recomputes all arrays only from stored run inputs, complete canonical manifest headers/roots and immutable audit rows. Request hashes, current authority reads and convention-based object serialization are forbidden. A calendar correction changes a later eligible manifest/calendar binding without rewriting prior identity. Golden acceptance freezes the canonical UTF-8 bytes and digest for all three preimages, verifies an independent PostgreSQL and JavaScript implementation agree, and mutates every field/list member one at a time.

`begin` accepts no preparation, comparison or evaluation-lock key from PostgREST. It captures one database `beginAt=clock_timestamp()` and applies this exact internal precedence before any durable write: (1) validate the active runner binding at `beginAt`, otherwise `PT403/principal_role_unavailable`; every absent, inactive, expired or differing greatest-recorded binding tie has that one message; (2) validate mode/purpose compatibility, require `sourceCutoff=date_trunc('second',sourceCutoff)`, and validate the branch-specific expected-hash nullability/64-hex grammar, otherwise `PT409/data_integrity_failure`; normalized cutoff bytes are PostgreSQL UTC `YYYY-MM-DDTHH24:MI:SSZ`; (3) reject `sourceCutoff > beginAt` as `PT422/future_source_cutoff`; (4) for a non-null cron hash, re-resolve the greatest effective completed composite session with `canonicalCutoff=sourceCutoff` under `trading-calendar-contract.md` and reject zero/different session or a non-byte-equal hash as `PT409/calendar_authority_mismatch`; (5) derive the complete ordered input-run set and the purpose-owned `evaluationDatasetLockHashOrNull` under the four mode branches below; (6) derive `comparisonContractKey` and `preparationKey` from the exact preimages above, take the preparation-key lock and reject any conflicting existing/bootstrap identity as `PT409/data_integrity_failure`. An earlier numbered failure always wins when fixtures collide; no application clock or route-selected key participates.

Step 5 first takes one transaction-scoped lineage lock over RFC-8785 `["opportunity-begin-lineage-v3.0",mode,runPurpose,sourceCutoff]`, then applies this total mode branch. `source_scan` requires and derives the literal empty input-run array; zero inputs is success and any pre-existing run binding for the new attempt is integrity failure. `enrich_rank` selects only the exact successful source run in `design.md` whose `runPurpose` byte-equals the enrich purpose and whose evaluation-lock value equals the derived purpose-owned value; zero same-purpose/lock matches is `PT409/missing_source_run`, one is bound, and two or more is `PT409/multiple_source_runs`. Runs of either other source/enrich purpose or lock are ineligible and cannot create a multiple-match failure. `label_outcomes` uses the two-stage indexed selector in `shadow-evaluation-contract.md`: the raw current-lock score scan reads at most 30,241 identities, then the terminal expansion reads at most 20,001 eligible outcome identities before deriving input run IDs; either sentinel overflow is `PT409/bound_violation`, while zero is valid and 1..20,000 produces the exact outcome-input plan. `shadow_evaluate` selects the canonical enrich/outcome daily inputs and frozen legacy lock under that contract, requiring the same derived non-null lock; an empty or not-yet-mature set is valid complete partial manifest evidence that remains shadow, while a duplicate canonical success for one required daily identity is `PT409/data_integrity_failure`. Its database-owned preparation plan then materializes `evaluation_input`, `link_audit_sample` and the cutoff-bound `link_audit_resolution` root before seal; the evaluation job reads only those roots. The global begin lock order is lineage lock, then derived preparation-key lock, then run lock; no function takes them in another order. No other zero/multiple/bound rule exists and the route performs no lineage read.

Those seven SQLSTATE/message pairs, including `PT409/bound_violation`, are the exhaustive expected begin exception catalog. Every expected exception rolls back all run/input/manifest-binding/job/payload/audit effects. No failed begin creates a terminal failed attempt. A typed PostgreSQL transport/coercion error that prevents function entry is not a begin exception and follows the control contract's uncatalogued-500 rule; the HTTP routes prevent it through their earlier exact lexical schema.

`comparisonContractKey` and `preparationKey` are derived inside begin only from the byte-exact preimages above; there is no caller value to compare or trust. The expected cron hash is a checked assertion, not a key member; the resolver at the same cutoff has only one acceptable value and later-recorded authority is ineligible. `begin` does not know or claim the final logical key. It takes `pg_advisory_xact_lock(hashtextextended(preparationKey,0))` after the lineage lock, then follows any newest `converged.canonicalRunId` to its success, otherwise returns the successful or active `preparing/running` attempt for the same preparation key, otherwise creates `attempt=max(existing)+1`. For an existing success, `runId` is that success and `attemptRunId` is the same UUID. For an active or created attempt, both IDs are the active attempt UUID. On `created`, the same transaction stores the derived comparison/preparation keys, binds the exact selected run/manifest inputs, invokes `enqueue_next_opportunity_job_v3_internal(run_id,NULL)` under the bootstrap branch, and inserts the derived first job plus immutable payload; either all exist or no run exists. Constraints are unique `(preparation_key,attempt)`, a partial unique successful `preparation_key`, and the canonical-evaluation partial uniqueness from `design.md`. Because recorded-at eligibility is `<= sourceCutoff` and begin forbids future cutoffs, data recorded after begin cannot enter this preparation's historical universe.

Preparing manifest jobs use only the create/append/complete/fail manifest RPCs above and the exact universal preimages/lifecycle in `manifest-storage-contract.md`; request JSON is never authority. Each lifecycle call verifies its immutable payload descriptor. Create, append-page and complete-manifest recompute the exact `manifest_header|manifest_page|manifest_reference` count branch and atomically mark the owner job succeeded plus create the sole next descriptor defined by `job-graph-contract.md`; fail-manifest atomically fails the job and parent run with the corresponding closed run failure and creates no successor. Generic stage/complete-job RPCs reject the three manifest outputs. Page append is atomic for its rows/page, same bytes and job result are idempotent, and a different descriptor/page/job result is integrity failure. Root completion locks the building manifest and all pages/rows, performs its sole terminal transition, binds it to the run and creates the next manifest header or seal job. Every `mover_price_reference` root branch additionally inserts/reuses its immutable mover audit and all ranked symbols; ordinal zero sets `selected_mover_audit_id`, later ordinals verify it unchanged, and only the final ordinal may create the dependent market-reference header. These writes are one root transaction and emit no extra RPC audit row. `seal_opportunity_run_inputs_v3` is the sole final-logical-key claim. It locks the preparation key and attempt, requires the complete exact plan including selected mover audit and every ordered mover root for enrich mode, recomputes the tuple/key from stored canonical root/audit bytes, and holds an advisory lock on that key.

If no success owns the final key, seal captures database `transitionAt`, stores `logical_key`, sets `sealedAt=transitionAt`, marks the seal job succeeded, changes `preparing` to `running` and enqueues the first post-seal/finalize job in the same transaction. It enforces unique `(logical_key,attempt)` plus one partial unique success and returns `sealed` with `runId=attemptRunId` and status `running`. If a success already owns the key, the same transaction stores the attempted logical key/input bindings for audit, marks the seal job succeeded, marks every not-yet-terminal job for the attempt `cancelled`, deletes only non-authoritative staging for that attempt, sets `sealedAt=terminalAt=transitionAt`, sets the attempt to `converged` with `canonicalRunId`, and returns `existing_success` with `runId=canonicalRunId`, `attemptRunId` equal to the converged attempt and status `success`. It creates no scoring/result/projection rows. Claim on a converged attempt returns zero rows; its status response is exactly `{status:'converged',canonicalRunId}`, while callers continue through the returned canonical run/status ref. A later `begin` follows the convergence pointer and returns that same success. Payloads, manifests, input audit rows and the converged attempt are immutable and are never deleted by cleanup or reaping.

A repeated seal call for the same attempt is idempotent only when the stored seal-job owner-token hash and recomputed logical/input hashes match. A `running` attempt returns the original `sealed` response; a `success` attempt returns `existing_success` with identical run/attempt IDs; a `converged` attempt returns its stored canonical response. A different token/hash, a failed attempt or any changed input returns integrity failure and mutates nothing.

No post-seal job can be created or leased before a non-converged seal. A failed seal leaves no partial logical/input binding or successor and terminalizes the attempt as `failed` with the exact integrity/failure code. Therefore concurrent preparation retries resolve to one running/success owner or one explicit converged audit attempt; no ambiguous live alias state exists.

Workers never insert terminal tables or jobs directly. `stage_opportunity_job_output_v3` verifies the live owner token, job input/payload hash, exact stage/output pair, exact `job-graph-contract.md` envelope/body, row bounds, SHA-256 and canonical/JSON equivalence, then upserts the sole staging bundle for `(jobId,attempt)`; manifest, seal and finalize payload kinds are rejected. Both representations and the whole request are at most 3 MiB. `complete_opportunity_job_v3` locks the job plus its one staging row, repeats exact schema validation, enforces the output/count branch in `postgres-type-contract.md`, requires equality with caller assertions. Deep completion recomputes candidate/success/failure conservation, validates exactly three score tuples per successful deep row and reports zero durable score snapshots. Projection completion alone recomputes global horizon ranks, inserts exactly three durable score snapshots per successful/detail candidate and reports that exact count. It inserts the authorized normalized rows, immutable `opportunity_job_results_v3`, warning facts, job terminal state and sole successor atomically. Same-hash/count completion is idempotent; a different hash/count, invalid layout/pair or successor conflict is `data_integrity_failure`. `fail_opportunity_job_v3` derives retryable/failed solely from the closed rule: retryable changes only the same job and creates no successor; terminal failure fails the parent run and creates no successor. A crash before complete leaves only staging that the reaper may delete. A crash after commit leaves result/terminal rows, warnings, succeeded job and next payload/job together. HTTP credential rejection/call-position behavior is exclusively the exact worker-wire table in `job-graph-contract.md`; a rejected continuation never authorizes the route to clear its lease or invent a failure commit.

All authoritative/observation rows are append-only and eligible only when database-generated `recordedAt <= sourceCutoff`; therefore later inserts cannot alter the logical point-in-time universe across independent PostgREST reads. Each manifest job records the exact cutoff, section/page ordinal and universal canonical page/root ref. Partial uniqueness on complete `(manifestKind,manifestHash)` makes concurrent identical terminal builders converge at seal, while a kind/version/header/page/root mismatch fails integrity. Building manifests are never input authority and cannot be sealed.

`finalize` accepts only the leased finalizer job/owner token, rejects `preparing` and `converged`, then obtains advisory locks for preparation/final logical keys and locks the running attempt and child rows. It verifies the finalizer payload's exact ordered predecessor IDs/hashes, requires every other required job succeeded with no lease/retry, all manifests and conservation/bounds, three horizons per deep success, child uniqueness and valid public/detail projection bytes. Only then does it capture database `terminalAt`, mark the finalizer job succeeded and set the run `success` in one transaction. PL/pgSQL exception handling rolls validation back, captures a terminal timestamp, marks both finalizer job and parent run `failed` with one closed code and creates no successor. Readers select only terminal-visible success and never treat convergence as result authority.

The public compact status/projection read normalizes server-owned request cutoff C and executes one bounded database statement. It is distinct from the current operational `opportunity_run_status_read_v3` control view: the control view reads one exact run ID's present status and never applies this historical projection algorithm. The public read filters `createdAt <= C` and `sourceCutoff <= C`, reconstructs each attempt's state from the timestamp rules above, and applies `data-contract.md` precedence. For an active or failed selection it joins only append-only warning facts with `fact.recordedAt <= C` and a same-run producing succeeded job having `job.terminalAt <= C`; neither current job status nor later facts participate. When a visible success wins, the endpoint validates and returns its stored canonical projection byte-for-byte, so the stored run `asOf` remains its source cutoff rather than C. Otherwise it serializes the exact unavailable object for C. Thus a run or stage terminalized after C cannot retroactively change the result at C even if the same query is executed after all work finishes.

`reap_opportunity_jobs_v3` accepts no time argument. After role validation it captures one `reapAt=clock_timestamp()` and uses that value for every lease comparison and terminal timestamp in the transaction; request, worker and application clocks are never authority. An expired lease becomes `retryable` when attempt <5; its staged rows are deleted by `(jobId,attempt)` only while the parent is active, while its immutable payload and any previously accepted immutable result are never deleted. At attempt 5 it becomes `failed` and the parent becomes `failed/job_attempts_exhausted`. A preparing/running run with a missing one-to-one immutable payload, with no live/queued/retryable/finalizer job, or with a succeeded predecessor whose deterministic successor is absent becomes `failed/orphaned_run`; the reaper never invents a successor because successor creation belongs to the predecessor transaction in `job-graph-contract.md`. Converged attempts and their cancelled/succeeded preparation jobs are terminal audit records and are ignored. Reaping is idempotent for the same database state; repeated later calls may only process newly expired leases. Terminal children, immutable payload/result rows, manifest rows and audit rows can never be deleted by reaping.

## Resource envelopes

Every SQL statement used by V3 sets a 10-second statement timeout and uses an indexed predicate/order. Every PostgREST/RPC response is at most 5 MiB; control/status responses are at most 256 KiB. One worker request has a 15-second application budget; cooperative workers heartbeat or fail before their budget, while abrupt termination is recovered solely by lease expiry/reaping. Work that cannot fit is split before claim rather than truncated.

| Unit | Maximum |
|---|---:|
| universal manifest page | 2,000 tuples, 768 KiB page canonical and 3 MiB total canonical/JSON bundle, whichever first |
| source parse job | exactly 1 document and at most 100,000 code points |
| emitted per parse job | exactly 1 document outcome, at most 200 claims and 1,000 mentions; canonical-plus-JSON <=3 MiB |
| immutable job payload or accepted result | 3 MiB combined canonical/JSON bytes per row; every SQL/PostgREST response containing it remains at most 5 MiB |
| universal manifest root request | 3 MiB canonical/JSON bytes |
| shallow/deep candidate job | 5 symbols |
| outcome label job | 200 score snapshots |
| in-process canonicalization buffer | 16 MiB |
| public projection read | one successful run, 20 candidates, contract egress caps |

If one tuple cannot fit a 3 MiB page/staging request, the run fails `bound_violation`; it is never truncated. Every authority/dataset manifest uses the sole row/page/root algorithm and per-kind section/bound table in `manifest-storage-contract.md`; legacy source/factor/sector page tags are forbidden. A completed page is immutable and resumable; root creation requires consecutive ordinals, exact first/last identities, row/count conservation and no missing/extra/reordered section or page.

Maximum-contract fixtures do not require one HTTP request to finish. They prove that job payloads, process memory, SQL responses and public egress remain within these envelopes while the durable queue reaches the same root/result across interruption schedules. Connector summary, outcome and evaluation workers receive only the bounded token-bound projections in `opportunity-job-graph-v3.15`, even when their normalized/manifest inputs reach one million mentions or five million benchmark rows. A run can span multiple worker invocations; it cannot publish until every required job and final validation completes.

## Legacy correctness stage authority

The disabled legacy-correctness producer owns one closed DAG in this exact order:
`source_sync -> mention_claim_extraction -> candidate_funnel -> facts_refresh ->
analysis_revision -> compact_radar_projection`. It is a separate append-only
observer and cannot create an `opportunity_runs` row, invoke a V3 route, change a
flag, or activate a scheduler.

Every successor receives its predecessor only through a persisted, cutoff-bound
stage bundle with `readKind`, `readCanonical`, `readJson`, `readHash` and
`readRowCount`; database code verifies the root/run/job/lease-token/predecessor
identity before returning it. `candidate_funnel` and `compact_radar_projection` are
at most 60 rows. `facts_refresh` and `analysis_revision` run one deterministic
stock shard per candidate, so the history/fact plane cannot turn into a monolithic
result. A staged attempt either commits its frozen page/outcomes/revision/successor
together or terminalizes without lease/data residue. A rerun with an equal material
hash records an evaluation but reuses the prior immutable analysis revision.
