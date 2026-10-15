BEGIN;
-- Uninstalled SOURCE-ONLY candidate, exact LOCAL captured50+26+protocol36+two-owner
-- USAGE successor. No new function/table/role/grant and no production activation.
-- Uses the existing sealed complete namespace/catalog hashes without normalization
-- or exceptions. Actual OIDs are captured in-transaction, never invented.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $author_union$
DECLARE catalog jsonb; before_catalog jsonb; namespace_before jsonb; namespace_now jsonb;
 item jsonb; normalized jsonb; identity_before jsonb; identity_now jsonb; source text;
 defaults_before jsonb; defaults_after jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'author_union_read_committed_required';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) THEN RAISE EXCEPTION 'author_union_busy';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(namespace_now),'UTF8')),'hex') IS DISTINCT FROM 'cb22ccfeb504b6fd82cc1af0d954fe220427d562120dd6089fc9accb9bffd29f' THEN RAISE EXCEPTION 'author_union_predecessor_namespace';END IF;
 namespace_before:=namespace_now;
 SELECT jsonb_build_object(
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
        CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
        FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x),'[]'::jsonb),
      'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,
        'default',pg_get_expr(d.adbin,d.adrelid),'collation',a.attcollation::regcollation::text,
        'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
          CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
          x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
          FROM aclexplode(a.attacl) x),'[]'::jsonb)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',k.conname,
        'type',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,
        'deferred',k.condeferred,'definition',pg_get_constraintdef(k.oid,true)) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
      'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.indexrelid::regclass::text,
        'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid))
        ORDER BY i.indexrelid::regclass::text) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
      'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,
        'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(
          CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r::regrole::text)
          FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),
        'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
      'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,
        'enabled',t.tgenabled,'type',t.tgtype,'function',t.tgfoid::regprocedure::text,
        'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname)
        FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
      'effectiveAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,priv,
        has_table_privilege(r,c.oid,priv),has_any_column_privilege(r,c.oid,priv)) ORDER BY r,priv)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb),
      'effectiveOtherAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,priv,
        has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r CROSS JOIN unnest(ARRAY['DELETE','TRUNCATE','TRIGGER']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
    ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY((SELECT array_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace))),'[]'::jsonb),
    'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.proname,
      'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
      'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,
      'leakproof',p.proleakproof,'config',p.proconfig,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
        CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
        FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x),'[]'::jsonb),
      'effectiveAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
      ) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY((SELECT array_agg(DISTINCT proname ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace)) AND p.prokind='f'),'[]'::jsonb),
    'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
      'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
      'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connectionLimit',r.rolconnlimit,'config',r.rolconfig,
      'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
        pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
        ORDER BY m.roleid::regrole::text,m.member::regrole::text,m.grantor::regrole::text)
        FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),'[]'::jsonb)) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname=ANY((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_'))),'[]'::jsonb),
    'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,
      'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),
      'notNull',t.typnotnull,'default',t.typdefault,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) x),'[]'::jsonb),
      'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'labels',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),'[]'::jsonb)) ORDER BY t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY((SELECT array_agg(typname ORDER BY typname) FROM pg_type WHERE typnamespace='public'::regnamespace)) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND EXISTS(SELECT FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c')))),'[]'::jsonb),
    'schemas',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',n.nspname,
      'owner',pg_get_userbyid(n.nspowner),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x),'[]'::jsonb),'effectiveAcl',(SELECT jsonb_agg(jsonb_build_array(r,
        has_schema_privilege(r,n.oid,'USAGE'),has_schema_privilege(r,n.oid,'CREATE')) ORDER BY r)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r))) ORDER BY n.nspname)
      FROM pg_namespace n WHERE n.nspname IN ('public','extensions','auth')),'[]'::jsonb)
  ) INTO catalog;
 
 normalized:='[]'::jsonb;
 FOR item IN SELECT value FROM jsonb_array_elements(catalog->'functions') LOOP
  normalized:=normalized||jsonb_build_array((item-'definition')||jsonb_build_object('definitionSha256',encode(sha256(convert_to(item->>'definition','UTF8')),'hex')));
 END LOOP;
 catalog:=jsonb_set(catalog,'{functions}',normalized);

 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(catalog),'UTF8')),'hex') IS DISTINCT FROM '4afc6fe90ae3d65acbc3858003695fc9b3c9c4122ef129f92ae174f0ea6bf9e4' THEN RAISE EXCEPTION 'author_union_predecessor_catalog';END IF;
 before_catalog:=catalog;
 SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 identity_before:=identity_now;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_before FROM pg_default_acl d;
 -- The new owner was created after the captured schema: no owner-specific
 -- default ACL exists in that original DDL. No default privilege is used here.
 IF EXISTS(SELECT FROM pg_default_acl WHERE defaclrole='research_input_preparation_owner_v2'::regrole) THEN RAISE EXCEPTION 'author_union_unknown_owner_default_acl';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.research_author_assignment_context_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '4d95cd7f2e7b019f7afc7faece96faa5b45182a28732e6d5d3eb54b7a3b813e5' THEN RAISE EXCEPTION 'author_union_predecessor_body:research_author_assignment_context_v2';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_packet_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM 'aab28c28adb8ff5fb725acc1a53d44058a04ff66d456a92310b21dc3ed4751fc' THEN RAISE EXCEPTION 'author_union_predecessor_body:read_research_author_packet_v2';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_result_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '2d821365f7ce9ac22e7c2992c64baf916ded4ece58fc44e413d71f3dcd702b4d' THEN RAISE EXCEPTION 'author_union_predecessor_body:read_research_author_result_v2';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.receive_research_author_result_v2(jsonb,uuid,text,text,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '7cd8d5a20f2f4d2420790b4a46c28c1d9ece5920177c0a02807fdf3f45d9d297' THEN RAISE EXCEPTION 'author_union_predecessor_body:receive_research_author_result_v2';END IF;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.research_author_assignment_context_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE revision jsonb; payload jsonb; j public.research_deep_jobs_v1;
 r public.research_model_reservations_v1; n timestamptz;
BEGIN
 IF p_revision_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
  OR p_principal IS NULL OR p_principal !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'research_author_assignment_identity_invalid'; END IF;
 -- This retains the source-fence then global-deep locks across admission/read.
 IF p_request->>'expectedCalculatorExecutionHash'='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41' THEN
  revision:=public.read_research_article_input_revision_v2(p_request);
 ELSE
  -- Exact retained selector, including compat-v2; errors NEVER fall back.
  revision:=public.read_research_article_input_candidate_v3(p_request);
  IF revision->'binding'->>'bindingCapsuleIdentity' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash'
   OR revision->'binding'->'core'->>'inventoryHash' IS DISTINCT FROM p_request->>'expectedArtifactManifestHash'
   OR revision->'binding'->'core'->>'wireVersion' IS DISTINCT FROM revision->'canonical_payload'->>'schemaVersion'
   THEN RAISE EXCEPTION 'research_author_union_binding'; END IF;
 END IF;
 payload:=revision->'canonical_payload';
 IF revision->>'status' IS DISTINCT FROM 'sealed'
  OR revision->>'revision_id' IS DISTINCT FROM p_revision_id::text
  OR revision->>'input_hash' IS DISTINCT FROM p_input_hash
  OR revision->'canonical_request' IS DISTINCT FROM p_request
  OR payload IS NULL OR public.research_complete_hash_v2(payload) IS DISTINCT FROM p_input_hash
  OR NOT (payload->>'schemaVersion'='research-article-input-v2' OR
   (payload->>'schemaVersion'='research-article-input-v3' AND revision->'binding'->'core'->>'wireVersion'='research-article-input-v3'
    AND revision->'binding'->'core'->>'financialProfile'='oct14_historical_cash_v1'))
  OR payload->'capabilities' IS DISTINCT FROM jsonb_build_object(
   'financialVerified',false,'dispatchReady',false,'modelDispatched',false,'publishableResearch',false,
   'researchQualified',false,'strategyApproved',false,'entryEligible',false,'historicalPITEligible',false)
  THEN RAISE EXCEPTION 'research_author_assignment_input_invalid'; END IF;
 SELECT * INTO j FROM public.research_deep_jobs_v1 WHERE job_id=(p_request->>'jobId')::uuid FOR SHARE;
 SELECT * INTO r FROM public.research_model_reservations_v1 WHERE reservation_id=(p_request->>'reservationId')::uuid FOR SHARE;
 n:=clock_timestamp();
 IF j.job_id IS NULL OR r.reservation_id IS NULL
  OR j.research_scope IS DISTINCT FROM 'research_observed_v1' OR j.status IS DISTINCT FROM 'running'
  OR j.attempts IS DISTINCT FROM (p_request->>'attempt')::integer OR j.lease_owner IS DISTINCT FROM p_request->>'owner'
  OR j.observed_snapshot_hash IS DISTINCT FROM p_request->>'snapshotHash'
  OR r.owner IS DISTINCT FROM j.lease_owner OR r.role IS DISTINCT FROM 'company_research'
  OR r.work_key IS DISTINCT FROM 'deep:'||j.job_id||':'||j.attempts
  OR NOT isfinite(r.started_at) OR r.started_at>n OR r.started_at IS NULL
  OR r.lease_expires_at IS NULL OR NOT isfinite(r.lease_expires_at) OR r.lease_expires_at<=n
  OR r.lease_expires_at>r.started_at+interval '30 minutes'
  OR j.lease_expires_at IS NULL OR NOT isfinite(j.lease_expires_at) OR j.lease_expires_at<=n
  OR EXISTS(SELECT FROM public.research_model_completions_v1 WHERE reservation_id=r.reservation_id)
  OR revision->>'job_id' IS DISTINCT FROM j.job_id::text
  OR revision->>'attempt' IS DISTINCT FROM j.attempts::text
  OR revision->>'reservation_id' IS DISTINCT FROM r.reservation_id::text
  OR revision->>'research_company_id' IS DISTINCT FROM j.research_company_id::text
  OR revision->>'research_scope' IS DISTINCT FROM j.research_scope
  OR revision->>'snapshot_hash' IS DISTINCT FROM j.observed_snapshot_hash
  OR payload->'originalJob' IS DISTINCT FROM jsonb_build_object(
   'jobId',j.job_id,'attempt',j.attempts,'owner',j.lease_owner,'leaseExpiresAt',j.lease_expires_at)
  OR payload->'originalReservation' IS DISTINCT FROM jsonb_build_object(
   'reservationId',r.reservation_id,'startedAt',r.started_at,'leaseExpiresAt',r.lease_expires_at)
  OR payload->'researchIdentity'->>'researchCompanyId' IS DISTINCT FROM j.research_company_id::text
  OR payload->'researchIdentity'->>'symbol' IS DISTINCT FROM j.symbol
  OR payload->'researchIdentity'->>'scope' IS DISTINCT FROM j.research_scope
  OR payload->'researchIdentity'->>'snapshotHash' IS DISTINCT FROM j.observed_snapshot_hash
  THEN RAISE EXCEPTION 'research_author_assignment_original_fence_lost'; END IF;
 RETURN revision;
END $$;$replacement$;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.read_research_author_packet_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; revision jsonb; payload jsonb; seal public.research_source_seals_v2;
 item jsonb; doc jsonb; m jsonb; descriptor jsonb; sources jsonb:='[]'; result jsonb;
 observed timestamptz; collected timestamptz; cutoff timestamptz; symbol text;
BEGIN
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_packet_assignment_missing'; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 payload:=revision->'canonical_payload';symbol:=payload->'researchIdentity'->>'symbol';
 cutoff:=(payload->'clocks'->>'researchCutoff')::timestamptz;
 IF cutoff IS NULL OR NOT isfinite(cutoff) OR cutoff>clock_timestamp()
  OR jsonb_typeof(payload->'sources'->'manifest') IS DISTINCT FROM 'array'
  OR jsonb_array_length(payload->'sources'->'manifest')>30 THEN
  RAISE EXCEPTION 'research_author_packet_source_shape'; END IF;
 IF jsonb_array_length(payload->'sources'->'manifest')>0 THEN
  SELECT * INTO seal FROM public.research_source_seals_v2
   WHERE seal_id=(payload->'sources'->>'sealId')::uuid;
  IF seal.seal_id IS NULL OR seal.received_at IS NULL OR NOT isfinite(seal.received_at)
   OR seal.received_at>cutoff OR seal.documents IS DISTINCT FROM payload->'sources'->'manifest'
   THEN RAISE EXCEPTION 'research_author_packet_seal_clock'; END IF;
 END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(payload->'sources'->'manifest') x ORDER BY x->>'id' LOOP
  SELECT to_jsonb(d) INTO doc FROM public.source_raw_documents d WHERE id=(item->>'id')::uuid;
  IF doc IS NULL OR encode(sha256(convert_to(doc::text,'UTF8')),'hex') IS DISTINCT FROM item->>'rowHash'
   THEN RAISE EXCEPTION 'research_author_packet_source_changed'; END IF;
  m:=doc->'metadata';
  IF m->>'rights_boundary' IS DISTINCT FROM 'public_citation' OR m->>'visibility' IS DISTINCT FROM 'public'
   OR m->>'subject_scope' IS NULL OR m->>'subject_scope' NOT IN ('company_mentions','industry_context')
   OR jsonb_typeof(doc->'symbols') IS DISTINCT FROM 'array'
   OR jsonb_array_length(doc->'symbols')>50
   OR EXISTS(SELECT FROM jsonb_array_elements(doc->'symbols') x
    WHERE jsonb_typeof(x)<>'string' OR (x#>>'{}')!~'^[0-9]{4}$')
   OR (m->>'subject_scope'='company_mentions' AND NOT(doc->'symbols' @> jsonb_build_array(symbol)))
   OR (m->>'subject_scope'='industry_context' AND doc->'symbols'<>'[]'::jsonb)
   OR NULLIF(m->>'retracted_at','') IS NOT NULL OR m->>'withdrawn'='true'
   OR m->>'claim_status' IS NULL OR m->>'claim_status' NOT IN ('rumor','reported','confirmed')
   THEN RAISE EXCEPTION 'research_author_packet_source_rights_or_scope'; END IF;
  IF jsonb_typeof(doc->'title') IS DISTINCT FROM 'string' OR octet_length(doc->>'title') NOT BETWEEN 1 AND 512
   OR jsonb_typeof(doc->'summary') IS DISTINCT FROM 'string' OR octet_length(doc->>'summary') NOT BETWEEN 1 AND 4096
   OR jsonb_typeof(m->'catalyst') IS DISTINCT FROM 'string' OR octet_length(m->>'catalyst') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(m->'risk') IS DISTINCT FROM 'string' OR octet_length(m->>'risk') NOT BETWEEN 1 AND 2048
   OR jsonb_typeof(doc->'platform') IS DISTINCT FROM 'string' OR octet_length(doc->>'platform') NOT BETWEEN 1 AND 80
   OR jsonb_typeof(m->'canonical_url') IS DISTINCT FROM 'string' OR octet_length(m->>'canonical_url') NOT BETWEEN 1 AND 800
   OR jsonb_typeof(m->'first_observed_at') IS DISTINCT FROM 'string' OR octet_length(m->>'first_observed_at') NOT BETWEEN 1 AND 100
   THEN RAISE EXCEPTION 'research_author_packet_content_bound'; END IF;
  observed:=(m->>'first_observed_at')::timestamptz;collected:=(doc->>'collected_at')::timestamptz;
  IF observed IS NULL OR collected IS NULL OR NOT isfinite(observed) OR NOT isfinite(collected)
   OR observed>collected OR collected>seal.received_at
   OR (doc->>'published_at')::timestamptz>observed
   OR ((doc->>'published_at') IS NOT NULL AND NOT isfinite((doc->>'published_at')::timestamptz))
   THEN RAISE EXCEPTION 'research_author_packet_source_clock'; END IF;
  descriptor:=jsonb_build_object('id',item->'id','rowHash',item->'rowHash','url',m->'canonical_url',
   'observedAt',m->'first_observed_at','admittedAt',seal.received_at,
   'publication',jsonb_build_object('precision','unknown','raw',NULL,'timezone',NULL,'instant',NULL),
   'scope',m->'subject_scope','symbols',doc->'symbols','rights','public_summary_only','retracted',false,'superseded',false);
  sources:=sources||jsonb_build_array(jsonb_build_object('descriptor',descriptor,
   'title',doc->'title','summary',doc->'summary','catalyst',m->'catalyst','risk',m->'risk',
   'platform',doc->'platform','sourceClaimStatus',m->'claim_status','collectedAt',doc->'collected_at',
   'unverifiedPublicationClaim',doc->'published_at','untrustedEvidence',true));
  IF octet_length(sources::text)>307200 THEN RAISE EXCEPTION 'research_author_packet_sources_bound'; END IF;
 END LOOP;
 -- Original source -> deep locks still held. No renewal on read or replay.
 IF public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal) IS DISTINCT FROM a
  THEN RAISE EXCEPTION 'research_author_packet_assignment_changed'; END IF;
 result:=jsonb_build_object('assignment',a-'controller_principal'-'canonical_request',
  'inputRevisionId',p_revision_id,'inputHash',p_input_hash,'sourceSealReceivedAt',seal.received_at,'sources',sources);
 IF payload->>'schemaVersion'='research-article-input-v3' THEN
  result:=result||jsonb_build_object('wireVersion','research-article-input-v3','bindingCapsuleIdentity',revision->'binding'->>'bindingCapsuleIdentity');
 END IF;
 IF octet_length(result::text)>1048576 THEN RAISE EXCEPTION 'research_author_packet_response_bound'; END IF;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
  THEN RAISE EXCEPTION 'research_author_packet_expired'; END IF;
 RETURN result;
END $$;$replacement$;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.read_research_author_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; revision jsonb; saved public.research_author_results_v2;
BEGIN
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_result_assignment_missing'; END IF;
 SELECT * INTO saved FROM public.research_author_results_v2 WHERE assignment_id=(a->>'assignment_id')::uuid;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_expired'; END IF;
 IF p_request->>'expectedCalculatorExecutionHash'<>'77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41' THEN
  revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
  IF saved.payload->>'schemaVersion' IS DISTINCT FROM CASE revision->'canonical_payload'->>'schemaVersion'
    WHEN 'research-article-input-v3' THEN 'research-author-result-v3-candidate'
    WHEN 'research-article-input-v2' THEN 'research-author-result-v2' END
   THEN RAISE EXCEPTION 'research_author_result_stored_version';END IF;
 END IF;
 IF saved.payload->>'schemaVersion'='research-author-result-v3-candidate' THEN
  IF saved.payload->>'assignmentId' IS DISTINCT FROM a->>'assignment_id'
   OR saved.payload->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR saved.payload->>'inputHash' IS DISTINCT FROM p_input_hash
   OR saved.payload->>'bindingCapsuleIdentity' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash'
   OR saved.result_hash IS DISTINCT FROM public.research_complete_hash_v2(saved.payload)
   OR saved.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(saved.payload),'UTF8'))
   THEN RAISE EXCEPTION 'research_author_result_stored_union'; END IF;
 END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;$replacement$;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.receive_research_author_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text,p_result jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; revision jsonb; old jsonb; saved public.research_author_results_v2;
 o jsonb; v jsonb; article jsonb; packet jsonb; bytes integer; n timestamptz; started timestamptz; ended timestamptz; authored timestamptz;
