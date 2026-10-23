-- SOURCE CANDIDATE only: immutable observations of three existing requests.
-- A transport observation NEVER proves an exhaustive event window, independent
-- root, financial authority or comparable volume. No old ACL/body is changed.
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(64221022);
DO $prerequisite$
BEGIN
 IF to_regclass('public.vnext_twse_snapshot_receipts_v1') IS NOT NULL OR to_regprocedure('public.vnext_twse_snapshot_v1(text,text,jsonb)') IS NOT NULL OR to_regprocedure('public.vnext_twse_snapshot_immutable_v1()') IS NOT NULL THEN RAISE EXCEPTION 'vnext_twse_snapshot_first_install_required'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='stockinsider_vnext_owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
  OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('public.vnext_source_policies_v1') AND pg_get_userbyid(relowner)='stockinsider_vnext_owner' AND relrowsecurity)
  OR NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid=to_regclass('public.connector_runs') AND attname='id' AND atttypid='uuid'::regtype AND attnotnull AND NOT attisdropped)
 THEN RAISE EXCEPTION 'vnext_twse_snapshot_source_prerequisite_missing'; END IF;
 IF NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.enforce_production_writer_fence()') AND prosecdef AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='8230515bef78902c9f955f5c87a77f8b04ef02fa22525a5c4828849f56a9273a')
  OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_provider_envelope_v1(jsonb,integer)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='f30e724618b242f2e40ee3f64ced5f131baf5505ac51827238bb6992f9c27264')
  OR NOT EXISTS(SELECT FROM pg_proc WHERE oid=to_regprocedure('public.vnext_catalog_canonical_v1(jsonb)') AND pg_get_userbyid(proowner)='stockinsider_vnext_owner' AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='597081dda160ac0e369b5f5306bee102caac5b78b19cd82583e0e9408cc4f464')
 THEN RAISE EXCEPTION 'vnext_twse_snapshot_guard_predecessor_changed'; END IF;
