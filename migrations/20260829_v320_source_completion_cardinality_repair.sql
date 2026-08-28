BEGIN;

-- V3.20 widened the source matrix from three connectors to five, but its
-- predecessor wrapper still derived each profile terminal status with a
-- hard-coded count of three.  That made a valid 17 x 5 frozen acquisition
-- fail after persistence with a generic data-integrity error.  Patch only
-- that closed derivation and preserve the V3.13 fallback for historical
-- three-connector envelopes.
GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;

DO $v320_source_completion_cardinality_repair$
DECLARE
  v_definition text;
  v_old_total text:=$old$v_attempt_provider+v_attempt_auth+v_attempt_missing+v_attempt_success<>3$old$;
  v_new_total text:=$new$v_attempt_provider+v_attempt_auth+v_attempt_missing+v_attempt_success<>(CASE
        WHEN p_json#>>'{sourceAcquisition,schema}'='official-source-acquisition-v3.20' THEN 5 ELSE 3 END)$new$;
  v_old_missing text:=$old$WHEN v_attempt_missing=3 THEN 'missing_endpoint'$old$;
  v_new_missing text:=$new$WHEN v_attempt_missing=(CASE
        WHEN p_json#>>'{sourceAcquisition,schema}'='official-source-acquisition-v3.20' THEN 5 ELSE 3 END)
        THEN 'missing_endpoint'$new$;
  v_five_source_key_check text:=$five$NOT IN ('threads','podcast','youtube','telegram','investanchors')$five$;
  v_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure
  ) INTO STRICT v_definition;

  v_count:=(length(v_definition)-length(replace(v_definition,v_five_source_key_check,'')))
    / length(v_five_source_key_check);
  IF position(v_new_total IN v_definition)>0 AND position(v_new_missing IN v_definition)>0 THEN
    IF position('official-source-acquisition-v3.20' IN v_definition)=0 OR v_count<>3 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_source_completion_cardinality_postcondition_failed';
    END IF;
    RETURN;
  END IF;

  IF position('official-source-acquisition-v3.20' IN v_definition)=0
    OR v_count<>3
    OR (length(v_definition)-length(replace(v_definition,v_old_total,'')))/length(v_old_total)<>1
    OR (length(v_definition)-length(replace(v_definition,v_old_missing,'')))/length(v_old_missing)<>1
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_source_completion_cardinality_predecessor_conflict';
  END IF;

  v_definition:=replace(v_definition,v_old_total,v_new_total);
  v_definition:=replace(v_definition,v_old_missing,v_new_missing);
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure
  ) INTO STRICT v_definition;
  IF position(v_new_total IN v_definition)=0 OR position(v_new_missing IN v_definition)=0
    OR position(v_old_total IN v_definition)>0 OR position(v_old_missing IN v_definition)>0
  THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_source_completion_cardinality_postcondition_failed';
  END IF;
END $v320_source_completion_cardinality_repair$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

COMMIT;
