# Additive Storage Schema Contract: source-led-opportunity-engine-v3

Version: `opportunity-storage-v3.25`

This file fixes the additive PostgreSQL shape that Terra must implement. SQL identifier casing is snake_case, timestamps are `timestamptz`, IDs are `uuid`, hashes are `text CHECK (value ~ '^[0-9a-f]{64}$')`, finite numeric facts are `double precision` with `CHECK (isfinite(value))`, and every RPC-visible enum/composite is the exact named type in `postgres-type-contract.md`; substituting anonymous/generic enums, JSON objects or implementation-selected `CHECK` labels is forbidden. No existing table or constraint is dropped or repurposed.

## Global rules

- Every authority, observation, revision, run, job, manifest and result row has `recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()`. Clients cannot insert/update `recorded_at`; each write RPC omits it and privileges prohibit direct table inserts outside the RPC owner.
- Business/source/approval timestamps and `recorded_at` are separate. Historical eligibility requires all contract-specific business timestamps and `recorded_at <= source_cutoff`.
- Authority, observation, revision, terminal manifest, terminal run and result rows reject `UPDATE` and `DELETE`. A `building` manifest is the sole authoritative-construction exception: only the exact create/append/complete/fail RPCs in `runtime-transaction-contract.md` may insert its immutable pages/rows and perform one `building -> complete|failed` transition. Header/identity/recorded fields never change, and every terminal manifest/page/row is immutable. Other mutable rows are nonterminal run/job leases and nonce consumption. Terminalization sets terminal columns once through the named RPC.
- All foreign keys are explicit. Authority/history FKs use `ON DELETE RESTRICT`; run-owned staging/result FKs use `ON DELETE RESTRICT`; no V3 authoritative evidence cascades from a legacy table deletion.
- Every authority/result column ending `principal_id` is an authenticated actor UUID copied from the server-owned secret mapping in `auth-principal-contract.md`; it is deliberately **not** a foreign key so immutable history does not depend on later binding retention. The named RPC must additionally authorize that UUID and its function-specific role against `internal_principal_role_bindings_v3` at the captured database transaction timestamp. No DDL or implementation may describe an actor column as an FK or treat possession of `service_role` plus an arbitrary UUID as authorization.
- Every V3 table executes `ENABLE ROW LEVEL SECURITY` and `NO FORCE ROW LEVEL SECURITY`. Table privileges are revoked from `PUBLIC`, `anon` and `authenticated`; `service_role` receives only the closed `SELECT`/`EXECUTE` catalog below and must already have `rolbypassrls=true`. Exactly one policy exists: `opportunity_v3_rpc_owner_binding_select FOR SELECT TO opportunity_v3_rpc_owner USING (true)` on migration-owner-owned `internal_principal_role_bindings_v3`; it has no `WITH CHECK`. No other V3 table has any policy. The NOLOGIN/NOBYPASSRLS RPC owner owns every other V3 table and therefore uses PostgreSQL owner bypass only on those non-forced tables; the single policy permits its read-only binding lookup. Direct authoritative mutation remains impossible for every client role.
- Canonical preimage bytes in `bytea` are authoritative. JSONB copies are query conveniences and must validate to the same stored byte hash; PostgreSQL JSONB serialization is never used as RFC 8785 authority.
- Before any V3 DDL, migration preflight requires exactly one installed `pgcrypto` extension in schema `extensions`, one exact `extensions.digest(bytea,text) RETURNS bytea` procedure and the three RFC-4122/job/page UUIDv5 golden vectors owned by `job-graph-contract.md` v3.15. Legitimate other signatures such as `extensions.digest(text,text)` do not conflict; every V3 call is schema-qualified. The migration never installs or moves an extension, creates a UUID helper or continues after a mismatch; failure occurs before the first V3 object, while successful reapplication creates no extra helper/object.
- The seven mutable authority families use only `authority-supersession-contract.md` v3.2: latest-event collapse includes inactive rows before status/expiry classification, all selected terminal events are hash-bound, and no query may prefilter inactive rows or revive older authority. The source-family and seven-authority stream registries below are populated atomically with the first event, immutable, globally capped under their family-wide advisory locks and enumerated before any cutoff/valid-time/eligibility filter. Each listed stream-leading index is also the mandatory append/cutoff path for the 64-event lifetime cap and literal `LIMIT 65`; catalog acceptance fails if a cutoff-ineligible prefix, individual stream or registry can scan or retain an unbounded population. The separate financial-series registry has the analogous exact 128-row lifetime and `LIMIT 129` authority in `financial-data-contract.md` v3.3; it is not an eighth supersession family.

## Authority and source revision tables

### Bounded stream registries

`source_revision_family_registry_v3(source_key source_key_v3,revision_family_key text,approved_source_identity_id uuid REFERENCES source_entities(id) ON DELETE RESTRICT,stable_connector_document_id text,registered_at timestamptz)` is immutable, has primary key `(source_key,revision_family_key)`, unique `(source_key,approved_source_identity_id,stable_connector_document_id)`, the exact family-key recomputation check from `source-adapter-contract.md` v3.3 and index `(source_key,revision_family_key)`. The source append RPC always takes the `sourceKey` registry advisory lock before the exact family lock. A new family is inserted in the same transaction as its first revision only after the indexed registry query in ASCII family-key order with literal `LIMIT 1000001` proves fewer than 1,000,000 existing families for that source key; a deferred constraint trigger rejects a registry row without a same-key revision at transaction end. Existing-family corrections cannot insert a second registry row. No role has a direct insert/update/delete grant.

`opportunity_authority_stream_registry_v3(family authority_stream_family_v3,stream_key_hash text,stream_key_canonical bytea,registered_at timestamptz)` is immutable, has primary key `(family,stream_key_hash)`, unique `(family,stream_key_canonical)`, lowercase-64-hex/hash-agreement checks and index `(family,stream_key_hash,stream_key_canonical)`. `stream_key_canonical` is UTF-8 RFC 8785 of the exact stream-key array in `authority-supersession-contract.md` v3.2 and `stream_key_hash=SHA256(stream_key_canonical)`. Every one of the seven append RPCs takes its family-wide registry advisory lock before its stream lock, inserts a new registry key and first event atomically only below that family's exact bound, and reuses the existing registry key for corrections. A deferred constraint trigger rejects an orphan registry row or an event whose derived family/key differs. No direct DML exists. This registry, not `SELECT DISTINCT` over eligible event rows, is the sole stream-key enumeration authority.

### `source_document_revisions_v3`

Columns are the exact revision columns in `source-adapter-contract.md`, with `revision_id` primary key, stored generated/validated `revision_family_key`, required `source_identity_authority_id`, required RPC-derived `approved_source_identity_id`, required RPC-derived `source_key`, `supersedes_revision_id uuid NULL REFERENCES source_document_revisions_v3(revision_id) ON DELETE RESTRICT`, and `raw_field_payload jsonb`. The sole authority FK is the composite `(source_identity_authority_id,approved_source_identity_id,source_key) REFERENCES source_identity_authorities_v3(authority_id,source_identity_id,source_key) ON DELETE RESTRICT`; it is immediate, non-deferrable and makes an independently mismatched identity or key unrepresentable. `approved_source_identity_id` additionally references `source_entities(id) ON DELETE RESTRICT`. `append_source_document_revision_v3` accepts only the authority UUID, locks/selects its latest stream event, requires it `effective_active`, derives the other two columns and inserts revision plus success audit in one transaction. Constraints enforce family-key recomputation from those copied columns, same-family earlier supersedes, status/hash/payload nullability and code-point bounds. A deferred constraint trigger rejects differing authoritative payloads tied on `(revision_family_key,recorded_at)`; byte-equivalent ties remain audit rows and selection retains the lowest UUID. The append RPC enforces the exact registry-wide family and 64-revision lifetime caps from `source-adapter-contract.md` v3.3 by registry-first locking, duplicate reuse and indexed `LIMIT 65` under the family lock. Indexes are:

```text
(source_key, revision_family_key, recorded_at DESC, revision_id)
(source_key, recorded_at DESC, stable_connector_document_id, revision_id)
(source_key, collected_at DESC, published_at DESC, revision_id)
(approved_source_identity_id, recorded_at DESC)
(ingestion_canonical_content_hash_v3) WHERE hash IS NOT NULL
```

`source_identity_authorities_v3` has the exact columns/constraints in `source-matrix.md`, primary key `authority_id`, required non-null `source_identity_id uuid REFERENCES source_entities(id) ON DELETE RESTRICT`, required `source_key`, unique `(authority_id,source_identity_id,source_key)`, non-FK approving-principal identity and indexes `(source_identity_id,recorded_at DESC,authority_id)`, `(recorded_at,source_key,source_identity_id)` and `(source_identity_id,valid_from,approved_at,recorded_at)`. Null identity and null admission-key members are rejected by both the input validation and table constraints. Legacy source-entity fields never satisfy V3 approval.

### `publisher_verification_authorities_v3`

```text
authority_id uuid PK, publisher_identity_id uuid REFERENCES source_entities(id) ON DELETE RESTRICT, source_class source_class_v3,
domains text[] NOT NULL, feed_identity text NULL, institution_identity text NULL,
valid_from timestamptz, valid_to timestamptz NULL, approved_at timestamptz,
approving_principal_id uuid, status authority_status_v3, recorded_at
```

Domains are already lowercase IDNA, sorted unique and contain no scheme/path/port. Constraints require `valid_to > valid_from`, nonempty identity, and an institution for `public_research`. Unique immutable payload covers every column except UUID/recorded time. Indexes `(publisher_identity_id,recorded_at DESC,authority_id)` and `(recorded_at,publisher_identity_id,approved_at,valid_from)` support latest-event collapse and the manifest sentinel.

### Identity/taxonomy authority

`stock_instruments_v3` columns are exactly `(instrument_authority_id uuid PK,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,symbol text,exchange stock_exchange_v3,instrument_type instrument_type_v3,listing_status listing_status_v3,official_legal_name text,official_short_name text NULL,official_name text GENERATED ALWAYS AS (CASE WHEN official_short_name IS NOT NULL THEN official_short_name WHEN char_length(official_legal_name) <= 40 THEN official_legal_name ELSE NULL END) STORED,provider official_roster_provider_v3,source_timestamp timestamptz,valid_from timestamptz,valid_to timestamptz NULL,roster_version text,recorded_at timestamptz)`. Legal name is NFC/trim-stable and 2..120 Unicode code points; short name is null or NFC/trim-stable and 2..40 code points. `official_name` is therefore exactly the short name when present, otherwise the legal name only when it is at most 40 code points, otherwise null. No name is truncated. The roster/public `officialName`/`chineseName` is this nullable generated value. An official alias is inserted only for an original legal/short input whose original length is 2..40 and whose normalized alias also satisfies the alias contract; legal names of 41..120 are retained as authority but produce neither alias nor public name unless an eligible short name is supplied. Unique payload covers every non-generated column except ID/recorded time; indexes are `(stock_id,recorded_at DESC,instrument_authority_id)`, `(recorded_at,exchange,symbol)` and `(source_timestamp,valid_from,valid_to)`.

`stock_aliases_v3` columns are `(alias_authority_id uuid PK,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,normalized_alias text,source alias_source_v3,source_timestamp timestamptz,approved_by_principal_id uuid,approved_at timestamptz,valid_from timestamptz,valid_to timestamptz NULL,status authority_status_v3,normalization_version text,recorded_at timestamptz)`. The principal is a verified actor scalar, not an FK. Indexes `(stock_id,normalized_alias,source,recorded_at DESC,alias_authority_id)`, `(recorded_at,normalized_alias,stock_id)` and `(approved_by_principal_id,approved_at)`.

`stock_sector_assignments_v3` columns are `(assignment_authority_id uuid PK,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,market tw_market_v3,official_industry_code text,canonical_sector_key canonical_sector_key_v3,provider official_roster_provider_v3,source_timestamp timestamptz,valid_from timestamptz,valid_to timestamptz NULL,taxonomy_version text,status authority_status_v3,recorded_at timestamptz)`. Indexes `(stock_id,market,recorded_at DESC,assignment_authority_id)`, `(recorded_at,market,stock_id)` and `(canonical_sector_key,recorded_at)`.

All three require `valid_to IS NULL OR valid_to > valid_from`; their manifests include `recorded_at`. They never read `stocks.sector` or hand-coded aliases as authority.

### Peer and human verification authority

`stock_peer_relationship_reviewers_v3` adds immutable `reviewer_authority_id uuid PK`, non-FK actor UUIDs `reviewer_principal_id` and `approving_principal_id`, `approved_at timestamptz`, `valid_from timestamptz`, `valid_to timestamptz NULL`, `status authority_status_v3`, `recorded_at timestamptz`; indexes `(reviewer_principal_id,recorded_at DESC,reviewer_authority_id)` and `(recorded_at,reviewer_principal_id,valid_from,approved_at)`.

