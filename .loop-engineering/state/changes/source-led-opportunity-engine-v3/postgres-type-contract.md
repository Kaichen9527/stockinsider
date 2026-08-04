# PostgreSQL Type and RPC Payload Contract: source-led-opportunity-engine-v3

Version: `opportunity-postgres-types-v3.21`

This file is the sole SQL type catalog for every V3 RPC-visible argument, return column, stored enum and staged completion count. Terra must create these exact snake-case named PostgreSQL enums/composites before the functions. A generic `enum`, an anonymous record with untyped columns, an open JSON object or an equivalent implementation-selected value set is forbidden. Built-ins retain their PostgreSQL names (`uuid`, `text`, `boolean`, `integer`, `bigint`, `date`, `timestamptz`, `double precision`, `bytea`, `jsonb`, and arrays thereof).

## Shared authority and observation enums

- `internal_principal_role_v3`: `opportunity_runner|source_reviewer|identity_reviewer|publisher_reviewer|peer_reviewer_admin|peer_reviewer|valuation_reviewer|model_reviewer|link_reviewer|link_adjudicator`.
- `source_key_v3`: `bulltalk|earnings_call|instagram|investanchors|mops_material_event|podcast|ptt|public_broker_research|telegram|threads|youtube`.
- `source_class_v3`: `official|public_research|curated_thesis|community`.
- `authority_status_v3`: `active|inactive`.
- `alias_source_v3`: `official_roster_seed|manual_review`.
- `stock_exchange_v3`: `TWSE|TPEX`.
- `instrument_type_v3`: `common_stock|etf|etn|warrant|preferred_share|depositary_receipt|bond|other`.
- `listing_status_v3`: `active|suspended|delisted`.
- `official_roster_provider_v3`: `twse|tpex`.
- `tw_market_v3`: `TWSE|TPEX`.
- `canonical_sector_key_v3`: exactly the distinct `codeToSector` values in first-occurrence order while traversing that JSON object's stored member order, followed by `fallbackSector` only when it was not already seen, in `sector-taxonomy-map-v3.json`; the migration meta-test performs that extraction and compares `pg_enum.enumsortorder` labels byte-for-byte, rejecting an extra/missing/reordered label.
- `source_acquisition_status_v3`: `complete|invalid_utf8|required_field_missing|content_overflow`.
- `trading_session_status_v3`: `completed|cancelled`.
- `market_fact_key_v3`: `taiex_close|otc_close|above_ma20|above_ma60|foreign_cash_5d|trust_cash_5d|margin_change_5d|foreign_futures_oi|put_call_ratio|taiwan_vix|sox_return_5d|nasdaq_return_5d|usd_twd_return_5d`.
- `market_scope_key_v3`: `TAIEX|OTC|TWSE_ACTIVE_COMMON|TPEX_ACTIVE_COMMON|TW_ACTIVE_COMMON|TAIFEX|SOX|NASDAQ|USD_TWD`; `TW_ACTIVE_COMMON` is derived/output-only and is rejected by `append_market_observation_v3`.
- `market_unit_v3`: `index_points|percentage_points|TWD|contracts|ratio|fx_rate`.
- `market_provider_v3`: `twse|tpex|taifex|finmind|node_twstock|global_allowlisted`; the exact fact/scope/unit/provider tiers and three concrete global identities are the byte-exact `market-provider-v3.2` preimage in `market-contract.md`, never another enum label or runtime-selected value.
- `price_provider_v3`: `twse|tpex|finmind`; raw-price exchange/tier eligibility and the separate official corporate-action authority are closed by the byte-exact 313-byte `market-price-provider-allowlist-v3.1` preimage in `market-contract.md`. Market-only providers are deliberately unrepresentable in the price plane.
- `stock_flow_fact_key_v3`: `foreign_net_twd|trust_net_twd|margin_financing_balance_twd|sbl_short_balance_shares`.
- `stock_flow_unit_v3`: `shares|TWD`.
- `stock_flow_provider_v3`: `twse|tpex|finmind`; exchange owner precedes the sole FinMind mirror.
- `price_authority_kind_v3`: `raw_price|corporate_action_snapshot|exchange_reported_pe`; it is the sole discriminator of the one runner-only price-authority RPC, with exactly one matching nested payload non-null.
- `corporate_action_kind_v3`: `ex_right_dividend|capital_reduction|par_value_change`; `none` is database-derived only from a selected complete snapshot and is deliberately not an input enum value.
- `authority_stream_family_v3`: `discovery_identity|publisher_verification|instrument_roster|stock_alias|sector_assignment|peer_reviewer|peer_relationship`; this is the exact generic bounded-stream registry discriminator and has no extra/unknown text branch.
- `financial_fact_key_v3`: `monthly_revenue|quarterly_revenue|quarterly_gross_profit|quarterly_operating_expense|quarterly_operating_income|quarterly_non_operating_income|quarterly_pretax_income|quarterly_income_tax_expense|quarterly_noncontrolling_interest|quarterly_net_income|quarterly_net_income_attributable_to_common|quarterly_diluted_eps|quarterly_ebitda|depreciation_amortization|diluted_shares|diluted_weighted_average_shares|book_value_per_share|roe|cash_and_equivalents|total_debt|net_debt|total_equity|total_assets|invested_capital|net_asset_value|operating_cash_flow|capital_expenditure|interest_expense|shares_outstanding|pe_multiple|pb_multiple|ev_ebitda_multiple|ev_sales_multiple|broker_target_price`. `broker_target_price` is a verified-publication comparison observation in `TWD_per_share`; it is never a reported filing fallback or a valuation multiple.
- `financial_duration_kind_v3`: `instant|monthly|quarterly|ttm|quarter_end`.
- `financial_unit_v3`: `TWD|TWD_thousand|TWD_million|share|thousand_shares|TWD_per_share|percentage_points|dimensionless`.
- `financial_provider_v3`: `mops|twse|tpex|finmind`.
- `financial_authority_tier_v3`: `official_filing|finmind_mirror`.
- `financial_estimate_kind_v3`: `reported|analyst_estimate|broker_consensus`.
- `financial_estimate_horizon_v3`: `reported_period|next_twelve_months|target_12m`.
- `valuation_verification_decision_v3`: `approved|rejected`.
- `assistive_artifact_kind_v3`: `news_sentiment|embedding|time_series`.
- `assistive_artifact_status_v3`: `registered|revoked`.
- `link_audit_label_role_v3`: `reviewer_1|reviewer_2|adjudicator`.
- `link_audit_assignment_disposition_v3`: `reviewer_open_slot|reviewer_existing_label|reviewer_slots_full|adjudication_pending|adjudication_not_required|adjudicator_open|adjudicator_existing_label|adjudication_completed`.
- `link_audit_failure_code_v3`: `invalid_request|authentication_rejected|principal_role_unavailable|invalid_requested_role|invalid_label_role|invalid_label_value|assignment_unavailable|principal_already_other_branch|principal_not_distinct|label_slot_not_assigned|label_slot_unavailable|reviewer_pair_incomplete|adjudication_not_required|adjudication_completed|label_conflict|label_symbol_unavailable|link_audit_internal_error`.
- `human_authority_failure_code_v3`: `authentication_rejected|principal_role_unavailable|invalid_authority_request|authority_reference_unavailable|authority_conflict|bound_violation`; it is used only as the exact PostgreSQL `MESSAGE` catalog for the seven non-blinded human routes, with SQLSTATE and public-envelope mapping fixed by `auth-principal-contract.md`. `principal_role_unavailable` is the sole database identity for every binding rejection; the HTTP layer maps it to public `authentication_rejected` without changing the stored/raised message. `bound_violation` is the sole append-history sentinel overflow and maps to PT409 without pretending the separately committed nonce rolled back.
- `opportunity_source_connector_status_v3`: `ok|degraded|failed`.
- `opportunity_document_outcome_v3`: `duplicate_document|expired_document|parse_failure|processed_no_claim|processed_with_claims`.
- `opportunity_claim_outcome_v3`: `unique_claim|duplicate_claim`.
- `opportunity_evidence_verification_tier_v3`: `provenance_verified|publisher_verified`.
- `opportunity_claim_evidence_stance_v3`: `supports|contradicts`.
- `opportunity_link_mode_v3`: `ticker|exact_alias|fuzzy`.
- `opportunity_mention_outcome_v3`: `linked_new|linked_refresh|linked_duplicate_claim|ambiguous_symbol|rejected_low_confidence|unsupported_instrument`.
- `opportunity_mention_reason_v3`: `explicit_ticker_context|exact_unique_alias_context|ambiguous_number|ambiguous_alias|fuzzy_below_auto_threshold|below_min_confidence|inactive_or_unknown_symbol|missing_stock_context|unsupported_market|non_common_stock|unsupported_instrument_type|duplicate_claim_link`.
- `opportunity_candidate_origin_v3`: `direct_candidate|comparison_only`.
- `opportunity_shallow_status_v3`: `deferred|failed|succeeded`.
- `opportunity_deep_status_v3`: `not_reached|deferred|failed|succeeded`.
- `opportunity_horizon_v3`: `momentum_5_20d|swing_20_60d|thesis_120_250d`.
- `opportunity_outcome_maturity_v3`: `session_20|session_60|session_120|session_250`. This is independent of the three scoring lanes; the label's numeric suffix is the exact completed-session offset.
- `opportunity_mover_audit_status_v3`: `pending|matured`.
- `opportunity_link_outcome_family_v3`: `linked|ambiguous|rejected|unsupported`.
- `opportunity_candidate_discovery_disposition_v3_11`: `promoted|refreshed|unchanged|rejected`.
- `opportunity_candidate_discovery_reason_v3_11`: `new_in_seed_symbol|new_out_of_seed_symbol|new_source_evidence|material_source_change|same_material_evidence|duplicate_claim|ambiguous_symbol|low_confidence|unsupported_instrument|missing_instrument_authority|source_unavailable|parse_failure|deferred_due_scan_cap|candidate_cap|shallow_cap`.
- `opportunity_candidate_research_disposition_v3_11`: `deep_researched|source_signal_only|not_selected`.
- `opportunity_candidate_research_reason_v3_11`: `candidate_cap|shallow_cap|deep_cap` (nullable exactly when the discovery contract requires null).
- `opportunity_candidate_seed_membership_v3_11`: `in_seed|out_of_seed` (nullable only for a ledger row without a linked stock).
- `opportunity_research_maturity_v3_11`: `source_signal|fundamental_review|decision_ready`.
- `opportunity_technical_state_v3_11`: `below_support|reclaim_required|at_support|breakout_pending|breakout_confirmed|extended|invalidated`.
- `opportunity_technical_unavailable_reason_v3_11`: `insufficient_adjusted_history|corporate_action_authority_missing|invalid_ohlcv|nonconsecutive_sessions|future_observation|volume_reference_unavailable|taiex_reference_unavailable|insufficient_support_structure|invalid_entry_geometry`.
- `opportunity_valuation_method_v3_11`: `pe|normalized_pe|ev_ebitda|pb_roe|residual_income|nav|ev_sales`.
- `opportunity_material_change_reason_v3_11`: `source_evidence_changed|financial_fact_changed|price_trigger_changed|technical_state_changed|valuation_changed|risk_changed|factor_correctness_changed`.
- `opportunity_analysis_evaluation_disposition_v3_11`: `material_revision_created|no_material_change`.
- `opportunity_legacy_producer_stage_v3_11`: `source_sync|mention_claim_extraction|candidate_funnel|facts_refresh|analysis_revision|compact_radar_projection`.
- `opportunity_legacy_producer_job_kind_v3_11`: `stage_barrier|revision_shard`.
- `opportunity_legacy_authority_page_kind_v3_11`: `roster|alias|taxonomy|selected_revision`.
- `opportunity_legacy_producer_job_status_v3_11`: `queued|leased|retryable|succeeded|failed|cancelled`.
- `opportunity_legacy_producer_failure_code_v3_11`: `provider_unavailable|data_integrity_failure|job_attempts_exhausted|lease_expired|cancelled`.