END $prerequisite$;
CREATE TABLE public.vnext_twse_snapshot_receipts_v1(
 receipt_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 connector_run_id uuid NOT NULL REFERENCES public.connector_runs(id) ON DELETE RESTRICT,
 endpoint_key text NOT NULL CHECK(endpoint_key IN('holding_listed','holding_public','transfer_listed')),
 observation jsonb NOT NULL,receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 principal text NOT NULL,license_basis text NOT NULL,rights_subject text NOT NULL,policy_valid_until timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(connector_run_id,endpoint_key)
);
ALTER TABLE public.vnext_twse_snapshot_receipts_v1 OWNER TO stockinsider_vnext_owner;
ALTER TABLE public.vnext_twse_snapshot_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vnext_twse_snapshot_receipts_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_writer_fence BEFORE INSERT OR UPDATE OR DELETE ON public.vnext_twse_snapshot_receipts_v1 FOR EACH ROW EXECUTE FUNCTION public.enforce_production_writer_fence();
CREATE FUNCTION public.vnext_twse_snapshot_immutable_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'vnext_twse_snapshot_append_only'; END $$;
ALTER FUNCTION public.vnext_twse_snapshot_immutable_v1() OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_twse_snapshot_immutable_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER vnext_snapshot_immutable BEFORE UPDATE OR DELETE ON public.vnext_twse_snapshot_receipts_v1 FOR EACH ROW EXECUTE FUNCTION public.vnext_twse_snapshot_immutable_v1();
-- The FK proves run existence. Its source/platform fields are verified by the
-- trusted server using existing service SELECT; this owner gets NO old-table
-- SELECT/GRANT/RLS policy. This is not hostile-service transport attestation.
CREATE FUNCTION public.vnext_twse_snapshot_v1(p_principal text,p_operation text,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET statement_timeout='30s' SET lock_timeout='2s' AS $$
DECLARE policy public.vnext_source_policies_v1; receipt public.vnext_twse_snapshot_receipts_v1; item jsonb; field text; manifest_item jsonb; ordinal_value integer; prior_ordinal integer:=-1; selected_count integer; payload_hash text;
 keys constant text[]:=ARRAY['connectorRunId','endpointKey','querySymbol','requestedAt','profileVersion','availableAt','status','httpStatus','responseSha256','responseBytes','observedBytesAtLeast','returnedRows','matchedRows','selectedRows','deferredRows','selectionCap','manifest','byteBasis','rowHashBasis','eventTimeBasis','eventWindow','exhaustion','rootResolution','eventVolume'];
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'vnext_read_committed_required'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR NOT public.vnext_provider_envelope_v1(p_request) THEN RAISE EXCEPTION 'vnext_twse_snapshot_envelope_bounds'; END IF;
 PERFORM pg_advisory_xact_lock(64221022);
 IF NOT EXISTS(SELECT FROM public.vnext_mode_v1 WHERE enabled AND legacy_fenced) OR NOT EXISTS(SELECT FROM public.vnext_principals_v1 WHERE principal=p_principal AND enabled AND role='operator') THEN RAISE EXCEPTION 'vnext_twse_snapshot_operator_mode_required'; END IF;
 SELECT * INTO policy FROM public.vnext_source_policies_v1 WHERE source='official' AND scope='official_original' AND enabled AND valid_until>clock_timestamp();
 IF policy.source IS NULL THEN RAISE EXCEPTION 'vnext_twse_snapshot_current_rights_required'; END IF;
 IF p_operation='append' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_request))<>1 OR NOT(p_request ? 'observation') THEN RAISE EXCEPTION 'vnext_twse_snapshot_closed_request'; END IF;
  item:=p_request->'observation';
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT(item ?& keys) OR EXISTS(SELECT FROM jsonb_object_keys(item) k WHERE NOT(k=ANY(keys)))
   OR jsonb_typeof(item->'endpointKey') IS DISTINCT FROM 'string' OR item->>'profileVersion' IS DISTINCT FROM 'twse-insider-snapshot-v1' OR item->>'endpointKey' NOT IN('holding_listed','holding_public','transfer_listed')
   OR coalesce(item->>'connectorRunId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR (item->'querySymbol'<>'null'::jsonb AND (jsonb_typeof(item->'querySymbol')<>'string' OR item->>'querySymbol' !~ '^[0-9]{4}$'))
   OR item->>'byteBasis' IS DISTINCT FROM 'fetch_response_body_after_http_content_decoding' OR item->>'rowHashBasis' IS DISTINCT FROM 'sha256_json_stringify_parsed_row_v1'
   OR item->>'eventTimeBasis' IS DISTINCT FROM 'report_date_not_original_event' OR item->'eventWindow' IS DISTINCT FROM 'null'::jsonb OR item->'eventVolume' IS DISTINCT FROM 'null'::jsonb
   OR item->>'exhaustion' IS DISTINCT FROM 'not_exposed_by_snapshot_api' OR item->>'rootResolution' IS DISTINCT FROM 'unresolved'
   OR jsonb_typeof(item->'requestedAt') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'availableAt') IS DISTINCT FROM 'string' OR NOT isfinite((item->>'requestedAt')::timestamptz) OR NOT isfinite((item->>'availableAt')::timestamptz) OR (item->>'requestedAt')::timestamptz>(item->>'availableAt')::timestamptz OR (item->>'availableAt')::timestamptz>clock_timestamp()
   OR jsonb_typeof(item->'selectionCap') IS DISTINCT FROM 'number' OR (item->>'selectionCap')::numeric<>(CASE WHEN item->'querySymbol'='null'::jsonb THEN 500 ELSE 60 END)
   OR jsonb_typeof(item->'manifest') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'manifest')>500
   OR coalesce(item->>'status','') NOT IN('response_observed','http_error','body_unavailable','body_bound','body_read_uncertain','json_unsupported','schema_error','response_url_mismatch','transport_error','transport_timeout')
  THEN RAISE EXCEPTION 'vnext_twse_snapshot_profile_invalid'; END IF;
  IF item->'httpStatus'<>'null'::jsonb AND (jsonb_typeof(item->'httpStatus')<>'number' OR (item->>'httpStatus')::numeric NOT BETWEEN 0 AND 599 OR (item->>'httpStatus')::numeric<>trunc((item->>'httpStatus')::numeric)) THEN RAISE EXCEPTION 'vnext_twse_snapshot_http_status_invalid'; END IF;
  IF (item->'responseSha256'='null'::jsonb) IS DISTINCT FROM (item->'responseBytes'='null'::jsonb) OR (item->'responseSha256'<>'null'::jsonb AND (jsonb_typeof(item->'responseSha256')<>'string' OR item->>'responseSha256' !~ '^[a-f0-9]{64}$')) THEN RAISE EXCEPTION 'vnext_twse_snapshot_digest_invalid'; END IF;
  FOREACH field IN ARRAY ARRAY['responseBytes','observedBytesAtLeast','returnedRows','matchedRows','selectedRows','deferredRows'] LOOP
   IF item->field<>'null'::jsonb AND (jsonb_typeof(item->field)<>'number' OR (item->>field)::numeric<0 OR (item->>field)::numeric<>trunc((item->>field)::numeric) OR (item->>field)::numeric>8388609) THEN RAISE EXCEPTION 'vnext_twse_snapshot_count_invalid'; END IF;
  END LOOP;
  IF item->'responseBytes'<>'null'::jsonb AND ((item->>'responseBytes')::numeric>8388608 OR item->'responseBytes' IS DISTINCT FROM item->'observedBytesAtLeast') THEN RAISE EXCEPTION 'vnext_twse_snapshot_complete_bytes_invalid'; END IF;
  IF item->>'status'='response_observed' THEN
   IF item->'responseSha256'='null'::jsonb OR item->'httpStatus'='null'::jsonb OR (item->>'httpStatus')::numeric NOT BETWEEN 200 AND 299 OR EXISTS(SELECT FROM unnest(ARRAY['returnedRows','matchedRows','selectedRows','deferredRows']) k WHERE jsonb_typeof(item->k) IS DISTINCT FROM 'number')
    OR (item->>'matchedRows')::numeric>(item->>'returnedRows')::numeric OR (item->>'selectedRows')::numeric<>least((item->>'matchedRows')::numeric,(item->>'selectionCap')::numeric)
    OR (item->>'deferredRows')::numeric<>(item->>'matchedRows')::numeric-(item->>'selectedRows')::numeric OR jsonb_array_length(item->'manifest')<>(item->>'selectedRows')::integer THEN RAISE EXCEPTION 'vnext_twse_snapshot_enumeration_invalid'; END IF;
  ELSIF EXISTS(SELECT FROM unnest(ARRAY['returnedRows','matchedRows','selectedRows','deferredRows']) k WHERE item->k IS DISTINCT FROM 'null'::jsonb) OR jsonb_array_length(item->'manifest')<>0 THEN RAISE EXCEPTION 'vnext_twse_snapshot_failure_is_not_zero'; END IF;
  FOR manifest_item IN SELECT * FROM jsonb_array_elements(item->'manifest') LOOP
   IF jsonb_typeof(manifest_item) IS DISTINCT FROM 'object' OR NOT(manifest_item ?& ARRAY['ordinal','rowHash','symbol','reportDateToken','unknownDateHash']) OR (SELECT count(*) FROM jsonb_object_keys(manifest_item))<>5
    OR jsonb_typeof(manifest_item->'ordinal') IS DISTINCT FROM 'number' OR (manifest_item->>'ordinal')::numeric<>trunc((manifest_item->>'ordinal')::numeric) OR (manifest_item->>'ordinal')::numeric<0 OR (manifest_item->>'ordinal')::numeric>=(item->>'returnedRows')::numeric
    OR jsonb_typeof(manifest_item->'rowHash') IS DISTINCT FROM 'string' OR coalesce(manifest_item->>'rowHash','') !~ '^[a-f0-9]{64}$' OR (manifest_item->'symbol'<>'null'::jsonb AND (jsonb_typeof(manifest_item->'symbol') IS DISTINCT FROM 'string' OR coalesce(manifest_item->>'symbol','') !~ '^[1-9][0-9]{3}$'))
    OR (manifest_item->'reportDateToken'<>'null'::jsonb AND (jsonb_typeof(manifest_item->'reportDateToken') IS DISTINCT FROM 'string' OR coalesce(manifest_item->>'reportDateToken','') !~ '^[0-9]{6,8}$')) OR (manifest_item->'unknownDateHash'<>'null'::jsonb AND (jsonb_typeof(manifest_item->'unknownDateHash') IS DISTINCT FROM 'string' OR coalesce(manifest_item->>'unknownDateHash','') !~ '^[a-f0-9]{64}$'))
    OR manifest_item->'reportDateToken'<>'null'::jsonb AND manifest_item->'unknownDateHash'<>'null'::jsonb THEN RAISE EXCEPTION 'vnext_twse_snapshot_manifest_invalid'; END IF;
   ordinal_value:=(manifest_item->>'ordinal')::integer;IF ordinal_value<=prior_ordinal THEN RAISE EXCEPTION 'vnext_twse_snapshot_manifest_order'; END IF;prior_ordinal:=ordinal_value;
  END LOOP;
  payload_hash:=encode(sha256(convert_to(public.vnext_catalog_canonical_v1(item),'UTF8')),'hex');
  SELECT * INTO receipt FROM public.vnext_twse_snapshot_receipts_v1 WHERE connector_run_id=(item->>'connectorRunId')::uuid AND endpoint_key=item->>'endpointKey';
  IF receipt.receipt_id IS NOT NULL THEN
   IF receipt.observation IS DISTINCT FROM item OR receipt.principal IS DISTINCT FROM p_principal OR receipt.license_basis IS DISTINCT FROM policy.license_basis OR receipt.rights_subject IS DISTINCT FROM policy.rights_subject OR receipt.policy_valid_until IS DISTINCT FROM policy.valid_until THEN RAISE EXCEPTION 'vnext_twse_snapshot_replay_conflict'; END IF;
  ELSE
   INSERT INTO public.vnext_twse_snapshot_receipts_v1(connector_run_id,endpoint_key,observation,receipt_hash,principal,license_basis,rights_subject,policy_valid_until)
    VALUES((item->>'connectorRunId')::uuid,item->>'endpointKey',item,payload_hash,p_principal,policy.license_basis,policy.rights_subject,policy.valid_until) RETURNING * INTO receipt;
  END IF;
 ELSIF p_operation='read' THEN
  IF NOT(p_request ?& ARRAY['connectorRunId','endpointKey']) OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>2 OR coalesce(p_request->>'connectorRunId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR coalesce(p_request->>'endpointKey','') NOT IN('holding_listed','holding_public','transfer_listed') THEN RAISE EXCEPTION 'vnext_twse_snapshot_closed_request'; END IF;
  SELECT * INTO receipt FROM public.vnext_twse_snapshot_receipts_v1 WHERE connector_run_id=(p_request->>'connectorRunId')::uuid AND endpoint_key=p_request->>'endpointKey';
  IF receipt.receipt_id IS NULL THEN RETURN jsonb_build_object('absent',true,'eventCoverage','unknown','eventVolume',NULL); END IF;
  IF receipt.license_basis IS DISTINCT FROM policy.license_basis OR receipt.rights_subject IS DISTINCT FROM policy.rights_subject OR receipt.policy_valid_until IS DISTINCT FROM policy.valid_until THEN RAISE EXCEPTION 'vnext_twse_snapshot_current_policy_identity_changed'; END IF;
 ELSIF p_operation='latest' THEN
  IF p_request<>'{}'::jsonb THEN RAISE EXCEPTION 'vnext_twse_snapshot_closed_request'; END IF;
  RETURN jsonb_build_object('observations',coalesce((SELECT jsonb_agg(observation ORDER BY endpoint_key) FROM(SELECT DISTINCT ON(endpoint_key) endpoint_key,jsonb_build_object('receiptId',receipt_id,'observation',observation,'recordedAt',recorded_at,'receiptHash',receipt_hash) AS observation FROM public.vnext_twse_snapshot_receipts_v1 r WHERE r.license_basis=policy.license_basis AND r.rights_subject=policy.rights_subject AND r.policy_valid_until=policy.valid_until ORDER BY endpoint_key,recorded_at DESC,receipt_id DESC) latest),'[]'::jsonb),'eventCoverage','unknown','eventVolume',NULL);
 ELSE RAISE EXCEPTION 'vnext_twse_snapshot_operation_unsupported'; END IF;
 RETURN jsonb_build_object('receiptId',receipt.receipt_id,'observation',receipt.observation,'recordedAt',receipt.recorded_at,'receiptHash',receipt.receipt_hash);
END $$;
ALTER FUNCTION public.vnext_twse_snapshot_v1(text,text,jsonb) OWNER TO stockinsider_vnext_owner;
REVOKE ALL ON FUNCTION public.vnext_twse_snapshot_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vnext_twse_snapshot_v1(text,text,jsonb) TO service_role;
COMMIT;
