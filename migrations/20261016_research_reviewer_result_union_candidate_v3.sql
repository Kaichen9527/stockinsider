BEGIN;
-- SOURCE-ONLY, uninstalled engineering candidate. Predecessor is captured50+26+
-- candidate36+LOCAL two-owner USAGE+c08 union+2592 handoff fence committed.
-- No static OIDs, new function/table/role/grant or production activation.
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
DO $reviewer_union_fence$
DECLARE catalog jsonb; before_catalog jsonb; namespace_before jsonb; namespace_now jsonb;
 item jsonb; normalized jsonb; identity_before jsonb; identity_now jsonb; source text;
 defaults_before jsonb; defaults_after jsonb; defaults_named jsonb;
 object_identity_before jsonb; object_identity_now jsonb; changed_definition text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'reviewer_union_read_committed_required';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) THEN RAISE EXCEPTION 'reviewer_union_busy';END IF;
 PERFORM pg_advisory_xact_lock(610091002::bigint);PERFORM pg_advisory_xact_lock(2409,6002);
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(namespace_now),'UTF8')),'hex') IS DISTINCT FROM '718f62f93fd1340e71b70eed24f856f030256c040e0efdd5734d98265fbbdf61' THEN RAISE EXCEPTION 'reviewer_union_predecessor_namespace';END IF;
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
 IF encode(sha256(convert_to(public.research_observed_canonical_json_v1(catalog),'UTF8')),'hex') IS DISTINCT FROM 'e5b3fc64fc31e8b97bd25006a263fcb27228fa8a70b9c33b11b8b5527ea55658' THEN RAISE EXCEPTION 'reviewer_union_predecessor_catalog';END IF;
 before_catalog:=catalog;
 SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 SELECT jsonb_build_object('schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN ('public','auth','extensions')),'objects',(SELECT jsonb_agg(jsonb_build_array(kind,oid,name) ORDER BY kind,name) FROM (SELECT 'relation' kind,c.oid,n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'type',t.oid,n.nspname||'.'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'role',r.oid,r.rolname FROM pg_roles r) objects)) INTO object_identity_now;
 identity_before:=identity_now;object_identity_before:=object_identity_now;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_before FROM pg_default_acl d;
 SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,''),'kind',d.defaclobjtype,'acl',to_jsonb(d.defaclacl)) ORDER BY pg_get_userbyid(d.defaclrole),coalesce(n.nspname,''),d.defaclobjtype),'[]'::jsonb) INTO defaults_named FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace;
 IF defaults_named IS DISTINCT FROM '[{"acl":["postgres=rwU/postgres","anon=rwU/postgres","authenticated=rwU/postgres","service_role=rwU/postgres"],"kind":"S","owner":"postgres","schema":"public"},{"acl":["postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"],"kind":"f","owner":"postgres","schema":"public"},{"acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres"],"kind":"r","owner":"postgres","schema":"public"},{"acl":["postgres=r*w*U*/supabase_admin"],"kind":"S","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=X*/supabase_admin"],"kind":"f","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=a*r*w*d*D*x*t*m*/supabase_admin"],"kind":"r","owner":"supabase_admin","schema":"extensions"},{"acl":["postgres=rwU/supabase_admin","anon=rwU/supabase_admin","authenticated=rwU/supabase_admin","service_role=rwU/supabase_admin"],"kind":"S","owner":"supabase_admin","schema":"public"},{"acl":["postgres=X/supabase_admin","anon=X/supabase_admin","authenticated=X/supabase_admin","service_role=X/supabase_admin"],"kind":"f","owner":"supabase_admin","schema":"public"},{"acl":["postgres=arwdDxtm/supabase_admin","anon=arwdDxtm/supabase_admin","authenticated=arwdDxtm/supabase_admin","service_role=arwdDxtm/supabase_admin"],"kind":"r","owner":"supabase_admin","schema":"public"},{"acl":["postgres=rwU/supabase_auth_admin","dashboard_user=rwU/supabase_auth_admin"],"kind":"S","owner":"supabase_auth_admin","schema":"auth"},{"acl":["postgres=X/supabase_auth_admin","dashboard_user=X/supabase_auth_admin"],"kind":"f","owner":"supabase_auth_admin","schema":"auth"},{"acl":["postgres=arwdDxtm/supabase_auth_admin","dashboard_user=arwdDxtm/supabase_auth_admin"],"kind":"r","owner":"supabase_auth_admin","schema":"auth"}]'::jsonb THEN RAISE EXCEPTION 'reviewer_union_predecessor_defaults';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.assert_research_editorial_review_v2(jsonb,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '85443213186836065125e2fd7193fd8956ef70f20fb4b0f69ae41b46898ef492' THEN RAISE EXCEPTION 'reviewer_union_predecessor_body';END IF;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.assert_research_editorial_review_v2(packet jsonb,review jsonb) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; f jsonb; id jsonb;allowed_paragraphs jsonb;allowed_sources jsonb; seen text[]:=ARRAY[]::text[]; concerns integer:=0;
 -- ECMAScript WhiteSpace + LineTerminator set, identical to String.trim().
 trim_chars text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
  chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 -- Explicit v3 arm; original v2 statements below are byte-preserved.
 IF packet->>'schemaVersion'='research-reviewer-packet-v3-candidate' OR review->>'schemaVersion'='research-editorial-review-v3-candidate' THEN

DECLARE c jsonb; f jsonb; id jsonb;allowed_paragraphs jsonb;allowed_sources jsonb; seen text[]:=ARRAY[]::text[]; concerns integer:=0;
 -- ECMAScript WhiteSpace + LineTerminator set, identical to String.trim().
 trim_chars text:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
  chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||
  chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
 IF packet->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-packet-v3-candidate' OR review->>'schemaVersion' IS DISTINCT FROM 'research-editorial-review-v3-candidate'
  OR octet_length(convert_to(public.research_complete_canonical_v2(packet),'UTF8'))>1048576
  OR octet_length(convert_to(public.research_complete_canonical_v2(review),'UTF8'))>65536
 THEN RAISE EXCEPTION 'research_editorial_review_v3_version_bound';END IF;
 IF review IS NULL OR jsonb_typeof(review)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(review) key)
  IS DISTINCT FROM ARRAY['articleHash','checks','decision','findings','reviewPackHash','reviewedAt','schemaVersion','strongestCounterEvidence']
  OR jsonb_typeof(review->'decision') IS DISTINCT FROM 'string' OR review->>'decision' NOT IN ('accepted','revision_required','rejected')
  OR jsonb_typeof(review->'checks') IS DISTINCT FROM 'array' OR jsonb_array_length(review->'checks')<>8
  OR jsonb_typeof(review->'findings') IS DISTINCT FROM 'array' OR jsonb_array_length(review->'findings')>30
  OR jsonb_typeof(review->'strongestCounterEvidence') IS DISTINCT FROM 'string' OR length(btrim(review->>'strongestCounterEvidence',trim_chars))<20 OR length(review->>'strongestCounterEvidence')>4000
 OR translate(review->>'strongestCounterEvidence',chr(9)||chr(10)||chr(13),'') ~ ('['||chr(1)||'-'||chr(31)||chr(127)||']') OR review->>'strongestCounterEvidence' ~* '(?p)\mBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\m(password|api[_-]?key|access[_-]?token|cookie)\s*[:=]'
 THEN RAISE EXCEPTION 'research_editorial_review_shape'; END IF;
 allowed_paragraphs:=jsonb_build_array(packet->'article'->'summary'->>'id')||
  (SELECT coalesce(jsonb_agg(p->>'id'),'[]') FROM jsonb_array_elements(packet->'article'->'sections') s CROSS JOIN LATERAL jsonb_array_elements(s->'paragraphs') p);
 allowed_sources:=(SELECT coalesce(jsonb_agg(s->'descriptor'->>'id'),'[]') FROM jsonb_array_elements(packet->'sources') s);
 FOR c IN SELECT value FROM jsonb_array_elements(review->'checks') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)
   IS DISTINCT FROM ARRAY['category','paragraphIds','rationale','status']
   OR jsonb_typeof(c->'category') IS DISTINCT FROM 'string' OR c->>'category' NOT IN ('source_support','rumor_staging','financial_recalculation','periods_and_dilution','competitive_alternatives','valuation_assumptions','counterevidence','entry_separation')
   OR c->>'category'=ANY(seen) OR jsonb_typeof(c->'status') IS DISTINCT FROM 'string' OR c->>'status' NOT IN ('pass','concern','fail')
   OR jsonb_typeof(c->'rationale') IS DISTINCT FROM 'string' OR length(btrim(c->>'rationale',trim_chars))<20 OR length(c->>'rationale')>2000
   OR jsonb_typeof(c->'paragraphIds') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'paragraphIds')>30
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(c->'paragraphIds'))<>jsonb_array_length(c->'paragraphIds')
 OR translate(c->>'rationale',chr(9)||chr(10)||chr(13),'') ~ ('['||chr(1)||'-'||chr(31)||chr(127)||']') OR c->>'rationale' ~* '(?p)\mBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\m(password|api[_-]?key|access[_-]?token|cookie)\s*[:=]'
  THEN RAISE EXCEPTION 'research_editorial_review_check'; END IF;
  seen:=array_append(seen,c->>'category');IF c->>'status'<>'pass' THEN concerns:=concerns+1; END IF;
  FOR id IN SELECT value FROM jsonb_array_elements(c->'paragraphIds') LOOP
   IF jsonb_typeof(id)<>'string' OR NOT allowed_paragraphs @> jsonb_build_array(id) THEN RAISE EXCEPTION 'research_editorial_review_paragraph'; END IF;
  END LOOP;
 END LOOP;
 FOR f IN SELECT value FROM jsonb_array_elements(review->'findings') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(f) key)
   IS DISTINCT FROM ARRAY['issue','paragraphId','severity','sourceIds']
   OR jsonb_typeof(f->'severity') IS DISTINCT FROM 'string' OR f->>'severity' NOT IN ('blocking','major','minor')
   OR (f->'paragraphId'<>'null'::jsonb AND (jsonb_typeof(f->'paragraphId')<>'string' OR NOT allowed_paragraphs @> jsonb_build_array(f->'paragraphId')))
   OR jsonb_typeof(f->'issue') IS DISTINCT FROM 'string' OR length(btrim(f->>'issue',trim_chars))<20 OR length(f->>'issue')>2000
   OR jsonb_typeof(f->'sourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'sourceIds')>30
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(f->'sourceIds'))<>jsonb_array_length(f->'sourceIds')
 OR translate(f->>'issue',chr(9)||chr(10)||chr(13),'') ~ ('['||chr(1)||'-'||chr(31)||chr(127)||']') OR f->>'issue' ~* '(?p)\mBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\m(password|api[_-]?key|access[_-]?token|cookie)\s*[:=]'
  THEN RAISE EXCEPTION 'research_editorial_review_finding'; END IF;
  IF f->>'severity'<>'minor' THEN concerns:=concerns+1; END IF;
  FOR id IN SELECT value FROM jsonb_array_elements(f->'sourceIds') LOOP
   IF jsonb_typeof(id)<>'string' OR NOT allowed_sources @> jsonb_build_array(id) THEN RAISE EXCEPTION 'research_editorial_review_source'; END IF;
  END LOOP;
 END LOOP;
 IF (review->>'decision'='accepted' AND concerns<>0) OR (review->>'decision'<>'accepted' AND concerns=0) THEN RAISE EXCEPTION 'research_editorial_review_decision'; END IF;
