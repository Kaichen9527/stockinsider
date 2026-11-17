import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { workerFixture } from './vnext-worker-fixture.mjs';

const planner = 'public.opportunity_candidate_plan_v3_internal(uuid,text)';
const historicalFunctionSha256 = 'ad26cb165d6a67bdb2c8e3a38d204c3af3a3be67d180a72c4012faa1b00c32db';
const principals = [
  'anon', 'authenticated', 'opportunity_v3_rpc_owner', 'service_role', 'research_source_fence_owner_v2',
];

async function readAcl(observer) {
  const { rows: [result] } = await observer.query(`
    SELECT oid::text, to_jsonb(p) - 'proacl' AS definition,
      encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex') AS "functionSha256",
      ARRAY(SELECT role FROM unnest($2::text[]) role WHERE has_function_privilege(role, p.oid, 'EXECUTE')) AS executable,
      ARRAY(
        SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.privilege_type='EXECUTE'
        ORDER BY 1
      ) AS acl
    FROM pg_proc p WHERE p.oid = $1::regprocedure`, [planner, principals]);
  return result;
}

async function privilegedCaller(fixture, role) {
  assert.ok(['service_role', 'opportunity_v3_rpc_owner'].includes(role));
  const connection = await fixture.connect();
  try {
    await connection.query('BEGIN READ ONLY');
    await connection.query('SET LOCAL ROLE ' + role);
    // The empty fixture has no such run. This fixed result confirms execution
    // reached the unchanged planner without reading any candidate data.
    await assert.rejects(connection.query(`
      SELECT count(*) FROM public.opportunity_candidate_plan_v3_internal(
        '00000000-0000-0000-0000-000000000000'::uuid, 'active'
      )`), { code: 'P0002' });
  } finally {
    await connection.query('ROLLBACK');
    await fixture.close(connection);
  }
}


const subscriberProbe = 'public.is_subscriber()';
const subscriberIdentity = '00000000-0000-4000-8000-000000000241';
const readerIdentity = '00000000-0000-4000-8000-000000000242';

async function subscriptionReaders(fixture) {
  const cases = [
    {role:'anon', subject:'', subscribed:false, reports:['public']},
    {role:'authenticated', subject:readerIdentity, subscribed:false, reports:['members','public']},
    {role:'authenticated', subject:subscriberIdentity, subscribed:true, reports:['members','public','subscribers']},
    {role:'service_role', subject:'', subscribed:false, reports:['members','public','subscribers']},
  ];
  for (const login of cases) {
    const c = await fixture.connect();
    try {
      await c.query('BEGIN READ ONLY');
      await c.query('SET LOCAL ROLE ' + login.role);
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role',$2,true)",
        [login.subject,login.role]);
      const {rows:[result]} = await c.query(
        'SELECT public.is_subscriber() AS subscribed, ARRAY (SELECT text FROM public.daily_catalysts WHERE text = ANY ($1::text[]) ORDER BY text) AS reports',
        [['members','public','subscribers']],
      );
      assert.deepEqual(result,{subscribed:login.subscribed,reports:login.reports});
    } finally {
      await c.query('ROLLBACK');
      await fixture.close(c);
    }
  }
}

async function subscriberState(fixture) {
  const query = `SELECT oid::text, to_jsonb(p)-'proacl'-'proconfig' AS definition, p.proconfig AS config,
    has_function_privilege('research_source_fence_owner_v2',p.oid,'EXECUTE') AS "sourceExecute",
    has_schema_privilege('research_source_fence_owner_v2','public','USAGE') AS "sourceUsage",
    ARRAY(
      SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END
      FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.privilege_type='EXECUTE' ORDER BY 1
    ) AS grantees
  FROM pg_proc p WHERE p.oid=$1::regprocedure`;
  const {rows:[row]} = await fixture.observer.query(query,[subscriberProbe]);
  return row;
}

