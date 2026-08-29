BEGIN;

-- Preserve source_sync's immutable KOL-first marker when the final claim
-- constructs compact_projection_input.  Without this one field the worker
-- correctly acquired only approved sources, but the projection layer could
-- not distinguish that run from a historical V3.19 compatibility payload.
-- This is an additive wrapper repair: no user data, relation, or prior result
-- is removed.
GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;
SET ROLE legacy_correctness_rpc_owner;

DO $v320_kol_projection_marker$
DECLARE
  v_definition text;
  -- The only supported predecessors are exact pg_get_functiondef canonical
  -- bodies that have been read from production.  Earlier whitespace regexes
  -- were not stable across this wrapper's dollar-quoted function body.  Keep
  -- all closed forms as complete literals: unknown formatting or structure
  -- fails before CREATE FUNCTION can run.
  v_with_prior_literal text:=$prior$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes','legacySourceResultHash',v_source_result.result_hash,'priorProjections'$prior$;
  v_with_prior_pretty_literal text:=$prior_pretty$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes',
        'legacySourceResultHash',v_source_result.result_hash,
        'priorProjections'$prior_pretty$;
  v_bare_plain_literal text:=$plain$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes','legacySourceResultHash',v_source_result.result_hash);v_read_count:=jsonb_array_length(v_prior.result_json->'decisions')$plain$;
  v_bare_coalesced_literal text:=$coalesced$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes','legacySourceResultHash',v_source_result.result_hash);v_read_count:=coalesce(jsonb_array_length(v_prior.result_json->'decisions'),0)$coalesced$;
  v_marker_reference_literal text:=$marker$v_source_result.result_json->'legacyRadarCompatibility'$marker$;
  v_with_prior_replacement text:=$new$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes',
        'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility',
        'priorProjections'$new$;
  v_with_prior_pretty_replacement text:=$new_pretty$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes',
        'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility',
        'priorProjections'$new_pretty$;
  v_bare_plain_replacement text:=$new$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes',
        'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility');v_read_count:=jsonb_array_length(v_prior.result_json->'decisions')$new$;
  v_bare_coalesced_replacement text:=$new$'legacyPayloadHashes',v_source_result.result_json->'legacyPayloadHashes',
        'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility');v_read_count:=coalesce(jsonb_array_length(v_prior.result_json->'decisions'),0)$new$;
  v_old_count integer;
  v_marker_count integer;
  v_marker_reference_count integer;
BEGIN
  -- The currently exported entry point is only a final handoff wrapper.  The
  -- compact input is constructed by this closed authoritative predecessor;
  -- patch that one body so every later wrapper retains the marker unchanged.
  SELECT pg_get_functiondef(
    'public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer)'::regprocedure
  ) INTO STRICT v_definition;

  v_marker_count:=(length(v_definition)-length(replace(v_definition,'legacyRadarCompatibility','')))
    / length('legacyRadarCompatibility');
  v_marker_reference_count:=(length(v_definition)-length(replace(v_definition,v_marker_reference_literal,'')))
    / length(v_marker_reference_literal);
  IF v_marker_count>0 THEN
    IF v_marker_count<>2 OR v_marker_reference_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_postcondition_failed';
    END IF;
    RETURN;
  END IF;

  v_old_count:=
    (length(v_definition)-length(replace(v_definition,v_with_prior_literal,'')))/length(v_with_prior_literal)+
    (length(v_definition)-length(replace(v_definition,v_with_prior_pretty_literal,'')))/length(v_with_prior_pretty_literal)+
    (length(v_definition)-length(replace(v_definition,v_bare_plain_literal,'')))/length(v_bare_plain_literal)+
    (length(v_definition)-length(replace(v_definition,v_bare_coalesced_literal,'')))/length(v_bare_coalesced_literal);
  IF v_old_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_predecessor_conflict';
  END IF;

  v_definition:=replace(v_definition,v_with_prior_literal,v_with_prior_replacement);
  v_definition:=replace(v_definition,v_with_prior_pretty_literal,v_with_prior_pretty_replacement);
  v_definition:=replace(v_definition,v_bare_plain_literal,v_bare_plain_replacement);
  v_definition:=replace(v_definition,v_bare_coalesced_literal,v_bare_coalesced_replacement);
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer)'::regprocedure
  ) INTO STRICT v_definition;
  v_marker_count:=(length(v_definition)-length(replace(v_definition,'legacyRadarCompatibility','')))
    / length('legacyRadarCompatibility');
  v_marker_reference_count:=(length(v_definition)-length(replace(v_definition,v_marker_reference_literal,'')))
    / length(v_marker_reference_literal);
  v_old_count:=
    (length(v_definition)-length(replace(v_definition,v_with_prior_literal,'')))/length(v_with_prior_literal)+
    (length(v_definition)-length(replace(v_definition,v_with_prior_pretty_literal,'')))/length(v_with_prior_pretty_literal)+
    (length(v_definition)-length(replace(v_definition,v_bare_plain_literal,'')))/length(v_bare_plain_literal)+
    (length(v_definition)-length(replace(v_definition,v_bare_coalesced_literal,'')))/length(v_bare_coalesced_literal);
  IF v_marker_count<>2 OR v_marker_reference_count<>1 OR v_old_count<>0
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_postcondition_failed';
  END IF;
END $v320_kol_projection_marker$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

COMMIT;