## V3.11 legacy producer return types

- `legacy_scheduled_occurrence_v3_11` is exactly
  `(scheduled_occurrence_id text,source_cutoff timestamptz,trading_date date,
  trading_session_authority_hash text)`.
- `legacy_producer_lease_v3_11` is exactly
  `(run_id uuid,job_id uuid,disposition text,source_cutoff timestamptz,
  authority_hash text)`. `disposition` is
  `created|retained_active|retained_success|retry_created|owner_already_leased`;
  the last branch returns null IDs/cutoff/hash.
- `legacy_producer_claim_v3_11` is exactly
  `(run_id uuid,job_id uuid,stage opportunity_legacy_producer_stage_v3_11,
  job_kind opportunity_legacy_producer_job_kind_v3_11,
  stage_ordinal smallint,shard_ordinal integer,execution_ordinal integer,
  revision_id uuid,attempt smallint,payload_canonical bytea,
  payload_json jsonb,payload_hash text,predecessor_result_canonical bytea,
  predecessor_result_json jsonb,predecessor_result_hash text,
  authority_kind text,authority_canonical bytea,authority_json jsonb,
  authority_hash text,frozen_revision_canonical bytea,
  frozen_revision_json jsonb,frozen_revision_hash text,
  read_kind text,read_canonical bytea,read_json jsonb,read_hash text,
  read_row_count integer,
  lease_expires_at timestamptz)`. Shard/revision members are non-null exactly for
  `mention_claim_extraction/revision_shard`. Predecessor members are null only at
  execution ordinal zero. Authority members are non-null only at `source_sync`, with
  `authority_kind='legacy-discovery-authority-v1'`, and byte-equal the frozen owning
  run authority. Revision shards receive the same authority only inside their hash-bound
  `frozen_revision_authority` read bundle; the top-level authority members remain null.
  Frozen-revision members are non-null only for the exact leased shard,
  are byte/hash-equal to its immutable selected row and source revision, and expose
  one revision only; claim never accepts or mutates either authority. For every
  non-source-sync stage it additionally returns the closed read bundle
  `(read_kind text,read_canonical bytea,read_json jsonb,read_hash text,
  read_row_count integer)`. The bundle is a run/token/predecessor-bound immutable
  stage input, never a current-table reread; its canonical plus JSON value is at
  most 3 MiB and the response is at most 5 MiB. Candidate and compact-projection
  bundles contain at most 60 candidates. The facts bundle has at most 256 financial
  rows and 251 adjusted OHLCV rows per exact candidate plus 251 TAIEX rows; the
  revision bundle carries the same at-most-60 predecessor decisions. A null,
  alternate kind, mismatched hash or an oversized
  bundle fails the claim before a lease is extended.
