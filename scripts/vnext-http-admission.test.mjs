/** Actual VM HTTP routes -> controlled finite REST transport -> real PG RPCs.
 * The transport replaces PostgREST, not database execution. No real source/model.
 * Requires the prior new coexistence fixture to have installed/activated authority.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { Client } = createRequire(import.meta.url)('pg');
const database=process.env.VNEXT_HTTP_DATABASE||'vnext_legacy';if(!['vnext_legacy','vnext_worker'].includes(database))throw Error('closed_owned_http_database_required');
const root = process.cwd(), artifacts = process.env.VNEXT_NATIVE_ARTIFACTS, socketParent = process.env.VNEXT_LEGACY_SOCKET_PARENT;
if (!artifacts || !path.isAbsolute(artifacts) || fs.existsSync(artifacts) || !/^\/tmp\/stockinsider-vnext-oct22-private\/(?:legacy-full-pg-socket(?:-[0-9]{2})?|worker-pg-socket-[0-9]{2})$/u.test(socketParent || '')) throw Error('explicit_fresh_owned_http_fixture_required');
fs.mkdirSync(artifacts, { mode: 0o700 });
const save = (n, x) => fs.writeFileSync(path.join(artifacts, n + '.json'), JSON.stringify(x, null, 2) + '\n', { mode: 0o600 });
const sha = b => createHash('sha256').update(b).digest('hex');
const connect = async () => { const c = new Client({ host: path.join(socketParent, 'socket'), user: 'postgres', database, ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 30000 }); await c.connect(); return c; };
const key = randomBytes(32).toString('hex'), operatorKey = randomBytes(32).toString('hex'), authorKey = randomBytes(32).toString('hex');
const operator = 'synthetic-http-operator', author = 'synthetic-http-author';
const trace = []; let pending = 0; const releaseId='a'.repeat(40);
const functions={vnext_thesis_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_thesis_command_v1($1,$2,$3::jsonb) AS result'},vnext_analysis_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_analysis_command_v1($1,$2,$3::jsonb) AS result'},vnext_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_command_v1($1,$2,$3::jsonb) AS result'},vnext_read_v1:{keys:['p_symbol'],sql:'SELECT public.vnext_read_v1($1) AS result'},acquire_production_write_lease:{keys:['p_lease_key','p_owner_id','p_ttl_seconds'],sql:'SELECT public.acquire_production_write_lease($1,$2::uuid,$3::integer) AS result'},release_production_write_lease:{keys:['p_lease_key','p_owner_id'],sql:'SELECT public.release_production_write_lease($1,$2::uuid) AS result'}};
const bridge = http.createServer(async (req, res) => {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 1048576) { res.writeHead(413).end(); return; } chunks.push(chunk); }
  res.setHeader('content-type', 'application/json');
  if(req.headers.authorization!=='Bearer '+key){res.writeHead(403).end('{"message":"owned_transport_identity"}');return;}
  if(req.method==='GET' && req.url.startsWith('/rest/v1/production_writer_releases?')){
    const parsed=new URL(req.url,'http://127.0.0.1');if(parsed.searchParams.get('select')!=='release_id,writer_kind'||parsed.searchParams.get('active')!=='eq.true'||[...parsed.searchParams.keys()].some(k=>!['select','active'].includes(k))){res.writeHead(400).end();return;}
    const c=await connect();pending++;try{await c.query('SET ROLE service_role');const result=await c.query('SELECT release_id,writer_kind FROM public.production_writer_releases WHERE active');assert.equal(result.rows.length,1);trace.push({rpc:'active-release-read',actualServiceRole:true});res.end(JSON.stringify(result.rows[0]));}finally{await c.end();pending--;}return;
  }
  const name=req.url.startsWith('/rest/v1/rpc/')?req.url.slice('/rest/v1/rpc/'.length):'';const definition=functions[name];
  if(req.method!=='POST'||!definition){res.writeHead(403).end('{"message":"owned_test_transport_scope"}');return;}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400).end();return;}
  if(Object.keys(body).some(k=>!definition.keys.includes(k))){res.writeHead(400).end();return;}
  if(name.includes('production_write_lease') && (body.p_lease_key!=='production-data-plane'||!/^[a-f0-9-]{36}$/u.test(body.p_owner_id)||name==='acquire_production_write_lease' && body.p_ttl_seconds!==300)){res.writeHead(400).end();return;}
  const c = await connect(); pending++;
  try {
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE service_role');
    await c.query("SELECT set_config('request.headers',$1,true),set_config('request.jwt.claims',$2,true)",[JSON.stringify({'x-stockinsider-writer-release':req.headers['x-stockinsider-writer-release']}),JSON.stringify({role:'service_role'})]);
    const actual=await c.query(definition.sql,definition.keys.map(k=>k==='p_request'?JSON.stringify(body[k]):body[k]));
    await c.query('COMMIT');trace.push({rpc:name,action:body.p_command,requestHash:sha(JSON.stringify(body)),commitObserved:true,actualServiceRole:true});
    res.end(JSON.stringify(actual.rows[0].result));
  } catch (e) {
    await c.query('ROLLBACK'); trace.push({ action: body.p_command, code: e.code, message: e.message, rollbackSettled: true });
    res.writeHead(400).end(JSON.stringify({ message: e.message, code: e.code }));
  } finally { await c.end(); pending--; }
});
const post = async (route, payload, token) => {
  const response = await fetch('http://127.0.0.1:34234/api/internal/' + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
};
const now = new Date().toISOString(); const session = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const priorSession = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000));
const input = symbol => ({ cutoff: now, tradingValid: true, clues: [{ symbol, source: 'ptt', root: 'synthetic-root-' + symbol, authorRoot: 'synthetic-author-' + symbol, eventAt: now, availableAt: now, contentHash: sha(symbol) }], evidence: [],
  screening: { sourceHealthy: false, recent7: null, prior21: null, corporateActionAdjusted: false, priceReturn20: { value: null, source: '', observedAt: '' }, volumeRatio20: { value: null, source: '', observedAt: '' }, institutionalFlowRatio: { value: null, source: '', observedAt: '' }, revenueGrowth: { value: null, source: '', observedAt: '' }, catalystVerified: { value: null, source: '', observedAt: '' } } });
await test('actual internal HTTP entrypoints share real durable4/20 authority', { timeout: 180000 }, async t => {
  let app; let admin; let appLog;
  const results = [];
  const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){failed=true;throw error;}});if(failed)throw Error('dependent_http_stage_failed');};
  try {
    admin = await connect();
    assert.equal(Number((await admin.query('SELECT count(*) FROM public.vnext_jobs_v1')).rows[0].count), 0, 'fresh coexistence business ledger required');
    await admin.query('INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,\'operator\',true),($2,\'author\',true)', [operator, author]);
    await admin.query('INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval\'1 day\',true) ON CONFLICT DO NOTHING', [session]);
    await admin.query('INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval\'2 days\',true) ON CONFLICT DO NOTHING', [priorSession]);

    const identitySettings=(await admin.query('SELECT * FROM public.stockinsider_data_plane_settings_v1')).rows;assert.deepEqual(identitySettings,[]);assert.equal((await admin.query('SELECT coalesce((SELECT identity_fence_enabled FROM public.stockinsider_data_plane_settings_v1 WHERE singleton),false) AS effective_identity_fence')).rows[0].effective_identity_fence,false);save('backend-identity-profile',{observedRows:identitySettings,effectiveFence:false,scope:'original captured-schema empty settings; original function COALESCE(false), no settings mutation or formal HBA acceptance'});
    await admin.query("INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",[releaseId]);

    await new Promise(resolve => bridge.listen(34233, '127.0.0.1', resolve));
    const env = { ...process.env, NODE_TEST_CONTEXT: 'child-v8', LEGACY_RADAR_CORRECTNESS_PROJECTION: 'enabled', STOCKINSIDER_VNEXT_ENABLED: 'true', SUPABASE_URL: 'http://127.0.0.1:34233', SUPABASE_SERVICE_ROLE_KEY: key,
      INTERNAL_API_KEY: operatorKey, STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL: operator, STOCKINSIDER_VNEXT_AUTHOR_KEY: authorKey, STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL: author,
      STOCKINSIDER_VNEXT_REVIEWER_KEY: randomBytes(32).toString('hex'), STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL: 'synthetic-http-reviewer', STOCKINSIDER_DATA_PLANE: 'supabase' };
    // No files, model credentials, production selector or inherited Vercel runtime are consulted.
    for (const name of Object.keys(env)) if (/^(OPENAI_|ANTHROPIC_|VERCEL|CREDENTIALS_DIRECTORY|STOCKINSIDER_WRITER_RELEASE_ID|NEXT_PUBLIC_SUPABASE_)/u.test(name)) delete env[name];
    env.STOCKINSIDER_WRITER_RELEASE_ID=releaseId;
    appLog = fs.openSync(path.join(artifacts, 'next.log'), 'wx', 0o600);
    app = spawn('/workspace/.tools/node22/node_modules/node/bin/node', ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '34234'], { cwd: path.join(root, 'web'), env, stdio: ['ignore', appLog, appLog] });
    const until = Date.now() + 30000; let ready = false;
    while (Date.now() < until) { if (app.exitCode !== null) throw Error('owned_next_exited'); try { const r = await post('vnext-research', { symbols: [] }); if (r.status === 401) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
    assert.equal(ready, true);
    await step('authfirst and missing-vs-empty scopes cause zero actual RPCs', async () => {
      assert.equal((await post('pipeline-run', { symbols: [] })).status, 401);
      assert.equal((await post('vnext-research', { action: 'enqueue' }, operatorKey)).status, 409);
      for(const route of ['pipeline-run','pipeline-research-run','stock-research-refresh','research-report-build','deep-dive-build','candidate-dossier-bundle','candidate-research-run','report-build','thesis-refresh']) {const missing=await post(route,{},operatorKey);assert.equal(missing.status,409);assert.equal(missing.body.error,'vnext_explicit_scope_required');}
      assert.equal((await post('pipeline-run', { symbols: [], symbol: '2330' }, operatorKey)).body.result.expensiveCalls, 0);
      assert.equal(trace.length, 0);
      const screening=await post('vnext-research',{action:'screen'},operatorKey);assert.equal(screening.status,200);assert.equal(screening.body.result.reviewed,0);assert.deepEqual(screening.body.result.reports,[]);assert.deepEqual(screening.body.result.admission.jobs,[]);assert.ok(trace.some(t=>t.action==='screen-context'));assert.ok(trace.some(t=>t.rpc==='acquire_production_write_lease'));assert.ok(trace.some(t=>t.rpc==='release_production_write_lease'));assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);
    });
    await step('parallel different aliases plus exact duplicate deliveries reserve only4 slots', async () => {
      // Synthetic prior-session fixture rows, seeded under the actual existing
      // writer fence/lease. This is setup, never a production/HBA approval.
      const fixtureOwner=randomUUID();await admin.query('BEGIN');try{
        await admin.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);
        assert.equal((await admin.query("SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",[fixtureOwner])).rows[0].acquired,true);
          await admin.query("INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session) SELECT (6000+n)::text,'waiting',repeat('a',64),'{\"syntheticPriorDayFixture\":true}'::jsonb,$1 FROM generate_series(1,16)n", [priorSession]);
        assert.equal((await admin.query("SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released",[fixtureOwner])).rows[0].released,true);await admin.query('COMMIT');
      }catch(error){await admin.query('ROLLBACK');throw error;}
      const routes = ['pipeline-run', 'stock-research-refresh', 'research-report-build', 'deep-dive-build', 'candidate-dossier-bundle', 'candidate-research-run', 'report-build', 'thesis-refresh'];
      const work = routes.map((route, i) => { const symbol = String(3000 + i); return { route, body: { symbols: [symbol], requestKey: 'actual-http-' + i, inputs: { [symbol]: input(symbol) } } }; });
      const receipts = await Promise.all(work.flatMap(w => [post(w.route, w.body, operatorKey), post(w.route, w.body, operatorKey)]));
      for(const r of receipts){if(r.status===409)assert.equal(r.body.error,'production_write_cycle_already_running');else assert.equal(r.status,200);}
      // Known lease-contention refusals performed no work. Bounded sequential
      // exact deliveries now prove progress/idempotency without resending a model.
      for(const w of work)for(let n=0;n<2;n++){const r=await post(w.route,w.body,operatorKey);assert.equal(r.status,200);receipts.push(r);}
      const jobs = [...new Set(receipts.flatMap(r => r.body.result?.jobs || []).filter(j => j.jobId).map(j => j.jobId))]; assert.equal(jobs.length, 4);
      const claims = await Promise.all(jobs.flatMap(jobId => [post('vnext-research', { action: 'claim', jobId }, authorKey), post('vnext-research', { action: 'claim', jobId }, authorKey)]));
      for(const r of claims){if(r.status===409)assert.equal(r.body.error,'production_write_cycle_already_running');else assert.equal(r.status,200);}
      for(const jobId of jobs)for(let n=0;n<2;n++){const r=await post('vnext-research',{action:'claim',jobId},authorKey);assert.equal(r.status,200);claims.push(r);}
      assert.equal(claims.filter(r=>r.body.result?.execute).length,4);
      assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);
      assert.equal(Number((await admin.query("SELECT count(*) FROM vnext_members_v1 WHERE state<>'exited'")).rows[0].count), 20);
      assert.equal(Number((await admin.query('SELECT count(*) FROM vnext_jobs_v1 WHERE started_at IS NOT NULL')).rows[0].count), 4);
      results.push({ aliases: routes, duplicateEnqueues: receipts.length, duplicateClaims: claims.length, distinctJobs: jobs.length, active: 20, attempts: 4 });
    });
  } finally {
    if (app && app.exitCode === null) { app.kill('SIGTERM'); await new Promise(resolve => app.once('close', resolve)); }
    if (appLog !== undefined) fs.closeSync(appLog);
    await new Promise(resolve => bridge.close(resolve));
    if (admin) await admin.end();
    save('receipt', { scope:'actual HTTP/real service_role PG with active synthetic release and real acquire/release lease RPC via controlled finite facade; backend identity_fence inactive, not formal HBA/Contabo/model/rights acceptance', results, trace, pendingQueries: pending, appExit: app?.exitCode, appPidPathAbsent: app ? !fs.existsSync('/proc/' + app.pid) : null });
    assert.equal(pending, 0);
  }
});
