BEGIN;

-- V3.20 widened the frozen acquisition matrix to five connectors, but the
-- production authority bootstrap still seeded only the legacy three.  This
-- closed, zero-argument definer writes exactly the reviewed public Telegram
-- and licensed InvestAnchors identities. It is executed by the reviewed
-- migration as the schema owner, then remains non-executable to runtime or
-- public roles. Official data remains a verifier only: it cannot nominate.
CREATE OR REPLACE FUNCTION public.seed_v320_kol_source_authorities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $v320_kol_source_authority_seed$
DECLARE
  v_rows jsonb := $identity$[
    {"id":"712771ff-b763-5045-8f8c-dd6466d6e6c0","platform":"telegram","entityType":"channel","displayName":"股癌","sourceIdentityKey":"v320:telegram:gooaye","profileUrl":"https://t.me/Gooaye","sourceKey":"telegram","sourceClass":"community","distributionIdentity":"telegram:gooaye"},
    {"id":"09d40273-9595-5a1c-8a0c-ee1624745473","platform":"telegram","entityType":"channel","displayName":"定錨投筆","sourceIdentityKey":"v320:telegram:investanchors","profileUrl":"https://t.me/investanchors","sourceKey":"telegram","sourceClass":"community","distributionIdentity":"telegram:investanchors"},
    {"id":"8cddda0f-0143-5df3-98d0-31a525e765fa","platform":"telegram","entityType":"channel","displayName":"John 林睿閔","sourceIdentityKey":"v320:telegram:johnstock888","profileUrl":"https://t.me/johnstock888","sourceKey":"telegram","sourceClass":"community","distributionIdentity":"telegram:johnstock888"},
    {"id":"c6067995-32ee-5886-a56f-067eccac29e4","platform":"investanchors","entityType":"site","displayName":"定錨投筆","sourceIdentityKey":"v320:investanchors:investanchors","profileUrl":"https://investanchors.com","sourceKey":"investanchors","sourceClass":"curated_thesis","distributionIdentity":"investanchors:investanchors"}
  ]$identity$::jsonb;
  v_expected integer := 4;
  v_source_reviewer_principal_id uuid := 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875002'::uuid;
  v_source_reviewer_binding_id uuid := '2ef0a7f8-862c-51a7-837e-f606ff43b59a'::uuid;
  v_source_reviewer_configuration_hash text := 'aa07af55ed6f178ecf811bb6ca8081217a738dffb98b3746055669db0d145356';
