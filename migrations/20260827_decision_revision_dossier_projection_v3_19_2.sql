-- StockInsider V3.19.2 production repair: the landing projection intentionally
-- omits the detail-only research dossier, while the immutable decision revision
-- retains it.  Compare their shared public material without discarding the
-- dossier that the detail route resolves by decisionRevisionId.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;

DO $v3192_projection_dossier_contract$
DECLARE
  v_definition text;
  v_rewritten text;
  v_old text := $old$value#>'{bundle,json}' ORDER BY value->>'decisionRevisionId'$old$;
  v_new text := $new$(value#>'{bundle,json}')-'researchDossier' ORDER BY value->>'decisionRevisionId'$new$;
  v_old_count integer;
  v_new_count integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)'::regprocedure
  ) INTO STRICT v_definition;
  v_old_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  v_new_count := (length(v_definition)-length(replace(v_definition,v_new,'')))/length(v_new);
  IF v_old_count=0
    AND (length(v_definition)-length(replace(v_definition,'''researchDossier''','')))
      / length('''researchDossier''')=1
  THEN RETURN;END IF;
  IF v_old_count<>1 OR v_new_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3192_projection_dossier_rewrite_shape';
  END IF;
  v_rewritten:=replace(v_definition,v_old,v_new);
  EXECUTE v_rewritten;
END $v3192_projection_dossier_contract$;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

DO $v3192_projection_dossier_assertions$
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
  IF (length(v_definition)-length(replace(v_definition,'''researchDossier''','')))
      / length('''researchDossier''')<>1
    OR position('value#>''{bundle,json}''ORDERBY' IN replace(v_definition,' ',''))>0 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3192_projection_dossier_contract_unavailable';
  END IF;
  IF has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE') THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v3192_projection_dossier_owner_create_leaked';
  END IF;
END $v3192_projection_dossier_assertions$;

COMMIT;