- `legacy_discovery_authority_page_v3_11` is exactly
  `(page_kind opportunity_legacy_authority_page_kind_v3_11,page_ordinal integer,
  first_row_ordinal integer,row_count integer,page_canonical bytea,page_json jsonb,
  page_hash text,kind_row_count integer,kind_page_count integer,kind_root_hash text,
  authority_header_canonical bytea,authority_header_json jsonb,
  authority_header_hash text)`. The private authority helper returns this type in
  page-kind/ordinal order. Every kind, including an empty kind, has a deterministic
  page/root representation; repeated header/root members are byte-equal on every row.
- `legacy_frozen_revision_read_v3_11` is exactly
  `(run_id uuid,job_id uuid,selection_ordinal integer,source_key source_key_v3,
  revision_id uuid,selected_revision_row_hash text,raw_field_payload jsonb,
  raw_code_point_count integer,raw_field_payload_algorithm_version text,
  ingestion_content_revision_sha256 text,
  canonical_content_algorithm_version text,
  ingestion_canonical_content_hash_v3 text)`. It is returned only to claim for the
  exact leased revision shard; the claim function serializes this typed row into its
  bounded canonical/JSON/hash return members.

## Runtime enums

- `opportunity_mode_v3`: `source_scan|enrich_rank|label_outcomes|shadow_evaluate`.
- `opportunity_run_purpose_v3`: `ad_hoc_shadow|production_shadow_daily|backtest_daily_primary|outcome_label_daily|shadow_evaluation_daily`. `source_scan|enrich_rank` accept the first three; `label_outcomes` accepts only `outcome_label_daily`; `shadow_evaluate` accepts only `shadow_evaluation_daily`.
- `opportunity_run_status_v3`: `preparing|running|success|failed|converged`.
- `opportunity_begin_disposition_v3`: `existing_success|existing_active|created`.
- `opportunity_seal_disposition_v3`: `sealed|existing_success`.
- `opportunity_job_stage_v3`: `authority_manifest|input_manifest_pages|seal_inputs|source_documents|shallow_enrich|deep_research|portfolio_allocate|project|label|evaluate|finalize`.
- `opportunity_job_status_v3`: `queued|leased|succeeded|retryable|failed|cancelled`.
- `opportunity_staging_status_v3`: sole label `staged`.
- `opportunity_manifest_page_status_v3`: sole label `stored`.
- `opportunity_manifest_status_v3`: `building|complete|failed`.
- `opportunity_manifest_kind_v3`: `source_eligible|source_identity_allowlist|publisher_verification_allowlist|instrument_roster|alias_authority|taxonomy_assignment|peer_reviewer_allowlist|peer_authority|source_dataset|candidate_financial|factor_scoring_reference|sector_scoring_reference|sector_valuation_reference|bias_reference|technical_history_reference|reported_pe_reference|market_reference|mover_price_reference|sector_benchmark|outcome_input|evaluation_input|link_audit_sample|link_audit_resolution`.
- `opportunity_run_input_role_v3`: `upstream_source_scan|outcome_enrich|evaluation_enrich|evaluation_outcome`.
- `opportunity_manifest_section_key_v3`: `rows|selected_rows|excluded_rows|connector_roots|selected_revision_rows|connector_conservation|selected_facts|excluded_facts|conservation|included_rows|current_rows|raw_adjusted_rows|history_rows|own_history_rows|sector_current_rows|sector_rows|market_benchmark_rows|sector_aggregate_rows|sector_aggregate_exclusions|aggregate_evidence_rows|sector_excess_included_rows|sector_excess_excluded_rows|aggregate_rows|entry_rows|evaluation_rows|session_conservation|input_rows|attempt_roster|backtest_rows|live_rows|cohort_rows|exclusion_rows|strata|samples|resolved_rows|unresolved_rows`.
- `opportunity_failure_code_v3`: `missing_source_run|multiple_source_runs|source_revision_unavailable|eligible_volume_exceeded|deep_candidate_bound_exceeded|roster_volume_exceeded|identity_manifest_overflow|valuation_verification_overflow|manifest_missing|manifest_hash_mismatch|conservation_failure|bound_violation|authority_revision_conflict|data_integrity_failure|provider_unavailable|v3_service_role_unavailable|job_attempts_exhausted|orphaned_run`. `bound_violation` is also the exact `PT409` begin message when the label-input sentinel observes terminal identity 20,001; that begin failure creates no run or terminal row.
- `opportunity_manifest_failure_code_v3`: `roster_volume_exceeded|identity_manifest_overflow|manifest_hash_mismatch|conservation_failure|bound_violation|authority_revision_conflict|data_integrity_failure|provider_unavailable`.
- `opportunity_job_payload_kind_v3`: `manifest_header|manifest_page|manifest_root|seal|source_parse_batch|source_connector_summary|market_context_snapshot|shallow_candidate_batch|sector_cycle_batch|deep_candidate_batch|portfolio_allocation_batch|projection_bundle|outcome_batch|evaluation_bundle|finalize`.
- `opportunity_job_output_kind_v3`: `manifest_header|manifest_page|manifest_reference|source_parse_batch|source_connector_summary|market_context_snapshot|shallow_candidate_batch|sector_cycle_batch|deep_candidate_batch|portfolio_allocation_batch|projection_bundle|outcome_batch|evaluation_bundle`.
- `opportunity_worker_read_kind_v3`: `manifest_page_rows|manifest_root_pages|source_parse_rows|source_connector_accounting|market_context_rows|shallow_candidate_rows|sector_cycle_rows|deep_candidate_rows|portfolio_rows|projection_rows|outcome_computation_rows|evaluation_computation_summary`. This enum is the complete finite read-unit catalog returned atomically by `claim_opportunity_job_v3`; no worker-selected SQL or open text read kind is allowed.
- `opportunity_rpc_function_name_v3`: exactly the 33 function identifiers in the closed `service_role EXECUTE` catalog in `storage-schema-contract.md`, in that catalog order; the migration meta-test compares `pg_enum` labels byte-for-byte and rejects any overload/extra/missing label.
- `opportunity_rpc_subject_kind_v3`: `nonce|nonce_purge|source_revision|instrument|sector_assignment|trading_session|price_observation|exchange_reported_pe|market_observation|stock_flow_observation|financial_fact|source_identity|publisher|alias|peer_reviewer|peer_relationship|valuation_verification|assistive_artifact|link_label|run|job|manifest`.
- `opportunity_rpc_audit_disposition_v3`: `consumed|purged|appended|idempotent|reviewer_open_slot|reviewer_existing_label|reviewer_slots_full|adjudication_pending|adjudication_not_required|adjudicator_open|adjudicator_existing_label|adjudication_completed|submitted|existing_success|existing_active|created|sealed|converged|claimed|heartbeat|staged|building|page_stored|complete|failed|succeeded|retryable|reaped|finalized`.
- `opportunity_engine_warning_v3`: `connector_degraded|market_incomplete|sector_cycle_unknown|source_audit_pending|prior_lineage_missing|valuation_missing|shadow_only`.

