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
assert.equal(process.version,'v22.14.0');
const database=process.env.VNEXT_HTTP_DATABASE||'vnext_legacy';if(!['vnext_legacy','vnext_worker'].includes(database))throw Error('closed_owned_http_database_required');
const root = process.cwd(), artifacts = process.env.VNEXT_NATIVE_ARTIFACTS, socketParent = process.env.VNEXT_LEGACY_SOCKET_PARENT;
if (!artifacts || !path.isAbsolute(artifacts) || fs.existsSync(artifacts) || !/^\/tmp\/stockinsider-vnext-oct22-private\/(?:legacy-full-pg-socket(?:-[0-9]{2})?|worker-pg-socket-[0-9]{2})$/u.test(socketParent || '')) throw Error('explicit_fresh_owned_http_fixture_required');
fs.mkdirSync(artifacts, { mode: 0o700 });
const save = (n, x) => fs.writeFileSync(path.join(artifacts, n + '.json'), JSON.stringify(x, null, 2) + '\n', { mode: 0o600 });
const sha = b => createHash('sha256').update(b).digest('hex');
const ownedClients=new Set();
const connect = async () => { const c = new Client({ host: path.join(socketParent, 'socket'), user: 'postgres', database, ssl: false, connectionTimeoutMillis: 3000, statement_timeout: 30000 }); await c.connect();ownedClients.add(c);c.once('end',()=>ownedClients.delete(c));return c; };
const key = randomBytes(32).toString('hex'), operatorKey = randomBytes(32).toString('hex'), authorKey = randomBytes(32).toString('hex');
const operator = 'synthetic-worker-operator', author = 'synthetic-worker-author';
const stage=process.env.VNEXT_HTTP_STAGE??'fresh';if(!['fresh','resume-prior-session-fk'].includes(stage))throw Error('closed_http_recovery_stage_required');
const trace = []; let pending = 0; const releaseId='a'.repeat(40);
const functions={vnext_forecast_active_read_v1:{keys:['p_principal'],sql:'SELECT public.vnext_forecast_active_read_v1($1) AS result'},vnext_provider_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_provider_command_v1($1,$2,$3::jsonb) AS result'},read_financial_facts_for_stocks_as_of:{keys:['p_cutoff','p_stock_ids'],sql:'SELECT * FROM public.read_financial_facts_for_stocks_as_of($1::timestamptz,$2::uuid[]) LIMIT 10000',setReturning:true},vnext_target_command_v1:{keys:['p_principal','p_request'],sql:'SELECT public.vnext_target_command_v1($1,$2::jsonb) AS result'},vnext_cached_admission_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_cached_admission_v1($1,$2,$3::jsonb) AS result'},vnext_source_withdrawal_v1:{keys:['p_principal','p_operation','p_request'],sql:'SELECT public.vnext_source_withdrawal_v1($1,$2,$3::jsonb) AS result'},vnext_thesis_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_thesis_command_v1($1,$2,$3::jsonb) AS result'},vnext_analysis_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_analysis_command_v1($1,$2,$3::jsonb) AS result'},vnext_command_v1:{keys:['p_principal','p_command','p_request'],sql:'SELECT public.vnext_command_v1($1,$2,$3::jsonb) AS result'},vnext_read_v1:{keys:['p_symbol'],sql:'SELECT public.vnext_read_v1($1) AS result'},acquire_production_write_lease:{keys:['p_lease_key','p_owner_id','p_ttl_seconds'],sql:'SELECT public.acquire_production_write_lease($1,$2::uuid,$3::integer) AS result'},release_production_write_lease:{keys:['p_lease_key','p_owner_id'],sql:'SELECT public.release_production_write_lease($1,$2::uuid) AS result'}};
const bridge = http.createServer(async (req, res) => {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > 1048576) { res.writeHead(413).end(); return; } chunks.push(chunk); }
  res.setHeader('content-type', 'application/json');
  if(req.headers.authorization!=='Bearer '+key){res.writeHead(403).end('{"message":"owned_transport_identity"}');return;}
  if(req.method==='GET' && req.url.startsWith('/rest/v1/production_writer_releases?')){
    const parsed=new URL(req.url,'http://127.0.0.1');if(parsed.searchParams.get('select')!=='release_id,writer_kind'||parsed.searchParams.get('active')!=='eq.true'||[...parsed.searchParams.keys()].some(k=>!['select','active'].includes(k))){res.writeHead(400).end();return;}
    const c=await connect();pending++;try{await c.query('SET ROLE service_role');const result=await c.query('SELECT release_id,writer_kind FROM public.production_writer_releases WHERE active');assert.equal(result.rows.length,1);trace.push({rpc:'active-release-read',actualServiceRole:true});res.end(JSON.stringify(result.rows[0]));}finally{await c.end();pending--;}return;
  }
  // Closed read-only test facade executes actual isolated rows; never fabricates
  // stock/price/provenance data or accepts an arbitrary relation/expression.
  if(req.method==='GET' && req.url.startsWith('/rest/v1/')){
    const parsed=new URL(req.url,'http://127.0.0.1');const relation=parsed.pathname.slice('/rest/v1/'.length);
    if(!['stocks','stock_instruments_v3','technical_feature_snapshots','revenue_signals','official_market_evidence_history','tw_trading_sessions_v3','opportunity_price_observations_v3','opportunity_corporate_action_snapshots_v3','opportunity_corporate_action_feed_evidence_v3','opportunity_corporate_action_events_v3'].includes(relation)){res.writeHead(403).end('{"message":"closed_relation"}');return;}
    const c=await connect();pending++;try{
      await c.query('SET ROLE service_role');const cols=(await c.query("SELECT attname FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped",['public.'+relation])).rows.map(x=>x.attname);
      const select=parsed.searchParams.get('select')||'*';if(select!=='*' && select.split(',').some(k=>!cols.includes(k)))throw Error('closed_projection');const params=[],where=[];
      const bind=value=>{params.push(value);return '$'+params.length;};
      for(const [key,value]of parsed.searchParams){
        if(['select','order','limit','offset'].includes(key))continue;
        if(key==='or') {const match=/^\(valid_to\.is\.null,valid_to\.gt\.(.+)\)$/u.exec(value);if(!match||!cols.includes('valid_to'))throw Error('closed_or');where.push('(valid_to IS NULL OR valid_to>'+bind(match[1])+')');continue;}
        if(!cols.includes(key))throw Error('closed_filter_column');
        if(value.startsWith('in.(')&&value.endsWith(')')){const values=value.slice(4,-1).split(',').map(x=>x.replace(/^"|"$/gu,''));where.push(values.length&&values[0]?key+' IN('+values.map(bind).join(',')+')':'false');continue;}
        const m=/^(eq|gte|lte|gt|lt)\.(.+)$/u.exec(value);if(!m)throw Error('closed_filter');where.push(key+({eq:'=',gte:'>=',lte:'<=',gt:'>',lt:'<'}[m[1]])+bind(m[2]));
      }
      const order=parsed.searchParams.get('order');let ordering='';if(order){const terms=order.split(',').map(term=>{const m=/^([a-z0-9_]+)\.(asc|desc)$/u.exec(term);if(!m||!cols.includes(m[1]))throw Error('closed_order');return m[1]+' '+m[2];});ordering=' ORDER BY '+terms.join(',');}
      const limit=Number(parsed.searchParams.get('limit')||20000);if(!Number.isSafeInteger(limit)||limit<0||limit>20000)throw Error('closed_limit');if(parsed.searchParams.has('offset'))throw Error('closed_offset');
      const query='SELECT '+select+' FROM public.'+relation+(where.length?' WHERE '+where.join(' AND '):'')+ordering+' LIMIT '+limit;const result=await c.query(query,params);trace.push({relation,readOnly:true,rows:result.rows.length,queryHash:sha(query)});
      if(String(req.headers.accept).includes('application/vnd.pgrst.object+json')){if(result.rows.length>1)throw Error('closed_single');res.end(JSON.stringify(result.rows[0]||null));}else res.end(JSON.stringify(result.rows));
    }catch(e){res.writeHead(400).end(JSON.stringify({message:e.message,code:e.code}));}finally{await c.end();pending--;}return;
  }
  const rpcURL=new URL(req.url,'http://127.0.0.1');const name=rpcURL.pathname.startsWith('/rest/v1/rpc/')?rpcURL.pathname.slice('/rest/v1/rpc/'.length):'';const definition=functions[name];
  if([...rpcURL.searchParams.keys()].some(k=>name!=='read_financial_facts_for_stocks_as_of'||k!=='limit')||rpcURL.searchParams.has('limit')&&rpcURL.searchParams.get('limit')!=='10000'){res.writeHead(400).end();return;}
  if(req.method!=='POST'||!definition){res.writeHead(403).end('{"message":"owned_test_transport_scope"}');return;}
  let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400).end();return;}
  if(Object.keys(body).some(k=>!definition.keys.includes(k))){res.writeHead(400).end();return;}
  if(name==='vnext_provider_command_v1'&&!['inspect','read'].includes(body.p_command)){res.writeHead(400).end();return;}
  if(name.includes('production_write_lease') && (body.p_lease_key!=='production-data-plane'||!/^[a-f0-9-]{36}$/u.test(body.p_owner_id)||name==='acquire_production_write_lease' && body.p_ttl_seconds!==300)){res.writeHead(400).end();return;}
  const c = await connect(); pending++;
  try {
    await c.query('BEGIN'); await c.query('SET LOCAL ROLE service_role');
    await c.query("SELECT set_config('request.headers',$1,true),set_config('request.jwt.claims',$2,true)",[JSON.stringify({'x-stockinsider-writer-release':req.headers['x-stockinsider-writer-release']}),JSON.stringify({role:'service_role'})]);
    // Query rejection can precede its ReadyForQuery frame. Settle BOTH before
    // attaching the next transaction command's listener (T success / E error).
    const queryReady=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));
    const [queried,querySettled]=await Promise.allSettled([c.query(definition.sql,definition.keys.map(k=>k==='p_request'?JSON.stringify(body[k]):body[k])),queryReady]);
    assert.equal(querySettled.status,'fulfilled');assert.equal(querySettled.value,queried.status==='fulfilled'?'T':'E');
    trace.push({rpc:name,action:body.p_command,queryStatus:queried.status,queryReady:querySettled.value,querySettled:true});
    if(queried.status==='rejected')throw queried.reason;const actual=queried.value;
    const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));await c.query('COMMIT');assert.equal(await ready,'I');trace.push({rpc:name,action:body.p_command,requestHash:sha(JSON.stringify(body)),commitObserved:true,actualServiceRole:true,ready:'I',querySettled:true});
    res.end(JSON.stringify(definition.setReturning?actual.rows:actual.rows[0].result));
  } catch (e) {
    const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));await c.query('ROLLBACK');assert.equal(await ready,'I');trace.push({action:body.p_command,code:e.code,message:e.message,rollbackSettled:true,ready:'I',querySettled:true});
    res.writeHead(400).end(JSON.stringify({ message: e.message, code: e.code }));
  } finally { await c.end(); pending--; }
});
const post = async (route, payload, token) => {
  const response = await fetch('http://127.0.0.1:34234/api/internal/' + route, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
};
const now = new Date().toISOString(); const session = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const priorSession = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() - 86400000));
const input = symbol => ({ cutoff: now, tradingValid: true, clues: [{ symbol, source: 'ptt', root: 'synthetic-root-' + symbol, authorRoot: 'synthetic-author-' + symbol, eventAt: now, availableAt: now, contentHash: sha(symbol) }], evidence: [],
  screening: { sourceHealthy: false, recent7: null, prior21: null, corporateActionAdjusted: false, priceReturn20: { value: null, source: '', observedAt: '' }, volumeRatio20: { value: null, source: '', observedAt: '' }, institutionalFlowRatio: { value: null, source: '', observedAt: '' }, revenueGrowth: { value: null, source: '', observedAt: '' }, catalystVerified: { value: null, source: '', observedAt: '' } } });