`stock_peer_relationships_v3` columns are exactly `(relationship_authority_id uuid PK,supplier_instrument_authority_id uuid REFERENCES stock_instruments_v3(instrument_authority_id) ON DELETE RESTRICT,supplier_stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,customer_instrument_authority_id uuid REFERENCES stock_instruments_v3(instrument_authority_id) ON DELETE RESTRICT,customer_stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,relationship_kind text CHECK (relationship_kind='supply_chain'),source_timestamp timestamptz,approved_at timestamptz,valid_from timestamptz,valid_to timestamptz NULL,status authority_status_v3,evidence_ref text,reviewer_principal_id uuid,recorded_at timestamptz)`. Symbols are deliberately not stored in this relation. The append RPC locks both supplied instrument-authority rows, copies their exact `stock_id` values, requires different stocks, `instrument_type=common_stock`, `recorded_at <= approved_at`, `source_timestamp <= approved_at`, and each authority interval to contain `source_timestamp`; a deferred trigger rechecks that each copied stock ID byte-matches its referenced authority. The peer-authority manifest then maps each stored stock ID through the one exact effective-active row for that stock in its already complete bound `instrument_roster` manifest and emits that row's symbol. Zero/multiple roster matches are respectively the existing ineligible endpoint reason or `data_integrity_failure`; current `stocks.symbol` and a live roster query are forbidden. Primary key is `relationship_authority_id`; indexes are `(supplier_stock_id,customer_stock_id,recorded_at DESC,relationship_authority_id)`, `(recorded_at,relationship_authority_id)`, `(supplier_instrument_authority_id,recorded_at)` and `(customer_instrument_authority_id,recorded_at)`.

`valuation_verifications_v3` columns are `(verification_id PK,symbol,input_hash,decision,reason_codes text[],evidence_refs text[],rationale,valuation_computed_at,review_timestamp,expires_at,reviewer_principal_id,recorded_at)`. Reviewer principal is a verified non-FK actor scalar. The RPC alone sets `expires_at = review_timestamp + interval '30 days'`. Index `(symbol,input_hash,review_timestamp DESC,recorded_at DESC,reviewer_principal_id,verification_id)` supports the exact sentinel/order; manifest selection collapses byte-equivalent tied authority rows and rejects differing tied payloads as specified in `valuation-contract.md`. Array, reason, rationale and timestamp checks implement that contract.

`internal_principal_nonces_v3(principal_id,nonce,request_timestamp,recorded_at)` has primary key `(principal_id,nonce)` and expiry index. It is the only security table with an approved 24-hour delete path. A successful standalone `consume_internal_nonce_v3` inserts the nonce and its one `opportunity_rpc_audit_v3` row atomically; either both commit or neither does. A later separately transacted human append failure cannot erase them. For the four blinded link routes, only the one combined assignment/submit RPC may insert the nonce, and that insert is in the same transaction as successful disposition/label/audit completion; every raised expected or unknown failure rolls the insert back.

`internal_principal_role_bindings_v3(binding_id uuid PK,principal_id uuid,role internal_principal_role_v3,valid_from timestamptz,valid_to timestamptz NULL,status authority_status_v3,configuration_hash text,recorded_at timestamptz)` is non-secret authorization authority. The additive schema migration creates it empty. It is append-only and writable only by the database migration owner through a separately approved binding-data migration; neither `opportunity_v3_rpc_owner` nor `service_role` has insert/update/delete or an RPC that can mutate it. Test fixtures may seed it only while connected as the migration owner. To authorize `(principal,role)` at captured transaction time T, select rows with `recorded_at <= T` and `valid_from <= T < valid_to` (null is open), greatest `recorded_at` first then binding UUID. Byte-identical ties collapse to the lowest UUID; a differing payload tie, no selected row or an inactive/expired selected row all fail every caller-bound RPC with the sole SQLSTATE/message `PT403/principal_role_unavailable`. `principal_binding_integrity_failure` is not a V3 message and must not appear in SQL, logs used as API authority or response mapping. The selected row must be `active`; the server-secret mapping independently must be active and contain the same role. `configuration_hash` is exactly the lowercase SHA-256 of the approved non-secret canonical principal/role manifest; no HMAC key/key ID is stored. Indexes are `(principal_id,role,recorded_at DESC,binding_id)` and `(status,valid_from,valid_to,recorded_at)`; `valid_to > valid_from`, 64-hex configuration hash and the closed role enum are checked.

`opportunity_rpc_audit_v3(audit_id uuid PK,function_name opportunity_rpc_function_name_v3,caller_principal_id uuid,subject_kind opportunity_rpc_subject_kind_v3,subject_id uuid NULL,input_hash text,disposition opportunity_rpc_audit_disposition_v3,recorded_at timestamptz)` is append-only. `function_name` is the exact 33-value closed granted function set below; caller principal is a non-FK actor scalar. Each successful write RPC inserts exactly one audit row in the same transaction as its successful/idempotent/terminal mutation: standalone nonce consumption therefore commits one `nonce/consumed` audit, and a later successful append commits its separate append audit. A failed second append writes no append audit but cannot roll back the already committed nonce or nonce audit. The blinded assignment read writes an audit row only for one of its eight successful dispositions, while an expected/unknown combined-RPC failure rolls back its provisional nonce and leaves no audit/label row. `input_hash` is the database-computed SHA-256 of a typed JSONB array of non-secret arguments; owner tokens are represented only by their SHA-256 and signatures/HMAC/nonces/raw source text are omitted. Indexes are `(recorded_at,function_name,audit_id)` and `(subject_kind,subject_id,recorded_at)`.

### Assistive artifact registration

`opportunity_assistive_artifact_registrations_v3` is the sole V3 artifact registry; no undocumented `ml_forecast_snapshots` or `model_training_runs` relation is assumed. Its exact columns are `(registration_id uuid PK,artifact_ref text UNIQUE,artifact_hash text,artifact_kind assistive_artifact_kind_v3,license_id text,license_evidence_ref text,training_cutoff timestamptz,evaluation_manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,comparison_baseline_key text,oos_precision_at_20 double precision,oos_ndcg_at_20 double precision,oos_worst_decile_mae20_pct double precision,status assistive_artifact_status_v3,supersedes_registration_id uuid NULL REFERENCES opportunity_assistive_artifact_registrations_v3(registration_id) ON DELETE RESTRICT,registered_by_principal_id uuid,registered_at timestamptz,recorded_at timestamptz)`. The principal is a verified non-FK actor scalar. Hash/ref/license bounds follow `data-contract.md`; `license_id` is exactly `apache-2.0|mit|bsd-3-clause|cc-by-4.0|proprietary-internal-eval`; `comparison_baseline_key` is lowercase 64-hex; precision/NDCG are finite `0..1`, MAE is finite `-100..0`, `training_cutoff <= registered_at = recorded_at`, and a supersedes pointer must be earlier and for the same artifact hash. A deferred trigger requires the evaluation manifest to be terminal `complete`, kind `evaluation_input`, version `source-led-eval-v3.7`, with `backtestCount=120`, exactly 120 backtest rows, a hash-bound trading-calendar window and header `comparisonContractKey` byte-equal to `comparison_baseline_key`; a valid complete partial manifest is ineligible for artifact registration. No other hash/key is an eligible right-hand side. The registration RPC verifies the nonempty license evidence ref and that training cutoff precedes every evaluation entry session. It always takes the one registry-wide advisory lock and then the `artifact_hash` advisory lock, in that global order. While holding both it reuses an exact semantic duplicate, admits at most 64 retained registrations for one hash, and admits at most 1,000 distinct hashes in the registry lifetime. It performs the stream probe with `LIMIT 65` and the ASCII-hash/global raw probe with `LIMIT 64001 = 1000*64+1`; a 65th revision or 1,001st hash is `PT409/bound_violation` with no registration or RPC-audit write, while a separately committed nonce remains consumed. The registry lock serializes concurrent different new hashes at the 1,000 boundary rather than allowing both to pass a stale count. Indexes are `(artifact_hash,recorded_at DESC,registration_id)`, `(comparison_baseline_key,recorded_at DESC,evaluation_manifest_id)` and `(status,recorded_at,training_cutoff)`.

For an available run, artifact selection first reads registrations in `(artifact_hash ASC,recorded_at DESC,registration_id ASC)` order through the first index with literal raw `LIMIT 64001`; row 64,001 is `PT409/bound_violation`, not discarded. The append invariant makes rows 1..64,000 the complete registry. It then filters to `recorded_at <= run.source_cutoff`, `training_cutoff <= run.source_cutoff`, `registration.comparison_baseline_key = run.comparison_contract_key`, the bound complete evaluation manifest header's `comparisonContractKey = run.comparison_contract_key`, a still-complete bound evaluation manifest and an allowed license. `evaluation_dataset_lock_hash` and the legacy baseline-lock hash are evidence inside the evaluation contract and can never substitute for this equality. Group by at most 1,000 `artifact_hash` values; greatest `recorded_at` wins, an exact semantic tie collapses to lowest registration UUID, and a differing tie is `data_integrity_failure`. A latest `revoked` row removes that hash. Sort the bounded heads by bound evaluation-manifest `terminal_at` descending, artifact hash ascending, registration UUID ascending; retain the first three and serialize in that order. The joined sort is therefore over at most 1,000 rows and need not scan an unbounded evaluation history. An artifact hash appears at most once. More than three is deterministic truncation, not failure; a duplicate/conflicting ref, post-cutoff registration, baseline mismatch, revoked row or missing metric/license evidence cannot appear. Catalog and `EXPLAIN (FORMAT JSON)` acceptance prove both raw sentinels, index use and a sparse revoked-prefix fixture. The artifact bytes are never downloaded or executed by a Vercel request, and every selected summary has `influence='none'`.

## Official observation plane

Legacy `stock_signals`, `revenue_signals` and `fundamental_snapshots` remain unchanged and are not V3 point-in-time authority.

`tw_trading_sessions_v3(session_authority_id uuid PRIMARY KEY,session_id date,market tw_market_v3,open_at timestamptz,close_at timestamptz,status trading_session_status_v3,provider official_roster_provider_v3,source_timestamp timestamptz,collected_at timestamptz,recorded_at timestamptz,source_ref text)` is the append-only market-session authority stream defined by `trading-calendar-contract.md` version `tw-trading-calendar-v3.4`. It rejects update/delete, requires `open_at < close_at`, `source_timestamp <= collected_at <= recorded_at`, and has byte-semantic idempotency unique `(market,session_id,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref)`. PostgreSQL may create indexes only to back that primary key and unique constraint; excluding those constraint-backed indexes, the complete supporting-index set is exactly `(market,session_id,recorded_at DESC,session_authority_id)`, `(recorded_at,market,session_id)` and `(status,close_at DESC,recorded_at)`. No other non-constraint supporting index exists, and the former `(market,close_at DESC,recorded_at,session_authority_id)` shape is forbidden. Effective selection, tie collapse, cancellation/reactivation and the TWSE/TPEX composite-session rule belong only to that calendar contract and the view below; no manifest-local rule may reinterpret them.

`opportunity_price_observations_v3` columns are `(observation_id uuid PRIMARY KEY,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,exchange stock_exchange_v3,session_id date,session_authority_id uuid REFERENCES tw_trading_sessions_v3(session_authority_id) ON DELETE RESTRICT,raw_open,raw_high,raw_low,raw_close,volume,turnover_twd,provider price_provider_v3,source_timestamp,collected_at,source_ref,recorded_at)`. There are no adjusted-price or corporate-action columns. A deferred constraint trigger requires the referenced calendar row to have the same `session_id` and `market=exchange`; a correction appends a new observation bound to the new authority and never rewrites old evidence. Raw OHLC are finite and positive; volume/turnover are finite and nonnegative. They satisfy `raw_low <= raw_open,raw_close <= raw_high`, use a nonempty source ref and obey `source_timestamp <= collected_at <= recorded_at`. Provider/exchange satisfies the raw tier in the exact 313-byte `market-price-provider-allowlist-v3.1` preimage. Unique immutable identity covers every listed authoritative column except UUID. The complete raw-price supporting indexes are `(stock_id,exchange,session_id,session_authority_id,provider,recorded_at DESC,observation_id)`, `(stock_id,session_id DESC,session_authority_id,provider,source_timestamp DESC,collected_at DESC,recorded_at DESC,source_ref,observation_id)` and `(exchange,session_id,session_authority_id,recorded_at,stock_id,provider)`. The first drives per-provider `LIMIT 65`; the second drives bounded cutoff/calendar-window selection.

Corporate actions are normalized into three immutable relations. `opportunity_corporate_action_snapshots_v3(snapshot_id uuid PRIMARY KEY,exchange stock_exchange_v3,session_id date,session_authority_id uuid REFERENCES tw_trading_sessions_v3(session_authority_id) ON DELETE RESTRICT,corporate_action_version text,provider official_roster_provider_v3,collected_at timestamptz,declared_event_count integer,dataset_hash text,recorded_at timestamptz)` has unique semantic identity `(exchange,session_id,session_authority_id,corporate_action_version,collected_at,dataset_hash)`. `opportunity_corporate_action_feed_evidence_v3(snapshot_id uuid REFERENCES opportunity_corporate_action_snapshots_v3(snapshot_id) ON DELETE RESTRICT,feed_ordinal integer,feed_identity text,response_byte_count integer,response_sha256 text,parsed_row_count integer,PRIMARY KEY(snapshot_id,feed_ordinal),UNIQUE(snapshot_id,feed_identity))` has exactly ordinals 0..2. `opportunity_corporate_action_events_v3(snapshot_id uuid REFERENCES opportunity_corporate_action_snapshots_v3(snapshot_id) ON DELETE RESTRICT,event_ordinal integer,symbol text,event_kind corporate_action_kind_v3,pre_action_reference_price double precision,post_action_reference_price double precision,feed_identity text,source_row_ref text,daily_adjustment_factor double precision,PRIMARY KEY(snapshot_id,event_ordinal),UNIQUE(snapshot_id,symbol))` stores every official instrument class, in symbol-ascending ordinals 0..`declared_event_count-1`; factor is database-derived byte-equal to post/pre and is never an input member.