`opportunity_failure_code_v3` is also the exact stored run/job failure type. `fail_opportunity_job_v3` derives retryability: only `provider_unavailable|v3_service_role_unavailable` becomes `retryable` while attempt is below five; every other explicit code becomes `failed`. Lease expiry is separately retryable while attempt is below five. A caller cannot submit a retryable boolean.

Audit disposition is function-closed: nonce/purge use `consumed|purged`; all `append_*` functions use `appended|idempotent`; assignment uses the returned eight assignment dispositions; label submission uses `submitted|idempotent`; begin uses `existing_success|existing_active|created`; seal uses `sealed|existing_success|converged`; claim/heartbeat/stage use `claimed|heartbeat|staged`; manifest create/page/complete/fail use `building|page_stored|complete|failed|idempotent`; job complete/fail use `succeeded|retryable|failed|idempotent`; reap uses sole `reaped` with its returned counts; finalize uses `finalized|failed|idempotent`. A no-job claim, an expected failure or a rolled-back call writes no audit row. No function may emit a disposition outside its listed subset.

## Exact input composites

```text
source_identity_authority_input_v3 = (
  source_identity_id uuid, source_key source_key_v3, source_class source_class_v3,
  distribution_identity text, valid_from timestamptz, valid_to timestamptz,
  status authority_status_v3
)
publisher_authority_input_v3 = (
  publisher_identity_id uuid, source_class source_class_v3, domains text[],
  feed_identity text, institution_identity text, valid_from timestamptz,
  valid_to timestamptz, status authority_status_v3
)
manual_alias_authority_input_v3 = (
  stock_id uuid, proposed_alias text, source_timestamp timestamptz,
  valid_from timestamptz, valid_to timestamptz, status authority_status_v3
)
peer_reviewer_authority_input_v3 = (
  reviewer_principal_id uuid, valid_from timestamptz, valid_to timestamptz,
  status authority_status_v3
)
peer_relationship_authority_input_v3 = (
  supplier_instrument_authority_id uuid, customer_instrument_authority_id uuid,
  source_timestamp timestamptz, valid_from timestamptz, valid_to timestamptz,
  status authority_status_v3, evidence_ref text
)
valuation_verification_input_v3 = (
  symbol text, input_hash text, decision valuation_verification_decision_v3,
  reason_codes text[], evidence_refs text[], rationale text,
  valuation_computed_at timestamptz
)
assistive_artifact_registration_input_v3 = (
  artifact_ref text, artifact_hash text, artifact_kind assistive_artifact_kind_v3,
  license_id text, license_evidence_ref text, training_cutoff timestamptz,
  evaluation_manifest_id uuid, comparison_baseline_key text,
  oos_precision_at_20 double precision, oos_ndcg_at_20 double precision,
  oos_worst_decile_mae20_pct double precision,
  status assistive_artifact_status_v3, supersedes_registration_id uuid
)
instrument_authority_input_v3 = (
  stock_id uuid, symbol text, exchange stock_exchange_v3,
  instrument_type instrument_type_v3, listing_status listing_status_v3,
  official_legal_name text, official_short_name text,
  provider official_roster_provider_v3, source_timestamp timestamptz,
  valid_from timestamptz, valid_to timestamptz, roster_version text
)
sector_assignment_input_v3 = (
  stock_id uuid, market tw_market_v3, official_industry_code text,
  canonical_sector_key canonical_sector_key_v3,
  provider official_roster_provider_v3, source_timestamp timestamptz,
  valid_from timestamptz, valid_to timestamptz, taxonomy_version text,
  status authority_status_v3
)
source_document_revision_input_v3 = (
  source_identity_authority_id uuid, stable_connector_document_id text,
  canonical_url_candidate text, published_at timestamptz, collected_at timestamptz,
  adapter_version text, acquisition_status source_acquisition_status_v3,
  raw_field_payload jsonb, raw_code_point_count integer,
  raw_field_payload_algorithm_version text,
  ingestion_content_revision_sha256 text,
  canonical_content_algorithm_version text,
  ingestion_canonical_content_hash_v3 text, supersedes_revision_id uuid
)
trading_session_input_v3 = (
  session_id date, market tw_market_v3, open_at timestamptz, close_at timestamptz,
  status trading_session_status_v3, provider official_roster_provider_v3,
  source_timestamp timestamptz, collected_at timestamptz, source_ref text
)
price_observation_input_v3 = (
  stock_id uuid, exchange stock_exchange_v3, session_id date,
  session_authority_id uuid,
  raw_open double precision, raw_high double precision, raw_low double precision,
  raw_close double precision, volume double precision, turnover_twd double precision,
  provider price_provider_v3, source_timestamp timestamptz,
  collected_at timestamptz, source_ref text
)
corporate_action_feed_evidence_input_v3 = (
  feed_identity text, response_byte_count integer,
  response_sha256 text, parsed_row_count integer
)
corporate_action_event_input_v3 = (
  symbol text, event_kind corporate_action_kind_v3,
  pre_action_reference_price double precision,
  post_action_reference_price double precision,
  feed_identity text, source_row_ref text
)
corporate_action_snapshot_input_v3 = (
  exchange stock_exchange_v3, session_id date, session_authority_id uuid,
  corporate_action_version text, provider official_roster_provider_v3,
  collected_at timestamptz,
  feed_evidence corporate_action_feed_evidence_input_v3[],
  declared_event_count integer, events corporate_action_event_input_v3[]
)
exchange_reported_pe_input_v3 = (
  stock_id uuid, exchange stock_exchange_v3, session_date date,
  close double precision, reported_pe double precision, published_at timestamptz,
  source_timestamp timestamptz, collected_at timestamptz, source_ref text
)
price_authority_input_v3 = (
  kind price_authority_kind_v3,
  raw_price price_observation_input_v3,
  corporate_action_snapshot corporate_action_snapshot_input_v3,
  exchange_reported_pe exchange_reported_pe_input_v3
)
market_observation_input_v3 = (
  fact_key market_fact_key_v3, scope_key market_scope_key_v3, session_id date,
  session_authority_id uuid,
  value double precision, unit market_unit_v3, provider market_provider_v3,
  provider_identity text,
  breadth_numerator_count integer, breadth_observed_count integer,
  breadth_eligible_count integer, breadth_roster_manifest_id uuid,
  breadth_roster_manifest_hash text,
  observed_at timestamptz, collected_at timestamptz,
  source_ref text, provider_revision text
)
stock_flow_observation_input_v3 = (
  stock_id uuid, exchange stock_exchange_v3, session_id date,
  session_authority_id uuid, fact_key stock_flow_fact_key_v3,
  value double precision, unit stock_flow_unit_v3,
  provider stock_flow_provider_v3, source_timestamp timestamptz,
  collected_at timestamptz, source_ref text, provider_revision text
)
financial_fact_input_v3 = (
  stock_id uuid, fact_key financial_fact_key_v3, period_start date,
  period_end date, duration_kind financial_duration_kind_v3,
  value double precision, unit financial_unit_v3,
  provider financial_provider_v3, authority_tier financial_authority_tier_v3,
  estimate_kind financial_estimate_kind_v3,
  estimate_horizon financial_estimate_horizon_v3,
  filing_published_at timestamptz, source_timestamp timestamptz,
  collected_at timestamptz, filing_restatement_id text, source_ref text
)
opportunity_manifest_row_input_v3 = (
  row_ordinal bigint, identity_key text, terminal_code text,
  payload_canonical bytea, payload_json jsonb, payload_hash text
)
```

