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
  } finally {
    await fixture.finish();
  }
});