Snapshot constraints require the exact provider, literal algorithm, three feed identities/order and feed/event-kind mapping from the 313-byte allowlist, response size 0..8,388,608, lowercase SHA-256 refs, adapter-normalized unique per-feed parsed counts whose exact sum equals the 0..20,000 event count, exact trimmed exchange-code grammar and finite positive pre/post/factor. Any cross-feed symbol collision is an authority conflict. The database recomputes every source-row ref from the exact event tuple. No roster or instrument-class filter is applied while sealing a complete official response. A deferred trigger requires the session authority's date/market match, all three feed rows and all declared event rows to exist in the same transaction, and recomputes `dataset_hash` from their exact ordered canonical tuple. The complete supporting indexes are snapshot stream `(exchange,session_id,session_authority_id,corporate_action_version,collected_at DESC,recorded_at DESC,snapshot_id)`, cutoff window `(exchange,session_id DESC,recorded_at,snapshot_id)` and event lookup `(snapshot_id,symbol,event_ordinal)`. The first drives literal `LIMIT 65`; a distinct 65th snapshot revision is zero-write `bound_violation`. Raw-price and snapshot append branches, cutoff/tie selection, complete-snapshot `none` derivation, trusted factor product and exact adjusted-price evidence are solely `market-contract.md` v3.6. Catalog/plan acceptance forbids sequential raw-price/snapshot history scans, incomplete-feed absence inference and caller-adjusted persistence.

`opportunity_market_observations_v3` columns are `(observation_id uuid PRIMARY KEY,fact_key,scope_key,session_id date NULL,session_authority_id uuid NULL REFERENCES tw_trading_sessions_v3(session_authority_id) ON DELETE RESTRICT,value,unit,provider,provider_identity text NULL,authority_date date NOT NULL,provider_session_date date NULL,breadth_numerator_count integer NULL,breadth_observed_count integer NULL,breadth_eligible_count integer NULL,breadth_roster_manifest_id uuid NULL,breadth_roster_manifest_hash text NULL,observed_at,collected_at,source_ref,provider_revision,recorded_at)`. `session_id` and `session_authority_id` are null or non-null together; when present a deferred trigger requires the exact applicable exchange member of the effective composite session. `authority_date` and `provider_session_date` are caller-absent and database-derived exactly under `market-contract.md`: the former is non-null for every row and equals session date, global home-market date or non-session Asia/Taipei observation date by row class; the latter is non-null exactly for global rows and equals `authority_date` there. The five breadth members are non-null exactly for `above_ma20|above_ma60`, obey `0<=numerator<=observed<=eligible<=20000`, and the ID/hash reference one terminal complete `instrument_roster/tw-instrument-roster-v3.0` manifest; because that relation is created later in the DDL, its named `ON DELETE RESTRICT` FK is added after generic manifest creation. The stored percentage and roster exchange count must recompute byte-for-byte under `market-context-v3.6`. Every other fact requires all five breadth members null.

The exact fact/scope/unit/provider/provider-identity tuple must exist in the 18-row `market-provider-v3.2` preimage in `market-contract.md`; `TW_ACTIVE_COMMON` is output-only, global identities are non-null and exact, and every non-global identity is null. These checks run in `append_market_observation_v3` and deferred constraints. An exact stream is `(fact_key,scope_key,authority_date,provider,provider_identity)`; the RPC derives the date, locks the stream, collapses semantic duplicates and applies indexed `LIMIT 65` before inserting any 65th revision. Supporting indexes are `(fact_key,scope_key,observed_at DESC,recorded_at,observation_id)`, `(fact_key,scope_key,authority_date,provider,provider_identity,recorded_at DESC,observation_id)`, `(fact_key,scope_key,provider,provider_identity,authority_date DESC,recorded_at DESC,observation_id)`, `(session_id,session_authority_id,fact_key,provider,recorded_at DESC,observation_id)`, `(breadth_roster_manifest_id,fact_key,scope_key,session_id)` and the global-only partial `(provider,provider_identity,provider_session_date DESC,recorded_at DESC,observation_id) WHERE provider='global_allowlisted'`. The second index drives the universal per-stream `LIMIT 65`; the third drives the z-score literal `LIMIT 32769`; the last drives the literal raw global `LIMIT 193`, at most 64 rows for each of the three greatest dates plus one fourth-date sentinel. Catalog and `EXPLAIN (FORMAT JSON)` acceptance compare these shapes and prove no sequential authority-stream, z-score-history or global-history scan.

`opportunity_stock_flow_observations_v3` is the sole V3 per-symbol chip authority and has columns `(observation_id uuid PRIMARY KEY,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,exchange stock_exchange_v3,session_id date,session_authority_id uuid REFERENCES tw_trading_sessions_v3(session_authority_id) ON DELETE RESTRICT,fact_key stock_flow_fact_key_v3,value double precision,unit stock_flow_unit_v3,provider stock_flow_provider_v3,source_timestamp,collected_at,source_ref,provider_revision,recorded_at)`. Keys are exactly `foreign_net_twd|trust_net_twd|margin_financing_balance_twd|sbl_short_balance_shares`; the first three require `TWD` and the last requires `shares`. TWSE/TPEx is owner and FinMind is the sole lower-tier mirror. `append_stock_flow_observation_v3(stock_flow_observation_input_v3,uuid)` verifies an active common-stock authority and matching completed exchange session, captures database time, collapses an exact duplicate, locks the exact `(stock,exchange,session,authority,fact,provider)` stream, and rejects revision 65 through indexed `LIMIT 65`. The factor manifest selects owner before mirror for each of the latest six exact completed sessions, requires five consecutive foreign/trust values and all six margin/SBL balances, derives foreign/trust five-session TWD sums, endpoint balance changes, and divides by the same positive five-session turnover; SBL share change is converted with the latest cutoff-valid adjusted close. Legacy `stock_signals.chip_metrics` is never queried or granted to the V3 owner.

Exactly two read-only views are part of the V3 schema. Both are
`WITH (security_barrier=true,security_invoker=true)`, owned by
`opportunity_v3_rpc_owner`, expose only the stated projection, and have no
trigger/rule or direct mutation grant. There is no owner-rights worker view:
job-bound read units are returned atomically by the token-validating
`claim_opportunity_job_v3` function below. No implementation may inherit a default
without catalog acceptance comparing each view's exact reloptions and owner.

- `opportunity_effective_taiwan_sessions_v3(session_id,open_at,close_at,taiwan_session_authority_hash,canonical_cutoff)` derives each row's 16:00 Asia/Taipei cutoff, requires it not exceed the one statement timestamp, and applies the TWSE/TPEX latest-event/tie/composite resolver at that row's own cutoff exactly as `trading-calendar-contract.md` v3.4 requires. It returns only completed, non-cancelled, byte-agreeing composite sessions for cron control; a later-recorded correction cannot enter an earlier row and the view never serves another historical selector.
- `opportunity_run_status_read_v3(run_id,status,failure_code,canonical_run_id)` is the sole control-plane status projection. It reads only `opportunity_runs`, exposes no owner token, payload, timestamps, raw evidence, principal or secret, and has at most one row per exact `run_id`.
`claim_opportunity_job_v3` is the sole worker data projection. Its exact
security-definer claim/read tuple, fresh-token verification, fixed CASE branches,
registry access, byte caps and no-enumeration behavior are owned by
`job-graph-contract.md` version `opportunity-job-graph-v3.15`. `service_role` receives
EXECUTE only; it has no direct SELECT on a derived worker surface or any bounded
registry. The function derives `read_kind` from the stored payload kind rather than a
caller discriminator and can return only the claimed job's immutable read bundle.

`opportunity_financial_fact_series_registry_v3` is the immutable append-bound authority
with exact columns
`(stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,
fact_key financial_fact_key_v3,duration_kind financial_duration_kind_v3,
estimate_kind financial_estimate_kind_v3,
estimate_horizon financial_estimate_horizon_v3,registered_at timestamptz,
PRIMARY KEY(stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon))`.
The first fact and its registry row commit atomically; a deferred trigger rejects an
orphan registry row or a fact without its exact series row. The append RPC takes the
series advisory lock, inserts-or-locks this row, collapses an exact duplicate, and
uses the series-leading fact index with literal `LIMIT 129`; an existing 128 rows
reject the proposed 129th distinct fact as `PT409/bound_violation` before fact,
registry-change or audit write. Registry and fact rows reject update/delete and no
client has direct registry DML or SELECT.

`opportunity_financial_facts_v3` columns are `(fact_id uuid PK,stock_id uuid REFERENCES stocks(id) ON DELETE RESTRICT,fact_key financial_fact_key_v3,period_start date NULL,period_end date,duration_kind financial_duration_kind_v3,value double precision,unit financial_unit_v3,provider financial_provider_v3,authority_tier financial_authority_tier_v3,estimate_kind financial_estimate_kind_v3,estimate_horizon financial_estimate_horizon_v3,filing_published_at timestamptz,source_timestamp timestamptz,collected_at timestamptz,filing_restatement_id text NULL,source_ref text,recorded_at timestamptz)`. It enforces finite value and `filing_published_at <= source_timestamp <= collected_at <= recorded_at`; the RPC captures `recorded_at` after rejecting future caller timestamps. Unique immutable source identity covers the complete tuple, including both estimate fields. Reported facts require `reported/reported_period`; eligible analyst estimates require `analyst_estimate/next_twelve_months`; quarter-only or fiscal-year-only values are rejected; `broker_target_price` requires `broker_consensus/target_12m` and `TWD_per_share`. Both non-reported families additionally require the fact's source ref to resolve to a cutoff-visible publication-verification row with a non-null institution identity. The complete indexes are series-leading `(stock_id,fact_key,duration_kind,estimate_kind,estimate_horizon,period_end DESC,filing_published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,fact_id)`, candidate identity `(stock_id,fact_key,period_start,period_end,duration_kind,filing_published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,fact_id)` and full-roster `(fact_key,duration_kind,estimate_kind,estimate_horizon,stock_id,period_end DESC,filing_published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,fact_id)`. The first drives append and every roster-first per-series `LIMIT 129`; the second drives candidate fact collapse. Every sector-valuation page selection enumerates the complete at-most-20,000 bound roster, probes exactly four keys and at most 128 rows per series, derives/sorts at most 20,000 terminals under the native method/sector/symbol/stock-ID comparator, then applies the stored strict cursor and `LIMIT 2001`. Its truthful raw-observation bound is therefore `20,000*4*128=10,240,000` per page invocation even for sparse or reordered output. Catalog plus `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)` acceptance under PostgreSQL 17, 2 vCPU, 4,096 MiB, `work_mem=64MB`, warm local storage and the maximum fixture must prove no 501-stock shortcut, sequential financial-fact scan, unindexed sparse-cutoff prefix or application truncation and complete inside the stage's 10-second SQL timeout. Timeout is a Code Gate failure, never permission to raise the runtime limit or truncate.

`opportunity_exchange_reported_pe_v3` columns are `(reported_pe_id uuid PK,stock_id
uuid REFERENCES stocks(id) ON DELETE RESTRICT,exchange stock_exchange_v3,session_date
date,close double precision,reported_pe double precision NULL,reported_pb double precision NULL,published_at timestamptz,
source_timestamp timestamptz,collected_at timestamptz,source_ref text,recorded_at
timestamptz)`. It permits only exchange-owner `twse|tpex` append RPC authority,
requires finite positive close and at least one finite PE or positive finite PB and
`published_at <= source_timestamp <= collected_at <= recorded_at`, and has no update
or delete privilege/trigger exception. `append_price_authority_v3` owns this table's
`kind='exchange_reported_pe'` branch: the branch accepts only the exact
`exchange_reported_pe_input_v3` composite, inserts one row plus one RPC audit in one
transaction and returns `reported_pe_id`; raw-price and corporate-action branches
must leave this table unchanged. For the V3.13 legacy-correctness producer,
`append_exchange_reported_valuation_v3_13(exchange_reported_valuation_input_v3_13,uuid)`
is the sole additive PE/PB writer; it uses the same exact runner role and atomically
records an `append_price_authority_v3` audit. Direct producer DML is forbidden. Its
immutable expression-unique source tuple covers every
column through `source_ref`. The selector index is `(stock_id,exchange,session_date
DESC,published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,
source_ref)` and the full-roster current-session index is `(session_date,stock_id,
published_at DESC,source_timestamp DESC,collected_at DESC,recorded_at DESC,source_ref)`.
The first drives each `LIMIT 1261` own-history query; the second drives exact
same-session sector selection. No client role receives direct table access; only the
fixed runner RPC writes and only the token-bound manifest/read path selects it.

No V3 request fetches full-market provider data. Guarded ingestion fills these tables first; reference builders query only stored indexed facts.

## Manifests, pages and verification evidence

The generic manifest tables are the only physical manifest storage and implement `manifest-storage-contract.md` version `opportunity-manifest-storage-v3.10`; named sector/reference manifests are closed `manifest_kind` values, not tables or views. Their deterministic header/page/root job descriptors and successors are exclusively governed by `job-graph-contract.md` version `opportunity-job-graph-v3.15`.

```text
opportunity_manifests_v3 (
  manifest_id uuid PK, manifest_kind opportunity_manifest_kind_v3, contract_version text,
  source_cutoff timestamptz NULL,
  header_canonical bytea, header_json jsonb,
  status opportunity_manifest_status_v3, row_count bigint NULL,
  root_canonical bytea NULL, root_json jsonb NULL, manifest_hash text NULL,
  failure_code opportunity_manifest_failure_code_v3 NULL, created_at timestamptz, terminal_at timestamptz NULL,
  recorded_at timestamptz
)
opportunity_manifest_pages_v3 (
  page_id uuid PK, manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT, section_key opportunity_manifest_section_key_v3,
  page_ordinal int, first_row_ordinal bigint, row_count int,
  first_identity text NULL, last_identity text NULL,
  page_canonical bytea, page_json jsonb, page_hash text, recorded_at timestamptz
)
opportunity_manifest_rows_v3 (
  manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,
  page_id uuid REFERENCES opportunity_manifest_pages_v3(page_id) ON DELETE RESTRICT,
  section_key opportunity_manifest_section_key_v3, row_ordinal bigint, identity_key text,
  terminal_code text NULL, lookup_symbol text NULL, lookup_session date NULL,
  payload_json jsonb, payload_canonical bytea,
  payload_hash text, recorded_at timestamptz
)
```

