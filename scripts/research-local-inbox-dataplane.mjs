import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { sourcePriorityCommand } from './research-source-priority-consumer.mjs';
import { prepareDiscoveryRelay } from './research-discovery-relay-prepare.mjs';
import { executeSourceController } from './research-source-controller.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function localProcessEnvironment(env = process.env) {
  return Object.fromEntries(['PATH','TMPDIR','LANG','TZ','NODE_TEST_CONTEXT','NEXT_TELEMETRY_DISABLED',
    'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS']
    .filter(name => typeof env[name] === 'string').map(name => [name, env[name]]));
}
async function boundedBytes(filename, limit) {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    assert.ok(before.isFile() && before.size > 0 && before.size <= limit, 'local_tool_file_bound');
    const bytes = await file.readFile(); const after = await file.stat();
    assert.equal(bytes.length, before.size); assert.equal(after.ctimeMs, before.ctimeMs);
    return bytes;
  } finally { await file.close(); }
}
async function pinnedPostgrest(root, filename, env) {
  const pin = await readFile(path.join(root, 'deployment/vps/prepare-contabo-postgres.sh'), 'utf8');
  const archiveSha256 = '4eb414eb948c8800863cc8c9896a17b611b2dccf9ff581f4d57f42ec9ccee40d';
  assert.ok(pin.includes(archiveSha256) && pin.includes('16.3'), 'repository_postgrest_pin_changed');
  const raw = await boundedBytes(path.join(path.dirname(filename), 'postgrest-v16.3.tar.xz'), 10_000_000);
  assert.equal(hash(raw), archiveSha256, 'postgrest_archive_pin_mismatch');
  const extracted = execFileSync('tar', ['-xOJf', '-', 'postgrest'], {input:raw, maxBuffer:32_000_000, timeout:20000, env});
  const binary = await boundedBytes(filename, 32_000_000);
  assert.equal(hash(binary), hash(extracted), 'postgrest_binary_pin_mismatch');
  const version = execFileSync(filename, ['--version'], {encoding:'utf8', timeout:5000, env}).trim();
  assert.match(version, /^PostgREST 16\.3(?:\s|$)/u);
  return {version, archiveBytes:raw.length, archiveSha256, binaryBytes:binary.length, binarySha256:hash(binary)};
}
export function redactLocalLogChunks(chunks, secrets) {
  // Pipe chunk boundaries are arbitrary; a second pass must precede persistence.
  return secrets.reduce((text, secret) => {
    assert.ok(typeof secret === 'string' && secret.length > 0);
    return text.replaceAll(secret, '[ephemeral credential]');
  }, chunks.join(''));
}
async function input(filename) {
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    assert.ok(before.isFile() && before.size <= 2_000_000, 'local_profile_input_bound');
    const bytes = await file.readFile(); const after = await file.stat();
    assert.equal(bytes.length, before.size); assert.equal(after.ctimeMs, before.ctimeMs);
    return JSON.parse(bytes.toString('utf8'));
  } finally { await file.close(); }
}
async function save(filename, value) {
  const file = await open(filename, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
  finally { await file.close(); }
}
async function reservePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}
async function ready(url, child, timeout = 20000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    if (child.exitCode !== null) throw new Error('local_profile_service_exited');
    try { return await fetch(url, { signal: AbortSignal.timeout(1000), redirect: 'error' }); }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('local_profile_service_not_ready');
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/** Partial development profile, never a production migration/installed-policy
 * attestation. Every installed definition is selected verbatim from existing SQL.
 * No observed roster, facts, publisher approvals or model reservations are seeded. */
export async function localInboxProfile(root) {
  const parts = []; const definitions = []; const sources = new Map();
  const select = async (file, marker, end = '\n);') => {
    if (!sources.has(file)) sources.set(file, await readFile(path.join(root, file), 'utf8'));
    const text = sources.get(file); const start = text.indexOf(marker);
    assert.ok(start >= 0 && text.indexOf(marker, start + marker.length) < 0, 'local_profile_unique_definition');
    const finish = text.indexOf(end, start); assert.ok(finish >= start, 'local_profile_definition_incomplete');
    const sql = text.slice(start, finish + end.length);
    parts.push(sql); definitions.push({ file, marker, sourceSha256: hash(text), definitionSha256: hash(sql) });
    return sql;
  };
  await select('supabase_schema.sql', 'CREATE TABLE IF NOT EXISTS stocks (');
  await select('migrations/20260315_research_system_v2.sql', 'CREATE TABLE IF NOT EXISTS source_entities (');
  await select('migrations/20260315_research_system_v2.sql', 'CREATE TABLE IF NOT EXISTS source_raw_documents (');
  await select('migrations/20260901_source_research_shadow_v2.sql', 'ALTER TABLE public.source_raw_documents', ';');
  await select('migrations/20260906_source_identity_v4.sql', 'ALTER TABLE public.source_raw_documents', ';');
  for (const name of ['authority_status_v3','stock_exchange_v3','instrument_type_v3','listing_status_v3',
    'official_roster_provider_v3','tw_market_v3','canonical_sector_key_v3']) {
    await select('migrations/20260724_source_led_opportunity_engine_v3.sql', `CREATE TYPE ${name} AS ENUM`, ';');
  }
  await select('migrations/20260724_source_led_opportunity_engine_v3.sql', 'CREATE TABLE IF NOT EXISTS stock_instruments_v3 (');
  await select('migrations/20260724_source_led_opportunity_engine_v3.sql', 'CREATE TABLE IF NOT EXISTS stock_sector_assignments_v3 (');
  const routines = [];
  for (const [file, name, signature] of [
    ['migrations/20260901_source_research_shadow_v2.sql','candidate_research_stock_authority','timestamptz'],
    ['migrations/20260906_authority_pagination_v2.sql','candidate_research_stock_authority_page','timestamptz,integer,integer'],
    ['migrations/20260929_research_agent_state_v1.sql','research_source_heads_page_v1','timestamptz,integer,integer'],
  ]) {
    const sql = await select(file, `CREATE OR REPLACE FUNCTION public.${name}(`, '$function$;');
    const body = sql.split('$function$')[1];
    routines.push({ name, signature, body });
    parts.push(`REVOKE ALL ON FUNCTION public.${name}(${signature}) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.${name}(${signature}) TO service_role;`);
  }
  return { sql: parts.join('\n'), definitions, routines };
}

/** Runs only in the existing Node test-runner loopback projection boundary.
 * Uses real Next, Supabase client, PostgREST and PostgreSQL; no DB/client injection. */
export async function verifyLocalInboxDataPlane({ root, artifacts, pgBin, postgrestBin, check = async (_name, fn) => fn() }) {
  assert.equal(process.env.NODE_TEST_CONTEXT, 'child-v8', 'local_profile_requires_node_test_runner');
  for (const value of [root, artifacts, pgBin, postgrestBin]) assert.ok(path.isAbsolute(value));
  const environment = localProcessEnvironment();
  const tool = await pinnedPostgrest(root, postgrestBin, environment);
  await mkdir(artifacts, { mode: 0o700 });
  const socket = path.join(artifacts, 'socket'); await mkdir(socket, { mode: 0o700 });
  assert.ok(/^[a-zA-Z0-9_./-]+$/u.test(socket) && Buffer.byteLength(socket) < 95, 'local_socket_path_bound');
  const cluster = path.join(artifacts, 'cluster'); const pgPort = await reservePort();
  const pgrstPort = await reservePort(); const apiPort = await reservePort(); const appPort = await reservePort();
  const exec = (name, args) => execFileSync(path.join(pgBin, name), args, { env:environment, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 20000 }).trim();
  const sql = query => exec('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',socket,'-p',String(pgPort),'-d','postgres','-c',query]);
  const pgStart = () => exec('pg_ctl', ['-D',cluster,'-l',path.join(artifacts,'postgres.log'),'-o',`-h '' -k ${socket} -p ${pgPort}`,'-w','start']);
  const pgStop = () => exec('pg_ctl', ['-D',cluster,'-m','fast','-w','stop']);
  const key = randomBytes(32).toString('hex'); const secret = randomBytes(48).toString('hex');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'service_role',exp:Math.floor(Date.now()/1000)+1800})}`;
  const bearer = `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;
  const safe = text => String(text).replaceAll(key,'[ephemeral internal key]').replaceAll(bearer,'[ephemeral service JWT]').replaceAll(secret,'[ephemeral JWT secret]');
  const report = { startedAt:new Date().toISOString(), postgrest:tool, partialDevelopmentProfile:true, databaseAdapterInjected:false,
    officialAuthorityRowsSeeded:0, observedRosterPromoted:false, modelReserved:false, productionImported:false,
    top20:null, checks:[], limitations:['Node test-runner controlled loopback configuration, not production runtime activation',
      'Partial schema profile does not attest the complete installed migration policy','No official roster/sector authority has been ingested; Top20 remains blocked'] };
  let running = false, postgrest, next, compatibility; const logs = {next:[],postgrest:[]};
  try {
    exec('initdb',['-D',cluster,'-A','trust','--no-instructions']); pgStart(); running=true;
    sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE ROLE local_postgrest LOGIN NOINHERIT; GRANT service_role,anon TO local_postgrest; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
    const profile = await localInboxProfile(root); sql(profile.sql);
    sql('ALTER TABLE source_raw_documents ENABLE ROW LEVEL SECURITY; CREATE POLICY local_inbox_service_only ON source_raw_documents TO service_role USING(true) WITH CHECK(true); GRANT USAGE ON SCHEMA public TO anon,service_role; GRANT SELECT,INSERT ON source_raw_documents TO service_role;');
    report.installedDefinitions = profile.definitions;
    report.installedRoutines = profile.routines.map(({name,signature,body}) => {
      const row = JSON.parse(sql(`SELECT json_build_object('name',proname,'body',prosrc,'securityDefiner',prosecdef,'searchPath',proconfig,'serviceExecute',has_function_privilege('service_role',oid,'EXECUTE'),'anonExecute',has_function_privilege('anon',oid,'EXECUTE')) FROM pg_proc WHERE oid='public.${name}(${signature})'::regprocedure`));
      assert.equal(row.body, body); assert.equal(row.securityDefiner,true); assert.equal(row.serviceExecute,true); assert.equal(row.anonExecute,false);
      assert.deepEqual(row.searchPath, ['search_path=public, pg_temp']);
      return {name, bodySha256:hash(row.body), securityDefiner:row.securityDefiner, searchPath:row.searchPath, serviceExecute:true, anonExecute:false};
    });
    postgrest=spawn(postgrestBin,[],{env:{...environment,PGRST_DB_URI:`postgresql://local_postgrest@/postgres?host=${socket}&port=${pgPort}`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:String(pgrstPort),PGRST_DB_POOL:'2',PGRST_OPENAPI_MODE:'disabled'},stdio:['ignore','pipe','pipe']});
    for(const stream of [postgrest.stdout,postgrest.stderr]) stream.on('data',b=>logs.postgrest.push(safe(b)));
    await ready(`http://127.0.0.1:${pgrstPort}/`,postgrest);
    // Supabase /rest/v1 shape only; loopback target/prefix are fixed, no arbitrary URL.
    compatibility=http.createServer(async(req,res)=>{
      try {
        if(!req.url.startsWith('/rest/v1/')) {res.writeHead(404);res.end();return;}
        const target=`http://127.0.0.1:${pgrstPort}/${req.url.slice('/rest/v1/'.length)}`;
        let body='';for await(const b of req){body+=b;if(body.length>2_000_000)throw new Error('body_bound');}
        const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];
        const response=await fetch(target,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'error',signal:AbortSignal.timeout(15000)});
        const chunks=[];let total=0;for await(const chunk of response.body ?? []){total+=chunk.length;assert.ok(total<=4_000_000);chunks.push(chunk);}const bytes=Buffer.concat(chunks);
        const resultHeaders=Object.fromEntries(response.headers);delete resultHeaders['content-length'];delete resultHeaders['content-encoding'];
        res.writeHead(response.status,resultHeaders);res.end(bytes);
      } catch {res.writeHead(502);res.end('{"error":"local_compatibility_failed"}');}
    });
    await new Promise(resolve=>compatibility.listen(apiPort,'127.0.0.1',resolve));
    next=spawn(process.execPath,[path.join(root,'web/node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(appPort)],{cwd:path.join(root,'web'),env:{...environment,NODE_ENV:'production',INTERNAL_API_KEY:key,LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',SUPABASE_URL:`http://127.0.0.1:${apiPort}/`,SUPABASE_SERVICE_ROLE_KEY:bearer,RADAR_PUBLIC_SNAPSHOTS_ENABLED:'disabled',SOURCE_LED_OPPORTUNITY_V3:'disabled'},stdio:['ignore','pipe','pipe']});
    for(const stream of [next.stdout,next.stderr])stream.on('data',b=>logs.next.push(safe(b)));
    const origin=`http://127.0.0.1:${appPort}/`;await ready(origin+'api/internal/research-inbox',next);
    const directory=path.join(root,'docs/research/2026-10-08-discovery-live');
    const values=await Promise.all(['public-source-relay.json','social-surface-observations.json','observed-security-classification.json','timed-public-source-relay.json'].map(f=>input(path.join(directory,f))));
    const prepared=prepareDiscoveryRelay(values[0],values[1],values[2],new Date().toISOString(),values[3]);
    assert.equal(prepared.observationUniverse.length,1946);
    assert.ok(prepared.observationUniverse.every(row=>row.pricePhase==='unknown'));
    await save(path.join(artifacts,'observed-classification-status.json'),{
      trustedCandidateUniverse:false,top20:null,top20Gap:prepared.top20Gap,rows:prepared.observationUniverse,
    });
    report.observedClassificationAccounting={total:1946,needsEvidence:prepared.observationUniverse.filter(row=>row.scopeStatus==='needs_evidence').length,
      notAssessed:prepared.observationUniverse.filter(row=>row.scopeStatus==='not_assessed').length,qualified:0,ranked:0};
    const run=await executeSourceController(prepared.controllerInput); assert.equal(run.inboxRequest.items.length,3);
    report.sourceAttempts=run.receipts.map(row=>({id:row.scopeId,outcome:row.outcome}));
    report.controllerRunHash=run.runHash;report.inputCanonicalSymbols=run.inboxRequest.items.map(i=>({url:i.sourceUrl,symbols:i.symbols,subjectScope:i.subjectScope}));
    await save(path.join(artifacts,'controller.json'),run);await save(path.join(artifacts,'assessments.json'),[]);
    const post = (endpoint, payload, authenticated=true) => fetch(origin+endpoint,{method:'POST',headers:{'content-type':'application/json',...(authenticated?{authorization:`Bearer ${key}`}:{})},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(15000)});
    await check('unauthorized real Next inbox returns 401 without a DB write',async()=>{
      const r=await post('api/internal/research-inbox',run.inboxRequest,false);assert.equal(r.status,401);assert.equal(sql('SELECT count(*) FROM source_raw_documents'),'0');report.checks.push('unauthorized_401_zero_write');
    });
    await check('real Next/Supabase/PostgREST PostgreSQL inbox persists three industry summaries',async()=>{
      const r=await post('api/internal/research-inbox',run.inboxRequest);assert.equal(r.status,200);const result=await r.json();assert.equal(result.accepted,3);
      assert.equal(sql("SELECT count(*) FROM source_raw_documents WHERE symbols='[]'::jsonb AND metadata->>'subject_scope'='industry_context'"),'3');assert.equal(sql('SELECT count(DISTINCT publisher_key) FROM source_raw_documents'),'1');report.distinctPublishers=1;report.persistedDocuments=3;report.checks.push('inbox_three_industry_only');
    });
    const rpc=(name,args)=>fetch(`http://127.0.0.1:${apiPort}/rest/v1/rpc/${name}`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(15000)});
    await check('anonymous PostgREST cannot read or call service-only source RPC',async()=>{
      const base=`http://127.0.0.1:${apiPort}/rest/v1/`;
      const r=await fetch(base+'source_raw_documents?select=id',{signal:AbortSignal.timeout(15000),redirect:'error'});
      assert.equal(r.status,401);
      const call=await fetch(base+'rpc/research_source_heads_page_v1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({p_cutoff:run.asOf,p_offset:0,p_limit:500}),signal:AbortSignal.timeout(15000),redirect:'error'});
      assert.equal(call.status,401);report.checks.push('anonymous_table_rpc_denied');
    });
    await check('guarded stock-master entry refuses an absent production writer identity',async()=>{
      const r=await post('api/internal/taiwan-data-refresh',{datasets:['stock_master'],phase:'final',symbols:[]});
      assert.equal(r.status,409);const result=await r.json();assert.equal(result.error,'writer_release_identity_missing');
      assert.equal(sql('SELECT count(*) FROM stock_instruments_v3'),'0');report.rosterIngestionFailure=result.error;report.checks.push('production_writer_not_fabricated');
    });
    await check('unchanged real source-head RPC returns current roots and no pre-observation knowledge',async()=>{
      let r=await rpc('research_source_heads_page_v1',{p_cutoff:run.asOf,p_offset:0,p_limit:500});assert.equal(r.status,200);const rows=await r.json();assert.equal(rows.length,3);assert.ok(rows.every(row=>row.symbols.length===0));
      r=await rpc('research_source_heads_page_v1',{p_cutoff:'2026-10-08T09:18:05Z',p_offset:0,p_limit:500});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);report.sourceHeads=3;report.checks.push('real_source_heads_cutoff');
    });
    await check('real authority RPC remains empty without promoting the observed roster',async()=>{
      const r=await rpc('candidate_research_stock_authority_page',{p_cutoff:run.asOf,p_page_offset:0,p_page_limit:500});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);report.checks.push('real_authority_empty');
    });
    await check('PostgreSQL restart and duplicate inbox POST preserve the original records',async()=>{
      const before=sql('SELECT jsonb_agg(row_to_json(d) ORDER BY document_url) FROM source_raw_documents d');pgStop();running=false;pgStart();running=true;
      // PostgREST reconnects to the same socket after its pool loses the old DB.
      let r;for(let i=0;i<20;i++){r=await post('api/internal/research-inbox',run.inboxRequest);if(r.status===200)break;await new Promise(resolve=>setTimeout(resolve,200));}
      assert.equal(r.status,200);assert.equal((await r.json()).accepted,0);assert.equal(sql('SELECT jsonb_agg(row_to_json(d) ORDER BY document_url) FROM source_raw_documents d'),before);report.postgresRestartUnchanged=true;report.inboxReplayAccepted=0;report.checks.push('restart_dedup');
    });
    await check('priority fails honestly and consumer restart fences an uncertain submission',async()=>{
      const r=await post('api/internal/research-priority-run',{...run.priorityRequest,assessments:[]});report.priorityStatus=r.status;report.priorityFailure=await r.json();assert.equal(report.priorityFailure.ok,false);
      const args=['--controller',path.join(artifacts,'controller.json'),'--assessments',path.join(artifacts,'assessments.json'),'--origin',origin,'--journal',path.join(artifacts,'journal')];
      await assert.rejects(sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}}),/priority_rejected_or_uncertain/);
      await assert.rejects(sourcePriorityCommand(args,{env:{INTERNAL_API_KEY:key}}),/uncertain_submission/);assert.equal(sql('SELECT count(*) FROM source_raw_documents'),'3');report.checks.push('priority_blocked_restart_fenced');
    });
    assert.equal(report.checks.length,8,'local_profile_incomplete_checks');
    report.passed=true;
  } catch(error) {report.failure=safe(error.message);throw error;}
  finally {
    await stop(next);if(compatibility)await new Promise(resolve=>compatibility.close(resolve));await stop(postgrest);if(running)pgStop();
    report.completedAt=new Date().toISOString();await save(path.join(artifacts,'acceptance-receipt.json'),report);
    for(const [name,lines] of Object.entries(logs))await writeFile(path.join(artifacts,name+'.log'),redactLocalLogChunks(lines,[key,bearer,secret]),{flag:'wx',mode:0o600});
  }
  return report;
}