async function testSubscriberScope(t, fixture) {
  await fixture.writer.query('INSERT INTO auth.users(id) VALUES ($1),($2)',[subscriberIdentity,readerIdentity]);
  await fixture.writer.query(
    'INSERT INTO public.profiles(user_id,is_subscriber) VALUES ($1,true),($2,false) ON CONFLICT (user_id) DO UPDATE SET is_subscriber=EXCLUDED.is_subscriber',
    [subscriberIdentity,readerIdentity],
  );
  await fixture.writer.query(`
    WITH fixtures AS (
      INSERT INTO public.reports(report_type,visibility,title,slug,date)
      SELECT 'top10_daily', name, 'Synthetic role fixture', 'scope-fixture-' || name, DATE '2026-10-22'
      FROM unnest(ARRAY['public','members','subscribers']) AS kinds(name)
      RETURNING id,visibility
    )
    INSERT INTO public.daily_catalysts(report_id,text) SELECT id,visibility FROM fixtures`);
  const before = await subscriberState(fixture);
  const rows = await fixture.snapshot();
  assert.equal(before.config,null);
  assert.equal(before.sourceExecute,true);
  assert.equal(before.sourceUsage,false);
  assert.deepEqual(before.grantees,['PUBLIC','anon','authenticated','postgres','service_role']);

  await t.test('legacy reports preserve access for web roles and service before the ACL change',async () => {
    await subscriptionReaders(fixture);
  });
  await t.test('withdraw the inherited subscriber lookup without granting source schema access',async () => {
    const sql = readFileSync(new URL('../migrations/20261117_44_vnext_legacy_subscription_acl_v1.sql',import.meta.url),'utf8');
    await fixture.writer.query(sql);
    const after = await subscriberState(fixture);
    assert.equal(after.oid,before.oid);
    assert.deepEqual(after.definition,before.definition);
    assert.deepEqual(after.config,['search_path=pg_catalog']);
    assert.equal(after.sourceExecute,false);
    assert.equal(after.sourceUsage,false);
    assert.deepEqual(after.grantees,['anon','authenticated','postgres','service_role']);
    assert.deepEqual(await fixture.snapshot(),rows);
  });
  await t.test('legacy report RLS and subscriber lookup preserve all four caller cases',async () => {
    await subscriptionReaders(fixture);
    fixture.save('legacy-subscriber-acl-safe',{
      functionBodyRetained:true,independentSearchPath:true,sourceOwnerCanExecute:false,sourceSchemaUsage:false,
      legacyCallerCases:4,accessSurface:'report helpers and row security',synthetic:true,
    });
  });
}