The manifest kind/version, exact header fields, ordered sections and row bounds are closed by `manifest-storage-contract.md`; checks reject any other pairing. `created_at` and `recorded_at` are database-generated together at manifest insert and immutable. `building` requires all root/count/hash/failure/terminal fields null. `complete` requires nonnegative `row_count`, non-null <=3,145,728-byte root canonical/JSON/hash/terminal, null failure, canonical/JSON agreement and `extensions.digest(root_canonical,'sha256')=manifest_hash`. `failed` requires non-null closed failure/terminal and null root/count/hash. The lifecycle trigger permits only the complete/fail RPC field set once. A partial unique index on `(manifest_kind,manifest_hash) WHERE status='complete'` provides terminal convergence.

Page checks enforce `0 <= page_ordinal`, `0 <= first_row_ordinal`, `1 <= row_count <= 2000`, both identities non-null, <=786,432 page-canonical bytes, <=3,145,728 total unencoded page/row canonical/JSON bundle bytes, page JSON/canonical/hash agreement and one closed section for the parent kind. Unique keys are `(manifest_id,section_key,page_ordinal)` and `(manifest_id,section_key,first_row_ordinal)`; indexes include `(manifest_id,section_key,page_ordinal,page_hash)`. Row primary key is `(manifest_id,section_key,row_ordinal)`, with unique `(manifest_id,section_key,identity_key)` and `(page_id,row_ordinal)`. A composite deferred FK/trigger requires every row's `(manifest_id,page_id,section_key)` to match its page and every page range to contain exactly its consecutive rows; page insert and rows commit atomically. Payload canonical/JSON/hash and universal identity recomputation are checked. Empty sections own no page/row and remain explicit only in the completed root. Large arrays never exist only inside one opaque JSONB cell.

`lookup_symbol` and `lookup_session` are database-derived index projections, never caller fields and never hash inputs. They are non-null only for `sector_benchmark/entry_rows` (`lookup_symbol=payload[0]`, `lookup_session=header.entrySession`), `sector_benchmark/evaluation_rows` (`lookup_session=payload[0]`, `lookup_symbol=payload[3]`) and `sector_benchmark/session_conservation` (`lookup_symbol=NULL`, `lookup_session=payload[0]`); every other kind/section requires both null. The page RPC derives them only after exact native-payload validation and a deferred trigger re-derives them byte-for-byte. Indexes `(manifest_id,section_key,lookup_symbol,lookup_session,row_ordinal)` and `(manifest_id,section_key,lookup_session,row_ordinal)` let one outcome batch read only its at-most-200 symbols/sessions from a five-million-row benchmark without a JSON scan or dedicated sector-manifest relation.

`source_publication_verifications_v3` stores `(verification_id PK,source_run_id REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,source_cutoff,revision_id REFERENCES source_document_revisions_v3(revision_id) ON DELETE RESTRICT,publisher_manifest_id REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,publisher_identity_id,institution_identity NULL,canonical_document_id,canonical_content_hash,published_at NULL,collected_at,recorded_at,evidence_ref)` with unique `(source_run_id,revision_id,publisher_manifest_id)` and no raw text. A deferred trigger requires the referenced manifest to be terminal complete kind `publisher_verification_allowlist` with the required version/cutoff/hash.

`opportunity_mover_audits_v3` stores one immutable audit header `(audit_id uuid PK,session_id date,audited_session_authority_hash text,previous_session_authority_hash text,recent_session_plan_hash text,source_cutoff timestamptz,audit_window_closes_at timestamptz,source_collection_cutoff timestamptz,status opportunity_mover_audit_status_v3,mover_count integer,eligible_universe_count integer,recall_pct double precision NULL,price_manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,source_dataset_manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,upstream_source_run_id uuid REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,recorded_at timestamptz)`; unique `(session_id,audited_session_authority_hash,source_cutoff,price_manifest_id,source_dataset_manifest_id)`. The three authority hashes are lowercase 64-hex and recompute from the bounded effective-session window fixed by `trading-calendar-contract.md`. Counts are nonnegative, mover count is <=20 and <=eligible universe, source collection cutoff is `min(source_cutoff,audit_window_closes_at)`, pending requires cutoff before window and null recall, matured requires cutoff at/after window and recall null iff mover count is zero otherwise finite 0..100. Deferred triggers require the exact upstream successful source run and terminal complete `source_dataset/source-dataset-v3.3` plus `mover_price_reference/mover-audit-price-v3.3` roots with matching cutoff/session/authority hashes/roster/price-provider/corporate-action headers and trusted adjusted-price evidence. `opportunity_mover_audit_symbols_v3(audit_id REFERENCES opportunity_mover_audits_v3(audit_id) ON DELETE RESTRICT,rank integer,stock_id REFERENCES stocks(id) ON DELETE RESTRICT,symbol text,one_session_return_pct double precision,turnover_twd double precision,end_price_ref text,prior_price_ref text,corporate_action_version text,later_mentioned boolean,recorded_at timestamptz)` has primary key `(audit_id,rank)`, unique `(audit_id,symbol)`, consecutive ranks `1..mover_count`, finite return, turnover >=20,000,000 and one audit/header/symbol transaction. Both tables reject update/delete; a later cutoff or calendar correction appends a new snapshot rather than mutating history. Only the mover-root branch of `complete_opportunity_manifest_v3` may insert either table. DDL constructs the cross-reference without ordering discretion: create `opportunity_runs` with the nullable UUID column but no selected-audit FK, create mover audit/symbol tables with named `opportunity_mover_audits_v3_upstream_source_run_fk DEFERRABLE INITIALLY DEFERRED ON DELETE RESTRICT`, then `ALTER TABLE opportunity_runs ADD CONSTRAINT opportunity_runs_selected_mover_audit_fk ... DEFERRABLE INITIALLY DEFERRED ON DELETE RESTRICT`; both constraints are catalog-tested.

## Runs, jobs and terminal results

`opportunity_runs` columns are exactly `(run_id uuid PK,preparation_key text NOT NULL,logical_key text NULL,attempt integer,mode opportunity_mode_v3,run_purpose opportunity_run_purpose_v3,trading_date date NULL,source_cutoff timestamptz,comparison_contract_key text,evaluation_dataset_lock_hash text NULL,upstream_run_id uuid NULL REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,selected_mover_audit_id uuid NULL REFERENCES opportunity_mover_audits_v3(audit_id) ON DELETE RESTRICT,supersedes_run_id uuid NULL REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,canonical_run_id uuid NULL REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,status opportunity_run_status_v3,failure_code opportunity_failure_code_v3 NULL,created_at timestamptz,sealed_at timestamptz NULL,terminal_at timestamptz NULL,recorded_at timestamptz)`. The five-argument database begin RPC is the sole writer and derivation authority for `comparison_contract_key`, `evaluation_dataset_lock_hash`, `preparation_key` and the ordered mode-owned run inputs; no HTTP/PostgREST argument supplies any of them. The evaluation lock is null exactly for `ad_hoc_shadow` and is the deployed `source-led-eval-v3.7` approval hash for every other purpose; a deferred trigger requires every bound daily input run to carry the same non-null value. Keys/hashes are lowercase 64-hex, attempt is positive and `upstream_run_id` is non-null exactly for `enrich_rank` and references a successful same-purpose/same-lock `source_scan`; a deferred trigger proves the two `run_purpose` and lock values are byte-equal. `selected_mover_audit_id` is null on creation, may be set exactly once by the atomic mover-root completion for `enrich_rank`, must be non-null before its market-reference header/seal and is null for every other mode; `supersedes_run_id`, when present, references an earlier terminal attempt with the same preparation key; `canonical_run_id` follows the convergence rule below. The begin, seal, convergence, failure and finalize RPCs omit caller timestamps and use one captured database `clock_timestamp()` per transition. `created_at` is set once at insert; `sealed_at` is set once in the successful seal transaction; `terminal_at` is set once in the terminal transaction. Constraints require `created_at <= sealed_at <= terminal_at` where present, `preparing` has null seal/terminal, `running` has non-null seal and null terminal, every terminal status has non-null terminal, a pre-seal `failed` may have null seal, and `success|converged` require non-null seal. Triggers reject later timestamp changes even if another column update is attempted.

`logical_key` is null for `preparing` and a pre-seal `failed`, and non-null for `running|success|converged` or a post-seal `failed`; `canonical_run_id` is non-null exactly for `converged`, points to a different `success` row with the same logical key, and a converged row has no failure code. Indexed point-in-time selection is supported by `(run_purpose,comparison_contract_key,source_cutoff DESC,terminal_at DESC,run_id)`, partial `(evaluation_dataset_lock_hash,run_purpose,trading_date,run_id) WHERE status='success' AND mode='enrich_rank' AND run_purpose IN ('backtest_daily_primary','production_shadow_daily')`, and `(created_at,terminal_at,sealed_at,run_id)`. Joined score rows use `(run_id,score_snapshot_id,horizon)`.

The daily partial index is the begin-side label raw-candidate driver. Under the exact current non-null evaluation lock, begin first resolves at most 252 completed Taiwan sessions and scans only those two canonical purposes in trading-date/purpose/run-ID order, joining at most 60 score snapshots per run (20 deep successes times exactly three horizons). Literal raw `LIMIT 30241` is therefore the `252*2*60 + 1` sentinel; row 30,241 is zero-write `PT409/bound_violation`. Only after that bound passes may SQL expand four maturity enums, resolve calendar offsets, anti-join already immutable outcomes, and apply the separate literal terminal `LIMIT 20001`. The query projects only identities/input-run IDs until both sentinels pass. `EXPLAIN (FORMAT JSON)` acceptance proves the current-lock/date-leading partial index, score index and outcome anti-join perform no unbounded historical/ad-hoc scan or materialization for empty, sparse, maximum or overflow fixtures. Unique/partial indexes, future-cutoff rejection and preparation/seal/final locks are exactly those in `runtime-transaction-contract.md` and `design.md`.

`opportunity_run_inputs(run_id uuid REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,input_run_id uuid REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,input_role opportunity_run_input_role_v3,recorded_at timestamptz)` has primary key on all three and rejects self-input. `input_role` is the server-owned closed enum from `postgres-type-contract.md`; arbitrary request values are unrepresentable. `opportunity_run_manifest_inputs(run_id uuid REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,manifest_id uuid REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,input_role opportunity_manifest_kind_v3,ordinal integer,recorded_at timestamptz)` has primary key `(run_id,input_role,ordinal)` and unique `(run_id,manifest_id,input_role)`; `ordinal >= 0`, and a deferred trigger requires a complete manifest of the role's exact kind/version before seal.

`opportunity_run_jobs_v3` columns are exactly `(job_id uuid PK,run_id uuid REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,stage opportunity_job_stage_v3,shard_key text,input_hash text,status opportunity_job_status_v3,attempt integer,owner_token_hash text NULL,attempt_started_at timestamptz NULL,lease_expires_at timestamptz NULL,heartbeat_at timestamptz NULL,output_kind opportunity_job_output_kind_v3 NULL,output_hash text NULL,output_manifest_id uuid NULL REFERENCES opportunity_manifests_v3(manifest_id) ON DELETE RESTRICT,output_counts opportunity_job_counts_v3 NULL,failure_code opportunity_failure_code_v3 NULL,created_at timestamptz,terminal_at timestamptz NULL,recorded_at timestamptz)`. There is no payload reference column. Hashes are lowercase 64-hex, attempt is 0..5, and the status-specific nullability/transition checks are exactly the lease/completion branches in `runtime-transaction-contract.md`; `seal_inputs` and `finalize` are the only stages with null output kind on success, while manifest header/page/root jobs are terminalized only by their matching lifecycle RPC. Unique keys are `(run_id,job_id)` and `(run_id,stage,shard_key,input_hash)`; queue index is `(status,stage,lease_expires_at,run_id)`.

`opportunity_job_payloads_v3(job_id uuid PRIMARY KEY,run_id uuid,payload_kind opportunity_job_payload_kind_v3,payload_canonical bytea,payload_json jsonb,payload_hash text,recorded_at timestamptz)` and `opportunity_job_results_v3(job_id uuid PRIMARY KEY,run_id uuid,output_kind opportunity_job_output_kind_v3,output_canonical bytea,output_json jsonb,output_hash text,output_counts opportunity_job_counts_v3,recorded_at timestamptz)` are exact one-to-one immutable relations. Every listed column is `NOT NULL`; each has composite FK `(run_id,job_id) REFERENCES opportunity_run_jobs_v3(run_id,job_id) ON DELETE RESTRICT`, unique `(run_id,job_id,payload_hash)` or `(run_id,job_id,output_hash)`, lowercase-hash/canonical/JSON/3,145,728-byte bundle checks and no update/delete path. A deferred constraint trigger on every inserted job rejects commit unless exactly one same-run payload exists with structural kind/stage/hash agreement; the payload FK rejects an inverse orphan. Job plus payload creation is therefore one transaction, and non-manifest completion inserts result plus normalized rows, warnings, job success and successor in one transaction, exactly as `job-graph-contract.md` requires.

