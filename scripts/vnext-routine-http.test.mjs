/** Fresh routine-screen HTTP -> controlled finite REST facade -> actual PG.
 * The transport replaces PostgREST, not database execution. No real source/model.
 * Full original prefix setup is performed below; sources are synthetic only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import {workerFixture} from './vnext-worker-fixture.mjs';
import {extractContentBatch} from '../web/src/lib/vnext/permitted-content.ts';
const { Client } = createRequire(import.meta.url)('pg');
assert.equal(process.version,'v22.14.0');
const database=process.env.VNEXT_HTTP_DATABASE||'vnext_legacy';if(!['vnext_legacy','vnext_worker'].includes(database))throw Error('closed_owned_http_database_required');
const root = process.cwd(), artifacts = process.env.VNEXT_NATIVE_ARTIFACTS, socketParent = process.env.VNEXT_LEGACY_SOCKET_PARENT;
if (!artifacts || !path.isAbsolute(artifacts) || fs.existsSync(artifacts) || !/^\/tmp\/stockinsider-vnext-oct22-private\/(?:legacy-full-pg-socket(?:-[0-9]{2})?|worker-pg-socket-[0-9]{2})$/u.test(socketParent || '')) throw Error('explicit_fresh_owned_http_fixture_required');
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
await test('fresh routine-screen HTTP admits from current original receipts before expensive work',{timeout:240000},async t=>{
 const x=await workerFixture();let app,appLog,unexpectedFetch;let appStopRequested=false;const results=[];
 const stage=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){failed=true;const primitive=v=>v===null||typeof v==='number'||typeof v==='boolean'?v:'REDACTED';console.log('VNEXT_ROUTINE_FAILURE_SAFE '+JSON.stringify({stage:name,code:/^[A-Z0-9_]{1,40}$/u.test(error.code||'')?error.code:'UNKNOWN',actual:primitive(error.actual),expected:primitive(error.expected),messageHash:sha(String(error.message)),tokens:(String(error.message).match(/vnext_[a-z_]{1,120}/gu)||[]).slice(0,3)}));throw error;}});if(failed)throw Error('dependent_routine_stage_failed');};
 let contentHash;
 const observation=async()=>{const state=await x.snapshot();return {state,traceCount:trace.length};};
 const noExpensive=state=>{for(const name of ['vnext_preparations_v1','vnext_provider_invocations_v1','vnext_provider_events_v1','vnext_publications_v1'])assert.equal(state[name].count,0);assert.equal(state.vnext_jobs_v1.rows.filter(j=>j.started_at).length,0);assert.equal(fs.existsSync(unexpectedFetch),false,'no attempted external IO');};
 try{
  await stage('full original candidates commit and legal original content seeds a fresh empty business ledger',async()=>{
   await x.install();
   for(const candidate of ['migrations/20261022_vnext_analysis_sources_v1.sql','migrations/20261022_vnext_thesis_audit_v1.sql','migrations/20261022_vnext_source_withdrawals_v1.sql','migrations/20261022_vnext_cached_admission_v2.sql','migrations/20261022_vnext_terminal_failure_slots_v1.sql','migrations/20261022_vnext_financial_status_text_v1.sql','migrations/20261022_vnext_issuer_ir_sources_v1.sql','migrations/20261022_vnext_semantic_score_fence_v1.sql','migrations/20261022_vnext_catalyst_criteria_v1.sql','migrations/20261022_vnext_dimensionless_arithmetic_v1.sql','migrations/20261022_vnext_target_exit_v1.sql','migrations/20261022_vnext_preparation_read_v1.sql','migrations/20261023_vnext_trading_invalidity_exit_v1.sql','migrations/20261023_vnext_roster_current_fence_v1.sql','migrations/20261023_vnext_forecast_sources_v1.sql','migrations/20261023_vnext_forecast_active_v1.sql']){const bytes=fs.readFileSync(candidate);await x.writer.query(bytes.toString());x.save('prefix-'+path.basename(candidate),{sha256:sha(bytes),bytes:bytes.length});}
   await x.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,'operator',true),($2,'author',true)",[operator,author]);
   await x.writer.query("INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original','synthetic-engineering-public-license','synthetic-current-source',clock_timestamp()+interval'1 hour',true)");
   const content={id:'synthetic-routine-original',source:'official',scope:'official_original',url:'https://www.twse.com.tw/synthetic-routine-cache-only',eventAt:now,publishedAt:now,eventBasis:'original_event',availableAt:now,symbols:['2409'],originalRoot:'https://www.twse.com.tw/synthetic-routine-cache-only',authorRoot:'synthetic:official',body:'Synthetic original cached document, never real acquired issuer research.'};
   await extractContentBatch([content],now,async(action,body)=>{const c=await x.connect();try{await c.query('SET ROLE service_role');const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));const [query,settled]=await Promise.allSettled([c.query('SELECT public.vnext_analysis_command_v1($1,$2,$3::jsonb) AS result',[operator,action,JSON.stringify(body)]),ready]);assert.equal(settled.status,'fulfilled');assert.equal(settled.value,'I');if(query.status==='rejected')throw query.reason;return query.value.rows[0].result;}finally{await x.close(c);}});
   contentHash=(await x.observer.query('SELECT content_hash FROM public.vnext_extractions_v1')).rows[0].content_hash;
   const stockId=randomUUID();await x.writer.query("INSERT INTO public.stocks(id,symbol,name,market) VALUES($1,'2409','Synthetic routine cache, not real source','TW')",[stockId]);
   await x.writer.query("INSERT INTO public.stock_instruments_v3(stock_id,symbol,exchange,instrument_type,listing_status,official_legal_name,provider,source_timestamp,valid_from,roster_version) VALUES($1,'2409','TWSE','common_stock','active','Synthetic routine instrument','twse',clock_timestamp()-interval'1 hour',clock_timestamp()-interval'1 hour','tw-instrument-roster-v3.0')",[stockId]);
   // Existing paired calendar schema/guard; deliberately synthetic prior civil
   // date plus current date, no altered system clock or real two-session swap claim.
   for(const calendarDay of [priorSession,session])for(const [market,provider] of [['TWSE','twse'],['TPEX','tpex']])await x.writer.query("INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref) VALUES($1,$2,$3,$4,$5,'completed',$6,clock_timestamp()-interval'1 minute',clock_timestamp()-interval'1 minute','synthetic-routine-calendar-not-acquired')",[randomUUID(),calendarDay,market,calendarDay+'T01:00:00Z',calendarDay+'T05:30:00Z',provider]);
   await x.writer.query("INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",[releaseId]);
   const pristine=await x.snapshot();assert.equal(pristine.vnext_jobs_v1.count,0);assert.equal(pristine.vnext_members_v1.count,0);x.save('initial-complete-state',pristine);
   await new Promise(resolve=>bridge.listen(34233,'127.0.0.1',resolve));
   const env={...process.env,NODE_TEST_CONTEXT:'child-v8',LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',STOCKINSIDER_VNEXT_ENABLED:'true',SUPABASE_URL:'http://127.0.0.1:34233',SUPABASE_SERVICE_ROLE_KEY:key,INTERNAL_API_KEY:operatorKey,STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL:operator,STOCKINSIDER_VNEXT_AUTHOR_KEY:authorKey,STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL:author,STOCKINSIDER_VNEXT_REVIEWER_KEY:randomBytes(32).toString('hex'),STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL:'synthetic-routine-reviewer',STOCKINSIDER_DATA_PLANE:'supabase'};
   for(const name of Object.keys(env))if(/^(OPENAI_|ANTHROPIC_|VERCEL|CREDENTIALS_DIRECTORY|STOCKINSIDER_WRITER_RELEASE_ID|NEXT_PUBLIC_SUPABASE_)/u.test(name))delete env[name];env.STOCKINSIDER_WRITER_RELEASE_ID=releaseId;
   const fetchBoundary=path.join(artifacts,'owned-fetch-boundary.mjs');unexpectedFetch=path.join(artifacts,'unexpected-fetch.jsonl');
   fs.writeFileSync(fetchBoundary,`import fs from 'node:fs';const actual=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.origin!=='http://127.0.0.1:34233'||!url.pathname.startsWith('/rest/v1/')){fs.appendFileSync(${JSON.stringify(unexpectedFetch)},JSON.stringify({origin:url.origin,path:url.pathname})+'\\n',{mode:0o600});throw Error('owned_routine_http_network_scope');}return actual(input,init);};\n`,{mode:0o600,flag:'wx'});
   delete env.NODE_OPTIONS;appLog=fs.openSync(path.join(artifacts,'next.log'),'wx',0o600);app=spawn(process.execPath,['--import',fetchBoundary,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34234'],{cwd:path.join(root,'web'),env,stdio:['ignore',appLog,appLog]});
   const until=Date.now()+30000;let ready=false;while(Date.now()<until){if(app.exitCode!==null)throw Error('owned_next_exited');try{if((await post('vnext-research',{action:'screen'})).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(ready,true);
  });
  await stage('auth, wrong role, extra fields and explicit empty scope perform no SQL work',async()=>{
   const before=await observation();assert.equal((await post('vnext-research',{action:'screen'})).status,401);assert.equal((await post('vnext-research',{action:'screen'},authorKey)).status,409);
   for(const injected of [{principal:'caller'},{inputs:{}},{validated:true}])assert.equal((await post('vnext-research',{action:'screen',...injected},operatorKey)).status,409);
   const empty=await post('vnext-research',{symbols:[]},operatorKey);assert.equal(empty.status,200);assert.equal(empty.body.result.expensiveCalls,0);assert.deepEqual(empty.body.result.jobs,[]);assert.equal(trace.length,before.traceCount);assert.deepEqual(await x.snapshot(),before.state);
  });
  await stage('real routine HTTP derives the source receipt and atomically reserves one new researching slot without any claim',async()=>{
   const before=await observation();const response=await post('vnext-research',{action:'screen'},operatorKey);x.save('first-screen-response',response);assert.equal(response.status,200);
   const after=await x.snapshot();assert.equal(after.vnext_jobs_v1.count,1);assert.equal(after.vnext_members_v1.count,1);const [job]=after.vnext_jobs_v1.rows,[member]=after.vnext_members_v1.rows;assert.equal(job.symbol,'2409');assert.equal(member.symbol,'2409');assert.equal(member.state,'researching');assert.equal(job.input_hash,member.input_hash);assert.equal(job.started_at,null);assert.ok(member.evidence.clues.some(clue=>clue.contentHash===contentHash));assert.equal(member.evidence.initialScore.probability,false);assert.equal(after.production_write_leases.count,0);noExpensive(after);
   const changed=Object.keys(before.state).filter(name=>JSON.stringify(before.state[name].rows)!==JSON.stringify(after[name].rows));x.save('first-screen-state',{wholeBefore:before.state,wholeAfter:after,changed,events:trace.slice(before.traceCount)});assert.ok(changed.includes('vnext_jobs_v1'));assert.ok(changed.includes('vnext_members_v1'));if(changed.includes('vnext_weekly_audits_v1')){assert.equal(before.state.vnext_weekly_audits_v1.count,0);assert.equal(after.vnext_weekly_audits_v1.count,1);const [audit]=after.vnext_weekly_audits_v1.rows;assert.equal(audit.session_date,job.session_date);assert.deepEqual(audit.symbols,[]);assert.deepEqual(audit.gaps,[]);}assert.ok(changed.every(name=>['vnext_sessions_v1','vnext_calendar_receipts_v2','vnext_jobs_v1','vnext_members_v1','vnext_screening_v1','vnext_confirmations_v1','vnext_audit_v1','vnext_home_v1','vnext_weekly_audits_v1'].includes(name)),'finite exact whole-table delta');
   const events=trace.slice(before.traceCount);assert.ok(events.some(e=>e.rpc==='vnext_cached_admission_v1'&&e.action==='enqueue'&&e.commitObserved));assert.equal(events.some(e=>['claim','prepare','reserve'].includes(e.action)||e.rpc?.includes('provider')),false);x.save('first-screen-state',{wholeBefore:before.state,wholeAfter:after,changed,events});results.push({kind:'routine-admitted',newJobs:1,newMembers:1,startedAttempts:0,providerInvocations:0,noExternalIO:true});
  });
  await stage('repeat routine evaluation and committed source withdrawal cannot create another job or refresh original job clocks',async()=>{
   const original=await x.snapshot();const repeat=await post('vnext-research',{action:'screen'},operatorKey);x.save('repeat-screen-response',repeat);assert.equal(repeat.status,200);let current=await x.snapshot();assert.deepEqual(current.vnext_jobs_v1.rows,original.vnext_jobs_v1.rows);assert.equal(current.vnext_members_v1.count,1);noExpensive(current);
   const withdrawal=await post('vnext-research',{action:'source-withdraw',contentHash,reason:'rights_revoked',citation:'https://www.twse.com.tw/synthetic-routine-withdrawal'},operatorKey);assert.equal(withdrawal.status,200);const withdrawn=await x.snapshot();assert.equal(withdrawn.vnext_source_withdrawals_v1.count,1);assert.equal(withdrawn.vnext_extractions_v1.count,1);
   const screen=await post('vnext-research',{action:'screen'},operatorKey);x.save('withdrawn-screen-response',screen);assert.equal(screen.status,200);current=await x.snapshot();assert.deepEqual(current.vnext_jobs_v1.rows,original.vnext_jobs_v1.rows);assert.equal(current.vnext_extractions_v1.count,1);assert.equal(current.vnext_source_withdrawals_v1.count,1);assert.equal(current.production_write_leases.count,0);noExpensive(current);x.save('retained-withdrawn-state',current);results.push({kind:'repeat-and-withdrawal',jobRowsImmutable:true,originalsRetained:true,noAdditionalStartedAttempts:true,providerInvocations:0,noExternalIO:true});
  });
 }finally{
  if(app&&app.exitCode===null){appStopRequested=true;assert.equal(app.kill('SIGTERM'),true);await new Promise(resolve=>app.once('close',resolve));}if(appLog!==undefined)fs.closeSync(appLog);
  if(bridge.listening)await new Promise(resolve=>bridge.close(resolve));for(const client of [...ownedClients])await client.end();
  x.save('routine-http-receipt',{scope:'actual built Next HTTP/real service_role PG through finite REST facade; synthetic calendar/stock/source only, not formal source/model/research/staging approval',sourceCommit:process.env.GITHUB_SHA||null,results,trace,pendingQueries:pending,appExit:app?.exitCode,appPidAbsent:app?!fs.existsSync('/proc/'+app.pid):null,clientsSettled:ownedClients.size===0,appStopRequested,unexpectedExternalFetchObserved:unexpectedFetch?fs.existsSync(unexpectedFetch):null});await x.finish();assert.equal(pending,0);assert.equal(ownedClients.size,0);if(app){assert.equal(fs.existsSync('/proc/'+app.pid),false);assert.ok(app.exitCode===0||appStopRequested&&app.exitCode===143,'owned Next must terminate cleanly or with its requested SIGTERM status');}
 }
});