`market_observation_input_v3` intentionally has no `authority_date` or `provider_session_date` member. `append_market_observation_v3` derives both after validating the typed row and before acquiring the exact authority-stream lock, using only the row class, `session_id`, `observed_at` and compiled provider identity rules in `market-contract.md`; a caller cannot select or override either date.

Fields shown as built-in nullable values (`valid_to`, optional text/UUID/date, and `terminal_code`) are nullable exactly where the owning domain contract says `null`; PostgreSQL composite declarations do not encode nullability, so each consuming function performs those exact checks before any write. No other composite fields exist and argument order is exact.

## V3.11 legacy-correctness composites

These four types belong only to the separate ten-function V3.11 catalog in
`storage-schema-contract.md`; they do not enter the 33 V3 RPC signatures:

```text
candidate_discovery_input_v3_11 = (
  source_run_id uuid, source_key source_key_v3,
  document_revision_id uuid, claim_id uuid, mention_id uuid,
  stock_id uuid, symbol text,
  disposition opportunity_candidate_discovery_disposition_v3_11,
  reason opportunity_candidate_discovery_reason_v3_11,
  research_disposition opportunity_candidate_research_disposition_v3_11,
  research_reason opportunity_candidate_research_reason_v3_11,
  material_evidence_hash text
)
analysis_revision_input_v3_11 = (
  symbol text, source_cutoff timestamptz, material_change_hash text,
  prior_revision_id uuid,
  research_maturity opportunity_research_maturity_v3_11,
  formal_research_status text, new_position_action text,
  fundamental_snapshot_hash text, technical_decision_hash text,
  valuation_input_hash text, locked_claims jsonb,
  narrative_template_version text,sentence_claim_refs jsonb,
  narrative text,narrative_hash text,
  analysis_generated_at timestamptz,
  producer_commit_sha text
)
analysis_evaluation_input_v3_11 = (
  symbol text, revision_id uuid, evaluated_material_change_hash text,
  disposition opportunity_analysis_evaluation_disposition_v3_11,
  evaluated_source_cutoff timestamptz, evaluated_price_session date,
  evaluated_adjusted_close double precision, evaluated_at timestamptz, trigger text
)
legacy_radar_projection_input_v3_11 = (
  projection_key text, window text, as_of timestamptz,
  producer_commit_sha text, worker_sha256 text, material_change_root text,
  payload_canonical bytea, payload_json jsonb, payload_sha256 text
)
```

