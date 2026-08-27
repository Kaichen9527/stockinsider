-- V3.19.6 production repair: V3.19 compact projections are authoritative
-- evaluation payloads, but the retained V3.14 table constraint only admitted
-- the V3.13/V3.14 schema labels.  Extend that closed allowlist without
-- weakening any decision, provenance, RLS, or action-authority checks.

BEGIN;

GRANT CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;
SET ROLE opportunity_v3_rpc_owner;

ALTER TABLE public.legacy_decision_revision_evaluations_v3_13
  DROP CONSTRAINT IF EXISTS legacy_evaluation_schema_v314_check;
ALTER TABLE public.legacy_decision_revision_evaluations_v3_13
  ADD CONSTRAINT legacy_evaluation_schema_v314_check
  CHECK (source_led_correctness->>'schema' IN (
    'legacy-radar-v3.13.0',
    'legacy-radar-v3.14.0',
    'legacy-radar-v3.17.0',
    'legacy-radar-v3.18.0',
    'legacy-radar-v3.19.0'
  ));

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM opportunity_v3_rpc_owner;

DO $v3196_evaluation_schema_assertions$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(constraint_row.oid)
    INTO STRICT v_definition
  FROM pg_constraint constraint_row
  WHERE constraint_row.conrelid=
      'public.legacy_decision_revision_evaluations_v3_13'::regclass
    AND constraint_row.conname='legacy_evaluation_schema_v314_check'
    AND constraint_row.contype='c';

  IF position('legacy-radar-v3.13.0' IN v_definition)=0
    OR position('legacy-radar-v3.14.0' IN v_definition)=0
    OR position('legacy-radar-v3.17.0' IN v_definition)=0
    OR position('legacy-radar-v3.18.0' IN v_definition)=0
    OR position('legacy-radar-v3.19.0' IN v_definition)=0
    OR has_schema_privilege('opportunity_v3_rpc_owner','public','CREATE') THEN
    RAISE EXCEPTION USING
      ERRCODE='PT409',
      MESSAGE='v3196_evaluation_schema_contract_unavailable';
  END IF;
END
$v3196_evaluation_schema_assertions$;

COMMIT;