END;
 RETURN;
 END IF;
 IF review IS NULL OR jsonb_typeof(review)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(review) key)
  IS DISTINCT FROM ARRAY['articleHash','checks','decision','findings','reviewPackHash','reviewedAt','schemaVersion','strongestCounterEvidence']
  OR jsonb_typeof(review->'decision') IS DISTINCT FROM 'string' OR review->>'decision' NOT IN ('accepted','revision_required','rejected')
  OR jsonb_typeof(review->'checks') IS DISTINCT FROM 'array' OR jsonb_array_length(review->'checks')<>8
  OR jsonb_typeof(review->'findings') IS DISTINCT FROM 'array' OR jsonb_array_length(review->'findings')>30
  OR jsonb_typeof(review->'strongestCounterEvidence') IS DISTINCT FROM 'string' OR length(btrim(review->>'strongestCounterEvidence',trim_chars))<20 OR length(review->>'strongestCounterEvidence')>4000
 THEN RAISE EXCEPTION 'research_editorial_review_shape'; END IF;
 allowed_paragraphs:=jsonb_build_array(packet->'article'->'summary'->>'id')||
  (SELECT coalesce(jsonb_agg(p->>'id'),'[]') FROM jsonb_array_elements(packet->'article'->'sections') s CROSS JOIN LATERAL jsonb_array_elements(s->'paragraphs') p);
 allowed_sources:=(SELECT coalesce(jsonb_agg(s->'descriptor'->>'id'),'[]') FROM jsonb_array_elements(packet->'research'->'sources') s);
 FOR c IN SELECT value FROM jsonb_array_elements(review->'checks') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(c) key)
   IS DISTINCT FROM ARRAY['category','paragraphIds','rationale','status']
   OR jsonb_typeof(c->'category') IS DISTINCT FROM 'string' OR c->>'category' NOT IN ('source_support','rumor_staging','financial_recalculation','periods_and_dilution','competitive_alternatives','valuation_assumptions','counterevidence','entry_separation')
   OR c->>'category'=ANY(seen) OR jsonb_typeof(c->'status') IS DISTINCT FROM 'string' OR c->>'status' NOT IN ('pass','concern','fail')
   OR jsonb_typeof(c->'rationale') IS DISTINCT FROM 'string' OR length(btrim(c->>'rationale',trim_chars))<20 OR length(c->>'rationale')>2000
   OR jsonb_typeof(c->'paragraphIds') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'paragraphIds')>30
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(c->'paragraphIds'))<>jsonb_array_length(c->'paragraphIds')
  THEN RAISE EXCEPTION 'research_editorial_review_check'; END IF;
  seen:=array_append(seen,c->>'category');IF c->>'status'<>'pass' THEN concerns:=concerns+1; END IF;
  FOR id IN SELECT value FROM jsonb_array_elements(c->'paragraphIds') LOOP
   IF jsonb_typeof(id)<>'string' OR NOT allowed_paragraphs @> jsonb_build_array(id) THEN RAISE EXCEPTION 'research_editorial_review_paragraph'; END IF;
  END LOOP;
 END LOOP;
 FOR f IN SELECT value FROM jsonb_array_elements(review->'findings') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(f) key)
   IS DISTINCT FROM ARRAY['issue','paragraphId','severity','sourceIds']
   OR jsonb_typeof(f->'severity') IS DISTINCT FROM 'string' OR f->>'severity' NOT IN ('blocking','major','minor')
   OR (f->'paragraphId'<>'null'::jsonb AND (jsonb_typeof(f->'paragraphId')<>'string' OR NOT allowed_paragraphs @> jsonb_build_array(f->'paragraphId')))
   OR jsonb_typeof(f->'issue') IS DISTINCT FROM 'string' OR length(btrim(f->>'issue',trim_chars))<20 OR length(f->>'issue')>2000
   OR jsonb_typeof(f->'sourceIds') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'sourceIds')>30
   OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(f->'sourceIds'))<>jsonb_array_length(f->'sourceIds')
  THEN RAISE EXCEPTION 'research_editorial_review_finding'; END IF;
  IF f->>'severity'<>'minor' THEN concerns:=concerns+1; END IF;
  FOR id IN SELECT value FROM jsonb_array_elements(f->'sourceIds') LOOP
   IF jsonb_typeof(id)<>'string' OR NOT allowed_sources @> jsonb_build_array(id) THEN RAISE EXCEPTION 'research_editorial_review_source'; END IF;
  END LOOP;
 END LOOP;
 IF (review->>'decision'='accepted' AND concerns<>0) OR (review->>'decision'<>'accepted' AND concerns=0) THEN RAISE EXCEPTION 'research_editorial_review_decision'; END IF;
