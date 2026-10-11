import fs from 'node:fs';
import { createHash } from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item)
  && typeof item === 'object' ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, 'en'))) : item);
const profileUrl = new URL('./research-publication-install-profile.json', import.meta.url);

// Catalog expressions contain no rows or secrets. OIDs are resolved to stable
// names. Exact definitions and effective privileges catch altered overloads,
// column grants, inherited access, disabled triggers and unvalidated constraints.
export async function readResearchPublicationCatalog(client, scope) {
  const { rows } = await client.query(`SELECT jsonb_build_object(
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
        FROM unnest($3::text[]) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb),
      'effectiveOtherAcl',COALESCE((SELECT jsonb_agg(jsonb_build_array(r,priv,
        has_table_privilege(r,c.oid,priv)) ORDER BY r,priv)
        FROM unnest($3::text[]) r CROSS JOIN unnest(ARRAY['DELETE','TRUNCATE','TRIGGER']) priv
        WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
    ) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[])),'[]'::jsonb),
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
        FROM unnest($3::text[]) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r)),'[]'::jsonb)
      ) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY($2::text[]) AND p.prokind='f'),'[]'::jsonb),
    'roles',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,
      'inherit',r.rolinherit,'super',r.rolsuper,'createRole',r.rolcreaterole,
      'createDb',r.rolcreatedb,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connectionLimit',r.rolconnlimit,'config',r.rolconfig,
      'membership',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(m.roleid),
        pg_get_userbyid(m.member),pg_get_userbyid(m.grantor),m.admin_option,m.inherit_option,m.set_option)
        ORDER BY m.roleid::regrole::text,m.member::regrole::text,m.grantor::regrole::text)
        FROM pg_auth_members m WHERE m.roleid=r.oid OR m.member=r.oid),'[]'::jsonb)) ORDER BY r.rolname)
      FROM pg_roles r WHERE r.rolname=ANY($3::text[])),'[]'::jsonb),
    'types',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,
      'owner',pg_get_userbyid(t.typowner),'base',format_type(t.typbasetype,t.typtypmod),
      'notNull',t.typnotnull,'default',t.typdefault,
      'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) x),'[]'::jsonb),
      'attributes',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'collation',a.attcollation::regcollation::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=t.typrelid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
      'labels',COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb),
      'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid,true)) ORDER BY c.conname) FROM pg_constraint c WHERE c.contypid=t.oid),'[]'::jsonb)) ORDER BY t.typname)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=ANY($4::text[]) AND (t.typtype IN ('e','d') OR (t.typtype='c' AND EXISTS(SELECT FROM pg_class c WHERE c.oid=t.typrelid AND c.relkind='c')))),'[]'::jsonb),
    'schemas',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',n.nspname,
      'owner',pg_get_userbyid(n.nspowner),'acl',COALESCE((SELECT jsonb_agg(jsonb_build_array(pg_get_userbyid(x.grantor),CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY x.grantor::regrole::text,x.grantee::regrole::text,x.privilege_type) FROM aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x),'[]'::jsonb),'effectiveAcl',(SELECT jsonb_agg(jsonb_build_array(r,
        has_schema_privilege(r,n.oid,'USAGE'),has_schema_privilege(r,n.oid,'CREATE')) ORDER BY r)
        FROM unnest($3::text[]) r WHERE EXISTS(SELECT FROM pg_roles WHERE rolname=r))) ORDER BY n.nspname)
      FROM pg_namespace n WHERE n.nspname IN ('public','extensions','auth')),'[]'::jsonb)
  ) AS catalog`, [scope.tables, scope.functions, scope.roles, scope.types]);
  const result = rows?.[0]?.catalog;
  if (!result || !['tables','functions','roles','schemas','types'].every(k => Array.isArray(result[k])))
    throw new Error('research_publication_catalog_unreadable');
  // Store body hashes rather than duplicating function source or pg_dump text.
  for (const fn of result.functions) { fn.definitionSha256 = sha(fn.definition); delete fn.definition; }
  return result;
}

export function fingerprintResearchPublicationCatalog(catalog) {
  return Object.fromEntries(Object.entries(catalog).map(([kind, entries]) => [kind,
    entries.map(item => ({ name: item.name, ...(item.signature ? {signature:item.signature} : {}),
      sha256: sha(canonical(item)) }))]));
}

export async function assertResearchPublicationCatalog(client, stage) {
  const profile = JSON.parse(fs.readFileSync(profileUrl, 'utf8'));
  const expected = profile.stages[stage];
  if (!expected || profile.schemaVersion !== 'research-publication-install-profile-v1')
    throw new Error('research_publication_catalog_stage_invalid');
  for (const [relative, digest] of profile.migrations) {
    if (sha(fs.readFileSync(new URL('../../' + relative, import.meta.url))) !== digest)
      throw new Error('research_publication_profile_source_changed');
  }
  const actual = await readResearchPublicationCatalog(client, expected.scope);
  if (canonical(fingerprintResearchPublicationCatalog(actual)) !== canonical(expected.catalog)) {
    const categories = Object.keys(actual).filter(key => canonical(fingerprintResearchPublicationCatalog(actual)[key]) !== canonical(expected.catalog[key]));
    throw new Error('research_publication_catalog_mismatch:' + stage + ':' + categories.join(','));
  }
  return { stage, catalogSha256: sha(canonical(actual)) };
}