Nullable UUID/text members are null exactly as the discovery/revision contracts say.
`locked_claims` and `sentence_claim_refs` are the only JSON members and neither is
open: the append function validates the exhaustive seven-member typed claim rows,
claim/clause/key/unit/value/ref/date bounds, canonical order, contiguous sentence
ordinals, exact clause ownership, sorted unique claim IDs, one-to-one claim coverage
and SHA-256 before any insert.
`narrative_template_version` is exactly
`stockinsider-narrative-template-v1`; the append function independently rerenders
the deterministic narrative and rejects a byte/hash mismatch. Formal status, action
and trigger text are
validated against the exact closed TypeScript unions in
`analysis-revision-contract.md`; an unknown label fails rather than being stored.
The projection JSON member is likewise closed: its bytes must decode byte-equal to
`legacy-radar-projection-v3.11.0`, its route window is
`daily|three_day|weekly|home`, and its key, SHA-256, metadata identity, size and
card/ref bounds are independently recomputed by the append RPC.

## Staging and completion counts

`opportunity_job_counts_v3` is the exact composite:

```text
(manifest_row_count bigint,
 connector_accounting_count integer,
 source_document_count integer, claim_count integer, mention_count integer,
 candidate_count integer, deep_success_candidate_count integer,
 deep_failure_candidate_count integer, market_snapshot_count integer,
 sector_snapshot_count integer, score_snapshot_count integer,
 outcome_count integer, public_projection_count integer,
 detail_projection_count integer, evaluation_result_count integer,
 warning_count integer)
```

