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
  -- PostgreSQL may reformat function bodies before a reviewed migration is
  -- replayed. Use the closed POSIX whitespace grammar rather than a literal
  -- source layout when recognizing the permitted predecessor forms.  The
  -- authoritative wrapper always retains legacyPayloadHashes immediately
  -- before legacySourceResultHash; matching that pair prevents an unrelated
  -- jsonb_build_object from being selected as a predecessor.
  v_with_prior_pattern text:=E'''legacyPayloadHashes'',[[:space:]]*v_source_result[.]result_json[[:space:]]*->[[:space:]]*''legacyPayloadHashes'',[[:space:]]*''legacySourceResultHash'',[[:space:]]*v_source_result[.]result_hash,[[:space:]]*''priorProjections''';
  -- Keep the bare predecessors mutually exclusive.  The former prefix-only
  -- rule also matched the coalesced variant below, so a valid deployed body
  -- was counted twice and correctly failed closed as an unknown predecessor.
  v_bare_plain_pattern text:=E'''legacyPayloadHashes'',[[:space:]]*v_source_result[.]result_json[[:space:]]*->[[:space:]]*''legacyPayloadHashes'',[[:space:]]*''legacySourceResultHash'',[[:space:]]*v_source_result[.]result_hash[)][[:space:]]*;[[:space:]]*v_read_count[[:space:]]*:=[[:space:]]*jsonb_array_length[[:space:]]*[(][[:space:]]*v_prior[.]result_json[[:space:]]*->[[:space:]]*''decisions''[[:space:]]*[)]''';
  v_bare_coalesced_pattern text:=E'''legacyPayloadHashes'',[[:space:]]*v_source_result[.]result_json[[:space:]]*->[[:space:]]*''legacyPayloadHashes'',[[:space:]]*''legacySourceResultHash'',[[:space:]]*v_source_result[.]result_hash[)][[:space:]]*;[[:space:]]*v_read_count[[:space:]]*:=[[:space:]]*coalesce[[:space:]]*[(][[:space:]]*jsonb_array_length[[:space:]]*[(][[:space:]]*v_prior[.]result_json[[:space:]]*->[[:space:]]*''decisions''[[:space:]]*[)][[:space:]]*,[[:space:]]*0[[:space:]]*[)]''';
  v_marker_reference_pattern text:=E'v_source_result[.]result_json[[:space:]]*->[[:space:]]*''legacyRadarCompatibility''';
  v_with_prior_replacement text:=$new$'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility',
        'priorProjections'$new$;
  v_bare_plain_replacement text:=$new$'legacySourceResultHash',v_source_result.result_hash,
        'legacyRadarCompatibility',v_source_result.result_json->'legacyRadarCompatibility');v_read_count:=jsonb_array_length(v_prior.result_json->'decisions')$new$;
  v_bare_coalesced_replacement text:=$new$'legacySourceResultHash',v_source_result.result_hash,
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
  SELECT count(*) FROM regexp_matches(v_definition,v_marker_reference_pattern,'g') INTO v_marker_reference_count;
  IF v_marker_count>0 THEN
    IF v_marker_count<>2 OR v_marker_reference_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_postcondition_failed';
    END IF;
    RETURN;
  END IF;

  SELECT (SELECT count(*) FROM regexp_matches(v_definition,v_with_prior_pattern,'g'))+
    (SELECT count(*) FROM regexp_matches(v_definition,v_bare_plain_pattern,'g'))+
    (SELECT count(*) FROM regexp_matches(v_definition,v_bare_coalesced_pattern,'g')) INTO v_old_count;
  IF v_old_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_predecessor_conflict';
  END IF;

  v_definition:=regexp_replace(v_definition,v_with_prior_pattern,v_with_prior_replacement);
  v_definition:=regexp_replace(v_definition,v_bare_plain_pattern,v_bare_plain_replacement);
  v_definition:=regexp_replace(v_definition,v_bare_coalesced_pattern,v_bare_coalesced_replacement);
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.claim_legacy_producer_job_authoritative_v3_13(uuid,uuid,uuid,integer)'::regprocedure
  ) INTO STRICT v_definition;
  v_marker_count:=(length(v_definition)-length(replace(v_definition,'legacyRadarCompatibility','')))
    / length('legacyRadarCompatibility');
  SELECT count(*) FROM regexp_matches(v_definition,v_marker_reference_pattern,'g') INTO v_marker_reference_count;
  SELECT (SELECT count(*) FROM regexp_matches(v_definition,v_with_prior_pattern,'g'))+
    (SELECT count(*) FROM regexp_matches(v_definition,v_bare_plain_pattern,'g'))+
    (SELECT count(*) FROM regexp_matches(v_definition,v_bare_coalesced_pattern,'g')) INTO v_old_count;
  IF v_marker_count<>2 OR v_marker_reference_count<>1 OR v_old_count<>0
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_projection_marker_postcondition_failed';
  END IF;
END $v320_kol_projection_marker$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner;

COMMIT;
