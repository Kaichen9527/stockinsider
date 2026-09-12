-- Keep the validation writer aligned with the restored facts table. The table
-- has always used a checked text status; no financial_validation_status_v3
-- enum exists in the production schema.
BEGIN;

DO $repair$
DECLARE
  v_function regprocedure :=
    'public.record_official_financial_validation(uuid,timestamptz,text,text,jsonb,uuid)'::regprocedure;
  v_definition text;
  v_legacy_cast constant text := '::public.financial_validation_status_v3';
BEGIN
  IF (SELECT columns.udt_schema <> 'pg_catalog' OR columns.udt_name <> 'text'
      FROM information_schema.columns columns
      WHERE columns.table_schema='public'
        AND columns.table_name='opportunity_financial_facts_v3'
        AND columns.column_name='validation_status') IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION 'financial_validation_status_column_contract_mismatch';
  END IF;

  SELECT pg_get_functiondef(v_function) INTO STRICT v_definition;
  IF (length(v_definition)-length(replace(v_definition,v_legacy_cast,'')))
      <> length(v_legacy_cast)
  THEN
    RAISE EXCEPTION 'financial_validation_legacy_cast_contract_mismatch';
  END IF;

  EXECUTE replace(v_definition,v_legacy_cast,'::text');
  IF position(v_legacy_cast IN pg_get_functiondef(v_function))<>0 THEN
    RAISE EXCEPTION 'financial_validation_legacy_cast_repair_failed';
  END IF;
END
$repair$;

-- pg_restore must replay archive ownership. These statements are also a
-- fail-safe for the already-staged cutover database that was restored once
-- with --no-owner before that production restore defect was found.
ALTER FUNCTION public.internal_principal_role_is_exact_v3_internal(
  uuid,public.internal_principal_role_v3,timestamptz
) OWNER TO opportunity_v3_rpc_owner;
ALTER TABLE public.opportunity_financial_facts_v3 OWNER TO opportunity_v3_rpc_owner;
REVOKE ALL ON FUNCTION public.internal_principal_role_is_exact_v3_internal(
  uuid,public.internal_principal_role_v3,timestamptz
) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