`opportunity_job_staging_v3(job_id uuid REFERENCES opportunity_run_jobs_v3(job_id) ON DELETE RESTRICT,attempt integer,output_kind opportunity_job_output_kind_v3,output_canonical bytea,output_json jsonb,output_hash text,output_counts opportunity_job_counts_v3,recorded_at timestamptz)` has primary key `(job_id,attempt)`, requires positive attempt, a fully nonnegative count composite and lowercase 64-hex hash, is writable only by the owner-token staging/complete/reap RPCs while the parent is nonterminal, and is the sole approved non-authoritative staging location. Envelope/body shape, type/nullability/range checks and the permitted normalized writes per output kind are exact in `job-graph-contract.md`; staging cannot contain an implementation-selected JSON document.

`opportunity_run_warning_facts_v3(run_id uuid,warning opportunity_engine_warning_v3,producing_job_id uuid,evidence_ref text,recorded_at timestamptz)` is append-only, has primary key `(run_id,warning,producing_job_id)` plus composite FK `(run_id,producing_job_id) REFERENCES opportunity_run_jobs_v3(run_id,job_id) ON DELETE RESTRICT`, and rejects `shadow_only`. A fact is inserted only by `complete_opportunity_job_v3` in the same transaction that changes its producing job to `succeeded` and sets that job's database-owned `terminal_at`; no retry/lease/fail RPC can insert, update or delete one. Index `(run_id,recorded_at,warning,producing_job_id)` supports historical warnings. Public status reads admit a fact at request cutoff C only when both `fact.recorded_at <= C` and its producing succeeded job has `terminal_at <= C`. `shadow_only` is added by the serializer and is never a stored fact.

Normalized accounting/result tables have these exact columns. Every omitted `NULL` marker means `NOT NULL`; every count/ordinal is `integer CHECK (value >= 0)` unless explicitly identified as a positive rank, every confidence is finite `double precision CHECK (value BETWEEN 0 AND 1)`, every other numeric score/return is finite, every hash is lowercase 64-hex, and every row also has database-generated `recorded_at timestamptz NOT NULL`. No open text discriminator is allowed:

```text
opportunity_source_connector_accounting (
  run_id uuid FK, source_key source_key_v3, eligible_documents integer,
  selected_documents integer, deferred_due_scan_cap integer,
  duplicate_document_count, expired_document_count, parse_failure_count,
  processed_no_claim_count, processed_with_claims_count,
  extracted_claims, unique_claim_count, duplicate_claim_count, raw_mentions,
  linked_new_count, linked_refresh_count, linked_duplicate_claim_count,
  ambiguous_symbol_count, rejected_low_confidence_count, unsupported_instrument_count,
  mention_reason_counts jsonb, linked_candidate_count integer,
  status opportunity_source_connector_status_v3,
  failure_reason opportunity_failure_code_v3 NULL
)
opportunity_source_document_outcomes (
  run_id uuid FK, source_key source_key_v3, revision_id uuid FK,
  selection_ordinal integer, canonical_document_id text NULL,
  effective_at timestamptz, outcome opportunity_document_outcome_v3,
  content_hash text NULL, extracted_claim_count integer, raw_mention_count integer
)
opportunity_source_claims (
  claim_id uuid PK, run_id uuid FK, revision_id uuid FK, claim_ordinal integer,
  canonical_claim_id text, outcome opportunity_claim_outcome_v3,
  canonical_prior_claim_id uuid NULL, evidence_root_id text,
  effective_at timestamptz, claim_confidence double precision, source_ref text,
  verification_tier opportunity_evidence_verification_tier_v3,
  claim_evidence_stance opportunity_claim_evidence_stance_v3
)
opportunity_source_mentions (
  mention_id uuid PK, run_id uuid FK, revision_id uuid FK, claim_ordinal integer,
  mention_ordinal integer, normalized_token text, start_offset integer,
  end_offset integer, review_context text, review_mention_start_offset integer,
  review_mention_end_offset integer, link_mode opportunity_link_mode_v3, stock_id uuid NULL FK,
  symbol text NULL, outcome opportunity_mention_outcome_v3,
  reason opportunity_mention_reason_v3, confidence double precision
)
opportunity_candidate_snapshots (
  candidate_snapshot_id uuid PK, run_id uuid FK, stock_id uuid FK, symbol text,
  direct_source boolean NOT NULL, candidate_origin opportunity_candidate_origin_v3 NOT NULL,
  anchor_claim_id uuid NULL FK, shallow_status opportunity_shallow_status_v3,
  deep_status opportunity_deep_status_v3, payload_canonical bytea,
  payload_json jsonb, payload_hash text,
  CHECK (
    (candidate_origin = 'direct_candidate' AND direct_source AND anchor_claim_id IS NOT NULL)
    OR
    (candidate_origin = 'comparison_only' AND NOT direct_source AND anchor_claim_id IS NULL)
  )
)
opportunity_market_context_snapshots (
  market_snapshot_id uuid PK, run_id uuid FK, contract_version text,
  payload_canonical bytea, payload_json jsonb, payload_hash text
)
opportunity_sector_cycle_snapshots (
  sector_snapshot_id uuid PK, run_id uuid FK,
  canonical_sector_key canonical_sector_key_v3, contract_version text,
  payload_canonical bytea, payload_json jsonb, payload_hash text
)
opportunity_score_snapshots (
  score_snapshot_id uuid PK, run_id uuid FK, stock_id uuid FK, symbol text,
  horizon opportunity_horizon_v3, rank integer CHECK (rank >= 1),
  score double precision, score_confidence double precision,
  available_weight double precision CHECK (available_weight >= 0),
  payload_canonical bytea, payload_json jsonb, payload_hash text
)
opportunity_outcomes (
  outcome_id uuid PK, score_snapshot_id uuid FK,
  maturity_horizon opportunity_outcome_maturity_v3, entry_session date,
  entry_session_authority_hash text, maturity_session date,
  maturity_session_authority_hash text, entry_price_ref text, outcome_price_ref text,
  sector_benchmark_manifest_id uuid FK, return_pct double precision,
  sector_relative_return_pct double precision, mfe_pct double precision,
  mae_pct double precision, sector_relative_mfe_pct double precision NULL,
  payload_canonical bytea, payload_json jsonb, payload_hash text
)
opportunity_link_audit_samples (
  sample_manifest_id uuid FK, sample_id text, run_id uuid FK, claim_id uuid FK,
  mention_id uuid FK, connector source_key_v3, link_mode opportunity_link_mode_v3,
  outcome_family opportunity_link_outcome_family_v3,
  mention_ordinal integer, selection_ordinal integer, selection_hash text,
  evidence_ref text, review_context text, review_mention_start_offset integer,
  review_mention_end_offset integer, normalized_token text,
  engine_outcome opportunity_mention_outcome_v3,
  engine_reason opportunity_mention_reason_v3, engine_canonical_symbol text NULL,
  review_evidence_hash text
)
opportunity_link_audit_labels (
  sample_manifest_id uuid, sample_id text, label_role link_audit_label_role_v3,
  canonical_symbol text NULL, no_link boolean, reviewer_principal_id uuid,
  submitted_at timestamptz, label_hash text
)
```

The connector accounting integer columns all have `CHECK >= 0`; its five document columns, two claim columns and six mention-outcome columns are the normalized closed maps. `mention_reason_counts` is a JSON object only because it is a fixed map: its keys are exactly every `opportunity_mention_reason_v3` label once, its values are nonnegative integers and its sum equals the matching normalized mention totals. Document/content/prior/symbol nullability is exactly the outcome branch in `job-graph-contract.md` v3.15; claim `source_ref` is 1..120 Unicode code points, mention `normalized_token` is 2..40 Unicode code points, stored Taiwan symbol is exactly four ASCII digits, and start/end offsets satisfy `0 <= start_offset < end_offset <= 100000`. Every mention additionally stores the exact 2..96-code-point/<=384-byte `review_context` and local offset pair from `entity-link-contract.md` v3.1; those bytes and offsets are immutable and cannot be supplied by a later review request. A linked mention requires non-null stock/symbol while all non-linked outcomes require both null. Candidate payload branches must agree with origin/shallow/deep status. In addition to the row `CHECK`, a deferred constraint trigger requires every direct candidate's anchor claim to share its run and own at least one same-run mention whose `stock_id` and `symbol` equal the candidate and whose outcome is exactly `linked_new|linked_refresh|linked_duplicate_claim`. A comparison-only candidate has no anchor; after a successful shallow calculation its only success payload is `enriched_observation`, while deferred and shallow-failed terminal payloads remain possible. It can never own a deep-success payload, score snapshot, verified-change brief or public/detail card. Any origin/Boolean/anchor/mention mismatch raises `data_integrity_failure` and rolls back the candidate result and successor. All canonical/JSON payload pairs are each <=3,145,728 bytes and structurally/hash equal to their exact domain schema.

Every abbreviated FK in that block expands exactly as follows, always `ON DELETE RESTRICT`: every `run_id` references `opportunity_runs(run_id)`; every `revision_id` references `source_document_revisions_v3(revision_id)`; every `stock_id` references `stocks(id)`; `anchor_claim_id` and `canonical_prior_claim_id` reference `opportunity_source_claims(claim_id)`; each mention also has composite FK `(run_id,revision_id,claim_ordinal)` to the unique claim occurrence; `score_snapshot_id` references `opportunity_score_snapshots(score_snapshot_id)`; `sector_benchmark_manifest_id` references `opportunity_manifests_v3(manifest_id)` with a deferred complete-kind/version trigger; each audit sample's `claim_id` and `mention_id` reference the globally unique claim/mention UUIDs and its `sample_manifest_id` references the generic manifest with the complete-kind trigger below. Reviewer/adjudicator principal IDs on labels are authenticated actor scalars, not FKs. No nullable FK may point across a run: deferred composite triggers require anchor/prior claims, mention claims and sample claim/mention identities to share their stored owning `run_id`.

Closed count JSON such as `mention_reason_counts` must contain every enum key including zero and is checked against its normalized totals. No complete raw claim/document text is copied into normalized claim or mention rows; the sole text exception is the bounded normalized `review_context` slice, which is private review evidence and never public output. The exact primary/unique constraints are:

```text
PK opportunity_source_connector_accounting (run_id,source_key)
PK opportunity_source_document_outcomes (run_id,source_key,revision_id)
PK opportunity_source_claims (claim_id); UNIQUE (run_id,revision_id,claim_ordinal)
PK opportunity_source_mentions (mention_id); UNIQUE (run_id,revision_id,claim_ordinal,mention_ordinal)
PK opportunity_candidate_snapshots (candidate_snapshot_id); UNIQUE (run_id,symbol)
PK opportunity_market_context_snapshots (market_snapshot_id); UNIQUE (run_id)
PK opportunity_sector_cycle_snapshots (sector_snapshot_id); UNIQUE (run_id,canonical_sector_key)
PK opportunity_score_snapshots (score_snapshot_id); UNIQUE (run_id,symbol,horizon)
PK opportunity_outcomes (outcome_id); UNIQUE (score_snapshot_id,maturity_horizon)
PK opportunity_link_audit_samples (sample_manifest_id,sample_id)
PK opportunity_link_audit_labels (sample_manifest_id,sample_id,label_role); UNIQUE (sample_manifest_id,sample_id,reviewer_principal_id)
```

`opportunity_link_audit_samples.sample_manifest_id` has an ordinary FK to the generic manifest PK plus a deferred constraint trigger requiring terminal `complete` logical kind `link_audit_sample/source-led-eval-v3.7` and byte-for-byte equality between every normalized identity/stratum/ordinal and complete `reviewEvidence`/hash field and that manifest's ordered `samples` payload. The evidence columns are immutable, `review_evidence_hash` recomputes the exact shadow-evaluation preimage, local offsets are inside the stored slice, connector/link/outcome/reason/symbol byte-match the referenced mention/claim, and engine-symbol nullability matches its mention outcome. `opportunity_link_audit_labels` has exact columns `(sample_manifest_id uuid,sample_id text,label_role link_audit_label_role_v3,canonical_symbol text NULL,no_link boolean,reviewer_principal_id uuid,submitted_at timestamptz,label_hash text,recorded_at timestamptz)` and the explicit composite FK `(sample_manifest_id,sample_id) REFERENCES opportunity_link_audit_samples(sample_manifest_id,sample_id) ON DELETE RESTRICT`; no unqualified `sample_id` FK exists. Primary key is `(sample_manifest_id,sample_id,label_role)` and unique `(sample_manifest_id,sample_id,reviewer_principal_id)` prevents one principal from filling two branches. `submitted_at=recorded_at` is one database-captured timestamp and `label_hash=SHA256(UTF8(RFC8785(["link-audit-label-v3.0",sampleManifestId,sampleId,labelRole,canonicalSymbolOrNull,noLink,reviewerPrincipalId,submittedAt])))`. A deferred trigger enforces the exact reviewer/adjudicator role, ordering, distinctness, disagreement and nullability branches in `auth-principal-contract.md` v3.8; the read RPC returns only its closed disposition/evidence projection and does not persist assignment state. Candidate `direct_source` is the non-null Boolean constrained together with `candidate_origin` and `anchor_claim_id` by the exact row check and deferred linked-mention rule above; source ownership remains represented by `anchor_claim_id -> opportunity_source_claims -> source_document_revisions_v3.source_key`. A comparison-only candidate is therefore exactly `false/comparison_only/null` and cannot be promoted beyond its shallow observation. Indexes support `(run_id,selection_ordinal)`, `(run_id,canonical_claim_id)`, `(run_id,symbol)`, `(run_id,horizon,rank)`, the label-planning shape `(run_id,score_snapshot_id,horizon)`, `(score_snapshot_id,maturity_horizon)`, `(sample_manifest_id,selection_hash)` and `(sample_manifest_id,sample_id,label_role)`. The outcome maturity index accepts exactly the four `opportunity_outcome_maturity_v3` values independently of the three-lane score horizon; all four may coexist for one score snapshot. A success cannot finalize unless byte hash, JSON schema version and every normalized column agree. Public serializers never select `review_context` or reconstruct it from live observations.