Every field is non-null and nonnegative; an unused field is literal zero. The parent job stores its one `output_kind`, so neither stage nor caller JSON may reinterpret a count. Exact valid branches are:

| Output kind | Required nonzero/allowed fields | Exact constraint |
|---|---|---|
| `manifest_header` | none | all fields 0; `create_opportunity_manifest_v3` alone completes the owning header job |
| `manifest_page` | `manifest_row_count` | exactly the rows atomically stored by the owning page job, 1..2,000 |
| `manifest_reference` | `manifest_row_count` | referenced complete manifest row count; every other field, including warnings, is 0 |
| `source_parse_batch` | `source_document_count,claim_count,mention_count`, optional `warning_count` | documents exactly 1, claims 0..200, mentions 0..1,000; decoded row counts and the full canonical-plus-JSON bundle must satisfy the single-revision proof in `job-graph-contract.md` |
| `source_connector_summary` | `connector_accounting_count`, optional `warning_count` | connector accounting exactly 1; every other field is 0 and the closed count maps include every enum label, including zeros |
| `market_context_snapshot` | `market_snapshot_count`, optional `warning_count` | market snapshot exactly 1 |
| `shallow_candidate_batch` | `candidate_count`, optional `warning_count` | candidates 1..5 |
| `sector_cycle_batch` | `sector_snapshot_count`, optional `warning_count` | sector snapshots 1..5 |
| `deep_candidate_batch` | `candidate_count,deep_success_candidate_count,deep_failure_candidate_count`, optional `warning_count` | candidates 1..5; success and failure are independently 0..5, conserve `candidate_count=deep_success_candidate_count+deep_failure_candidate_count`; `score_snapshot_count` is literal zero because this stage does not own durable ranks |
| `portfolio_allocation_batch` | `candidate_count`, optional `warning_count` | candidates 0..20, exactly one such job per run |
| `projection_bundle` | `score_snapshot_count,public_projection_count,detail_projection_count`, optional `warning_count` | public projection exactly 1; detail projections 0..20 and equal deep-success count; score snapshots equal exactly `3*detail_projection_count` and are inserted atomically by this completion |
| `outcome_batch` | `outcome_count`, optional `warning_count` | outcomes 1..200 |
| `evaluation_bundle` | `evaluation_result_count`, optional `warning_count` | evaluation result exactly 1 |

