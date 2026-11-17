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

test('internal planner keeps its backend callers and withdraws public execution', async t => {
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
  } finally {
    await fixture.finish();
  }
});
