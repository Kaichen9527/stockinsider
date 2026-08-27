-- StockInsider V3.19.3 production repair: a bound detail dossier carries
-- decisionRevisionId and dossierId, but both are derived from the decision
-- identity.  Reconstruct the PostgreSQL identity from the same non-cyclic
-- material as the tracked worker before validating the submitted hash.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;

DO $v3193_decision_identity_contract$
DECLARE
  v_definition text;
  v_rewritten text;
  v_old text := $old$(v_item#>'{bundle,json,decisionEnvelope}')-'decisionRevisionId'::text));$old$;
  v_new text := $new$(v_item#>'{bundle,json,decisionEnvelope}')-'decisionRevisionId'::text)
          ||CASE WHEN jsonb_typeof(v_item#>'{bundle,json,researchDossier}')='object'
            THEN jsonb_build_object('researchDossier',
              ((v_item#>'{bundle,json,researchDossier}')-'dossierId'::text)-'decisionRevisionId'::text)
            ELSE '{}'::jsonb END);$new$;
  v_old_count integer;
  v_new_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure
  ) INTO STRICT v_definition;
  v_old_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  v_new_count := (length(v_definition)-length(replace(v_definition,'''dossierId''','')))
    / length('''dossierId''');
  IF v_old_count=0 AND v_new_count=1 THEN RETURN;END IF;
  IF v_old_count<>1 OR v_new_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3193_decision_identity_rewrite_shape';
  END IF;
  v_rewritten:=replace(v_definition,v_old,v_new);
  EXECUTE v_rewritten;
END $v3193_decision_identity_contract$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

DO $v3193_decision_identity_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(function.oid) INTO STRICT v_definition
  FROM pg_proc function
  JOIN pg_namespace namespace ON namespace.oid=function.pronamespace
  JOIN pg_roles owner ON owner.oid=function.proowner
  WHERE namespace.nspname='public'
    AND function.proname='complete_legacy_producer_job_authoritative_v3_19'
    AND pg_get_function_identity_arguments(function.oid)='p_run uuid, p_job uuid, p_token uuid, p_result bytea, p_json jsonb, p_hash text'
    AND function.prosecdef
    AND owner.rolname='opportunity_v3_rpc_owner';
  IF (length(v_definition)-length(replace(v_definition,'''dossierId''','')))
      / length('''dossierId''')<>1
    OR position('jsonb_typeof(v_item#>''{bundle,json,researchDossier}'')' IN v_definition)=0
    OR position('decision_revision_identity_conflict' IN v_definition)=0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3193_decision_identity_contract_unavailable';
  END IF;
  IF has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE') THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3193_decision_identity_owner_create_leaked';
  END IF;
END $v3193_decision_identity_assertions$;

COMMIT;
