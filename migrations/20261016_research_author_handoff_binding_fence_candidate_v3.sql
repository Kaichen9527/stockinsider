BEGIN;
-- SOURCE-ONLY, uninstalled engineering candidate. Predecessor is captured50+26+
-- candidate36+LOCAL two-owner USAGE+c08 durable union already committed.
-- No static OIDs, new function/table/role/grant or production activation.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $handoff_binding_fence$
DECLARE catalog jsonb; before_catalog jsonb; namespace_before jsonb; namespace_now jsonb;
 item jsonb; normalized jsonb; identity_before jsonb; identity_now jsonb; source text;
 defaults_before jsonb; defaults_after jsonb; defaults_named jsonb;
 object_identity_before jsonb; object_identity_now jsonb; changed_definition text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'handoff_binding_read_committed_required';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) THEN RAISE EXCEPTION 'handoff_binding_busy';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(namespace_now),'UTF8')),'hex') IS DISTINCT FROM 'd5d40be3a570685e109953393c629d7b972b40d4910bb3d6002d28ceba81300d' THEN RAISE EXCEPTION 'handoff_binding_predecessor_namespace';END IF;
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
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY(SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname))),'[]'::jsonb),
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
      WHERE n.nspname='public' AND p.proname=ANY(ARRAY(SELECT DISTINCT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname)) AND p.prokind='f'),'[]'::jsonb),
    'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
      'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
      'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connectionLimit',r.rolconnlimit,'config',r.rolconfig,
      'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
        pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
        ORDER BY m.roleid::regrole::text,m.member::regrole::text,m.grantor::regrole::text)
        FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),'[]'::jsonb)) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname=ANY(ARRAY(SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname))),'[]'::jsonb),
    'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,
      'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),
      'notNull',t.typnotnull,'default',t.typdefault,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) x),'[]'::jsonb),
      'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'labels',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),'[]'::jsonb)) ORDER BY t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY(ARRAY(SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace ORDER BY typname)) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND EXISTS(SELECT FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c')))),'[]'::jsonb),
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
 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(catalog),'UTF8')),'hex') IS DISTINCT FROM '2db3c24e2ed40099f437f82290ab2049e0859080cfeae92bdd24592918725087' THEN RAISE EXCEPTION 'handoff_binding_predecessor_catalog';END IF;
 before_catalog:=catalog;
 SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 SELECT jsonb_build_object('schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN ('public','auth','extensions')),'objects',(SELECT jsonb_agg(jsonb_build_array(kind,oid,name) ORDER BY kind,name) FROM (SELECT 'relation' kind,c.oid,n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'type',t.oid,n.nspname||'.'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'role',r.oid,r.rolname FROM pg_roles r) objects)) INTO object_identity_now;
 identity_before:=identity_now;object_identity_before:=object_identity_now;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_before FROM pg_default_acl d;
 SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,''),'kind',d.defaclobjtype,'acl',to_jsonb(d.defaclacl)) ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),'[]'::jsonb) INTO defaults_named FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace;
 IF defaults_named IS DISTINCT FROM '[{"acl":["postgres=rwU/postgres","anon=rwU/postgres","authenticated=rwU/postgres","service_role=rwU/postgres"],"kind":"S","owner":"postgres","schema":"public"},{"acl":["postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"],"kind":"f","owner":"postgres","schema":"public"},{"acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres"],"kind":"r","owner":"postgres","schema":"public"},{"acl":["postgres=r*w*U*/supabase_admin"],"kind":"S","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=X*/supabase_admin"],"kind":"f","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=a*r*w*d*D*x*t*m*/supabase_admin"],"kind":"r","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=rwU/supabase_admin","anon=rwU/supabase_admin","authenticated=rwU/supabase_admin","service_role=rwU/supabase_admin"],"kind":"S","owner":"supabase_admin","schema":"public"},{"acl":["postgres=X/supabase_admin","anon=X/supabase_admin","authenticated=X/supabase_admin","service_role=X/supabase_admin"],"kind":"f","owner":"supabase_admin","schema":"public"},{"acl":["postgres=arwdDxtm/supabase_admin","anon=arwdDxtm/supabase_admin","authenticated=arwdDxtm/supabase_admin","service_role=arwdDxtm/supabase_admin"],"kind":"r","owner":"supabase_admin","schema":"public"},{"acl":["postgres=rwU/supabase_auth_admin","dashboard_user=rwU/supabase_auth_admin"],"kind":"S","owner":"supabase_auth_admin","schema":"auth"},{"acl":["postgres=X/supabase_auth_admin","dashboard_user=X/supabase_auth_admin"],"kind":"f","owner":"supabase_auth_admin","schema":"auth"},{"acl":["postgres=arwdDxtm/supabase_auth_admin","dashboard_user=arwdDxtm/supabase_auth_admin"],"kind":"r","owner":"supabase_auth_admin","schema":"auth"}]'::jsonb THEN RAISE EXCEPTION 'handoff_binding_predecessor_defaults';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM 'ffb26f1274ab222166c0f7cfac2355cfacce2fcdb9ec5288e5ea089fc176ae1d' THEN RAISE EXCEPTION 'handoff_binding_predecessor_body';END IF;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.read_research_author_handoff_context_v2(
 p_request jsonb,p_revision_id uuid,p_input_hash text,p_principal text,p_result_id uuid,p_result_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.research_author_assignments_v2; v public.research_article_input_revisions_v2;
 p public.research_input_preparations_v2; r public.research_author_results_v2;
 c public.research_model_completions_v1; claim jsonb; payload jsonb; n timestamptz; live jsonb; b jsonb; binding_core jsonb; material jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'research_author_handoff_read_committed_required'; END IF;
 IF p_request IS NULL OR jsonb_typeof(p_request)<>'object' OR octet_length(p_request::text)>8192
  OR p_revision_id IS NULL OR p_result_id IS NULL OR p_input_hash IS NULL OR p_input_hash !~ '^[a-f0-9]{64}$'
  OR p_result_hash IS NULL OR p_result_hash !~ '^[a-f0-9]{64}$' OR p_principal IS NULL OR p_principal !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'research_author_handoff_identity'; END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);
 PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT * INTO a FROM public.research_author_assignments_v2 WHERE input_revision_id=p_revision_id;
 SELECT * INTO v FROM public.research_article_input_revisions_v2 WHERE revision_id=p_revision_id;
 SELECT * INTO r FROM public.research_author_results_v2 WHERE result_id=p_result_id;
 SELECT * INTO p FROM public.research_input_preparations_v2 WHERE preparation_id=v.preparation_id;
 IF a.assignment_id IS NULL OR v.revision_id IS NULL OR r.result_id IS NULL OR p.preparation_id IS NULL
  OR a.canonical_request IS DISTINCT FROM p_request OR v.canonical_request IS DISTINCT FROM p_request
  OR a.controller_principal IS DISTINCT FROM p_principal OR a.input_hash IS DISTINCT FROM p_input_hash
  OR v.input_hash IS DISTINCT FROM p_input_hash OR r.assignment_id IS DISTINCT FROM a.assignment_id
  OR r.result_hash IS DISTINCT FROM p_result_hash OR r.result_hash IS DISTINCT FROM public.research_complete_hash_v2(r.payload)
  OR r.logical_bytes IS DISTINCT FROM octet_length(convert_to(public.research_complete_canonical_v2(r.payload),'UTF8'))
  OR v.input_hash IS DISTINCT FROM public.research_complete_hash_v2(v.canonical_payload)
  OR v.job_id IS DISTINCT FROM a.job_id OR v.attempt IS DISTINCT FROM a.attempt
  OR v.reservation_id IS DISTINCT FROM a.reservation_id OR v.research_company_id IS DISTINCT FROM a.research_company_id
  OR v.snapshot_hash IS DISTINCT FROM a.snapshot_hash OR v.research_scope IS DISTINCT FROM 'research_observed_v1'
  OR p.job_id IS DISTINCT FROM a.job_id OR p.attempt IS DISTINCT FROM a.attempt OR p.reservation_id IS DISTINCT FROM a.reservation_id
  OR p.input_hash IS DISTINCT FROM p_request->>'preparationHash' OR p.preparation_id::text IS DISTINCT FROM p_request->>'preparationId'
  OR p.source_seal_id IS DISTINCT FROM v.source_seal_id
  OR r.payload->>'assignmentId' IS DISTINCT FROM a.assignment_id::text
  OR r.payload->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR r.payload->>'inputHash' IS DISTINCT FROM p_input_hash
  OR r.payload->'observation'->>'invocationId' IS DISTINCT FROM r.invocation_id
  OR r.payload->'validatedArticle'->>'articleHash' IS DISTINCT FROM public.research_complete_hash_v2((r.payload->'validatedArticle')-'articleHash')
 THEN RAISE EXCEPTION 'research_author_handoff_binding'; END IF;
 IF v.source_seal_id IS NOT NULL THEN PERFORM public.assert_research_source_seal_v2(v.source_seal_id); END IF;
 claim:=public.read_research_observed_claim_v2(a.work_owner,a.snapshot_hash,a.job_id,a.attempt);
 IF claim IS NULL OR claim->'job'->>'jobId' IS DISTINCT FROM a.job_id::text
  OR claim->'job'->'attempt' IS DISTINCT FROM to_jsonb(a.attempt)
  OR claim->'job'->>'owner' IS DISTINCT FROM a.work_owner
  OR claim->'modelReservation'->>'reservationId' IS DISTINCT FROM a.reservation_id::text
  OR claim->'modelReservation'->>'role' IS DISTINCT FROM 'company_research'
  OR claim->'modelReservation'->>'owner' IS DISTINCT FROM a.work_owner
  OR claim->'researchIdentity'->>'researchCompanyId' IS DISTINCT FROM a.research_company_id::text
  OR claim->'researchIdentity'->>'scope' IS DISTINCT FROM 'research_observed_v1'
  OR claim->'researchIdentity'->>'snapshotHash' IS DISTINCT FROM a.snapshot_hash
  OR NOT EXISTS(SELECT FROM public.research_observed_roster_members_v1 m JOIN public.research_observed_companies_v1 co USING(research_company_id)
    WHERE m.snapshot_hash=a.snapshot_hash AND m.research_company_id=a.research_company_id
      AND m.symbol=claim->'job'->>'symbol' AND co.symbol=m.symbol)
 THEN RAISE EXCEPTION 'research_author_handoff_claim'; END IF;
 payload:=v.canonical_payload;n:=clock_timestamp();
 IF payload->'originalJob' IS DISTINCT FROM jsonb_build_object('jobId',a.job_id,'attempt',a.attempt,'owner',a.work_owner,'leaseExpiresAt',a.original_job_deadline)
  OR payload->'originalReservation' IS DISTINCT FROM jsonb_build_object('reservationId',a.reservation_id,'startedAt',a.reservation_started_at,'leaseExpiresAt',a.reservation_expires_at)
  OR (claim->'job'->>'leaseExpiresAt')::timestamptz IS DISTINCT FROM a.original_job_deadline
  OR (claim->'modelReservation'->>'startedAt')::timestamptz IS DISTINCT FROM a.reservation_started_at
  OR (claim->'modelReservation'->>'leaseExpiresAt')::timestamptz IS DISTINCT FROM a.reservation_expires_at
  OR payload->'researchIdentity'->>'symbol' IS DISTINCT FROM claim->'job'->>'symbol'
  OR NOT isfinite(a.original_job_deadline) OR NOT isfinite(a.reservation_expires_at) OR NOT isfinite(a.reservation_started_at)
  OR a.reservation_started_at>n OR a.reservation_expires_at>a.reservation_started_at+interval '30 minutes'
  OR n>=least(a.original_job_deadline,a.reservation_expires_at)
  OR r.received_at<a.assigned_at OR r.received_at>n
 THEN RAISE EXCEPTION 'research_author_handoff_original_fence'; END IF;
 -- Finite retained binding fence on BOTH first completion and completed replay.
 -- Same owner/private resolver; no active-reader call or new service-role grant.
 IF p_request->>'expectedCalculatorExecutionHash'='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41' THEN
  IF payload->>'schemaVersion' IS DISTINCT FROM 'research-article-input-v2'
   OR payload->'hashes'->>'sourceClosureHash' IS DISTINCT FROM '77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41'
   THEN RAISE EXCEPTION 'research_author_handoff_legacy_binding'; END IF;
 ELSE
  b:=public.research_input_binding_candidate_v3(claim->'job'->>'symbol',p_request->>'expectedArtifactManifestHash',p_request->>'expectedCalculatorExecutionHash',false);
  binding_core:=b->'core';
  IF b->>'bindingCapsuleIdentity' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash'
   OR binding_core->>'inventoryHash' IS DISTINCT FROM p_request->>'expectedArtifactManifestHash'
   OR v.request_hash IS DISTINCT FROM public.research_complete_hash_v2(p_request)
   THEN RAISE EXCEPTION 'research_author_handoff_candidate_binding'; END IF;
 IF payload->>'schemaVersion' IS DISTINCT FROM binding_core->>'wireVersion' OR payload->'hashes'->>'sourceClosureHash' IS DISTINCT FROM binding_core->>'sourceExecutionHash'
 OR v.input_hash IS DISTINCT FROM public.research_complete_hash_v2(payload) THEN RAISE EXCEPTION 'versioned_stored_binding';END IF;
 IF binding_core->>'wireVersion'='research-article-input-v3' THEN
  IF payload->'financial'->'protocol' IS DISTINCT FROM binding_core||jsonb_build_object('bindingCapsuleIdentity',b->>'bindingCapsuleIdentity') THEN RAISE EXCEPTION 'versioned_stored_binding';END IF;
  material:=(payload->'financial'->'candidate')||jsonb_build_object('financialMaterial',payload->'financial'->'material');
 ELSE
  material:=jsonb_build_object('schemaVersion','research-complete-financial-material-v2','symbol',binding_core->'symbol','artifactReadKnownAt',payload->'clocks'->'artifactReadKnownAt','sourceClosureHash',binding_core->'sourceExecutionHash','artifactInventoryHash',binding_core->'inventoryHash','financialMaterial',payload->'financial'->'material');
 END IF;
 PERFORM public.research_complete_schema_check_v2(material,b->'registration'->'schemaTemplate',(payload->'clocks'->>'artifactReadKnownAt')::timestamptz);
 END IF;
 SELECT * INTO c FROM public.research_model_completions_v1 WHERE reservation_id=a.reservation_id;
 IF FOUND THEN
  IF c.owner IS DISTINCT FROM a.work_owner OR c.outcome IS DISTINCT FROM 'completed'
   OR c.result_hash IS DISTINCT FROM r.payload->'validatedArticle'->>'articleHash'
   OR c.finished_at IS NULL OR NOT isfinite(c.finished_at) OR c.finished_at<r.received_at OR c.finished_at>n
   OR c.finished_at>=least(a.original_job_deadline,a.reservation_expires_at)
  THEN RAISE EXCEPTION 'research_author_handoff_completion_conflict'; END IF;
 ELSE
  -- Preserve all original active-work fences before the first completion.
  live:=public.read_research_author_result_v2(p_request,p_revision_id,p_input_hash,p_principal);
  IF live->>'result_id' IS DISTINCT FROM p_result_id::text OR live->>'result_hash' IS DISTINCT FROM p_result_hash
   THEN RAISE EXCEPTION 'research_author_handoff_result_missing'; END IF;
 END IF;
 IF clock_timestamp()>=least(a.original_job_deadline,a.reservation_expires_at) THEN RAISE EXCEPTION 'research_author_handoff_expired'; END IF;
 RETURN jsonb_build_object('assignment',to_jsonb(a),'result',to_jsonb(r)-'invocation_id',
  'revision',to_jsonb(v)||jsonb_build_object('status','sealed','dispatchReady',false),
  'completion',CASE WHEN c.reservation_id IS NULL THEN NULL ELSE to_jsonb(c) END)
  || (CASE WHEN binding_core->>'wireVersion'='research-article-input-v3' THEN jsonb_build_object('binding',b) ELSE '{}'::jsonb END);