BEGIN
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF revision->'canonical_payload'->>'schemaVersion'='research-article-input-v3' THEN
 -- Existing live context acquires source then global-deep locks, and holds both.
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_result_assignment_missing'; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object'
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
   IS DISTINCT FROM ARRAY['assignmentId','bindingCapsuleIdentity','financialProfile','inputHash','inputRevisionId','observation','rawArticle','schemaVersion','validatedArticle','validatorVersion','wireVersion']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-author-result-v3-candidate'
  OR p_result->>'assignmentId' IS DISTINCT FROM a->>'assignment_id'
  OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_author_result_bound'; END IF;
 o:=p_result->'observation';v:=p_result->'validatedArticle';article:=p_result->'rawArticle';
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(article) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 packet:=public.read_research_author_packet_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) IS DISTINCT FROM
  ARRAY['article','articleHash','bindingCapsuleIdentity','calculation','calculatorExecutionHash','citationContext','dispatchReady','entryEligible','financialProfile','financialVerified','forecastCash','historicalPITEligible','inputHash','inputRevisionId','limitations','modelDispatched','noFutureCash','originalModelCutoff','publishableResearch','researchCutoff','researchQualified','schemaVersion','sourceClosureApproved','sourceClosureHash','sources','strategyApproved','tables','technicalAdmission','validationStatus','validatorVersion','valuationApproved','valuations','wireDispatchEnabled','wireVersion']
  OR v->'calculation' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'calculation'
  OR v->>'sourceClosureHash' IS DISTINCT FROM revision->'canonical_payload'->'hashes'->>'sourceClosureHash'
  OR v->'sources' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->'descriptor' ORDER BY x->'descriptor'->>'id'),'[]'::jsonb) FROM jsonb_array_elements(packet->'sources') x)
 THEN RAISE EXCEPTION 'research_author_result_validated_context'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2'
  OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation' OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat'
  OR o->>'assignmentId' IS DISTINCT FROM a->>'assignment_id' OR o->>'jobId' IS DISTINCT FROM a->>'job_id'
  OR o->'attempt' IS DISTINCT FROM a->'attempt' OR o->>'reservationId' IS DISTINCT FROM a->>'reservation_id'
  OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR o->>'inputHash' IS DISTINCT FROM p_input_hash
  OR o->'reviewPackHash' IS DISTINCT FROM 'null'::jsonb
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string'
  OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(o->'dispatchObservationHash') IS DISTINCT FROM 'string'
  OR jsonb_typeof(o->'completionObservationHash') IS DISTINCT FROM 'string'
  OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$' OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]'
    OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
  OR v->>'schemaVersion' IS DISTINCT FROM 'validated-business-article-v3-candidate'
  OR v->>'validatorVersion' IS DISTINCT FROM 'business-article-cash-contract-v3.1'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only'
  OR v->'article' IS DISTINCT FROM article OR v->>'articleHash' IS DISTINCT FROM public.research_complete_hash_v2(v-'articleHash')
  OR o->>'articleHash' IS DISTINCT FROM v->>'articleHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(article)
  OR article->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR article->>'inputHash' IS DISTINCT FROM p_input_hash
  OR article->>'researchCompanyId' IS DISTINCT FROM a->>'research_company_id'
  OR article->>'symbol' IS DISTINCT FROM revision->'canonical_payload'->'researchIdentity'->>'symbol'
  OR article->>'evidenceCutoffAt' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'researchCutoff'
  OR v->'financialVerified' IS DISTINCT FROM 'false'::jsonb OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb
  OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb
  OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_author_result_binding'; END IF;

 -- Closed v3 envelope, exact retained binding and source snapshot; no caller flag.
 IF p_result->>'bindingCapsuleIdentity' IS DISTINCT FROM revision->'binding'->>'bindingCapsuleIdentity'
 OR p_result->>'wireVersion' IS DISTINCT FROM 'research-article-input-v3'
 OR p_result->>'financialProfile' IS DISTINCT FROM 'oct14_historical_cash_v1'
 OR p_result->>'validatorVersion' IS DISTINCT FROM 'business-article-cash-contract-v3.1'
 OR v->>'bindingCapsuleIdentity' IS DISTINCT FROM p_result->>'bindingCapsuleIdentity'
 OR v->>'wireVersion' IS DISTINCT FROM p_result->>'wireVersion'
 OR v->>'financialProfile' IS DISTINCT FROM p_result->>'financialProfile'
 OR v->>'validatorVersion' IS DISTINCT FROM p_result->>'validatorVersion'
 OR v->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR v->>'inputHash' IS DISTINCT FROM p_input_hash
 OR v->>'originalModelCutoff' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'originalModelCutoff'
 OR v->>'researchCutoff' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'researchCutoff'
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(article) key) IS DISTINCT FROM
 ARRAY['authoredAt','businessModel','catalysts','companyBackground','evidenceCutoffAt','inputHash','inputRevisionId','researchCompanyId','schemaVersion','sections','summary','symbol','tables','valuation']
 OR article->>'schemaVersion' IS DISTINCT FROM 'candidate-deep-research-v3'
 OR article->>'businessModel' IS DISTINCT FROM 'business_scenarios_cash_v3'
 OR octet_length(article::text)>262144
 OR jsonb_array_length(article->'sections') IS DISTINCT FROM 7
 OR (SELECT jsonb_agg(x->'key' ORDER BY ord) FROM jsonb_array_elements(article->'sections') WITH ORDINALITY e(x,ord)) IS DISTINCT FROM
 '["market_expectation","industry_position","rumors_and_orders","earnings_transmission","valuation","entry_conditions","next_evidence"]'::jsonb
 OR v->'forecastCash' IS DISTINCT FROM 'null'::jsonb OR v->'noFutureCash' IS DISTINCT FROM 'true'::jsonb
 OR EXISTS(SELECT FROM unnest(ARRAY['dispatchReady','modelDispatched','historicalPITEligible','sourceClosureApproved','wireDispatchEnabled','valuationApproved','technicalAdmission']) k WHERE v->k IS DISTINCT FROM 'false'::jsonb)
 OR EXISTS(SELECT FROM jsonb_array_elements(v->'valuations') x WHERE x->'targetPrice' IS DISTINCT FROM 'null'::jsonb)
 THEN RAISE EXCEPTION 'research_author_result_v3_context'; END IF;
 -- Source material was schema-checked by the exact retained input READ.
 -- The trusted server validator recomputes financial and article tables before
 -- receive AND read recovery; SQL binds that complete validated payload below.
 IF v->'calculation' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'calculation'
 OR v->'citationContext'->>'schemaVersion' IS DISTINCT FROM 'research-v3-cash-citation-context-candidate-v1'
 OR v->'citationContext'->>'financialProfile' IS DISTINCT FROM 'oct14_historical_cash_v1'
 OR v->'citationContext'->>'wireVersion' IS DISTINCT FROM 'research-article-input-v3'
 OR v->'citationContext'->>'originalModelCutoff' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'originalModelCutoff'
 OR v->'citationContext'->>'extractionAvailableAt' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'projection'->'historicalCash'->>'extractionAvailableAt'
 OR v->'citationContext'->'noFutureCash' IS DISTINCT FROM 'true'::jsonb
 OR v->'citationContext'->'forecastCash' IS DISTINCT FROM 'null'::jsonb
 OR v->'citationContext'->'capitalAvailable' IS DISTINCT FROM to_jsonb(article->>'symbol'='2409')
 OR v->'citationContext'->'capitalUnavailableReason' IS DISTINCT FROM CASE WHEN article->>'symbol'='2383' THEN to_jsonb('no_retained_EMC_capital_tuple'::text) ELSE 'null'::jsonb END
 OR v->'citationContext'->'unavailableAmounts' IS DISTINCT FROM CASE WHEN article->>'symbol'='2409' THEN '["/cash/derived/rouCashAcquisitionSeparate/0","/cash/derived/rouCashAcquisitionSeparate/1"]'::jsonb ELSE '[]'::jsonb END
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v->'citationContext') key) IS DISTINCT FROM
 ARRAY['artifactReadKnownAt','authorReviewerVerified','bindingCapsuleIdentity','capitalAvailable','capitalUnavailableReason','compiledFingerprintIdentity','dispatchReady','extractionAvailableAt','financialProfile','forecastCash','formalRightsVerified','inputHash','inputRevisionId','noFutureCash','originalCapabilities','originalModelCutoff','publishableResearch','qualification','requestHash','schemaVersion','sourceClosureApproved','sourceExecutionHash','symbol','technicalAdmission','unavailableAmounts','valuationApproved','wireVersion']
 THEN RAISE EXCEPTION 'research_author_result_v3_material'; END IF;
 -- Context is the immutable READ result, not a permission or reusable lease.
 IF v->'citationContext'->>'bindingCapsuleIdentity' IS DISTINCT FROM p_result->>'bindingCapsuleIdentity'
 OR v->'citationContext'->>'requestHash' IS DISTINCT FROM public.research_complete_hash_v2(p_request)
 OR v->'citationContext'->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
 OR v->'citationContext'->>'inputHash' IS DISTINCT FROM p_input_hash
 OR v->'citationContext'->>'symbol' IS DISTINCT FROM article->>'symbol'
 OR v->'citationContext'->>'sourceExecutionHash' IS DISTINCT FROM revision->'binding'->'core'->>'sourceExecutionHash'
 OR v->'citationContext'->>'compiledFingerprintIdentity' IS DISTINCT FROM revision->'binding'->'core'->>'compiledFingerprintIdentity'
 OR v->'citationContext'->>'artifactReadKnownAt' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'artifactReadKnownAt'
 OR v->'citationContext'->'qualification' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'provenance'
 OR v->'citationContext'->'originalCapabilities' IS DISTINCT FROM revision->'canonical_payload'->'capabilities'
 OR EXISTS(SELECT FROM unnest(ARRAY['valuationApproved','technicalAdmission','sourceClosureApproved','formalRightsVerified','authorReviewerVerified','publishableResearch','dispatchReady']) k WHERE v->'citationContext'->k IS DISTINCT FROM 'false'::jsonb)
 THEN RAISE EXCEPTION 'research_author_result_v3_citation_context'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz; ended:=(o->>'controllerObservedEndAt')::timestamptz;
 authored:=(article->>'authoredAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR authored IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(authored)
  OR started<(a->>'assigned_at')::timestamptz OR started<(revision->'canonical_payload'->'clocks'->>'researchCutoff')::timestamptz
  OR ended<started OR authored<started OR authored>ended OR ended>n
  OR n>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_clock'; END IF;
 old:=public.read_research_author_result_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF old IS NOT NULL THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_author_result_replay_conflict'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_author_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((a->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
 END IF;
 -- Original v2 arm below, unchanged bytes.
 -- Existing live context acquires source then global-deep locks, and holds both.
 a:=public.read_research_author_assignment_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF a IS NULL THEN RAISE EXCEPTION 'research_author_result_assignment_missing'; END IF;
 revision:=public.research_author_assignment_context_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object'
  OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
   IS DISTINCT FROM ARRAY['assignmentId','inputHash','inputRevisionId','observation','rawArticle','schemaVersion','validatedArticle']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-author-result-v2'
  OR p_result->>'assignmentId' IS DISTINCT FROM a->>'assignment_id'
  OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_author_result_bound'; END IF;
 o:=p_result->'observation';v:=p_result->'validatedArticle';article:=p_result->'rawArticle';
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(article) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'research_author_result_shape'; END IF;
 packet:=public.read_research_author_packet_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(v) key) IS DISTINCT FROM
  ARRAY['article','articleHash','calculation','calculatorExecutionHash','entryEligible','financialVerified','limitations','originalModelCutoff',
   'publishableResearch','researchCutoff','researchQualified','schemaVersion','sourceClosureHash','sources','strategyApproved','tables','validationStatus','validatorVersion','valuations']
  OR v->'calculation' IS DISTINCT FROM revision->'canonical_payload'->'financial'->'material'->'calculation'
  OR v->>'sourceClosureHash' IS DISTINCT FROM revision->'canonical_payload'->'hashes'->>'sourceClosureHash'
  OR v->'sources' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x->'descriptor' ORDER BY x->'descriptor'->>'id'),'[]'::jsonb) FROM jsonb_array_elements(packet->'sources') x)
 THEN RAISE EXCEPTION 'research_author_result_validated_context'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2'
  OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation' OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat'
  OR o->>'assignmentId' IS DISTINCT FROM a->>'assignment_id' OR o->>'jobId' IS DISTINCT FROM a->>'job_id'
  OR o->'attempt' IS DISTINCT FROM a->'attempt' OR o->>'reservationId' IS DISTINCT FROM a->>'reservation_id'
  OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR o->>'inputHash' IS DISTINCT FROM p_input_hash
  OR o->'reviewPackHash' IS DISTINCT FROM 'null'::jsonb
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string'
  OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(o->'dispatchObservationHash') IS DISTINCT FROM 'string'
  OR jsonb_typeof(o->'completionObservationHash') IS DISTINCT FROM 'string'
  OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$' OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]'
    OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
  OR v->>'schemaVersion' IS DISTINCT FROM 'validated-business-article-v2'
  OR v->>'validatorVersion' IS DISTINCT FROM 'business-article-contract-v2.1'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only'
  OR v->'article' IS DISTINCT FROM article OR v->>'articleHash' IS DISTINCT FROM public.research_complete_hash_v2(v-'articleHash')
  OR o->>'articleHash' IS DISTINCT FROM v->>'articleHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(article)
  OR article->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR article->>'inputHash' IS DISTINCT FROM p_input_hash
  OR article->>'researchCompanyId' IS DISTINCT FROM a->>'research_company_id'
  OR article->>'symbol' IS DISTINCT FROM revision->'canonical_payload'->'researchIdentity'->>'symbol'
  OR article->>'evidenceCutoffAt' IS DISTINCT FROM revision->'canonical_payload'->'clocks'->>'researchCutoff'
  OR v->'financialVerified' IS DISTINCT FROM 'false'::jsonb OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb
  OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb
  OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_author_result_binding'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz; ended:=(o->>'controllerObservedEndAt')::timestamptz;
 authored:=(article->>'authoredAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR authored IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(authored)
  OR started<(a->>'assigned_at')::timestamptz OR started<(revision->'canonical_payload'->'clocks'->>'researchCutoff')::timestamptz
  OR ended<started OR authored<started OR authored>ended OR ended>n
  OR n>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_clock'; END IF;
 old:=public.read_research_author_result_v2(p_request,p_revision_id,p_input_hash,p_principal);
 IF old IS NOT NULL THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_author_result_replay_conflict'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_author_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((a->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 IF clock_timestamp()>=least((a->>'original_job_deadline')::timestamptz,(a->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_author_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;$replacement$;
SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 IF identity_now IS DISTINCT FROM identity_before THEN RAISE EXCEPTION 'author_union_function_identity_changed';END IF;
SELECT jsonb_build_object(
    'tables', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
      'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
        CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
        FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x),'[]'::jsonb),
      'columns',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,
        'default',pg_get_expr(d.adbin,d.adrelid),'collation',a.attcollation::regcollation::text,
        'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
          CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
          x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
          FROM aclexplode(a.attacl) x),'[]'::jsonb)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',k.conname,
        'type',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,
        'deferred',k.condeferred,'definition',pg_get_constraintdef(k.oid,true)) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'::jsonb),
      'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',i.indexrelid::regclass::text,
        'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid))
        ORDER BY i.indexrelid::regclass::text) FROM pg_index i WHERE i.indrelid=c.oid),'[]'::jsonb),
      'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,
        'command',p.polcmd,'permissive',p.polpermissive,'roles',(SELECT jsonb_agg(
          CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END ORDER BY r::regrole::text)
          FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),
        'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb),
      'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,
        'enabled',t.tgenabled,'type',t.tgtype,'function',t.tgfoid::regprocedure::text,
        'definition',pg_get_triggerdef(t.oid,true)) ORDER BY t.tgname)
        FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'::jsonb),
      'effectiveAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,priv,
        has_table_privilege(r,c.oid,priv),has_any_column_privilege(r,c.oid,priv)) ORDER BY r,priv)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb),
      'effectiveOtherAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,priv,
        has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r CROSS JOIN unnest(ARRAY['DELETE','TRUNCATE','TRIGGER']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
    ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY((SELECT array_agg(relname ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace))),'[]'::jsonb),
    'functions',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.proname,
      'signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
      'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,
      'volatile',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,
      'leakproof',p.proleakproof,'config',p.proconfig,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),
        CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type)
        FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x),'[]'::jsonb),
      'effectiveAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) ORDER BY r)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
      ) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY((SELECT array_agg(DISTINCT proname ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace)) AND p.prokind='f'),'[]'::jsonb),
    'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
      'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
      'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connectionLimit',r.rolconnlimit,'config',r.rolconfig,
      'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
        pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
        ORDER BY m.roleid::regrole::text,m.member::regrole::text,m.grantor::regrole::text)
        FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),'[]'::jsonb)) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname=ANY((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_'))),'[]'::jsonb),
    'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,
      'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),
      'notNull',t.typnotnull,'default',t.typdefault,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) x),'[]'::jsonb),
      'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'labels',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),'[]'::jsonb)) ORDER BY t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY((SELECT array_agg(typname ORDER BY typname) FROM pg_type WHERE typnamespace='public'::regnamespace)) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND EXISTS(SELECT FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c')))),'[]'::jsonb),
    'schemas',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',n.nspname,
      'owner',pg_get_userbyid(n.nspowner),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x),'[]'::jsonb),'effectiveAcl',(SELECT jsonb_agg(jsonb_build_array(r,
        has_schema_privilege(r,n.oid,'USAGE'),has_schema_privilege(r,n.oid,'CREATE')) ORDER BY r)
        FROM unnest((SELECT array_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname !~ '^pg_')) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r))) ORDER BY n.nspname)
      FROM pg_namespace n WHERE n.nspname IN ('public','extensions','auth')),'[]'::jsonb)
  ) INTO catalog;

 normalized:='[]'::jsonb;
 FOR item IN SELECT value FROM jsonb_array_elements(catalog->'functions') LOOP
  normalized:=normalized||jsonb_build_array((item-'definition')||jsonb_build_object('definitionSha256',encode(sha256(convert_to(item->>'definition','UTF8')),'hex')));
 END LOOP;
 catalog:=jsonb_set(catalog,'{functions}',normalized);
 IF catalog-'functions' IS DISTINCT FROM before_catalog-'functions' THEN RAISE EXCEPTION 'author_union_nonbody_catalog_changed';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_after FROM pg_default_acl d;
 IF defaults_after IS DISTINCT FROM defaults_before THEN RAISE EXCEPTION 'author_union_defaults_changed';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.research_author_assignment_context_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '904b91599eab5f33d15c1c73bea2ba94f57ee53da769ec67b65b96eba2a85346' THEN RAISE EXCEPTION 'author_union_post_body:research_author_assignment_context_v2';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='research_author_assignment_context_v2(jsonb,uuid,text,text)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_packet_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '8f6edc9b34836a22b4a56f14772a75600d0fb915dbc8076ba42cd1cbc9eb2a7f' THEN RAISE EXCEPTION 'author_union_post_body:read_research_author_packet_v2';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='read_research_author_packet_v2(jsonb,uuid,text,text)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_result_v2(jsonb,uuid,text,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM 'e5889572355ba71c77f0d12c5af867cf65e88d00161d781bbd5051e43f674233' THEN RAISE EXCEPTION 'author_union_post_body:read_research_author_result_v2';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='read_research_author_result_v2(jsonb,uuid,text,text)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.receive_research_author_result_v2(jsonb,uuid,text,text,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '97f361883edc0d8cf61e696775c7cdb377272979c61e2604c3ec881497576c41' THEN RAISE EXCEPTION 'author_union_post_body:receive_research_author_result_v2';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='receive_research_author_result_v2(jsonb,uuid,text,text,jsonb)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF namespace_now IS DISTINCT FROM namespace_before THEN RAISE EXCEPTION 'author_union_namespace_postcondition';END IF;
END $author_union$;
COMMIT;