`deep_success_candidate_count` and `deep_failure_candidate_count` are literal zero for every output kind other than `deep_candidate_batch`. For that kind, completion decodes each exact success/failure row branch, recomputes candidate/success/failure counts from normalized rows and rejects caller disagreement before any durable result; it validates the three score tuples per success but reports zero durable score snapshots. Projection completion is the sole owner that recomputes global ranks, inserts the three durable snapshots per successful/detail candidate, and reports that exact count. `warning_count` is 0..6 and equals the warning-fact rows atomically inserted by this job; the seventh enum label `shadow_only` is never stored. The stage/output relation is exhaustive: `authority_manifest|input_manifest_pages -> manifest_header|manifest_page|manifest_reference` as fixed by its server-owned header/page/root shard role; `source_documents -> source_parse_batch|source_connector_summary`; `shallow_enrich ->` exactly one `market_context_snapshot` job plus bounded `shallow_candidate_batch` jobs; `deep_research ->` bounded `sector_cycle_batch` plus `deep_candidate_batch` jobs; `portfolio_allocate -> portfolio_allocation_batch`; `project -> projection_bundle`; `label -> outcome_batch`; `evaluate -> evaluation_bundle`. `seal_inputs` and `finalize` stage no output and complete only inside `seal_opportunity_run_inputs_v3` and `finalize_opportunity_run_v3` respectively. No other pair is valid. Exact payload and output envelope/body schemas are exclusively those in `job-graph-contract.md`; an implementation-selected JSON shape is forbidden.

The three manifest outputs never call `stage_opportunity_job_output_v3` or `complete_opportunity_job_v3`: create stores `output_hash=SHA256(header_canonical)`, append-page stores `output_hash=page_hash`, complete-manifest stores `output_hash=manifest_hash`, all three store their parent `manifest_id` as `output_manifest_id`, recompute the applicable counts and atomically mark their one owning job succeeded; fail-manifest atomically marks its owning job failed with null output fields. Every non-manifest output kind requires exactly one matching staging row and an equal staged `output_hash`; `complete_opportunity_job_v3` accepts no manifest-ref argument, decodes the closed payload schema for that output kind and recomputes this count composite. Caller counts are assertions, never insertion authority. Both generic job RPCs reject all manifest outputs, `seal_inputs` and `finalize`.