`opportunity_public_projections_v3(run_id REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT PRIMARY KEY,contract_version,acceptance_version,payload_canonical bytea,payload_json jsonb,payload_hash,recorded_at)` stores the exact available payload generated before finalization. Its decoded `asOf` and `engineHealth.sourceCutoff` must both equal `opportunity_runs.source_cutoff`; an endpoint returns `payload_canonical` byte-for-byte after hash/JSON/version checks and cannot inject its later request cutoff. The payload owns the sizing-omitted `verifiedChangeWorkspace` and `homepageSummary`. Unavailable payloads are not stored run projections and are canonically generated from the point-in-time selection statement. `opportunity_detail_projections_v3(run_id REFERENCES opportunity_runs(run_id) ON DELETE RESTRICT,symbol,contract_version,payload_canonical bytea,payload_json jsonb,payload_hash,recorded_at)` has primary key `(run_id,symbol)`, owns the same public card plus byte-equal brief or null, and implements `v3-detail-contract.md`. No mutable workspace table exists; evaluation strategy rows are immutable members of the existing evaluation job result/evidence bundle.

## V3.11 legacy-correctness storage

The V3.11 additive migration is prepared but is not authorized for production apply.
It creates a separate `legacy_correctness_rpc_owner` as `NOLOGIN NOBYPASSRLS`, owns
the relations/functions below, enables but does not force RLS, revokes every table
privilege from `PUBLIC|anon|authenticated|service_role`, and grants `service_role`
only the closed ten-function execution catalog below plus `SELECT` on the dedicated
compact-projection relation. It grants no direct table mutation. This catalog is
separate from and does not change the exact 33 V3 function set or the disabled
`/api/opportunity-v3` route.

`legacy_producer_runs_v3_11` columns are
`(run_id uuid primary key,owner_label text,owner_token_hash text,producer_commit_sha
text,worker_sha256 text,scheduler_config_canonical bytea,scheduler_config_sha256 text,
legacy_seed_symbols text[],legacy_seed_set_hash text,scheduled_occurrence_id text,
source_cutoff timestamptz,trading_date date null,
trading_session_authority_hash text null,authority_canonical bytea,
authority_json jsonb,authority_hash text,status text,started_at
timestamptz,heartbeat_at timestamptz,lease_expires_at timestamptz,terminal_at
timestamptz null,failure_code opportunity_legacy_producer_failure_code_v3_11 null,
logical_run_key text,attempt smallint,recorded_at timestamptz)`. Checks require the
sole label `com.stockinsider.auth-source-worker`, hash/SHA grammars, status
`running|success|failed|cancelled`, null terminal/failure fields exactly while running,
non-null terminal at/after started when terminal, positive attempt, exact logical key
and non-negative duration. The config bytes are the exact tracked 1,226-byte
LF-terminated file and hash to `scheduler_config_sha256`; their parsed canonical
member has the owned schema identity `stockinsider-auth-source-dag-v1`,
`legacy_seed_symbols` equals its closed 30-symbol array, and
`legacy_seed_set_hash` recomputes from the exact tagged 247-byte preimage.
The occurrence/cutoff/trading tuple is database-derived, the compact authority-root bytes decode
byte-equal to JSON, hash to `authority_hash`, satisfy
`legacy-discovery-authority-v1`, are at most 64 KiB and bind the same
occurrence/cutoff plus all frozen page roots/counts.
All config, seed, occurrence and authority members are immutable. Unique
`(logical_run_key,attempt)` plus a partial
unique index on constant owner label where status running permits one owner. Only
acquire/heartbeat/complete/fail/reap may mutate lease/terminal fields; identity fields never
change and terminal rows reject update/delete.

`legacy_producer_authority_pages_v3_11` columns are
`(run_id uuid references legacy_producer_runs_v3_11 on delete restrict,
page_kind opportunity_legacy_authority_page_kind_v3_11,page_ordinal integer,
first_row_ordinal integer,row_count integer,page_canonical bytea,page_json jsonb,
page_hash text,recorded_at timestamptz,primary key(run_id,page_kind,page_ordinal))`.
Page kinds are the closed roster/alias/taxonomy/selected-revision set. Page sizes are
500 for roster/alias/taxonomy and 200 for selected revisions; ordinals are gap-free,
the first-row ordinal is database-derived, each canonical page is at most 3 MiB, and
page JSON/hash plus the run root/counts recompute exactly.

`legacy_frozen_source_revisions_v3_11` columns are
`(run_id uuid references legacy_producer_runs_v3_11 on delete restrict,
selection_ordinal integer,source_key source_key_v3,revision_id uuid references
source_document_revisions_v3(revision_id) on delete restrict,
selected_revision_row_canonical bytea,selected_revision_row_json jsonb,
selected_revision_row_hash text,raw_field_payload_algorithm_version text,
ingestion_content_revision_sha256 text,canonical_content_algorithm_version text,
canonical_content_sha256 text null,recorded_at timestamptz,
primary key(run_id,selection_ordinal),unique(run_id,revision_id))`.
Rows are the exact selected-dataset order, are append-only, contain no
`raw_field_payload`, and are page/root/conservation-bound to the run before the
source-sync payload is derived.

`legacy_producer_jobs_v3_11` columns are
`(job_id uuid primary key,run_id uuid references legacy_producer_runs_v3_11 on delete
restrict,stage opportunity_legacy_producer_stage_v3_11,
job_kind opportunity_legacy_producer_job_kind_v3_11,stage_ordinal smallint,
shard_ordinal integer null,execution_ordinal integer,revision_id uuid null,
predecessor_job_id uuid null references legacy_producer_jobs_v3_11 on delete restrict,
input_hash text,payload_hash text,status opportunity_legacy_producer_job_status_v3_11,
attempt smallint,max_attempts smallint,owner_token_hash text null,leased_at timestamptz
null,heartbeat_at timestamptz null,lease_expires_at timestamptz null,terminal_at
timestamptz null,failure_code opportunity_legacy_producer_failure_code_v3_11 null,
recorded_at timestamptz)`. A `stage_barrier` has null shard/revision; a
`revision_shard` is legal only at `mention_claim_extraction`, has equal
shard/selection ordinal and references the exact frozen run/revision row. Stage
barriers follow the six-row config, while revision shards occur between source-sync
and the mention barrier in frozen ordinal order. Attempts are 0..5; input/hash values
are lowercase SHA-256; execution ordinals are gap-free; and nullability is exact for
queued/retryable, leased and terminal states. Unique `(run_id,execution_ordinal)`,
`(run_id,stage_ordinal,job_kind,coalesce(shard_ordinal,-1))` through a stored generated
null sentinel, and `(run_id,input_hash)` plus a partial single-leased-job-per-run index
make the database-derived chain linear without limiting a stage to one revision.

`legacy_producer_job_payloads_v3_11` has exact columns
`(job_id uuid primary key references legacy_producer_jobs_v3_11 on delete restrict,
payload_canonical bytea,payload_json jsonb,payload_hash text,recorded_at timestamptz)`.
`legacy_producer_job_results_v3_11` has the same shape with `result_*` names and a
foreign key to the job. Canonical bytes decode byte-equal to JSON, hash to the stored
digest, satisfy the stage-specific tuple and 3-MiB bound, and are append-only. Payloads
are database-derived when acquire/completion creates a job. The ordinal-zero payload
is created only after its run-owned authority is frozen, and its
`authorityBundleHash` must byte-equal `legacy_producer_runs_v3_11.authority_hash`.
A result can be inserted
only by completion after all stage-owned domain IDs/hashes have been proven.

The append-only normalized parse plane has exactly:

- `legacy_source_document_outcomes_v3_11(run_id,job_id,revision_id,
  selection_ordinal,source_key,canonical_document_id,effective_at,
  outcome opportunity_document_outcome_v3,content_hash,extracted_claim_count,
  raw_mention_count,outcome_root,recorded_at)` with primary key
  `(run_id,revision_id)` and unique `(run_id,selection_ordinal)`;
- `legacy_source_claim_outcomes_v3_11(run_id,job_id,revision_id,claim_ordinal,
  canonical_claim_id,outcome opportunity_claim_outcome_v3,
  prior_revision_id,prior_claim_ordinal,evidence_root_id,effective_at,
  claim_confidence,source_ref,verification_tier,claim_evidence_stance,recorded_at)`
  with primary key `(run_id,revision_id,claim_ordinal)`; and
- `legacy_source_mention_outcomes_v3_11(run_id,job_id,revision_id,claim_ordinal,
  mention_ordinal,normalized_token,start_offset,end_offset,review_context,
  review_mention_start_offset,review_mention_end_offset,link_mode,stock_id,symbol,
  outcome opportunity_mention_outcome_v3,reason opportunity_mention_reason_v3,
  confidence,recorded_at)` with primary key
  `(run_id,revision_id,claim_ordinal,mention_ordinal)`.

All columns/limits and the complete four-byte UTF-8 maximum are the
`job-graph-contract.md` one-revision result tuple. Completion inserts exactly one
document, at most 200 claims and at most 1,000 mentions only for the matching leased
revision shard, rewrites duplicate/link outcomes against earlier immutable ordinals,
and stores the same canonical shard result atomically. A retry byte-identically reuses
the rows; a collision fails `data_integrity_failure`. The final revision shard creates
the mention stage barrier only after document/claim/mention counts and connector
conservation equal the frozen selected set.

`legacy_candidate_discovery_ledger_v3_11` stores the exact
`CandidateDiscoveryLedgerV311` fields from `discovery-correctness-contract.md`, with
UUID primary key, FK to producer run, enum discovery disposition/reason, enum research
disposition/nullable research reason, nullable seed membership/seed-set hash with
linked-stock all-or-none and SHA checks, SHA check, recorded time and unique
`(source_run_id,source_key,document_revision_id,claim_id,mention_id,stock_id,reason)`
using explicit null-sentinel generated columns so retries collide deterministically.
On collision the function returns the retained UUID only when every discovery and
research field is byte-equal; otherwise it fails `data_integrity_failure`. It is
append-only. Neither seed field is accepted in
`candidate_discovery_input_v3_11`. For a linked stock the append function loads the
immutable owning run, derives `in_seed|out_of_seed` by exact symbol membership in
`legacy_seed_symbols`, copies `legacy_seed_set_hash`, and rejects a reason that
contradicts the derived membership. For an unlinked connector/document rejection it
stores both null. A caller cannot substitute config-B membership/hash under a
config-A run.

`legacy_analysis_revisions_v3_11` columns are
`(revision_id uuid primary key,symbol text,source_cutoff timestamptz,
material_change_hash text,prior_revision_id uuid null references same table on delete
restrict,research_maturity opportunity_research_maturity_v3_11,
formal_research_status text,new_position_action text,fundamental_snapshot_hash text,
technical_decision_hash text null,valuation_input_hash text null,locked_claims jsonb,
narrative_template_version text,sentence_claim_refs jsonb,narrative text,
narrative_hash text,analysis_generated_at timestamptz,
producer_commit_sha text,recorded_at timestamptz)`. Checks enforce every closed enum,
hash, string/array bound, locked-claim schema, template literal and one-to-one
sentence-claim mapping in `analysis-revision-contract.md`; unique
`(symbol,material_change_hash)`, append-only trigger, prior same-symbol/earlier time
deferred trigger and independently rerendered canonical narrative hash are mandatory.

`legacy_analysis_evaluations_v3_11` columns are
`(evaluation_id uuid primary key,symbol text,revision_id uuid references
legacy_analysis_revisions_v3_11 on delete restrict,evaluated_material_change_hash
text,disposition opportunity_analysis_evaluation_disposition_v3_11,evaluated_at
timestamptz,evaluated_source_cutoff timestamptz,evaluated_price_session date null,
evaluated_adjusted_close double precision null,trigger text,producer_run_id uuid
references legacy_producer_runs_v3_11
on delete restrict,recorded_at timestamptz)`. Trigger is the closed four-label set in
the revision contract; unique `(producer_run_id,symbol)`, exact revision
symbol/hash consistency, cutoff/session/positive-finite-close nullability, and
append-only triggers are mandatory.

`legacy_radar_projections_v3_11` is the dedicated compact read model and has exact
columns
`(projection_id uuid primary key,projection_key text unique,window text,as_of
timestamptz,producer_commit_sha text,worker_sha256 text,material_change_root text,
payload_canonical bytea,payload_json jsonb,payload_sha256 text,created_at
timestamptz)`. `projection_id` and `created_at` are database generated. Window is
`daily|three_day|weekly|home`; key, metadata columns, payload schema/canonical
equivalence, checksum and bounds are exactly
`legacy-radar-correctness-contract.md`. The only lookup index in addition to
primary/unique constraint backing indexes is exactly
`(window,as_of DESC,created_at DESC,projection_id ASC)`. It supports the literal
window predicate and two-row sentinel without a metadata expression, heap-wide sort
or sequential scan.