BEGIN
  IF jsonb_array_length(v_rows) <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_authority_seed_fixture_conflict';
  END IF;
  IF EXISTS (
    WITH requested AS (SELECT * FROM jsonb_to_recordset(v_rows) AS x(
      id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,
      "sourceKey" text,"sourceClass" text,"distributionIdentity" text))
    SELECT 1 FROM requested r JOIN public.source_entities entity
      ON entity.source_key=r."sourceIdentityKey" OR entity.id=r.id
    WHERE entity.id<>r.id OR entity.source_key<>r."sourceIdentityKey" OR entity.platform<>r.platform
      OR entity.entity_type<>r."entityType" OR entity.display_name<>r."displayName"
      OR entity.profile_url IS DISTINCT FROM r."profileUrl" OR entity.status<>'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_authority_identity_conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.internal_principal_role_bindings_v3 binding
    WHERE binding.binding_id=v_source_reviewer_binding_id
      AND (binding.principal_id<>v_source_reviewer_principal_id OR binding.role<>'source_reviewer'
        OR binding.status<>'active' OR binding.configuration_hash<>v_source_reviewer_configuration_hash)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_reviewer_binding_conflict';
  END IF;
  INSERT INTO public.internal_principal_role_bindings_v3(
    binding_id,principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
  )
  SELECT v_source_reviewer_binding_id,v_source_reviewer_principal_id,'source_reviewer',
    clock_timestamp()-interval '1 second',NULL,'active',v_source_reviewer_configuration_hash,clock_timestamp()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.internal_principal_role_bindings_v3 binding
    WHERE binding.binding_id=v_source_reviewer_binding_id
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.internal_principal_role_bindings_v3 binding
    WHERE binding.binding_id=v_source_reviewer_binding_id
      AND binding.principal_id=v_source_reviewer_principal_id AND binding.role='source_reviewer'
      AND binding.status='active' AND binding.valid_to IS NULL
      AND binding.configuration_hash=v_source_reviewer_configuration_hash
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_reviewer_binding_postcondition_failed';
  END IF;
  INSERT INTO public.source_entities(
    id,platform,entity_type,display_name,source_key,profile_url,status,metadata,created_at,updated_at
  )
  SELECT id,platform,"entityType","displayName","sourceIdentityKey","profileUrl",'active',
    jsonb_build_object('authority','approved-source-roster-v3.20','migration','v320-kol-source-authority'),
    clock_timestamp(),clock_timestamp()
  FROM jsonb_to_recordset(v_rows) AS x(
    id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,
    "sourceKey" text,"sourceClass" text,"distributionIdentity" text)
  ON CONFLICT(source_key) DO NOTHING;
  IF (WITH requested AS (SELECT * FROM jsonb_to_recordset(v_rows) AS x(
      id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,
      "sourceKey" text,"sourceClass" text,"distributionIdentity" text))
    SELECT count(*) FROM requested r JOIN public.source_entities entity
      ON entity.id=r.id AND entity.source_key=r."sourceIdentityKey" AND entity.platform=r.platform
        AND entity.entity_type=r."entityType" AND entity.display_name=r."displayName"
        AND entity.profile_url IS NOT DISTINCT FROM r."profileUrl" AND entity.status='active') <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_authority_identity_postcondition_failed';
  END IF;
  PERFORM appended.authority_id
  FROM (
    WITH requested AS (SELECT * FROM jsonb_to_recordset(v_rows) AS x(
      id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,
      "sourceKey" text,"sourceClass" text,"distributionIdentity" text))
    SELECT r.* FROM requested r WHERE NOT EXISTS (
      SELECT 1 FROM public.source_identity_authorities_v3 authority
      WHERE authority.source_identity_id=r.id AND authority.source_key::text=r."sourceKey"
        AND authority.distribution_identity=r."distributionIdentity" AND authority.status='active'
    )
  ) missing
  CROSS JOIN LATERAL public.append_source_identity_authority_v3(ROW(
    missing.id,missing."sourceKey"::public.source_key_v3,missing."sourceClass"::public.source_class_v3,
    missing."distributionIdentity",'1970-01-01T00:00:00Z'::timestamptz,NULL,'active'::public.authority_status_v3
  )::public.source_identity_authority_input_v3,v_source_reviewer_principal_id) appended;
  IF (WITH requested AS (SELECT * FROM jsonb_to_recordset(v_rows) AS x(
      id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,
      "sourceKey" text,"sourceClass" text,"distributionIdentity" text))
    SELECT count(*) FROM requested r JOIN public.source_identity_authorities_v3 authority
      ON authority.source_identity_id=r.id AND authority.source_key::text=r."sourceKey"
        AND authority.distribution_identity=r."distributionIdentity" AND authority.status='active') <> v_expected THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='v320_kol_source_authority_postcondition_failed';
  END IF;
END;
$v320_kol_source_authority_seed$;

REVOKE ALL ON FUNCTION public.seed_v320_kol_source_authorities() FROM PUBLIC;
DO $v320_kol_source_authority_privileges$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'anon','authenticated','service_role','stockinsider_runtime_v319'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.seed_v320_kol_source_authorities() FROM %I',v_role
      );
    END IF;
  END LOOP;
END;
$v320_kol_source_authority_privileges$;
SELECT public.seed_v320_kol_source_authorities();

COMMIT;
