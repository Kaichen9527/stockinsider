-- Research-extension prelude only; requires the exact reviewed apply authority.
-- No definitions, rows, ACL grants or broad role membership are replaced.
BEGIN;
DO $ownership_bridge$
DECLARE
  v_profile record; v_function record; v_role record; v_actor record;
  v_oid oid; v_owner text; v_signature text;
  v_transfers text[] := ARRAY[]::text[]; v_targets text[] := ARRAY[]::text[];
  v_index integer;
BEGIN
  SELECT rolsuper INTO STRICT v_actor FROM pg_roles WHERE rolname=current_user;
  -- Validate every existing profile before the first owner/CREATE mutation.
  FOR v_profile IN SELECT * FROM (VALUES
    ('public.read_legacy_release_checkpoints_v3_19()', 'legacy_correctness_rpc_owner',
      ARRAY['813934a6a5130d3aaf20ea9b39748427220b156b1a864c105d61f435cd21ed24'],
      'sql','s','jsonb',NULL::text[]),
    ('public.append_legacy_source_shard_v3_19(uuid,uuid,text,jsonb)', 'legacy_correctness_rpc_owner',
      ARRAY['7bd4f4282e2e758f042ad746185f417d3cfe0452afc3261aac656336b3b64ee2'],
      'plpgsql','v','jsonb',ARRAY['p_run','p_completed_source_job','p_source_result_hash','p_selected_rows']),
    ('public.schedule_legacy_source_shard_successor_v3_19(uuid,uuid,uuid,text,integer,uuid)', 'legacy_correctness_rpc_owner',
      ARRAY['4128a1520a08699a38c1d82bd15d266fdc49c21ebdaa18e3a73b467868caed90'],
      'plpgsql','v','jsonb',ARRAY['p_run','p_completed_source_job','p_successor_job','p_source_result_hash','p_first_ordinal','p_first_revision']),
    ('public.append_legacy_expired_producer_diagnostic_v3_20(uuid,uuid,text,text,text,text,text,timestamptz)', 'opportunity_v3_rpc_owner',
      ARRAY['6b6876d60ff3b86f9df9911764cbcb0cca21a790f116de3568402d4439bd690a'],
      'plpgsql','v','void',ARRAY['p_run','p_job','p_stage','p_job_kind','p_input_hash','p_producer_sha','p_diagnostic_hash','p_recorded_at']),
    ('public.complete_legacy_producer_job_authoritative_v3_19(uuid,uuid,uuid,bytea,jsonb,text)', 'opportunity_v3_rpc_owner',
      ARRAY['54da77163f034de3e7c102c755ede6381ee6b78909d242cf2d475432fc33396c',
        '8e70502c44b8ba09c655259ab7259fc20a07a8e0154d586735e6acf272b3f8a3'],
      'plpgsql','v','TABLE(status text, next_job jsonb)',ARRAY['p_run','p_job','p_token','p_result','p_json','p_hash','status','next_job'])
  ) profiles(signature,target_owner,body_hashes,language,volatility,result_type,argument_names)
  LOOP
    v_oid := to_regprocedure(v_profile.signature);
    IF v_oid IS NULL THEN CONTINUE; END IF; -- Fresh installs have no owner drift.
    SELECT p.*,l.lanname,pg_get_function_result(p.oid) AS result_type,
      encode(extensions.digest(convert_to(p.prosrc,'UTF8'),'sha256'),'hex') AS body_hash
    INTO STRICT v_function FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=v_oid;
    v_owner := pg_get_userbyid(v_function.proowner);
    IF v_owner NOT IN ('postgres',v_profile.target_owner)
      OR NOT v_function.body_hash=ANY(v_profile.body_hashes)
      OR v_function.prokind<>'f' OR NOT v_function.prosecdef OR v_function.proisstrict
      OR v_function.proleakproof OR v_function.proparallel<>'u'
      OR v_function.lanname<>v_profile.language OR v_function.provolatile::text<>v_profile.volatility
      OR v_function.result_type<>v_profile.result_type
      OR v_function.proargnames IS DISTINCT FROM v_profile.argument_names
      OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
      RAISE EXCEPTION 'release_owner_bridge_unknown_profile:%',v_profile.signature;
    END IF;
    SELECT * INTO v_role FROM pg_roles WHERE rolname=v_profile.target_owner;
    IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolbypassrls
      OR v_role.rolcreaterole OR v_role.rolcreatedb OR v_role.rolreplication
      OR has_schema_privilege(v_role.oid,'public','CREATE') THEN
      RAISE EXCEPTION 'release_owner_bridge_target_role_invalid:%',v_profile.target_owner;
    END IF;
    -- Unknown/default-public or grantable execution ACLs cannot cross owners.
    IF EXISTS(SELECT 1 FROM aclexplode(coalesce(v_function.proacl,acldefault('f',v_function.proowner))) acl
      WHERE acl.privilege_type<>'EXECUTE' OR acl.is_grantable
        OR acl.grantee=0 OR pg_get_userbyid(acl.grantee) NOT IN
          ('postgres','legacy_correctness_rpc_owner','opportunity_v3_rpc_owner','service_role')) THEN
      RAISE EXCEPTION 'release_owner_bridge_acl_invalid:%',v_profile.signature;
    END IF;
    IF v_owner=v_profile.target_owner THEN CONTINUE; END IF;
    IF NOT v_actor.rolsuper AND (NOT pg_has_role(current_user,v_function.proowner,'USAGE')
      OR NOT pg_has_role(current_user,v_role.oid,'SET')) THEN
      RAISE EXCEPTION 'release_owner_bridge_owner_authority_missing:%',v_profile.signature;
    END IF;
    v_transfers := array_append(v_transfers,v_profile.signature);
    v_targets := array_append(v_targets,v_profile.target_owner);
  END LOOP;
  IF cardinality(v_transfers)=0 THEN RETURN; END IF;
  FOR v_index IN 1..cardinality(v_transfers) LOOP
    v_signature := v_transfers[v_index];
    EXECUTE format('GRANT CREATE ON SCHEMA public TO %I',v_targets[v_index]);
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',v_signature,v_targets[v_index]);
    EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I',v_targets[v_index]);
  END LOOP;
END
$ownership_bridge$;
COMMIT;