END $$;$replacement$;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM 'bf4366dd42828e570c0ba6d091c968845721fd5678251ab61b8451f4b1606087' THEN RAISE EXCEPTION 'reviewer_union_predecessor_body';END IF;
 EXECUTE $replacement$CREATE OR REPLACE FUNCTION public.receive_research_reviewer_result_v2(p_request jsonb,p_revision_id uuid,p_input_hash text,p_author_principal text,p_reviewer_principal text,p_result_id uuid,p_result_hash text,p_result jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE context jsonb;ra jsonb;o jsonb;v jsonb;review jsonb;packet jsonb;h jsonb;old jsonb;
 saved public.research_reviewer_results_v2;bytes integer;n timestamptz;started timestamptz;ended timestamptz;reviewed timestamptz;
BEGIN
 -- Server-owned dispatch fence precedes every envelope-selected arm.
 context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 h:=context->'authorContext';
 IF jsonb_typeof(h) IS DISTINCT FROM 'object'
  OR jsonb_typeof(h->'revision'->'canonical_payload') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'research_reviewer_result_dispatch_context';END IF;
 IF h->'revision'->'canonical_payload'->>'schemaVersion'='research-article-input-v3' THEN
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(h) key) IS DISTINCT FROM ARRAY['assignment','binding','completion','result','revision']
   OR jsonb_typeof(h->'binding') IS DISTINCT FROM 'object' OR jsonb_typeof(h->'binding'->'core') IS DISTINCT FROM 'object'
   OR h->'binding'->'core'->>'wireVersion' IS DISTINCT FROM 'research-article-input-v3'
   OR h->'binding'->'core'->>'financialProfile' IS DISTINCT FROM 'oct14_historical_cash_v1'
   OR h->'binding'->>'bindingCapsuleIdentity' IS NULL OR h->'binding'->>'bindingCapsuleIdentity' !~ '^[a-f0-9]{64}$'
   OR h->'binding'->>'bindingCapsuleIdentity' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash'
   OR h->'revision'->'canonical_payload'->'financial'->'protocol'->>'bindingCapsuleIdentity' IS DISTINCT FROM h->'binding'->>'bindingCapsuleIdentity'
   OR h->'revision'->'canonical_payload'->'financial'->'protocol'->>'wireVersion' IS DISTINCT FROM h->'binding'->'core'->>'wireVersion'
   OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v3-candidate'
  THEN RAISE EXCEPTION 'research_reviewer_result_dispatch_v3';END IF;
 ELSIF h->'revision'->'canonical_payload'->>'schemaVersion'='research-article-input-v2' THEN
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(h) key) IS DISTINCT FROM ARRAY['assignment','completion','result','revision']
   OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v2'
  THEN RAISE EXCEPTION 'research_reviewer_result_dispatch_v2';END IF;
 ELSE RAISE EXCEPTION 'research_reviewer_result_dispatch_version';
 END IF;
 -- End server-owned dispatch fence. Existing bounded context reads remain unchanged.
 -- Finite v3 arm; failures propagate, unknown versions retain the original rejection.
 IF p_result->>'schemaVersion'='research-reviewer-result-v3-candidate' THEN