async function checkSourceOwnerBoundary(fixture) {
  const observer = fixture.observer;
  await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const queries = `SELECT jsonb_build_object('role',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,
 'bypassRls',r.rolbypassrls,
 'membershipsOut',(SELECT count(*) FROM pg_auth_members WHERE member=r.oid),
 'membershipsIn',(SELECT count(*) FROM pg_auth_members WHERE roleid=r.oid),
 'publicUsage', has_schema_privilege(r.oid,'public','USAGE'),
 'publicCreate', has_schema_privilege(r.oid,'public','CREATE'),
 'publicCallableDefiners',(SELECT jsonb_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p
   WHERE p.pronamespace='public'::regnamespace AND p.prosecdef AND p.prokind='f' AND p.prorettype NOT IN ('pg_catalog.trigger'::regtype,'pg_catalog.event_trigger'::regtype)
     AND has_function_privilege(r.oid,p.oid,'EXECUTE'))) FROM pg_roles r WHERE r.rolname='research_source_fence_owner_v2';
WITH rights AS MATERIALIZED (
 SELECT relname,relrowsecurity AS rls,relforcerowsecurity AS forced,relowner=(SELECT oid FROM pg_roles WHERE rolname='research_source_fence_owner_v2') as owned,
 ARRAY(SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p WHERE has_any_column_privilege('research_source_fence_owner_v2',c.oid,p))
 || ARRAY(SELECT p FROM unnest(ARRAY['DELETE','TRUNCATE','TRIGGER','MAINTAIN']) p WHERE has_table_privilege('research_source_fence_owner_v2',c.oid,p)) AS rights
 FROM pg_class c WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p','v','m','f')
)
SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY relname),'[]') FROM rights v WHERE cardinality(rights)>0;
SELECT coalesce(jsonb_agg(jsonb_build_object('name',relname,'usage',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'USAGE'),
 'select',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'SELECT'),'update',has_sequence_privilege('research_source_fence_owner_v2',c.oid,'UPDATE')) ORDER BY relname),'[]')
 FROM pg_class c WHERE relnamespace='public'::regnamespace AND relkind='S'
 AND CASE WHEN relkind='S' THEN has_sequence_privilege('research_source_fence_owner_v2',c.oid,'USAGE,SELECT,UPDATE') ELSE false END;
SELECT jsonb_build_object(
 'publicOperators',(SELECT count(*) FROM pg_operator WHERE oprnamespace='public'::regnamespace),
 'publicCallableCastFunctions',(SELECT count(*) FROM pg_cast c JOIN pg_proc p ON p.oid=c.castfunc WHERE p.pronamespace='public'::regnamespace),
 'publicTypesWithNonCatalogInput',(SELECT count(*) FROM pg_type t JOIN pg_proc p ON p.oid=t.typinput WHERE t.typnamespace='public'::regnamespace AND p.pronamespace<>'pg_catalog'::regnamespace));`;
    const answers = await observer.query(queries);
    const [role, relationAccess, sequences, callAdapters] = answers.map(result => Object.values(result.rows[0])[0]);
    assert.deepEqual(role, {
      role: 'research_source_fence_owner_v2',
      login: false, bypassRls: false, superuser: false,
      publicUsage: false, publicCreate: false, membershipsIn: 0, membershipsOut: 0,
      publicCallableDefiners: [
        'assert_research_source_seal_v2(uuid)',
        'research_publication_source_state_v2(uuid)',
        'seal_research_sources_v2(jsonb,timestamp with time zone)',
      ],
    });

    const ownedRights = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES', 'DELETE', 'TRUNCATE', 'TRIGGER', 'MAINTAIN'];
    const sourceRelations = [
      'research_source_fence_events_v2', 'research_source_seal_invalidations_v2', 'research_source_seals_v2',
    ];
    assert.deepEqual(relationAccess, [
      ...sourceRelations.map(relname => ({ relname, rls: true, owned: true, forced: false, rights: ownedRights })),
      { relname: 'source_raw_documents', rls: false, owned: false, forced: false, rights: ['SELECT'] },
    ]);
    assert.deepEqual(sequences, [
      { name: 'research_source_fence_events_v2_event_id_seq', usage: true, select: true, update: true },
    ]);
    assert.deepEqual(callAdapters, { publicOperators: 0, publicCallableCastFunctions: 0, publicTypesWithNonCatalogInput: 0 });
    fixture.save('source-owner-boundary-safe', {
      role, relationAccess, sequences, callAdapters,
      transaction: 'repeatable read read only',
      reachesLegacySubscriberOrPlanner: false,
      namespaceGrantApplied: false,
    });
  } finally {
    await observer.query('ROLLBACK');
  }
}