END $$;$replacement$;
 SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 SELECT jsonb_build_object('schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN ('public','auth','extensions')),'objects',(SELECT jsonb_agg(jsonb_build_array(kind,oid,name) ORDER BY kind,name) FROM (SELECT 'relation' kind,c.oid,n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'type',t.oid,n.nspname||'.'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'role',r.oid,r.rolname FROM pg_roles r) objects)) INTO object_identity_now;
 IF identity_now IS DISTINCT FROM identity_before OR object_identity_now IS DISTINCT FROM object_identity_before THEN RAISE EXCEPTION 'handoff_binding_identity_changed';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_after FROM pg_default_acl d;
 IF defaults_after IS DISTINCT FROM defaults_before THEN RAISE EXCEPTION 'handoff_binding_defaults_changed';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM 'f507de78318a126e180f96fa7905fccfb6c1ee428688fb9e93b0f607c8d7e958' THEN RAISE EXCEPTION 'handoff_binding_successor_body';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF namespace_now IS DISTINCT FROM namespace_before THEN RAISE EXCEPTION 'handoff_binding_namespace_postcondition';END IF;
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
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY(SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace ORDER BY relname))),'[]'::jsonb),
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
      WHERE n.nspname='public' AND p.proname=ANY(ARRAY(SELECT DISTINCT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname)) AND p.prokind='f'),'[]'::jsonb),
    'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
      'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
      'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connectionLimit',r.rolconnlimit,'config',r.rolconfig,
      'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
        pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
        ORDER BY m.roleid::regrole::text,m.member::regrole::text,m.grantor::regrole::text)
        FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),'[]'::jsonb)) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname=ANY(ARRAY(SELECT rolname FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname))),'[]'::jsonb),
    'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,
      'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),
      'notNull',t.typnotnull,'default',t.typdefault,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) x),'[]'::jsonb),
      'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'labels',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),'[]'::jsonb)) ORDER BY t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY(ARRAY(SELECT typname FROM pg_type WHERE typnamespace='public'::regnamespace ORDER BY typname)) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND EXISTS(SELECT FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c')))),'[]'::jsonb),
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
 SELECT x->>'definitionSha256' INTO changed_definition FROM jsonb_array_elements(catalog->'functions') x WHERE x->>'signature'='read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)';
 IF changed_definition IS NULL THEN RAISE EXCEPTION 'handoff_binding_definition_missing';END IF;
 SELECT jsonb_set(before_catalog,'{functions}',jsonb_agg(CASE WHEN x->>'signature'='read_research_author_handoff_context_v2(jsonb,uuid,text,text,uuid,text)' THEN jsonb_set(x,'{definitionSha256}',to_jsonb(changed_definition)) ELSE x END ORDER BY ord)) INTO before_catalog FROM jsonb_array_elements(before_catalog->'functions') WITH ORDINALITY e(x,ord);
 IF catalog IS DISTINCT FROM before_catalog THEN RAISE EXCEPTION 'handoff_binding_catalog_postcondition';END IF;
END $handoff_binding_fence$;
COMMIT;