DECLARE context jsonb;ra jsonb;o jsonb;v jsonb;review jsonb;packet jsonb;h jsonb;old jsonb;
 saved public.research_reviewer_results_v2;bytes integer;n timestamptz;started timestamptz;ended timestamptz;reviewed timestamptz;
 sources jsonb;expected_packet jsonb;expected_validated jsonb;payload jsonb;author_validated jsonb;b jsonb;
BEGIN
 context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 ra:=context->'reviewerAssignment';h:=context->'authorContext';
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
  IS DISTINCT FROM ARRAY['assignmentId','authorResultHash','authorResultId','bindingCapsuleIdentity','financialProfile','inputHash','inputRevisionId','observation','packet','packetHash','rawReview','schemaVersion','sourceExecutionHash','validatedReview','wireVersion']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v3-candidate'
  OR p_result->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id' OR p_result->>'authorResultId' IS DISTINCT FROM p_result_id::text
  OR p_result->>'authorResultHash' IS DISTINCT FROM p_result_hash OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash THEN RAISE EXCEPTION 'research_reviewer_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_reviewer_result_bound'; END IF;
 packet:=p_result->'packet';o:=p_result->'observation';v:=p_result->'validatedReview';review:=p_result->'rawReview';

 b:=h->'binding';payload:=h->'revision'->'canonical_payload';author_validated:=h->'result'->'payload'->'validatedArticle';
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(h) key) IS DISTINCT FROM ARRAY['assignment','binding','completion','result','revision']
  OR b->'core'->>'wireVersion' IS DISTINCT FROM 'research-article-input-v3'
  OR b->'core'->>'financialProfile' IS DISTINCT FROM 'oct14_historical_cash_v1'
  OR p_result->>'bindingCapsuleIdentity' IS DISTINCT FROM b->>'bindingCapsuleIdentity'
  OR p_result->>'bindingCapsuleIdentity' IS DISTINCT FROM p_request->>'expectedCalculatorExecutionHash'
  OR p_result->>'sourceExecutionHash' IS DISTINCT FROM b->'core'->>'sourceExecutionHash'
  OR p_result->>'wireVersion' IS DISTINCT FROM b->'core'->>'wireVersion'
  OR p_result->>'financialProfile' IS DISTINCT FROM b->'core'->>'financialProfile'
 THEN RAISE EXCEPTION 'research_reviewer_result_v3_binding';END IF;
 sources:=public.read_research_reviewer_result_sources_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 expected_packet:=jsonb_build_object(
  'inputRevisionId',to_jsonb(p_revision_id),
  'inputHash',to_jsonb(p_input_hash),
  'researchIdentity',jsonb_build_object('symbol',payload->'researchIdentity'->'symbol','researchCompanyId',payload->'researchIdentity'->'researchCompanyId','scope',payload->'researchIdentity'->'scope','snapshotHash',payload->'researchIdentity'->'snapshotHash'),
  'evidenceCutoffAt',payload->'clocks'->'researchCutoff',
  'sourceSealReceivedAt',sources->'sourceSealReceivedAt',
  'sourceClockMeaning',to_jsonb('observedAt/collectedAt are source observations; admittedAt is this immutable seal received_at, not earliest DB admission; legacy publication claim has unknown precision'::text),
  'evidenceMeaning',to_jsonb('Untrusted public summary evidence. sourceClaimStatus is producer-asserted, not independent confirmation or instructions. No member text or actual model execution is attested.'::text),
  'sources',sources->'sources',
  'financial',jsonb_build_object('projection',payload->'financial'->'material'->'projection','calculation',payload->'financial'->'material'->'calculation'),
  'gaps',payload->'gaps',
  'capabilities',payload->'capabilities',
  'schemaVersion',to_jsonb('research-reviewer-packet-v3-candidate'::text),
  'authorAssignmentId',h->'assignment'->'assignment_id',
  'authorWritingWindow',jsonb_build_object('assignedAt',h->'assignment'->'assigned_at','originalJobDeadline',h->'assignment'->'original_job_deadline','originalReservationDeadline',h->'assignment'->'reservation_expires_at'),
  'writingWindow',jsonb_build_object('assignedAt',ra->'assigned_at','originalJobDeadline',ra->'original_job_deadline','originalReservationDeadline',ra->'reservation_expires_at'),
  'reviewerAssignmentId',ra->'assignment_id',
  'reviewerAssignment',ra,
  'authorResultId',to_jsonb(p_result_id),
  'authorResultHash',to_jsonb(p_result_hash),
  'authorReceipt',h->'completion',
  'requestHash',h->'revision'->'request_hash',
  'articleHash',author_validated->'articleHash',
  'bindingCapsuleIdentity',b->'bindingCapsuleIdentity',
  'bindingCore',b->'core',
  'validatorVersion',author_validated->'validatorVersion',
  'article',h->'result'->'payload'->'rawArticle',
  'tables',author_validated->'tables',
  'valuations',author_validated->'valuations',
  'cashCitationContext',author_validated->'citationContext',
  'policy',jsonb_build_object('sourceEvidenceUntrusted',true,'independentClaimReviewRequired',true,'reviewTextLimit',65536,'receiveEnvelopeLimit',1048576,'financialFactsFromTypedReferencesOnly',true),
  'controllerReportOnly','true'::jsonb,
  'noFutureCash','true'::jsonb,
  'dispatchReady','false'::jsonb,
  'modelDispatched','false'::jsonb,
  'reviewerDispatched','false'::jsonb,
  'publishableResearch','false'::jsonb,
  'researchQualified','false'::jsonb,
  'strategyApproved','false'::jsonb,
  'entryEligible','false'::jsonb,
  'historicalPITEligible','false'::jsonb,
  'financialVerified','false'::jsonb,
  'wireDispatchEnabled','false'::jsonb,
  'sourceClosureApproved','false'::jsonb,
  'valuationApproved','false'::jsonb,
  'technicalAdmission','false'::jsonb,
  'forecastCash','null'::jsonb
 );
 IF packet IS DISTINCT FROM expected_packet OR octet_length(convert_to(public.research_complete_canonical_v2(packet),'UTF8'))>1048576
 THEN RAISE EXCEPTION 'research_reviewer_result_v3_packet';END IF;
 expected_validated:=jsonb_build_object('schemaVersion','validated-editorial-review-v3-candidate','review',review,'reviewHash',public.research_complete_hash_v2(review),
 'articleHash',packet->'articleHash','reviewPackHash',public.research_complete_hash_v2(packet),'validatorVersion','editorial-review-cash-contract-v3.1',
 'bindingCapsuleIdentity',b->'bindingCapsuleIdentity','sourceExecutionHash',b->'core'->'sourceExecutionHash','calculatorExecutionHash',author_validated->'calculatorExecutionHash',
 'validationStatus','contract_valid_only','controllerReportOnly',true,'publishableResearch',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false);
 IF v IS DISTINCT FROM expected_validated THEN RAISE EXCEPTION 'research_reviewer_result_v3_validated';END IF;
 PERFORM public.assert_research_editorial_review_v2(packet,review);
 IF jsonb_typeof(packet) IS DISTINCT FROM 'object' OR jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object'
  OR p_result->>'packetHash' IS DISTINCT FROM public.research_complete_hash_v2(packet)
  OR packet->>'reviewerAssignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR packet->>'authorResultId' IS DISTINCT FROM p_result_id::text OR packet->>'authorResultHash' IS DISTINCT FROM p_result_hash
  OR packet->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR packet->>'inputHash' IS DISTINCT FROM p_input_hash
  OR packet->'article' IS DISTINCT FROM h->'result'->'payload'->'rawArticle'
  OR packet->>'articleHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'articleHash'
  OR packet->'tables' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'tables'
  OR packet->'valuations' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'valuations'
  OR v->>'calculatorExecutionHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'calculatorExecutionHash'
  OR review->>'schemaVersion' IS DISTINCT FROM 'research-editorial-review-v3-candidate' OR review->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR review->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR review->>'decision' IS NULL OR review->>'decision' NOT IN ('accepted','revision_required','rejected')
  OR octet_length(convert_to(public.research_complete_canonical_v2(review),'UTF8'))>65536 OR v->>'schemaVersion' IS DISTINCT FROM 'validated-editorial-review-v3-candidate'
  OR v->'review' IS DISTINCT FROM review OR v->>'reviewHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR v->>'articleHash' IS DISTINCT FROM packet->>'articleHash' OR v->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only' OR v->'controllerReportOnly' IS DISTINCT FROM 'true'::jsonb
  OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb
  OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_reviewer_result_review_binding'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2' OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation'
  OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat' OR o->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR o->>'jobId' IS DISTINCT FROM ra->>'job_id' OR o->'attempt' IS DISTINCT FROM ra->'attempt'
  OR o->>'reservationId' IS DISTINCT FROM ra->>'reservation_id' OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR o->>'inputHash' IS DISTINCT FROM p_input_hash OR o->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR o->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string' OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR o->>'threadId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'threadId'
  OR o->>'invocationId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'invocationId'
  OR o->>'dispatchObservationHash' IS NULL OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$'
  OR o->>'completionObservationHash' IS NULL OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]' OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
 THEN RAISE EXCEPTION 'research_reviewer_result_observation'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz;ended:=(o->>'controllerObservedEndAt')::timestamptz;reviewed:=(review->>'reviewedAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR reviewed IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(reviewed)
  OR started<(ra->>'assigned_at')::timestamptz OR started<(h->'result'->'payload'->'observation'->>'controllerObservedEndAt')::timestamptz
  OR reviewed<started OR reviewed>ended OR ended>n OR n>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_reviewer_result_clock'; END IF;
 old:=context->'reviewResult';
 IF old<>'null'::jsonb THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_reviewer_result_replay_conflict'; END IF;
  IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_reviewer_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((ra->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 VALUES((ra->>'reservation_id')::uuid,ra->>'work_owner','completed',saved.result_hash);
 IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END;
 END IF;
 context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);
 ra:=context->'reviewerAssignment';h:=context->'authorContext';
 IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_result) key)
  IS DISTINCT FROM ARRAY['assignmentId','authorResultHash','authorResultId','inputHash','inputRevisionId','observation','packet','packetHash','rawReview','schemaVersion','validatedReview']
  OR p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v2'
  OR p_result->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id' OR p_result->>'authorResultId' IS DISTINCT FROM p_result_id::text
  OR p_result->>'authorResultHash' IS DISTINCT FROM p_result_hash OR p_result->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR p_result->>'inputHash' IS DISTINCT FROM p_input_hash THEN RAISE EXCEPTION 'research_reviewer_result_shape'; END IF;
 bytes:=octet_length(convert_to(public.research_complete_canonical_v2(p_result),'UTF8'));
 IF bytes>1048576 THEN RAISE EXCEPTION 'research_reviewer_result_bound'; END IF;
 packet:=p_result->'packet';o:=p_result->'observation';v:=p_result->'validatedReview';review:=p_result->'rawReview';
 PERFORM public.assert_research_editorial_review_v2(packet,review);
 IF jsonb_typeof(packet) IS DISTINCT FROM 'object' OR jsonb_typeof(o) IS DISTINCT FROM 'object' OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object'
  OR p_result->>'packetHash' IS DISTINCT FROM public.research_complete_hash_v2(packet)
  OR packet->>'reviewerAssignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR packet->>'authorResultId' IS DISTINCT FROM p_result_id::text OR packet->>'authorResultHash' IS DISTINCT FROM p_result_hash
  OR packet->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text OR packet->>'inputHash' IS DISTINCT FROM p_input_hash
  OR packet->'article' IS DISTINCT FROM h->'result'->'payload'->'rawArticle'
  OR packet->>'articleHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'articleHash'
  OR packet->'tables' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'tables'
  OR packet->'valuations' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->'valuations'
  OR packet->>'calculatorExecutionHash' IS DISTINCT FROM h->'result'->'payload'->'validatedArticle'->>'calculatorExecutionHash'
  OR review->>'schemaVersion' IS DISTINCT FROM 'research-editorial-review-v2' OR review->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR review->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR review->>'decision' IS NULL OR review->>'decision' NOT IN ('accepted','revision_required','rejected')
  OR octet_length(convert_to(public.research_complete_canonical_v2(review),'UTF8'))>65536 OR v->>'schemaVersion' IS DISTINCT FROM 'validated-editorial-review-v2'
  OR v->'review' IS DISTINCT FROM review OR v->>'reviewHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR v->>'articleHash' IS DISTINCT FROM packet->>'articleHash' OR v->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash'
  OR v->>'validationStatus' IS DISTINCT FROM 'contract_valid_only' OR v->'controllerReportOnly' IS DISTINCT FROM 'true'::jsonb
  OR v->'publishableResearch' IS DISTINCT FROM 'false'::jsonb OR v->'researchQualified' IS DISTINCT FROM 'false'::jsonb
  OR v->'strategyApproved' IS DISTINCT FROM 'false'::jsonb OR v->'entryEligible' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'research_reviewer_result_review_binding'; END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(o) key) IS DISTINCT FROM
  ARRAY['articleHash','assignmentId','attempt','completionObservationHash','controllerObservedEndAt','controllerObservedStartAt',
   'dispatchObservationHash','hostId','inputHash','inputRevisionId','invocationId','jobId','modelIdentity','outputHash','providerSurface',
   'reservationId','reviewPackHash','threadId','turnId','verificationLevel','version']
  OR o->>'version' IS DISTINCT FROM 'research_execution_observation_v2' OR o->>'verificationLevel' IS DISTINCT FROM 'trusted_controller_observation'
  OR o->>'providerSurface' IS DISTINCT FROM 'codex_cross_chat' OR o->>'assignmentId' IS DISTINCT FROM ra->>'assignment_id'
  OR o->>'jobId' IS DISTINCT FROM ra->>'job_id' OR o->'attempt' IS DISTINCT FROM ra->'attempt'
  OR o->>'reservationId' IS DISTINCT FROM ra->>'reservation_id' OR o->>'inputRevisionId' IS DISTINCT FROM p_revision_id::text
  OR o->>'inputHash' IS DISTINCT FROM p_input_hash OR o->>'articleHash' IS DISTINCT FROM packet->>'articleHash'
  OR o->>'reviewPackHash' IS DISTINCT FROM p_result->>'packetHash' OR o->>'outputHash' IS DISTINCT FROM public.research_complete_hash_v2(review)
  OR jsonb_typeof(o->'invocationId') IS DISTINCT FROM 'string' OR length(o->>'invocationId') NOT BETWEEN 1 AND 200
  OR o->>'invocationId' ~ '[[:cntrl:]]' OR btrim(o->>'invocationId') IS DISTINCT FROM o->>'invocationId'
  OR jsonb_typeof(o->'threadId') IS DISTINCT FROM 'string' OR o->>'threadId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR o->>'threadId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'threadId'
  OR o->>'invocationId' IS NOT DISTINCT FROM h->'result'->'payload'->'observation'->>'invocationId'
  OR o->>'dispatchObservationHash' IS NULL OR o->>'dispatchObservationHash' !~ '^[a-f0-9]{64}$'
  OR o->>'completionObservationHash' IS NULL OR o->>'completionObservationHash' !~ '^[a-f0-9]{64}$'
  OR EXISTS(SELECT FROM jsonb_each(o) x WHERE x.key IN ('hostId','turnId','modelIdentity') AND x.value<>'null'::jsonb
   AND (jsonb_typeof(x.value)<>'string' OR length(x.value#>>'{}') NOT BETWEEN 1 AND 200 OR x.value#>>'{}' ~ '[[:cntrl:]]' OR btrim(x.value#>>'{}') IS DISTINCT FROM x.value#>>'{}'))
 THEN RAISE EXCEPTION 'research_reviewer_result_observation'; END IF;
 started:=(o->>'controllerObservedStartAt')::timestamptz;ended:=(o->>'controllerObservedEndAt')::timestamptz;reviewed:=(review->>'reviewedAt')::timestamptz;n:=clock_timestamp();
 IF started IS NULL OR ended IS NULL OR reviewed IS NULL OR NOT isfinite(started) OR NOT isfinite(ended) OR NOT isfinite(reviewed)
  OR started<(ra->>'assigned_at')::timestamptz OR started<(h->'result'->'payload'->'observation'->>'controllerObservedEndAt')::timestamptz
  OR reviewed<started OR reviewed>ended OR ended>n OR n>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz)
 THEN RAISE EXCEPTION 'research_reviewer_result_clock'; END IF;
 old:=context->'reviewResult';
 IF old<>'null'::jsonb THEN
  IF old->'payload' IS DISTINCT FROM p_result THEN RAISE EXCEPTION 'research_reviewer_result_replay_conflict'; END IF;
  IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
  RETURN old;
 END IF;
 INSERT INTO public.research_reviewer_results_v2(assignment_id,invocation_id,result_hash,logical_bytes,received_at,payload)
 VALUES((ra->>'assignment_id')::uuid,o->>'invocationId',public.research_complete_hash_v2(p_result),bytes,n,p_result) RETURNING * INTO saved;
 INSERT INTO public.research_model_completions_v1(reservation_id,owner,outcome,result_hash)
 VALUES((ra->>'reservation_id')::uuid,ra->>'work_owner','completed',saved.result_hash);
 IF clock_timestamp()>=least((ra->>'original_job_deadline')::timestamptz,(ra->>'reservation_expires_at')::timestamptz) THEN RAISE EXCEPTION 'research_reviewer_result_expired'; END IF;
 RETURN to_jsonb(saved)-'invocation_id';
END $$;$replacement$;
 SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.oid) INTO identity_now FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions');
 SELECT jsonb_build_object('schemas',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.oid) FROM pg_namespace n WHERE n.nspname IN ('public','auth','extensions')),'objects',(SELECT jsonb_agg(jsonb_build_array(kind,oid,name) ORDER BY kind,name) FROM (SELECT 'relation' kind,c.oid,n.nspname||'.'||c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'type',t.oid,n.nspname||'.'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions') UNION ALL SELECT 'role',r.oid,r.rolname FROM pg_roles r) objects)) INTO object_identity_now;
 IF identity_now IS DISTINCT FROM identity_before OR object_identity_now IS DISTINCT FROM object_identity_before THEN RAISE EXCEPTION 'reviewer_union_identity_changed';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]'::jsonb) INTO defaults_after FROM pg_default_acl d;
 IF defaults_after IS DISTINCT FROM defaults_before THEN RAISE EXCEPTION 'reviewer_union_defaults_changed';END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.assert_research_editorial_review_v2(jsonb,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '086a4b3af6b31a7277ee0b097ad83f94d720622022363092d524e255e57e0a50' THEN RAISE EXCEPTION 'reviewer_union_successor_body';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='assert_research_editorial_review_v2(jsonb,jsonb)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure('public.receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)');
 IF encode(sha256(convert_to(source,'UTF8')),'hex') IS DISTINCT FROM '8505d96f288d7e222fa85779f7c400f44c7a54dcca0c8bfc4e33e6cc73d72302' THEN RAISE EXCEPTION 'reviewer_union_successor_body';END IF;
 SELECT jsonb_set(namespace_before,'{routines}',jsonb_agg(CASE WHEN x->>'schema'='public' AND x->>'signature'='receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)' THEN jsonb_set(x,'{body}',to_jsonb(source)) ELSE x END ORDER BY ord)) INTO namespace_before FROM jsonb_array_elements(namespace_before->'routines') WITH ORDINALITY e(x,ord);
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'definition',CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE NULL END) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','extensions')),
 'routines',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'signature',p.oid::regprocedure::text,'kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'securityDefiner',p.prosecdef,'language',l.lanname,'result',pg_get_function_result(p.oid),'argumentNames',p.proargnames,'argumentModes',p.proargmodes,'allArgumentTypes',(SELECT array_agg(format_type(x,NULL)) FROM unnest(p.proallargtypes) x),'body',p.prosrc,'binary',p.probin,'strict',p.proisstrict,'leakproof',p.proleakproof,'parallel',p.proparallel,'volatile',p.provolatile) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname IN ('public','auth','extensions') AND p.prokind IN ('f','p')),
 'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'limit',rolconnlimit,'config',rolconfig,'validUntil',rolvaliduntil,'passwordSet',(SELECT rolpassword IS NOT NULL FROM pg_authid WHERE oid=pg_roles.oid)) ORDER BY rolname) FROM pg_roles),
 'types',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype,'owner',pg_get_userbyid(t.typowner),'acl',t.typacl,'notNull',t.typnotnull,'default',t.typdefault,'baseType',format_type(t.typbasetype,t.typtypmod),'collation',t.typcollation::regcollation::text) ORDER BY n.nspname,t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','auth','extensions'))
 ) INTO namespace_now;
 IF namespace_now IS DISTINCT FROM namespace_before THEN RAISE EXCEPTION 'reviewer_union_namespace_postcondition';END IF;
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
 SELECT x->>'definitionSha256' INTO changed_definition FROM jsonb_array_elements(catalog->'functions') x WHERE x->>'signature'='assert_research_editorial_review_v2(jsonb,jsonb)';
 IF changed_definition IS NULL THEN RAISE EXCEPTION 'reviewer_union_definition_missing';END IF;
 SELECT jsonb_set(before_catalog,'{functions}',jsonb_agg(CASE WHEN x->>'signature'='assert_research_editorial_review_v2(jsonb,jsonb)' THEN jsonb_set(x,'{definitionSha256}',to_jsonb(changed_definition)) ELSE x END ORDER BY ord)) INTO before_catalog FROM jsonb_array_elements(before_catalog->'functions') WITH ORDINALITY e(x,ord);
 SELECT x->>'definitionSha256' INTO changed_definition FROM jsonb_array_elements(catalog->'functions') x WHERE x->>'signature'='receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)';
 IF changed_definition IS NULL THEN RAISE EXCEPTION 'reviewer_union_definition_missing';END IF;
 SELECT jsonb_set(before_catalog,'{functions}',jsonb_agg(CASE WHEN x->>'signature'='receive_research_reviewer_result_v2(jsonb,uuid,text,text,text,uuid,text,jsonb)' THEN jsonb_set(x,'{definitionSha256}',to_jsonb(changed_definition)) ELSE x END ORDER BY ord)) INTO before_catalog FROM jsonb_array_elements(before_catalog->'functions') WITH ORDINALITY e(x,ord);
 IF catalog IS DISTINCT FROM before_catalog THEN RAISE EXCEPTION 'reviewer_union_catalog_postcondition';END IF;
END $reviewer_union_fence$;
COMMIT;