async function checkRawWriteRequiresNamespace(fixture) {
  const release = 'a'.repeat(40);
  const lease = '00000000-0000-4000-8000-000000000260';
  const before = await fixture.snapshot();
  const writer = await fixture.connect();
  try {
    await writer.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await writer.query(
      "INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",
      [release],
    );
    await writer.query('SET LOCAL ROLE service_role');
    await writer.query("SELECT set_config('request.headers',$1,true), set_config('request.jwt.claims',$2,true)", [
      JSON.stringify({'x-stockinsider-writer-release':release}), JSON.stringify({role:'service_role'}),
    ]);
    const { rows: [acquire] } = await writer.query(
      "SELECT current_user AS role, public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",
      [lease],
    );
    assert.deepEqual(acquire, { role: 'service_role', acquired: true });

    const write = writer.query(`
      INSERT INTO public.source_raw_documents(platform,document_url,title,content_text,published_at,collected_at,symbols,metadata)
      VALUES('twse_insider','https://www.twse.com.tw/synthetic-acl-boundary-only','Synthetic ACL regression fixture',
        'Synthetic source used only in the local transaction.',clock_timestamp(),clock_timestamp(),'["2409"]'::jsonb,
        jsonb_build_object('original_event_at',clock_timestamp()))`);
    await assert.rejects(write, error => {
      assert.equal(error.code, '42501');
      assert.equal(error.message, 'permission denied for schema public');
      assert.match(error.where, /PL\/pgSQL function (?:public\.)?research_source_fence_record_v2\(\) line /u);
      assert.match(error.internalQuery, /public\.research_source_root_v2\(/u);
      return true;
    });
  } finally {
    await writer.query('ROLLBACK');
    await fixture.close(writer);
  }
  assert.deepEqual(await fixture.snapshot(), before);

  const names = [
    'public.research_source_fence_write_v2()', 'public.research_source_fence_record_v2()',
    'public.research_source_root_v2(jsonb)', 'public.seal_research_sources_v2(jsonb,timestamptz)',
    'public.assert_research_source_seal_v2(uuid)', 'public.research_publication_source_state_v2(uuid)',
  ];
  const { rows: definitions } = await fixture.observer.query(`
    SELECT name, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS "securityDefiner",
      p.prorettype::regtype::text AS "resultType", p.proconfig AS settings,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS "definitionSha256"
    FROM unnest($1::text[]) WITH ORDINALITY calls(name,position)
    JOIN pg_proc p ON p.oid=to_regprocedure(name)
    ORDER BY position`, [names]);
  assert.deepEqual(definitions.map(definition => definition.name), names);
  assert.deepEqual(definitions.filter(definition => definition.resultType === 'trigger').map(definition => definition.name),
    names.slice(0,2));
  for (const definition of definitions) {
    assert.equal(definition.securityDefiner, definition.name !== 'public.research_source_root_v2(jsonb)');
    if (definition.securityDefiner) assert.equal(definition.owner, 'research_source_fence_owner_v2');
  }
  fixture.save('source-writer-namespace-block-safe', {
    scope: 'Contabo PostgreSQL 17.11 disposable synthetic original',
    writerRole: 'service_role', writerLeaseAcquired: true, errorCode: '42501',
    missingPrivilege: 'public schema USAGE for the source trigger owner',
    trigger: 'research_source_fence_record_v2',
    firstRejectedCall: 'public.research_source_root_v2(jsonb)',
    transactionRolledBack: true, allPublicTableRowsUnchanged: true, definitions,
    sourceGrantExecuted: false, realSourceProcessed: false,
  });
}

test('planner and legacy report ACLs preserve their existing web and backend calls', async t => {
  const fixture = await workerFixture();
  try {
    await fixture.install();
    const before = await readAcl(fixture.observer);
    assert.equal(before.functionSha256, historicalFunctionSha256);
    assert.ok(before.acl.includes('PUBLIC'));
    const original = await fixture.snapshot();
    await t.test('both existing trusted identities reach the fixed synthetic empty-run check', async () => {
      await privilegedCaller(fixture, 'service_role');
      await privilegedCaller(fixture, 'opportunity_v3_rpc_owner');
    });

    await t.test('only the exact planner ACL changes in the tested function', async () => {
      const migration = readFileSync(new URL('../migrations/20261117_42_vnext_internal_candidate_plan_acl_v1.sql', import.meta.url), 'utf8');
      await fixture.writer.query(migration);
      const after = await readAcl(fixture.observer);
      assert.equal(after.oid, before.oid);
      assert.deepEqual(after.definition, before.definition);
      assert.deepEqual(after.executable, ['opportunity_v3_rpc_owner', 'service_role']);
      assert.ok(!after.acl.includes('PUBLIC'));
      assert.deepEqual(await fixture.snapshot(), original);
      fixture.save('candidate-planner-acl-safe', {
        originalFunctionSha256: before.functionSha256,
        functionIdentityAndDefinitionRetained: true, tableRowsRetained: true,
        beforeEffective: before.executable, afterEffective: after.executable,
        publicExecuteAfter: false, synthetic: true,
      });
    });

    await t.test('both backend identities still execute the unchanged planner', async () => {
      await privilegedCaller(fixture, 'service_role');
      await privilegedCaller(fixture, 'opportunity_v3_rpc_owner');
    });
    await testSubscriberScope(t, fixture);
    await t.test('source role retains only its known public schema capabilities', async () => {
      await checkSourceOwnerBoundary(fixture);
    });
    await t.test('an authorized source writer rolls back when the source trigger lacks the namespace prerequisite', async () => {
      await checkRawWriteRequiresNamespace(fixture);
    });
  } finally {
    await fixture.finish();
  }
});