The relation is owned by `legacy_correctness_rpc_owner`, has RLS enabled but not
forced, and grants `service_role` only `SELECT`; `PUBLIC|anon|authenticated` receive
nothing. Direct `service_role` insert/update/delete/truncate is denied by ACL. A
trigger rejects every UPDATE and rejects DELETE unless both
`current_user='legacy_correctness_rpc_owner'` and the transaction-local internal
retention marker was set by the shared V3.13 retention trigger. A BEFORE INSERT
trigger takes the per-window transaction advisory lock and rejects non-monotonic time
or an equal-`as_of` checksum conflict; an AFTER INSERT trigger performs retention.
Consequently the atomic completion insert and the helper append RPC cross the same
guard and neither can bypass serialization or retention. The NOLOGIN owner is not granted to any login
role, so only an owner-rights function can have that effective owner identity.

Every projection insert takes one transaction advisory lock for the window, requires
`as_of` not earlier than the greatest retained `as_of`, inserts or byte-identically
reuses the projection, then sets the internal marker and retains exactly the newest
1,500 rows in `(as_of DESC,created_at DESC,projection_id ASC)` order for that window.
Rows after ordinal 1,500 are deleted in the same transaction; no other delete path
exists. Thus storage is at most 6,000 immutable retained projections, and a failed
insert or retention step rolls back both. Projections are a rebuildable compact read
model; immutable analysis revisions/evaluations remain the long-lived evidence
authority. The legacy `runtime_artifacts` table, its policies/indexes and its generic
retention job are untouched, so old projections cannot abort unrelated cleanup.

V3.13 adds `legacy_decision_revisions_v3_13` as immutable long-lived disclosure
authority with exact columns `(decision_revision_id text primary key,symbol text,
decision_payload_canonical bytea,decision_payload_json jsonb,decision_payload_sha256
text,recorded_at timestamptz)`. It deliberately stores neither correctness heartbeat nor
a foreign key to the rebuildable projection relation. `legacy_decision_revision_evaluations_v3_13`
stores `(evaluation_id uuid primary key,decision_revision_id text references the decision
revision on delete restrict,projection_id uuid,source_led_correctness jsonb,evaluated_at
timestamptz,recorded_at timestamptz)`; projection ID is audit provenance without a foreign
key, so the 1,500-row projection retention remains executable. Unique
`(decision_revision_id,evaluated_at)` and a locked existing-payload comparison make an
equal-instant correctness disagreement fail closed. Index
`(decision_revision_id,evaluated_at DESC,recorded_at DESC,evaluation_id)` supplies the
two-row exact-read sentinel. The exact Decision Brief renders its immutable evaluation
date from decision source provenance, while freshness is derived only from the newest
separate evaluation row.

V3.13 also adds `legacy_analysis_revision_payloads_v3_13` with exact columns
`(revision_id uuid primary key,symbol text,material_change_hash text,payload_canonical
bytea,payload_json jsonb,payload_sha256 text,recorded_at timestamptz)`. It is immutable,
RLS-enabled, bounded to 256 KiB per payload and has unique
`(symbol,material_change_hash)`. Analysis completion persists the worker's exact
`legacy_analysis_fact_payload_v3_13` bundle after authoritative lease completion. The
claim wrapper returns a prior analysis revision only when this exact payload exists and
its revision/symbol/material hash agree; it never reconstructs immutable facts from
current mutable inputs. Pre-V3.13 rows without a payload are omitted once, causing the
current exact payload to be captured without fabricating a prior Decision Brief.

### V3.13 frozen source-acquisition plane

The following eight relations are the complete persistent source-acquisition plane.
They are not implementation-private scratch tables. Every listed column, bound, key,
foreign key, lifecycle rule and privilege is normative; an additional column, relaxed
bound, alternate owner, policy or application grant is forbidden.

`legacy_approved_source_profiles_v3_13` is the migration-owned exact 17-row roster:
`(profile_id text primary key CHECK ^[a-z0-9_]{2,40}$, profile_name text NOT NULL
CHECK length 1..120)`. Its rows byte-match `approved-source-roster-v3.13`; reapply with
an extra, missing, renamed or conflicting row aborts as `approved_source_roster_conflict`.

`legacy_frozen_source_authorities_v3_13` is
`(source_run_id uuid FK legacy_producer_runs_v3_11(run_id) RESTRICT, profile_id text FK
legacy_approved_source_profiles_v3_13(profile_id) RESTRICT, source_key source_key_v3
CHECK threads|podcast|youtube, distribution_identity text, source_identity_id uuid FK
source_entities(id) RESTRICT, source_identity_authority_id uuid FK
source_identity_authorities_v3(authority_id) RESTRICT, authority_cutoff timestamptz,
recorded_at timestamptz default database clock)`, with primary key
`(source_run_id,profile_id,source_key)`, unique
`(source_run_id,source_identity_authority_id)` and exact distribution identity
`source_key || ':' || profile_id`. The AFTER-INSERT run trigger first invokes the
bounded registry-first latest-event conflict sentinel, then freezes only the active
cutoff-visible head. Post-cutoff grants, revocations and renames cannot affect it.

`legacy_source_append_context_v3_13` is
`(source_run_id uuid FK run RESTRICT, profile_id text FK approved profile RESTRICT,
source_key source_key_v3, stable_connector_document_id text length 1..512,
source_identity_authority_id uuid FK source authority RESTRICT, authority_cutoff
timestamptz, backend_pid integer, transaction_id bigint, recorded_at timestamptz default
database clock)`. Its primary key is
`(source_run_id,source_key,profile_id,stable_connector_document_id)` and composite FK
`(source_run_id,profile_id,source_key)` targets the frozen authority with RESTRICT.
Completion creates it immediately before the existing append RPC in the same database
transaction. Append may consume it only for that exact backend/transaction and only
before the matching persistence terminal exists; completed context cannot be replayed.

`legacy_source_document_persistence_v3_13` is
`(source_run_id uuid FK run RESTRICT, profile_id text CHECK ^[a-z0-9_]{2,40}$,
source_key source_key_v3, stable_connector_document_id text length 1..512,
ingestion_canonical_content_hash_v3 text nullable lower-hex-64,
document_terminal_identity_sha256 text lower-hex-64, disposition text
new_revision|unchanged|deferred|rejected, revision_id uuid NULL FK
source_document_revisions_v3(revision_id) RESTRICT, reason text length 1..500,
recorded_at timestamptz default database clock)`. Its primary key is
`(source_run_id,document_terminal_identity_sha256)` and `revision_id` is non-null
exactly for `new_revision|unchanged`. The terminal identity is SHA-256 over canonical
`[sourceKey,profileId,stableConnectorDocumentId,collectedAt,acquisitionStatus,
ingestionCanonicalContentHashV3OrNull]`. The canonical content hash is null exactly
when the appended revision has a non-complete typed acquisition status such as
`content_overflow`; the separate terminal identity conserves that document without
inventing a content hash.

`legacy_source_connector_attempts_v3_13` is one row per frozen
`(source_run_id,profile_id,source_key)` and stores `status`, `reason_code`,
`response_kind`, nullable `response_status_code`, `response_bytes`, `item_count`,
`document_count`, and database `recorded_at`. Status is exactly
`items_found|successful_empty|metadata_only|missing_endpoint|auth_failed|provider_failed`;
reason is lower snake-case length 2..80; kind is
`http_response|configuration|transport_error`; HTTP status is 100..599 iff kind is
HTTP; bytes are 0..8,000,000, items 0..20 and documents 0..10. The status/kind/status-
code/count/reason matrix is exact: a successful empty is observed 2xx with zero/zero,
items-found is observed 2xx with a nonzero item or document, metadata-only is observed
2xx with items and zero documents, auth is configuration-missing or 401/403, missing
endpoint is configuration-missing or 404, and provider failure is transport or another
non-2xx. Completion requires exactly 51 distinct rows and exact attempt/item/document
count conservation.

`legacy_source_item_outcomes_v3_13` is
`(source_run_id uuid FK run RESTRICT, profile_id text CHECK ^[a-z0-9_]{2,40}$,
source_key source_key_v3, stable_item_id text length 1..512, source_url text HTTPS,
published_at timestamptz NULL, acquisition_disposition text, analysis_disposition text,
recorded_at timestamptz default database clock)` with primary key
`(source_run_id,source_key,profile_id,stable_item_id)`. Its only allowed disposition
pairs are `(transcript_ready,eligible_for_claim_extraction)`,
`(metadata_only,no_claim)`, `(rejected,rejected)` and `(deferred,deferred)`.

`legacy_source_acquisition_outcomes_v3_13` is one SQL-derived row per
`(source_run_id,profile_id)`, with exact roster name, status
`fresh|unchanged|no_new_items|missing_endpoint|auth_failed|provider_failed`, reason
length 1..1000, acquired/new/unchanged/deferred/rejected integer counts each bounded
0..30 and exact count conservation, plus database `recorded_at`. Caller-supplied status
or reason is forbidden. The closed precedence is provider failure, authentication
failure, fresh, any remaining positive-document batch containing deferred work as
failure, an all-rejected batch as failure, unchanged, missing endpoint, successful empty. `no_new_items` requires
exactly zero documents; no evidence class may be re-labeled by the caller.

`legacy_source_processing_outcomes_v3_13` is
`(source_run_id uuid FK run RESTRICT, revision_id uuid FK source revision RESTRICT,
scope text document|claim|entity, outcome_id uuid, parent_outcome_id uuid NULL, symbol
text NULL CHECK ^[0-9A-Za-z]{2,12}$, stock_id uuid NULL FK stocks(id) RESTRICT, outcome
text processed_with_claims|processed_no_claim|linked|rejected|deferred, reason text
length 1..500, recorded_at timestamptz default database clock)` with primary key
`(source_run_id,revision_id,scope,outcome_id)`. Documents alone have null parents;
claims/entities require a parent; `linked` has a stock exactly when linked. Every
persisted revision receives one document terminal and conserved claim/entity terminals.

All eight relations have RLS enabled and not forced, no policies, and owner
`opportunity_v3_rpc_owner` (`NOLOGIN NOBYPASSRLS`). `PUBLIC`, `anon`, `authenticated`
and `service_role` receive no table privilege. Seven run-owned/event relations (all
except the static approved roster) use the exact
`legacy_correctness_immutable_v3_11` BEFORE UPDATE OR DELETE trigger; direct truncate is
denied by the closed ACL. Writes occur only inside the reviewed security-definer run
creation/completion wrappers. Catalog acceptance independently mutates every column,
bound, PK/FK, trigger, RLS flag, owner and ACL and must fail on each mutation.

The separate ten-function catalog, with no overload/default argument, is:

```text
acquire_legacy_producer_lease_v3_11(text,text,text,bytea,text,uuid,integer)
claim_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
heartbeat_legacy_producer_job_v3_11(uuid,uuid,uuid,integer)
complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)
fail_legacy_producer_job_v3_11(uuid,uuid,uuid,opportunity_legacy_producer_failure_code_v3_11)
reap_legacy_producer_jobs_v3_11(integer)
append_legacy_candidate_discovery_v3_11(candidate_discovery_input_v3_11,uuid,uuid)
append_legacy_analysis_revision_v3_11(analysis_revision_input_v3_11,uuid,uuid)
append_legacy_analysis_evaluation_v3_11(analysis_evaluation_input_v3_11,uuid,uuid)
append_legacy_radar_projection_v3_11(legacy_radar_projection_input_v3_11,uuid,uuid)
```

Every function is security-definer with empty search path, verifies database time,
the active owner/job-token SHA-256, lease, producer commit/hash manifest, idempotency
and input schema before a write. Acquire accepts only the exact owner/commit/worker/
exact config bytes/config hash/UUID/120-second tuple, recomputes and persists the
closed seed authority, derives the scheduled occurrence/cutoff/trading
authority exactly under `runtime-installation-contract.md` v1.12, atomically freezes
the run-owned paged authority manifest/root, creates the payload/input/job identities in that
order, returns
the run and execution-ordinal-zero job, and accepts no caller time. Claim preserves the
legacy lease state machine, then returns one closed
payload/predecessor-result row with exactly `(run_id,job_id,stage,job_kind,
stage_ordinal,shard_ordinal,execution_ordinal,revision_id,attempt,
payload_canonical,payload_json,payload_hash,
predecessor_result_canonical,predecessor_result_json,predecessor_result_hash,
authority_kind,authority_canonical,authority_json,authority_hash,
frozen_revision_canonical,frozen_revision_json,frozen_revision_hash,
lease_expires_at)`. Authority members are non-null only for `source_sync`, reproduce
the run-owned frozen `legacy-discovery-authority-v1` bytes and are returned only after
the payload hash has been checked against the run-owned authority hash. Frozen
revision members are non-null only for a leased `mention_claim_extraction`
revision shard and return exactly one raw revision after its frozen-row and token
checks.

For `analysis_revision`, the V3.13 claim wrapper joins only exact immutable fact
payloads. For `compact_radar_projection`, it selects prior projections in literal
`as_of DESC,created_at DESC,projection_id ASC` order and checks a two-row equal-instant
checksum sentinel before returning `priorProjections`; conflict fails closed.
Analysis completion additionally requires the ordered `(symbol,materialChangeHash)`
multiset in `decisionPayloads` to equal the ordered multiset in this exact completed
result's `decisions`; a valid payload for an unrelated retained revision cannot be
substituted merely because its own hash is sound.

The four private non-overloaded legacy bridge helpers are:

```text
resolve_legacy_scheduled_occurrence_v3_11(text,text)
read_legacy_discovery_authority_v3_11(uuid,text,text)
  RETURNS SETOF legacy_discovery_authority_page_v3_11
read_legacy_frozen_revision_v3_11(uuid,uuid,text,uuid,text)
  RETURNS legacy_frozen_revision_read_v3_11
read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)
  RETURNS jsonb
```

