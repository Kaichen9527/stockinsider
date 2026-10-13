// Finite read-only pg_catalog projection: no OIDs, mutable data or inferred authority.
export const financialHistoryCatalogSql = `SELECT jsonb_build_object(
 'functions', (SELECT jsonb_agg(jsonb_build_object(
   'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
   'bodySha256',encode(extensions.digest(convert_to(p.prosrc,'utf8'),'sha256'),'hex'),
   'owner',pg_get_userbyid(p.proowner),'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),
   'config',p.proconfig,'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,
   'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'privilege',a.privilege_type,'grantable',a.is_grantable,'grantor',pg_get_userbyid(a.grantor)) ORDER BY a.grantee=0,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
     FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.proname)
   FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN(
     'prepare_opportunity_financial_fact_series_v3','append_financial_fact_v3',
     'append_financial_fact_pre_history_v1','read_financial_history_page_v1','legacy_correctness_immutable_v3_11')),
 'observation', (SELECT jsonb_build_object('kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
   'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
   'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
     'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee=0,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
     FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'number',a.attnum,'type',t.typname,'typeSchema',n.nspname,
     'columnAcl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN ca.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(ca.grantee) END,
       'privilege',ca.privilege_type,'grantable',ca.is_grantable) ORDER BY ca.grantee=0,CASE WHEN ca.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(ca.grantee) END,ca.privilege_type) FROM aclexplode(a.attacl) ca),
     'collation',(SELECT collname FROM pg_collation WHERE oid=a.attcollation),'collationSchema',(SELECT nspname FROM pg_namespace WHERE oid=(SELECT collnamespace FROM pg_collation WHERE oid=a.attcollation)),
     'notNull',a.attnotnull,'typeModifier',a.atttypmod,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
     ORDER BY a.attnum) FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace n ON n.oid=t.typnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,'validated',k.convalidated,
     'deferrable',k.condeferrable,'deferred',k.condeferred,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname)
     FROM pg_constraint k WHERE k.conrelid=c.oid),
   'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,
     'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb)
     FROM pg_policy WHERE polrelid=c.oid),
   'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'type',tgtype,'enabled',tgenabled,'internal',tgisinternal,
     'function',tgfoid::regprocedure::text,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
     FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)) FROM pg_class c WHERE c.oid=to_regclass('public.opportunity_financial_observations_v1')),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'method',am.amname,
   'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'unique',i.indisunique,'primary',i.indisprimary,
   'keyCount',i.indnkeyatts,'columnCount',i.indnatts,'definition',pg_get_indexdef(c.oid)) ORDER BY c.relname)
   FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid JOIN pg_am am ON am.oid=c.relam
   WHERE c.oid=ANY(ARRAY[to_regclass('public.opportunity_financial_facts_v3_history_page_v1'),
     to_regclass('public.opportunity_financial_facts_v3_period_revisions_v1')]))) AS catalog`;
export async function readFinancialHistoryCatalog(client) {
 return (await client.query(financialHistoryCatalogSql)).rows[0]?.catalog;
}
