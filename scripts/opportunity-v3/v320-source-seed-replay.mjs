import { createHash } from 'node:crypto';

export const SOURCE_SEED_MIGRATION='migrations/20260829_v320_kol_source_authority_seed.sql';
const sourceSha256='e386cb8239115083be8c4c282b7bae43a2f2caa13e7e9e8bb2e6bf8d81164207';
const expectedIdentities=4;

function seedInputs(migration) {
  if(migration.relativePath!==SOURCE_SEED_MIGRATION ||
     createHash('sha256').update(migration.bytes).digest('hex')!==sourceSha256)
    throw Error('v320_source_seed_replay_source_changed');
  const sql=migration.bytes.toString('utf8');
  const body=sql.split('$v320_kol_source_authority_seed$');
  const roster=sql.split('$identity$');
  if(body.length!==3||roster.length!==3||JSON.parse(roster[1]).length!==expectedIdentities)
    throw Error('v320_source_seed_replay_boundary_changed');
  const variable=name=>new RegExp('^  v_source_reviewer_'+name+" (?:uuid|text) := '([a-f0-9-]+)'(?:::uuid)?;",'mu').exec(body[1])?.[1];
  const principal=variable('principal_id');
  const binding=variable('binding_id');
  const configuration=variable('configuration_hash');
  if(!principal||!binding||!configuration)throw Error('v320_source_seed_replay_binding_missing');
  return Object.freeze([roster[1],body[1],principal,binding,configuration]);
}

const inspectSql=[
  'WITH wanted AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS item(',
  ' id uuid,platform text,"entityType" text,"displayName" text,"sourceIdentityKey" text,"profileUrl" text,',
  ' "sourceKey" text,"sourceClass" text,"distributionIdentity" text)),',
  ' fn AS (SELECT p.* FROM pg_catalog.pg_proc p WHERE p.oid=',
  "   pg_catalog.to_regprocedure('public.seed_v320_kol_source_authorities()'))",
  'SELECT',
  ' (SELECT count(*)::int FROM wanted w WHERE (SELECT count(*) FROM public.source_entities s',
  '   WHERE s.id=w.id OR s.source_key=w."sourceIdentityKey")=1',
  '   AND EXISTS(SELECT FROM public.source_entities s WHERE s.id=w.id AND s.source_key=w."sourceIdentityKey"',
  '    AND s.platform=w.platform AND s.entity_type=w."entityType" AND s.display_name=w."displayName"',
  "    AND s.profile_url IS NOT DISTINCT FROM w.\"profileUrl\" AND s.status='active')) AS identities,",
  ' (SELECT count(*)::int FROM wanted w WHERE (SELECT count(*) FROM public.source_identity_authorities_v3 a',
  '    WHERE a.source_identity_id=w.id AND a.source_key::text=w."sourceKey"',
  '      AND a.distribution_identity=w."distributionIdentity" AND a.status::text=\'active\')=1',
  '   AND EXISTS(SELECT FROM public.source_identity_authorities_v3 a WHERE a.source_identity_id=w.id',
  '      AND a.source_key::text=w."sourceKey" AND a.source_class::text=w."sourceClass"',
  '      AND a.distribution_identity=w."distributionIdentity" AND a.status::text=\'active\'',
  "      AND a.valid_from='1970-01-01T00:00:00Z'::timestamptz AND a.valid_to IS NULL)) AS authorities,",
  ' (SELECT count(*)::int FROM public.internal_principal_role_bindings_v3 b WHERE b.binding_id=$4::uuid',
  "    AND b.principal_id=$3::uuid AND b.role::text='source_reviewer' AND b.status::text='active'",
  '    AND b.valid_from<=clock_timestamp() AND b.valid_to IS NULL AND b.configuration_hash=$5) AS bindings,',
  ' EXISTS(SELECT FROM fn p JOIN pg_catalog.pg_language l ON l.oid=p.prolang',
  "    WHERE p.prosrc=$2 AND p.prosecdef AND l.lanname='plpgsql' AND p.prokind='f' AND p.pronargs=0",
  "      AND p.prorettype='pg_catalog.void'::regtype AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof",
  "      AND p.provolatile='v' AND p.proparallel='u' AND p.proconfig=ARRAY['search_path=\"\"']",
  "      AND pg_catalog.pg_get_userbyid(p.proowner) IN (current_user,'postgres')) AS \"functionExact\",",
  ' EXISTS(SELECT FROM fn p',
  "    WHERE NOT EXISTS(SELECT FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a",
  "       WHERE a.grantee=0 AND a.privilege_type='EXECUTE')",
  "    AND NOT EXISTS(SELECT FROM pg_catalog.pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','stockinsider_runtime_v319')",
  "       AND pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE'))) AS \"executeClosed\"",
].join('\n');

async function observe(client,inputs) {
  const {rows}=await client.query(inspectSql,inputs);
  const result=rows[0];
  if(rows.length!==1 || !['identities','authorities','bindings'].every(k=>Number.isInteger(result[k])) ||
     typeof result.functionExact!=='boolean' || typeof result.executeClosed!=='boolean')
    throw Error('v320_source_seed_replay_observation_invalid');
  return result;
}

function complete(result) {
  return result.identities===expectedIdentities && result.authorities===expectedIdentities &&
    result.bindings===1 && result.functionExact && result.executeClosed;
}

export async function inspectV320SourceSeed(client,migration) {
  return observe(client,seedInputs(migration));
}

// A complete archive requires no seed call. Lock the three data relations
// and recheck all preconditions before the caller retains the existing state.
export async function lockSatisfiedV320SourceSeed(client,migration) {
  const inputs=seedInputs(migration);
  if(!complete(await observe(client,inputs)))return null;
  await client.query('LOCK TABLE public.internal_principal_role_bindings_v3, public.source_entities, public.source_identity_authorities_v3 IN SHARE ROW EXCLUSIVE MODE');
  await verifySatisfiedV320SourceSeed(client,inputs);
  return inputs;
}

export async function verifySatisfiedV320SourceSeed(client,inputs) {
  if(!complete(await observe(client,inputs)))throw Error('v320_source_seed_replay_checkpoint_changed');
}
