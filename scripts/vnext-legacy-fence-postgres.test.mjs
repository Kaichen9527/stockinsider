/** New vNext coexistence proof. Prefix uses exact main schema/financial50/pub26
 * engineering libraries; never imports old test entries or deployment CLIs.
 * Entire database/roles belong to the explicitly named, network-none VM fixture.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { MIGRATIONS, applyReviewedMigrationPlanToClient } from './opportunity-v3/apply-reviewed-migrations.mjs';
import { FINANCIAL_TAIL, selectFinancialHistoryChain, orderedHash } from './opportunity-v3/financial-history-install-guard.mjs';
import { OWNERSHIP_PRELUDE, makeFinancialExistingSchemaProfile } from './opportunity-v3/financial-existing-schema-profile.mjs';
import { ensureVpsRuntimeRole } from './opportunity-v3/financial-vps-operator-action.mjs';
import { financialOperatorActionIdentity } from './opportunity-v3/financial-vps-operator-binding.mjs';
import { loadPublicationTail } from './opportunity-v3/research-publication-tail-extraction.mjs';
import { applyPublicationTailToEngineeringClient } from './opportunity-v3/research-publication-tail-atomic-client.mjs';
const { Client } = createRequire(import.meta.url)('pg');
const root = process.cwd();
const container = process.env.VNEXT_TEST_CONTAINER;
const directory = process.env.VNEXT_LEGACY_SOCKET_PARENT;
const output = process.env.VNEXT_NATIVE_ARTIFACTS;
const database = process.env.VNEXT_LEGACY_DATABASE || 'vnext_legacy';
if (!/^vnext_legacy(?:_[0-9]{2})?$/u.test(database)) throw Error('closed_owned_database_required');
if (!/^stockinsider-vnext-oct22-legacy-full(?:-[0-9]{2})?$/u.test(container || '') || !directory || !path.isAbsolute(directory) || !output || !path.isAbsolute(output) || fs.existsSync(output)) throw Error('fresh_explicit_owned_legacy_fixture_required');
fs.mkdirSync(output, { mode: 0o700 });
const inspect = spawnSync('docker', ['--host=unix:///var/run/docker.sock', 'inspect', container], { encoding: 'utf8' }); assert.equal(inspect.status, 0);
const identity = JSON.parse(inspect.stdout)[0]; assert.equal(identity.Config.Labels['codex.task'], 'stockinsider-vnext-oct22'); assert.equal(identity.HostConfig.NetworkMode, 'none'); assert.deepEqual(identity.HostConfig.PortBindings, {}); assert.equal(identity.HostConfig.Memory, 1073741824);
const sha = x => createHash('sha256').update(x).digest('hex');
const save = (name, data) => fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
const load = relativePath => { const bytes = fs.readFileSync(path.join(root, relativePath)); return { relativePath, bytes, sha256: sha(bytes) }; };
const migrations = selectFinancialHistoryChain(MIGRATIONS.map(load), load(FINANCIAL_TAIL), true);
const plan = { migrations, chainSha256: orderedHash(migrations), financialExistingSchemaProfile: makeFinancialExistingSchemaProfile(migrations, load(OWNERSHIP_PRELUDE)), operatorPrerequisite: financialOperatorActionIdentity() };
const clients = new Set(); const events = [];
async function connect() { const client = new Client({ host: path.join(directory, 'socket'), user: 'postgres', database, ssl: false }); await client.connect(); clients.add(client); client.once('end', () => clients.delete(client)); return client; }
async function close(c) { if (clients.has(c)) await c.end(); }
async function snapshot(c) {
  const tables = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
  const result = {};
  for (const name of tables) {
    assert.match(name, /^[a-z0-9_]+$/u);
    const rows = (await c.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public.${name} t`)).rows[0].rows;
    result[name] = { count: rows.length, sha256: sha(JSON.stringify(rows)) };
  }
  return result;
}
async function asService(c, sql, parameters, error, role = 'service_role') {
  assert.match(role, /^[a-z0-9_]+$/u);
  await c.query('SET ROLE ' + role);
  try {
    const ready = new Promise(resolve => c.connection.once('readyForQuery', message => resolve(message.status)));
    const [queryResult, readyResult] = await Promise.allSettled([c.query(sql, parameters), ready]);
    assert.equal(readyResult.status, 'fulfilled'); assert.equal(readyResult.value, 'I');
    events.push({ sqlSha256: sha(sql), actualReadyForQuery: readyResult.value });
    if (queryResult.status === 'rejected') throw queryResult.reason;
    const result = queryResult.value;
    if (error) assert.fail('actual direct RPC unexpectedly accepted');
    return result.rows;
  } catch (e) {
    events.push({ sqlSha256: sha(sql), code: e.code, message: e.message, actualQuerySettled: true });
    if (!error) throw e;
    assert.equal(e.code, /permission denied/u.test(String(error)) ? '42501' : /trigger functions/u.test(String(error)) ? '0A000' : 'P0001');
    assert.match(e.message, error);
  } finally { await c.query('RESET ROLE'); }
}
await test('new vNext shared-authority legacy RPC coexistence', { timeout: 240000 }, async t => {
  let writer; let observer;
  const step=async (name,body)=>{let failed=false;await t.test(name,async()=>{try{await body();}catch(e){failed=true;throw e;}});if(failed)throw Error('legacy_dependent_stage_failed');};
  try {
    writer = await connect(); observer = await connect();
    assert.notEqual(writer.processID, observer.processID);
    const locale=(await writer.query('SELECT datcollate,datctype FROM pg_database WHERE datname=current_database()')).rows[0];
    save('database-locale',{...locale,expectedSource:'original VM initdb under LANG=C.UTF-8; SQL array ordering is part of exact canonical profile'});
    assert.deepEqual(locale,{datcollate:'C.UTF-8',datctype:'C.UTF-8'});
    await step('exact genuine captured schema and existing approved prefixes in disposable engineering DB', async () => {
      const gz = fs.readFileSync('scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz'); const captured = gunzipSync(gz);
      assert.equal(sha(gz), '2e9fc2f8a795a13490c12a90a2d9c974e19c1e93f9593d443d834978e0a19c60');
      assert.equal(sha(captured), 'a82e3b089ee0523a9de3b1a84c0e799d878fa47bb6ec892a51af8c8e037c3731');
      const bootstrap = load('deployment/vps/bootstrap-stockinsider-postgres.sql');
      await writer.query(bootstrap.bytes.toString().replaceAll(/^\\set.*$/gm, ''));
      await writer.query('ALTER SCHEMA public RENAME TO fixture_bootstrap_public; ALTER SCHEMA extensions RENAME TO fixture_bootstrap_extensions');
      const restored = captured.toString().replaceAll(/^\\(?:restrict|unrestrict).*$/gm, '').replace('CREATE SCHEMA extensions;', 'ALTER SCHEMA fixture_bootstrap_extensions RENAME TO extensions;');
      await writer.query(restored);
      // pg_dump deliberately leaves this session's search_path empty. The
      // genuine prefix installer starts on a fresh connection, as its existing
      // engineering API requires; do not rewrite captured DDL or installer SQL.
      await close(writer); writer = await connect();
      save('prefix-source-seal', { capturedGzipSha256: sha(gz), capturedSchemaSha256: sha(captured), executedSchemaSha256: sha(restored), bootstrapSha256: bootstrap.sha256,
        financial50: plan.financialExistingSchemaProfile.orderedProfileSha256, scope: 'exact local engineering prefix; not production peer/HBA/writer or formal legacy lifecycle acceptance' });
      const applied = await applyReviewedMigrationPlanToClient(writer, plan, { privateVpsPeerOperator: true, bootstrapVpsRuntimeRole: true, financialExistingSchemaProfile: true, sourceCommit: null, attestationCommit: null }, {
        operatorPrerequisiteExecutor: async c => ({ transport: { engineeringOnly: true, privatePeerTransportVerified: false, effectiveHbaVerified: false }, role: await ensureVpsRuntimeRole(c) }),
      });
      clients.delete(writer); save('financial-prefix', applied); writer = await connect();
      const tail = await applyPublicationTailToEngineeringClient(writer, loadPublicationTail(root)); save('publication-prefix', tail); writer = await connect();
      save('full-prefix-state', await snapshot(observer));
    });
    const catalog = async () => (await observer.query(`SELECT p.oid,p.oid::regprocedure::text AS signature,p.prosrc,
      pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.oid`)).rows;
    const predecessor = await catalog(); save('legacy-predecessor-catalog', predecessor);
    const main = load('migrations/20261022_stockinsider_vnext_20_v1.sql');
    const fence = load('migrations/20261022_vnext_legacy_mode_fence_v1.sql');
    save('candidate-inputs', [main,fence].map(({relativePath,bytes,sha256}) => ({relativePath,bytes:bytes.length,sha256})));
    await step('full finite predecessor fence commits and preserves old identities and original body bytes', async () => {
      await writer.query(main.bytes.toString());
      await asService(writer, 'SELECT public.vnext_command_v1($1,$2,$3)', ['none','enqueue',{symbols:[]}], /^vnext_database_mode_not_enabled$/u);
      await writer.query(fence.bytes.toString());
      const stored = (await observer.query('SELECT * FROM public.vnext_legacy_routines_v1 ORDER BY signature')).rows;
      assert.equal(stored.length,15); save('finite-wrapped-profiles', stored);
      const installed = await catalog();
      for (const old of predecessor) {
        const current = installed.find(p => p.oid===old.oid); assert.ok(current,old.signature);
        const selected = stored.find(p => p.routine===old.oid);
        if (!selected) { assert.deepEqual(current,old); continue; }
        assert.equal(selected.original_source,old.prosrc);
        const insertion = `\n PERFORM public.vnext_legacy_claim_guard_v1('${selected.signature}');`;
        assert.equal(current.prosrc.replace(insertion,''),old.prosrc);
        assert.equal(current.prosrc,selected.wrapped_source);
        assert.deepEqual({...current,prosrc:old.prosrc,definition:old.definition},old);
      }
      save('legacy-installed-catalog',installed);
      assert.deepEqual((await observer.query('SELECT * FROM public.vnext_mode_v1')).rows.map(r=>({enabled:r.enabled,legacy_fenced:r.legacy_fenced})),[{enabled:false,legacy_fenced:true}]);
      const beforeRepeat = await snapshot(observer);
      await assert.rejects(writer.query(fence.bytes.toString()), e=>e.code==='42P07');
      await writer.query('ROLLBACK'); assert.deepEqual(await snapshot(observer),beforeRepeat);
      await asService(writer,'SELECT public.vnext_set_mode_v1(true)',[],/permission denied/u);
      await writer.query('BEGIN');
      await writer.query('GRANT EXECUTE ON FUNCTION public.claim_research_deep_job_v1(text) TO anon');
      await assert.rejects(writer.query('SELECT public.vnext_set_mode_v1(true)'),e=>e.code==='P0001'&&e.message==='vnext_legacy_fence_drift');
      await writer.query('ROLLBACK'); assert.deepEqual(await snapshot(observer),beforeRepeat);
    });
    await step('concurrent mode disable is rechecked after the actual shared lock, with no mutation', async () => {
      await writer.query('SELECT public.vnext_set_mode_v1(true)');
      const before=await snapshot(observer); const contender=await connect();
      await contender.query('SET ROLE service_role');
      await writer.query('BEGIN'); await writer.query('SELECT pg_advisory_xact_lock(64221022)');
      const ready=new Promise(resolve=>contender.connection.once('readyForQuery',m=>resolve(m.status)));
      const actual=contender.query('SELECT public.vnext_command_v1($1,$2,$3)', ['unprovisioned-mode-race','screen-context',{}]).then(value=>({value}),error=>({error}));
      let blocked=false; const until=Date.now()+3000;
      while(Date.now()<until) {
        const row=(await observer.query("SELECT EXISTS(SELECT FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted) AS blocked",[contender.processID])).rows[0];
        if(row.blocked){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(blocked,true,'real pg_locks must witness the blocked contender');
      await writer.query('SELECT public.vnext_set_mode_v1(false)'); await writer.query('COMMIT');
      const result=await actual; assert.equal(result.error?.code,'P0001'); assert.equal(result.error?.message,'vnext_database_mode_not_enabled'); assert.equal(await ready,'I');
      events.push({contract:'concurrent-mode-disable',contenderPid:contender.processID,lockActuallyBlocked:blocked,code:result.error.code,message:result.error.message,ready:'I'});
      await close(contender); await writer.query('SELECT public.vnext_set_mode_v1(true)');
      assert.deepEqual(await snapshot(observer),before);
    });
    await step('admin activation closes actual direct legacy RPCs before any business mutation', async () => {
      await writer.query('SELECT public.vnext_set_mode_v1(true)');
      const baseline=await snapshot(observer); save('enabled-baseline',baseline);
      const targets=(await observer.query(`SELECT r.signature,p.oid,pg_get_userbyid(p.proowner) AS owner,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,p.prorettype='trigger'::regtype AS trigger_only,
        ARRAY(SELECT format_type(a,NULL) FROM unnest(p.proargtypes) a) AS types
        FROM public.vnext_legacy_routines_v1 r JOIN pg_proc p ON p.oid=r.routine ORDER BY r.signature`)).rows;
      for(const target of targets) {
        const name=target.signature.split('(')[0]; assert.match(name,/^public\.[a-z0-9_]+$/u);
        const statement=`SELECT ${name}(${target.types.map(type=>'NULL::'+type).join(',')})`;
        await asService(writer,statement,[],target.service_execute?/vnext_legacy_authority_disabled/u:/permission denied/u);
        // Non-service legacy RPCs are also tested via their actual execution
        // owner in this disposable engineering DB, never as a service ACL claim.
        if(!target.service_execute) await asService(writer,statement,[],target.trigger_only?/^trigger functions can only be called as triggers$/u:/vnext_legacy_authority_disabled/u,target.owner);
        assert.deepEqual(await snapshot(observer),baseline);
      }
      save('direct-rpc-results',{targets,events,after:await snapshot(observer)});
    });
  } finally {
    save('query-events', events);
    for (const c of [...clients]) await close(c);
    save('cleanup', { allTrackedClientsSettled: clients.size === 0, clusterRetained: true, externalOwnerMustStopCluster: true });
  }
});