await test('actual closed cached HTTP input, shared leases and per-document withdrawal',{timeout:180000},async t=>{
 let app;let admin;let appLog;let unexpectedFetch;let cleanupContainment=false;const results=[];
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){failed=true;const primitive=v=>v===null||typeof v==='number'||typeof v==='boolean'?v:'REDACTED';console.log('VNEXT_HTTP_FAILURE_SAFE '+JSON.stringify({stage:name,code:/^[A-Z0-9_]{1,40}$/u.test(error.code||'')?error.code:'UNKNOWN',actual:primitive(error.actual),expected:primitive(error.expected),tokens:(String(error.message).match(/vnext_[a-z_]{1,120}/gu)||[]).slice(0,3)}));throw error;}});if(failed)throw Error('dependent_cached_http_stage_failed');};
 try{
  admin=await connect();assert.equal(Number((await admin.query('SELECT count(*) FROM public.vnext_jobs_v1')).rows[0].count),4);assert.equal(Number((await admin.query('SELECT count(*) FROM public.vnext_publications_v1')).rows[0].count),2);
  // Fresh test candidate installation uses original guards with actual current
  // predecessor; no runtime auto-install/fallback and no authority changes.
  for(const candidate of ['migrations/20261022_vnext_financial_status_text_v1.sql','migrations/20261022_vnext_issuer_ir_sources_v1.sql','migrations/20261022_vnext_semantic_score_fence_v1.sql','migrations/20261022_vnext_catalyst_criteria_v1.sql','migrations/20261022_vnext_dimensionless_arithmetic_v1.sql','migrations/20261022_vnext_target_exit_v1.sql','migrations/20261023_vnext_trading_invalidity_exit_v1.sql','migrations/20261023_vnext_roster_current_fence_v1.sql','migrations/20261023_vnext_forecast_sources_v1.sql','migrations/20261023_vnext_forecast_active_v1.sql'])await admin.query(fs.readFileSync(path.join(root,candidate),'utf8'));
  const baseline=(await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows;
  const providerLedger=(await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY invocation_id),'[]') AS rows FROM public.vnext_provider_invocations_v1 t")).rows[0].rows;
  const preparationLedger=(await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_preparations_v1 t")).rows[0].rows;
  save('initial-complete-ledgers',{jobs:baseline,providers:providerLedger,preparations:preparationLedger,counts:{jobs:baseline.length,providers:providerLedger.length,preparations:preparationLedger.length}});
  const identitySettings=(await admin.query('SELECT * FROM public.stockinsider_data_plane_settings_v1')).rows;assert.deepEqual(identitySettings,[]);
  if(stage==='fresh'){
  await admin.query("INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",[releaseId]);
  // Explicit engineering stock master/instrument cache, no authority or prices invented.
  const setupOwner=randomUUID();await admin.query('BEGIN');await admin.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);assert.equal((await admin.query("SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",[setupOwner])).rows[0].acquired,true);
  for(const symbol of ['2409','2383','2412','2330']){const stockId=randomUUID();await admin.query("INSERT INTO public.stocks(id,symbol,name,market) VALUES($1,$2,'Synthetic engineering stock','TW')",[stockId,symbol]);await admin.query("INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,official_legal_name,provider,source_timestamp,valid_from,roster_version) VALUES($1,$2,'TWSE','common_stock','active','Synthetic engineering instrument','twse',clock_timestamp()-interval'1 hour',clock_timestamp()-interval'1 hour','tw-instrument-roster-v3.0')",[stockId,symbol]);}
  assert.equal((await admin.query("SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released",[setupOwner])).rows[0].released,true);await admin.query('COMMIT');
  }else{const releases=(await admin.query('SELECT release_id FROM public.production_writer_releases WHERE active')).rows;assert.deepEqual(releases,[{release_id:releaseId}]);const stocks=(await admin.query("SELECT symbol FROM public.stocks WHERE name='Synthetic engineering stock' ORDER BY symbol")).rows;assert.deepEqual(stocks.map(r=>r.symbol),['2330','2383','2409','2412']);assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);}
  await new Promise(resolve=>bridge.listen(34233,'127.0.0.1',resolve));
  const env={...process.env,NODE_TEST_CONTEXT:'child-v8',LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',STOCKINSIDER_VNEXT_ENABLED:'true',SUPABASE_URL:'http://127.0.0.1:34233',SUPABASE_SERVICE_ROLE_KEY:key,INTERNAL_API_KEY:operatorKey,STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL:operator,STOCKINSIDER_VNEXT_AUTHOR_KEY:authorKey,STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL:author,STOCKINSIDER_VNEXT_REVIEWER_KEY:randomBytes(32).toString('hex'),STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL:'synthetic-worker-reviewer',STOCKINSIDER_DATA_PLANE:'supabase'};
  for(const name of Object.keys(env))if(/^(OPENAI_|ANTHROPIC_|VERCEL|CREDENTIALS_DIRECTORY|STOCKINSIDER_WRITER_RELEASE_ID|NEXT_PUBLIC_SUPABASE_)/u.test(name))delete env[name];env.STOCKINSIDER_WRITER_RELEASE_ID=releaseId;
  // Actual app fetch is observed, not a synthetic RPC response. Any attempted
  // external parser/model/download network path is denied and makes this run RED.
  const fetchBoundary=path.join(artifacts,'owned-fetch-boundary.mjs');unexpectedFetch=path.join(artifacts,'unexpected-fetch.jsonl');
  fs.writeFileSync(fetchBoundary,`import fs from 'node:fs';const actual=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.origin!=='http://127.0.0.1:34233'||!url.pathname.startsWith('/rest/v1/')){fs.appendFileSync(${JSON.stringify(unexpectedFetch)},JSON.stringify({origin:url.origin,path:url.pathname})+'\\n',{mode:0o600});throw Error('owned_cached_http_network_scope');}return actual(input,init);};\n`,{mode:0o600,flag:'wx'});
  delete env.NODE_OPTIONS;
  appLog=fs.openSync(path.join(artifacts,'next.log'),'wx',0o600);app=spawn(process.execPath,['--import',fetchBoundary,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34234'],{cwd:path.join(root,'web'),env,stdio:['ignore',appLog,appLog]});
  const until=Date.now()+30000;let ready=false;while(Date.now()<until){if(app.exitCode!==null)throw Error('owned_next_exited');try{if((await post('vnext-research',{symbols:[]})).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
  if(stage==='fresh'){
  await step('all write aliases reject raw scores/roots/principals before every DB read and empty scope stays zero work',async()=>{
   const routes=['pipeline-run','pipeline-research-run','stock-research-refresh','research-report-build','deep-dive-build','candidate-dossier-bundle','candidate-research-run','report-build','thesis-refresh'];
   for(const route of routes){assert.equal((await post(route,{},operatorKey)).body.error,'vnext_explicit_scope_required');assert.equal((await post(route,{symbols:[]},operatorKey)).body.result.expensiveCalls,0);for(const injected of [{inputs:{}},{principal:'caller'},{validated:true},{root:'/tmp'},{schemaVersion:'caller'}]){const r=await post(route,{symbols:['2409'],requestKey:'injected',...injected},operatorKey);assert.equal(r.status,409);assert.equal(r.body.error,'vnext_cached_admission_fields_required');}}
   assert.equal((await post('vnext-research',{symbols:['2409'],requestKey:'wrongrole'},authorKey)).status,409);assert.equal(trace.length,0);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows,baseline);
  });
  await step('real cheap cached derivation reaches exact current-receipt authority without per-stock downloads or models',async()=>{
   const r=await post('pipeline-run',{symbols:['2409'],requestKey:'closed-real-cache'},operatorKey);assert.equal(r.status,200);assert.ok(Array.isArray(r.body.result.jobs));assert.equal(r.body.result.scope.candidates,1);assert.ok(r.body.result.gaps.includes('source_health_and_comparable_volume_not_attested'));assert.ok(trace.some(x=>x.rpc==='vnext_cached_admission_v1'&&x.action==='sync-calendar'));assert.ok(trace.some(x=>x.rpc==='vnext_cached_admission_v1'&&x.action==='enqueue'));assert.ok(trace.some(x=>x.relation==='stock_instruments_v3'));assert.equal(trace.some(x=>x.rpc?.includes('provider')),false);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows,baseline);assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);results.push({currentCachedRequest:r,source:'realtypedSQLcache with syntheticstockmaster, missingactual240price/facts explicitlynull; no dummyapprovedauthority'});
  });
  }
  await step('actual configured operator HTTP screen reaches target RPC before routine screening; empty/missing scopes remain separate',async()=>{
   const start=trace.length;assert.equal((await post('vnext-research',{action:'screen'})).status,401);assert.equal(trace.length,start);
   assert.equal((await post('vnext-research',{action:'screen',price:1},operatorKey)).status,409);assert.equal(trace.length,start);
   const current=(await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows;
   const r=await post('vnext-research',{action:'screen'},operatorKey);save('screen-result',{status:r.status,result:r.body});if(r.status!==200)throw Error('vnext_http_screen_rejected:'+String(r.body.error));assert.equal(r.status,200);
   const events=trace.slice(start);const target=events.findIndex(e=>e.rpc==='vnext_target_command_v1'),screen=events.findIndex((e,i)=>i>target&&e.rpc==='vnext_command_v1'&&e.action==='screen-context');const firstWork=events.findIndex(e=>['screen-observations','enqueue','swap','claim','prepare'].includes(e.action));assert.ok(target>=0);assert.ok(screen>target);assert.ok(firstWork<0||firstWork>target);assert.equal(events.some(e=>e.rpc?.includes('provider')),false);
   assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows,current);assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);results.push({screen:r,actualTargetRPCBeforeScreen:true,scope:'real Next HTTP -> finite REST bridge -> actual service-role PG; synthetic original data/no model'});
  });
  await step('actual author preparation READ and explicit resume observe completed history with zero prepare/provider dispatch',async()=>{
   const job=baseline.find(j=>j.state==='published');assert.ok(job);const start=trace.length;
   assert.equal((await post('vnext-research',{action:'preparation-read',jobId:job.job_id})).status,401);assert.equal((await post('vnext-research',{action:'preparation-read',jobId:job.job_id},operatorKey)).status,409);assert.equal(trace.length,start);
   for(const action of ['preparation-read','resume-preparation']){const read=await post('vnext-research',{action,jobId:job.job_id},authorKey);assert.equal(read.status,200);assert.equal(read.body.result.status,'not_running');assert.equal(read.body.result.currentRights,'not_checked');assert.equal(read.body.result.automaticResume,false);assert.equal(read.body.result.reinvoke,false);assert.equal('evidence'in read.body.result,false);}
   const events=trace.slice(start);assert.equal(events.filter(e=>e.rpc==='vnext_provider_command_v1'&&e.action==='inspect'&&e.commitObserved===true).length,2);assert.equal(events.filter(e=>e.rpc==='vnext_provider_command_v1'&&e.action==='inspect'&&e.queryStatus==='fulfilled'&&e.queryReady==='T').length,2);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_preparations_v1 t")).rows[0].rows,preparationLedger);assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);assert.equal(events.some(e=>['claim','prepare','reserve'].includes(e.action)||e.rpc?.includes('production_write_lease')),false);assert.ok(events.every(e=>e.rpc==='active-release-read'||e.rpc==='vnext_provider_command_v1'&&e.action==='inspect'),'completed-history observation permits only release identity and original journal inspect');assert.equal(fs.existsSync(unexpectedFetch),false,'no attempted external parser/model/download fetch');assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY invocation_id),'[]') AS rows FROM public.vnext_provider_invocations_v1 t")).rows[0].rows,providerLedger);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows,baseline);results.push({actualPreparationCompletedRead:true,scope:'not-running original history only; running cached-ready/prepare response-loss NOT_RUN'});
  });
  await step('failed attempts remain charged, refuse new work and cross-day waiting members remain bounded20',async()=>{
   const fixtureOwner=randomUUID();await admin.query('BEGIN');try{await admin.query("SELECT set_config('request.headers',$1,true)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);assert.equal((await admin.query("SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",[fixtureOwner])).rows[0].acquired,true);assert.equal(Number((await admin.query("SELECT count(*) FROM public.vnext_members_v1 WHERE state!='exited'")).rows[0].count),2);await admin.query("INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,$2,true)",[priorSession,priorSession+'T05:30:00Z']);await admin.query("INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session) SELECT (6000+n)::text,'waiting',repeat('a',64),'{\"syntheticPriorDayFixture\":true}'::jsonb,$1 FROM generate_series(1,18)n",[priorSession]);assert.equal((await admin.query("SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released",[fixtureOwner])).rows[0].released,true);await admin.query('COMMIT');}catch(e){await admin.query('ROLLBACK');throw e;}
   const failed=(await admin.query("SELECT job_id FROM public.vnext_jobs_v1 WHERE state='failed' ORDER BY job_id")).rows;assert.equal(failed.length,2);for(const job of failed){const r=await post('vnext-research',{action:'claim',jobId:job.job_id},authorKey);assert.equal(r.status,409);assert.match(r.body.error,/vnext_admission_invalid/u);}
   assert.equal(Number((await admin.query('SELECT count(*) FROM public.vnext_jobs_v1 WHERE started_at IS NOT NULL')).rows[0].count),4);assert.equal(Number((await admin.query("SELECT count(*) FROM public.vnext_members_v1 WHERE state!='exited'")).rows[0].count),20);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY invocation_id),'[]') AS rows FROM public.vnext_provider_invocations_v1 t")).rows[0].rows,providerLedger);assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);assert.deepEqual((await admin.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY job_id),'[]') AS rows FROM public.vnext_jobs_v1 t")).rows[0].rows,baseline);
  });
  await step('closed authenticated permanent withdrawal COMMIT and explicit read use the actual immutable event',async()=>{
   const contentHash=(await admin.query('SELECT content_hash FROM public.vnext_extractions_v1')).rows[0].content_hash;const request={action:'source-withdraw',contentHash,reason:'rights_revoked',citation:'https://www.twse.com.tw/synthetic-http-withdrawal'};const r=await post('vnext-research',request,operatorKey);assert.equal(r.status,200);const value=r.body.result;assert.equal(value.payload.contentHash,contentHash);const traceCount=trace.length;const read=await post('vnext-research',{action:'source-withdraw-read',contentHash},operatorKey);assert.equal(read.status,200);assert.deepEqual(read.body.result,value);assert.equal(trace.slice(traceCount).some(x=>x.rpc?.includes('production_write_lease')),false);const observer=await connect();try{const rows=(await observer.query('SELECT * FROM public.vnext_source_withdrawals_v1 WHERE content_hash=$1',[contentHash])).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0].payload,value.payload);assert.equal(rows[0].event_hash,value.hash);assert.equal(rows[0].logical_bytes,value.logicalBytes);}finally{await observer.end();}assert.equal(Number((await admin.query('SELECT count(*) FROM public.production_write_leases')).rows[0].count),0);results.push({withdrawalHash:value.hash,immutableRead:true,readAcquiredWriterLease:false,formalSourceRevocation:false});
  });
  } finally {
    if (app && app.exitCode === null && app.signalCode === null) {
      const closed=new Promise(resolve=>app.once('close',resolve));app.kill('SIGTERM');
      let timer;const settled=await Promise.race([closed.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),35000);})]);clearTimeout(timer);
      if(!settled){cleanupContainment=true;app.kill('SIGKILL');await closed;}
    }
    if (appLog !== undefined) fs.closeSync(appLog);
    const bridgeClosed=new Promise(resolve=>bridge.close(resolve));bridge.closeAllConnections();await bridgeClosed;
    if (admin) await admin.end();
    if(ownedClients.size){cleanupContainment=true;await Promise.allSettled([...ownedClients].map(c=>c.end()));}
    save('receipt', { stage, priorSyntheticSessionScope:'fixture only prior-session FK plus18priorwaiting members; not originalofficialcalendar/swap proof', scope:'actual HTTP/real service_role PG with active synthetic release and real acquire/release lease RPC via controlled finite facade; backend identity_fence inactive, not formal HBA/Contabo/model/rights acceptance', results, trace, externalFetchAttempted:unexpectedFetch?fs.existsSync(unexpectedFetch):false, cleanupContainment, trackedClientsRemaining:ownedClients.size, pendingQueries: pending, appExit: app?.exitCode, appPidPathAbsent: app ? !fs.existsSync('/proc/' + app.pid) : null });
    assert.equal(unexpectedFetch?fs.existsSync(unexpectedFetch):false,false,'no attempted external parser/model/download fetch in any actual HTTP case');
    assert.equal(cleanupContainment,false,'owned HTTP cleanup needed containment; no success claim');assert.equal(ownedClients.size,0);assert.equal(pending, 0);if(app)assert.equal(fs.existsSync('/proc/'+app.pid),false);
  }
});