The V3.13 migration preserves the public ten-function catalog by renaming the prior
claim, completion and fact-plane implementations to the private
`*_authoritative_v3_13` names and placing the reviewed V3.13 wrappers at the original
signatures. Those three authoritative implementations grant EXECUTE only to the
NOLOGIN owner of their wrapper, revoke every client role, and are not an additional
application RPC surface. The wrappers and authoritative implementations execute in
one SQL transaction, so any V3.13 validation or persistence failure rolls back the
underlying lease/completion mutation as well.

`resolve_legacy_scheduled_occurrence_v3_11` is owned by
`opportunity_v3_rpc_owner`, security-definer with empty search path, and grants
EXECUTE only to `legacy_correctness_rpc_owner`. It accepts only owner label/config
hash, derives database time internally, reads only cutoff-valid
`tw_trading_sessions_v3`, applies the exact composite resolver and returns exactly
`(scheduled_occurrence_id,source_cutoff,trading_date,
trading_session_authority_hash)`; it cannot accept or return an open date query.

`read_legacy_discovery_authority_v3_11(uuid,text,text)` is owned by
`opportunity_v3_rpc_owner`, security-definer with empty search path, and grants
EXECUTE only to the NOLOGIN `legacy_correctness_rpc_owner`. It alone receives SELECT
on the exact legacy run identity needed to validate run ID, database-derived
occurrence/cutoff, running state, commit and config hash, then uses its owner rights to read
only `stock_instruments_v3`, `stock_aliases_v3`,
`stock_sector_assignments_v3`, `source_revision_family_registry_v3`,
`source_document_revisions_v3`, `source_identity_authorities_v3` and
`source_publication_verifications_v3`. It returns only the exact
`legacy_discovery_authority_page_v3_11` stream in closed page-kind/ordinal order, used
by acquire to persist the compact frozen authority manifest/root, or no row. Roster,
alias and taxonomy pages contain at most 500 rows; selected-revision pages contain at
most 200; every empty kind has its canonical zero-row page; total selected revisions
are at most the eleven-connector `11*1000` cap. Repeated header/root values,
kind/page/row counts and page hashes must all conserve before acquire writes a page;
it
cannot write either plane or read a V3 run/job/result/projection.
`service_role|PUBLIC|anon|authenticated` have no EXECUTE on any helper, and the
legacy owner has no direct table/view SELECT. Acquire may invoke the resolver only
before run identity is derived and may invoke the authority reader only in the fixed
new-run branch after inserting the run but before inserting frozen pages/root, payload
or job.
The authority reader cannot be invoked by claim or any stage branch. A helper error
rolls back the run; a retained run never rereads current authority.

`read_legacy_frozen_revision_v3_11(uuid,uuid,text,uuid,text)` has the same owner,
security and grant boundary. It receives SELECT only on the exact legacy run, job,
payload and frozen-revision rows required to validate a currently leased
`mention_claim_extraction/revision_shard`, token hash, revision ID, selected-row hash,
producer commit/config and running state, plus the exact immutable
`source_document_revisions_v3` row named by that frozen row. It returns one bounded
`legacy_frozen_revision_read_v3_11` tuple only when raw/canonical algorithm versions and hashes
byte-equal the frozen manifest. It has no cursor/range/current-family-head branch,
cannot be called by acquire/completion/another stage, and writes nothing. Claim locks
the queued/retryable job and performs the staged attempt increment, fresh-token lease
mutation, helper invocation, exact-one-row identity/algorithm/hash/shape/size checks
and return construction inside one nested block before the SQL transaction commits.
Only the successful branch commits the lease and one-revision return together.

`read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)` has the same owner,
security and grant boundary and is callable only by the already authenticated,
leased `facts_refresh` branch of `claim_legacy_producer_job_v3_11`. Claim supplies
the run-owned source cutoff and the hash-validated predecessor result; the helper
accepts at most 60 distinct UUID/symbol candidates and returns only bounded,
point-in-time financial facts, at most 251 adjusted OHLCV rows per candidate and the
bounded TAIEX reference stream. It resolves corporate actions only from evidence
available at the cutoff, anchors every adjusted series to its latest selected
session, rejects invalid candidate identity/shape and caps the canonical response at
3 MiB. It is read-only, cannot select a current unbounded family, cannot be called by
a public client or `service_role`, and cannot write either the legacy or V3 plane.

A zero/duplicate row, helper exception, identity/algorithm/hash/shape mismatch or
oversize result is exactly `data_integrity_failure`. The nested block rolls back the
staged attempt and all owner/lease fields; the enclosing claim transaction then
terminalizes the prior queued/retryable job and run as `failed` with that failure code,
unchanged attempt, null owner token/lease timestamps, zero claim rows and zero raw
bytes. The integrity branch is not retryable and cannot consume an attempt.
Heartbeat returns Boolean. Complete validates canonical result bytes/JSON/hash. The
V3.13 wrapper returns immediately when authoritative completion produces no row,
before any V3.13 source, fact, price, analysis-payload, decision or evaluation write.
On a valid completion it validates
stage-owned appended IDs and exact counts, then atomically succeeds the job and
creates the database-derived next revision shard/barrier or succeeds the run.
Revision-shard completion atomically persists one document plus bounded claims/
mentions before publishing its successor; the final shard creates a bounded aggregate
barrier, never a monolithic outcome array. Fail/reap apply the attempt-five rule
and cannot create a successor. Append functions return retained/created UUIDs and are
authorized only by a matching leased stage; candidate append derives seed membership
and hash from the run rather than caller input; projection append additionally verifies
the compact payload, immutable key and checksum before its guarded
`legacy_radar_projections_v3_11` insert/retention transaction. The compact completion
path uses the same table-level guard. An expired/wrong owner
or stage performs zero domain or projection write.
Catalog/RLS/zero-direct-DML/interruption acceptance is mandatory before any later
production migration authority. Applied-PostgreSQL acceptance runs as
`service_role` and proves direct projection INSERT/UPDATE/DELETE/TRUNCATE all fail,
the guarded compact-stage function inserts once, a byte-identical retry returns the
same UUID, a different collision fails, and an unrelated legacy `runtime_artifacts`
row remains readable/mutable/deletable exactly as in the pre-migration fixture. It
loads 1,500 retained rows for each of four windows plus an ordinal-1,501 insert,
requires the index-backed `LIMIT 2` plan with no Sort/Seq Scan, proves the new row is
retained and the former oldest row alone is removed, and recomputes the 6,000-row
global ceiling.

## Exact ownership, grants and RPC-only mutation

The dedicated `legacy_radar_projections_v3_11` catalog above is separate from the
V3 relation/function catalogs in this section. Its exact
`legacy_correctness_rpc_owner` ownership, `service_role`-SELECT-only ACL and
ten-function execute surface plus the four private read-only bridge helpers are
authoritative for that relation; it does not alter
any pre-existing legacy relation, grant, policy, index or retention behavior.

The migration creates `opportunity_v3_rpc_owner` as `NOLOGIN NOBYPASSRLS`; it owns the new V3 relations/functions except `internal_principal_role_bindings_v3`, which remains owned by the database migration owner, grants the RPC owner `SELECT` only and has the sole policy named above. The RPC owner is the only application role with table `INSERT/UPDATE/DELETE`. `service_role` must already be `rolbypassrls=true`; preflight fails closed otherwise and the migration never alters that role attribute. It receives `SELECT` only on the following new relations: `source_document_revisions_v3`, `source_identity_authorities_v3`, `publisher_verification_authorities_v3`, `stock_instruments_v3`, `stock_aliases_v3`, `stock_sector_assignments_v3`, `stock_peer_relationship_reviewers_v3`, `stock_peer_relationships_v3`, `valuation_verifications_v3`, `internal_principal_nonces_v3`, `internal_principal_role_bindings_v3`, `opportunity_rpc_audit_v3`, `opportunity_assistive_artifact_registrations_v3`, `tw_trading_sessions_v3`, `opportunity_price_observations_v3`, `opportunity_corporate_action_snapshots_v3`, `opportunity_corporate_action_feed_evidence_v3`, `opportunity_corporate_action_events_v3`, `opportunity_market_observations_v3`, `opportunity_financial_facts_v3`, `opportunity_manifests_v3`, `opportunity_manifest_pages_v3`, `opportunity_manifest_rows_v3`, `source_publication_verifications_v3`, `opportunity_mover_audits_v3`, `opportunity_mover_audit_symbols_v3`, `opportunity_runs`, `opportunity_run_inputs`, `opportunity_run_manifest_inputs`, `opportunity_run_jobs_v3`, `opportunity_job_payloads_v3`, `opportunity_job_results_v3`, `opportunity_job_staging_v3`, `opportunity_run_warning_facts_v3`, `opportunity_source_connector_accounting`, `opportunity_source_document_outcomes`, `opportunity_source_claims`, `opportunity_source_mentions`, `opportunity_candidate_snapshots`, `opportunity_market_context_snapshots`, `opportunity_sector_cycle_snapshots`, `opportunity_score_snapshots`, `opportunity_outcomes`, `opportunity_link_audit_samples`, `opportunity_link_audit_labels`, `opportunity_public_projections_v3` and `opportunity_detail_projections_v3`. The three bounded registry tables `source_revision_family_registry_v3`, `opportunity_authority_stream_registry_v3` and `opportunity_financial_fact_series_registry_v3` are deliberately absent from direct `service_role` SELECT. They are readable only by their owner RPC paths and the fixed, token-bound CASE branches inside `claim_opportunity_job_v3`; they never receive another client-visible table/view grant. `service_role` receives `SELECT` on only two views: `opportunity_effective_taiwan_sessions_v3` and `opportunity_run_status_read_v3`. Both use caller privileges through `security_invoker=true`; no owner-rights worker view exists. Catalog acceptance proves exact owner/barrier/invoker flags, direct registry and former-view SELECT denial for `service_role`, successful exact claim-read registry branches, and zero rows/writes for wrong/reused/all-zero tokens, other jobs/principals and enumeration attempts. `PUBLIC`, `anon` and `authenticated` receive no view SELECT. `service_role` receives no direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` on any V3 relation or view. No migration changes a legacy relation's privileges.

`service_role` receives `EXECUTE` only on this closed 33-function set: `consume_internal_nonce_v3`, `purge_internal_nonces_v3`, `append_source_document_revision_v3`, `append_instrument_roster_authority_v3`, `append_stock_sector_assignment_v3`, `append_trading_session_v3`, `append_price_authority_v3`, `append_market_observation_v3`, `append_stock_flow_observation_v3`, `append_financial_fact_v3`, `append_source_identity_authority_v3`, `append_publisher_verification_authority_v3`, `append_manual_stock_alias_authority_v3`, `append_peer_reviewer_authority_v3`, `append_peer_relationship_authority_v3`, `append_valuation_verification_v3`, `append_assistive_artifact_registration_v3`, `get_link_audit_assignment_v3`, `submit_link_audit_label_v3`, `begin_opportunity_run_v3`, `seal_opportunity_run_inputs_v3`, `claim_opportunity_job_v3`, `heartbeat_opportunity_job_v3`, `stage_opportunity_job_output_v3`, `create_opportunity_manifest_v3`, `append_opportunity_manifest_page_v3`, `complete_opportunity_manifest_v3`, `fail_opportunity_manifest_v3`, `complete_opportunity_job_v3`, `fail_opportunity_job_v3`, `reap_opportunity_jobs_v3`, `finalize_opportunity_run_v3`, and `select_opportunity_public_projection_v3`. The exact non-orchestration signatures are in `auth-principal-contract.md`; exact orchestration signatures are in `runtime-transaction-contract.md`; overloads/default arguments are forbidden. The two private helpers in `job-graph-contract.md` are absent from this catalog and explicitly revoke execute from `PUBLIC`, `anon`, `authenticated` and `service_role`. Every caller-principal function independently validates the exact current database role binding, every function revokes execute from `PUBLIC`, `anon`, `authenticated`, sets empty `search_path`, fully qualifies objects and returns no secret. All V3 tables have RLS enabled and not forced; catalog acceptance requires exactly the one binding-select policy and no other policy.

Migration acceptance must inspect catalog DDL for every required column/check/index/FK target/deletion action/trigger/RLS/revoke/grant and every exact non-overloaded RPC signature, the app-immutable principal-role binding owner/selection rule, instrument-name derivation, peer instrument/stock copy trigger, the generic manifest kind/version mapping, its exact lifecycle transition function/trigger, mover/evaluation kind triggers and the composite link-audit FK/branch trigger. For every V3 table it requires `pg_class.relrowsecurity=true` and `relforcerowsecurity=false`; `pg_policy` contains exactly `opportunity_v3_rpc_owner_binding_select` on the binding table with SELECT-only `USING (true)` and no `WITH CHECK`. It proves the RPC owner is `NOLOGIN,NOBYPASSRLS`, owns every other V3 relation/function, can execute all 33 security-definer operations including role-bound operations, and has only policy-mediated SELECT on the migration-owner binding table. It proves `service_role.rolbypassrls=true`, has read-plus-closed-execute but no direct mutation, the two private helpers have no client execute grant, `anon|authenticated` cannot read/mutate, and RPC calls still succeed under this exact ownership/RLS arrangement. Principal actor UUIDs have no invented FK, arbitrary UUIDs fail the role-binding check, and no dedicated `sector_scoring_reference_manifests_v3` or `sector_benchmark_manifests_v3` relation exists. Reapplying the migration is a no-op; applying it to a fixture containing legacy tables/data cannot update or delete any legacy row.
