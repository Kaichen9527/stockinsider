/** Isolated test harness only. Never loads a production connection or installs a migration. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {assessHostResources,inspectHostResources} from './contabo-host-resource-check.mjs';
import {insiderAcceptanceLifecycle,trackInsiderAcceptanceChild,stopInsiderAcceptanceChild} from './research-insider-acceptance-lifecycle.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export const REQUIRED_CHECKS=['legacy_aba','isolation','authority_aba','event_commit_order','lease_observer','lock_order','attempt_cas','physical_files','database_metrics','shared_writers','event_exhaustion','receipt_integrity'];
export function journalFingerprint(events){
 assert.ok(Array.isArray(events)&&events.length<=128,'event_bound');const seen=new Set();
 const sorted=events.map(e=>{assert.ok(Number.isSafeInteger(e.id)&&e.id>0&&e.id<=128&&!seen.has(e.id)&&typeof e.binding==='string','event_identity');seen.add(e.id);return {id:e.id,binding:e.binding};}).sort((a,b)=>a.id-b.id);
 return sha(JSON.stringify({count:sorted.length,events:sorted}));
}
export function measurementVerdict(lifecycle){
 const passed=lifecycle?.passed===true&&lifecycle.cleanupComplete===true&&REQUIRED_CHECKS.every(k=>lifecycle.checks?.[k]==='passed');
 return {testOutcome:passed?'passed':'failed',fullContractAcceptance:false,productionReady:false,evictionAuthorized:false,cleanupComplete:lifecycle?.cleanupComplete===true,checks:lifecycle?.checks??{}};
}
export async function allocationInventory(directory,{maxEntries=16384,maxBytes=512*1024**2,hashFiles=true,signal}={}){
 assert.ok(Number.isSafeInteger(maxEntries)&&maxEntries>0&&maxEntries<=16384,'entry_bound');assert.ok(Number.isSafeInteger(maxBytes)&&maxBytes>=0&&maxBytes<=4*1024**3,'byte_bound');
 const actual=await fs.realpath(directory);assert.equal(actual,path.resolve(directory),'unsafe_root');const entries=[],inodes=new Set();let apparent=0,unique=0,dirs=0,count=0;
 const check=()=>{if(signal?.aborted)throw Error('inventory_aborted');};
 async function visit(filename){
  check();if(++count>maxEntries)throw Error('inventory_entry_bound');const before=await fs.lstat(filename);
  if(before.isSymbolicLink()||(!before.isFile()&&!before.isDirectory())||before.uid!==process.getuid()||!Number.isSafeInteger(before.blocks)||before.blocks<0)throw Error('inventory_unsafe');
  const inode=`${before.dev}:${before.ino}`,bytes=before.blocks*512;assert.ok(Number.isSafeInteger(bytes),'allocation_overflow');
  const row={path:path.relative(actual,filename)||'.',dev:before.dev,ino:before.ino,nlink:before.nlink,size:before.size,blocks:before.blocks,allocatedBytes:bytes,kind:before.isFile()?'file':'directory'};
  if(before.isDirectory()){
   dirs+=bytes;entries.push(row);if(dirs+unique>maxBytes)throw Error('inventory_byte_bound');
   // opendir bounds enumeration without materializing an unbounded readdir array.
   const stream=await fs.opendir(filename);for await(const child of stream)await visit(path.join(filename,child.name));
  }else{
   apparent+=before.size;if(apparent>maxBytes||dirs+unique+(!inodes.has(inode)?bytes:0)>maxBytes)throw Error('inventory_byte_bound');
   if(!inodes.has(inode)){inodes.add(inode);unique+=bytes;}
   if(hashFiles){
    const handle=await fs.open(filename,constants.O_RDONLY|constants.O_NONBLOCK|constants.O_NOFOLLOW);
    try{const initial=await handle.stat();assert.ok(initial.isFile()&&initial.dev===before.dev&&initial.ino===before.ino,'inventory_changed');
     const hash=createHash('sha256'),chunk=Buffer.alloc(65536);let n=0;
     while(true){check();const r=await handle.read(chunk,0,Math.min(chunk.length,before.size+1-n),n);if(!r.bytesRead)break;n+=r.bytesRead;if(n>before.size)throw Error('inventory_growth');hash.update(chunk.subarray(0,r.bytesRead));}
     const after=await handle.stat();assert.ok(n===before.size&&after.size===before.size&&after.ctimeMs===before.ctimeMs&&after.mtimeMs===before.mtimeMs,'inventory_changed');row.sha256=hash.digest('hex');
    }finally{await handle.close();}
   }
   entries.push(row);
  }
  const visible=await fs.lstat(filename);assert.ok(visible.dev===before.dev&&visible.ino===before.ino,'inventory_changed');check();
 }
 await visit(actual);return {allocatedBytes:unique+dirs,uniqueFileAllocatedBytes:unique,directoryAllocatedBytes:dirs,apparentFileBytes:apparent,uniqueFiles:inodes.size,fileEntries:entries.filter(x=>x.kind==='file').length,entries};
}
export async function buildArchiveFixtureProfile(){
 const definitions=[],pieces=['CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;'];
 const extract=async(file,marker,end='\n);')=>{const source=await fs.readFile(path.join(root,file),'utf8');const start=source.indexOf(marker),finish=source.indexOf(end,start);assert.ok(start>=0&&finish>start,`profile_marker:${marker}`);const sql=source.slice(start,finish+end.length);definitions.push({file,marker,sha256:sha(sql)});pieces.push(sql);};
 const engine='migrations/20260724_source_led_opportunity_engine_v3.sql',lease='migrations/20260831_candidate_shadow_performance.sql',plane='migrations/20260911_contabo_data_plane_v1.sql',writer='migrations/20260901_source_research_shadow_v2.sql';
 for(const name of ['internal_principal_role_v3','authority_status_v3'])await extract(engine,`CREATE TYPE ${name} AS ENUM`,';');
 await extract(engine,'CREATE TABLE IF NOT EXISTS internal_principal_role_bindings_v3 (');
 await extract(engine,'CREATE OR REPLACE FUNCTION internal_principal_role_is_exact_v3_internal(', '$fn$;');
 await extract(lease,'CREATE TABLE IF NOT EXISTS public.production_write_leases (');
 for(const name of ['acquire_production_write_lease','release_production_write_lease'])await extract(lease,`CREATE OR REPLACE FUNCTION public.${name}(`,'$function$;');
 for(const name of ['stockinsider_data_plane_settings_v1','stockinsider_backend_identities_v1'])await extract(plane,`CREATE TABLE IF NOT EXISTS public.${name} (`);
 await extract(plane,'CREATE OR REPLACE FUNCTION public.assert_stockinsider_backend_request_v1(', '$function$;');
 await extract(writer,'CREATE TABLE IF NOT EXISTS public.production_writer_releases (');
 await extract(writer,'CREATE OR REPLACE FUNCTION public.register_production_writer_release(', '$function$;');
 await extract(plane,'CREATE OR REPLACE FUNCTION public.activate_stockinsider_backend_release_v1(', '$function$;');
 pieces.push(`CREATE UNIQUE INDEX fixture_one_backend ON public.stockinsider_backend_identities_v1((status)) WHERE status='active';CREATE UNIQUE INDEX fixture_one_writer ON public.production_writer_releases((active)) WHERE active;`);
 const principal='00000000-0000-4000-8000-000000000001',backend='00000000-0000-4000-8000-000000000002',release='1'.repeat(40);
 pieces.push(`INSERT INTO public.stockinsider_data_plane_settings_v1 VALUES(true,true,clock_timestamp(),'synthetic fixture');
 INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,status,configuration_hash,valid_from) VALUES('${principal}','opportunity_runner','active',repeat('a',64),clock_timestamp()-interval '1 day');
 INSERT INTO public.stockinsider_backend_identities_v1(backend_id,principal_id,release_id,status,valid_from) VALUES('${backend}','${principal}','${release}','active',clock_timestamp()-interval '1 day');
 SELECT public.register_production_writer_release('${release}');`);
 const fixture=await fs.readFile(path.join(root,'scripts/fixtures/insider-archive-fence-v2.sql'),'utf8');definitions.push({file:'scripts/fixtures/insider-archive-fence-v2.sql',sha256:sha(fixture)});pieces.push(fixture);
 return {sql:pieces.join('\n'),definitions,principal,backend,release,syntheticAcl:true,fullProductionProfile:false};
}
export async function runOwned(command,args,{life,env,input}={}){
 life.remaining();const child=trackInsiderAcceptanceChild(spawn(command,args,{env,stdio:['pipe','pipe','pipe']}));life.addCleanup(()=>stopInsiderAcceptanceChild(child));
 const out=life.boundedLog(),err=life.boundedLog();child.stdout.on('data',b=>out.append(b));child.stderr.on('data',b=>err.append(b));
 return life.run(()=>new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve(out.chunks.join('')):reject(Error(`fixture_command:${path.basename(command)}:${code}:${err.chunks.join('').slice(0,3000)}`)));child.stdin.end(input);}));
}
async function writerProbe(directory){
 assert.equal(process.platform,'linux','VM-only writer payload');assert.ok(path.isAbsolute(directory),'absolute_fixture_directory');await fs.mkdir(directory,{mode:0o700});
 process.env.STOCKINSIDER_DATA_PLANE='contabo';process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT=directory;
 globalThis.fetch=()=>{throw Error('fixture_network_forbidden');};
 const {putCandidateFinancialArtifact}=await import(pathToFileURL(path.join(root,'web/src/lib/candidate-financial-artifact.ts')));
 const {readBoundedCandidateFinancialDocument}=await import(pathToFileURL(path.join(root,'web/src/lib/candidate-financial-documents.ts')));
 const {putSourceAuditArtifact}=await import(pathToFileURL(path.join(root,'web/src/lib/source-audit-artifact.ts')));
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,purpose:args.p_purpose,bytes:args.p_byte_length});return {data:{},error:null};}};
 const stream=size=>{let remaining=size;return new ReadableStream({pull(c){if(!remaining){c.close();return;}const n=Math.min(65536,remaining);remaining-=n;c.enqueue(new Uint8Array(n).fill(71));}});};
 let financial=await readBoundedCandidateFinancialDocument(stream(50*1024**2));assert.equal(financial.byteLength,50*1024**2);
 await putCandidateFinancialArtifact({client,objectKey:'synthetic-only',sha256:financial.sha256,bytes:financial.bytes,contentType:'application/pdf'});financial=null;
 await assert.rejects(readBoundedCandidateFinancialDocument(stream(50*1024**2+1)),/too_large/);
 let audit=Buffer.alloc(64*1024**2,72);await putSourceAuditArtifact({client,bucket:'fixture',objectKey:'synthetic-only',bytes:audit,contentType:'application/octet-stream'});audit=null;
 await assert.rejects(putSourceAuditArtifact({client,bucket:'fixture',objectKey:'synthetic-only',bytes:Buffer.alloc(64*1024**2+1,72),contentType:'application/octet-stream'}),/artifact_input_invalid/);
 assert.deepEqual(calls.map(c=>c.purpose),['financial_document','diagnostic_attachment']);
 const allocation=await allocationInventory(directory);assert.ok(allocation.apparentFileBytes>=114*1024**2);
 return {calls,allocation,receiptTransport:'synthetic stub; no SQL authority',sharedReservationInstalled:false,sourcePayloads:'synthetic; network forbidden',peakChildRssBytes:process.resourceUsage().maxRSS*1024};
}
async function expectReject(promise,pattern){try{await promise;}catch(error){assert.match(error.message,pattern);return error.message;}throw Error('expected_rejection_missing');}
export async function runArchiveMeasurement({pgBin,artifacts,signal}={}){
 assert.equal(process.platform,'linux','VM Linux required; do not start PG on Mac');assert.ok(path.isAbsolute(pgBin??'')&&path.isAbsolute(artifacts??''),'explicit_isolated_paths');
 const parent=await fs.realpath(path.dirname(artifacts));assert.equal(parent,path.dirname(artifacts),'unsafe_artifact_parent');await fs.mkdir(artifacts,{mode:0o700});
 const life=insiderAcceptanceLifecycle({signal,timeoutMs:240000,cleanupTimeoutMs:10000,requiredChecks:REQUIRED_CHECKS});
 const report={schema:'insider-archive-isolated-measurement-v2',startedAt:new Date().toISOString(),productionReady:false,evictionAuthorized:false,negativeControls:[],metrics:[],coverage:{},limitations:['Synthetic superuser-owned DB fixture, not production minimum privilege','No production observer/registry/quota installation','No kernel hard-I/O deadline or power-loss proof','No Next/PostgREST archive endpoint exists','Shared financial/audit reservation remains uncovered'],testOutcome:'pending'};
 const env=Object.fromEntries(['PATH','LANG','TZ','TMPDIR'].filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]));env.PGPASSFILE='/dev/null';
 const cluster=path.join(artifacts,'pg'),socket=path.join(artifacts,'s'),privateRoot=path.join(artifacts,'objects');await fs.mkdir(socket,{mode:0o700});await fs.mkdir(privateRoot,{mode:0o700});assert.ok(Buffer.byteLength(socket)<95,'socket_bound');
 const clients=[];let pgChild,pgLog;const queryLog=[];
 try{
  report.hostBefore=await inspectHostResources(artifacts);const capacity={observedAt:report.hostBefore.observedAt,availableBytes:report.hostBefore.availableBytes,databaseRestoreBytes:4*1024**3,documentBytes:0,peakWalBytes:0,peakTemporaryBytes:0,deploymentBytes:0,localBackupStagingBytes:0,growthReserveBytes:0};report.fixtureHostGuard=assessHostResources({capacity,availableMemoryBytes:report.hostBefore.availableMemoryBytes,peakMemoryBytes:512*1024**2});assert.equal(report.fixtureHostGuard.allowed,true,'fixture_host_guard_refused');report.guardScope='4GiB TOTAL disposable workspace envelope, not a production allocation formula';
  report.sourceFiles=[];for(const file of ['scripts/insider-archive-measurement-v2.mjs','scripts/insider-archive-measurement-v2.test.mjs','scripts/fixtures/insider-archive-fence-v2.sql','web/src/lib/insider-completed-archive-codec-v2.ts','web/src/lib/insider-completed-archive-io-v2.ts','web/src/lib/private-artifact-store.ts'])report.sourceFiles.push({file,sha256:sha(await fs.readFile(path.join(root,file)))});
  report.toolVersion=(await runOwned(path.join(pgBin,'postgres'),['--version'],{life,env})).trim();assert.match(report.toolVersion,/PostgreSQL\) 17\./);
  await runOwned(path.join(pgBin,'initdb'),['-D',cluster,'-A','trust','--no-instructions'],{life,env});
  pgChild=trackInsiderAcceptanceChild(spawn(path.join(pgBin,'postgres'),['-D',cluster,'-h','','-k',socket,'-p','15432','-c','autovacuum=off','-c','max_connections=8','-c','shared_buffers=32MB','-c','max_wal_size=128MB'],{env,stdio:['ignore','pipe','pipe']}));
  life.addCleanup(()=>stopInsiderAcceptanceChild(pgChild,{graceMs:3000,killMs:2000}));pgLog=life.boundedLog();for(const stream of [pgChild.stdout,pgChild.stderr])stream.on('data',b=>pgLog.append(b));pgChild.on('error',e=>life.cancel(e));
  const {Client}=await import('pg');
  async function connect(name){
   const c=new Client({host:socket,port:15432,database:'postgres',user:os.userInfo().username,password:'',ssl:false,connectionTimeoutMillis:1000,application_name:name,options:'-c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000'});
   try{await c.connect();}catch(e){await c.end().catch(()=>{});throw e;}clients.push(c);life.addCleanup(()=>c.end());c.on('error',e=>{if(!life.signal.aborted)life.cancel(e);});return c;
  }
  let a;for(let i=0;i<100&&!a;i++){life.remaining();try{a=await connect('archive_a');}catch{await new Promise(r=>setTimeout(r,50));}}assert.ok(a,'pg_start_failed');
  const b=await connect('archive_b'),control=await connect('archive_control');
  const q=(c,sql,params=[])=>life.run(async()=>{const disk=await fs.statfs(artifacts,{bigint:true});const available=Number(disk.bavail*disk.bsize);assert.ok(available>=15*1024**3&&report.hostBefore.availableBytes-available<=4*1024**3,'fixture_disk_guard');queryLog.push({session:c===a?'a':c===b?'b':'control',sql,parameterCount:params.length});if(queryLog.length>1000)throw Error('query_log_bound');return c.query(sql,params);});
  const value=async(c,sql,params=[])=>(await q(c,sql,params)).rows[0]?.value;
  const profile=await buildArchiveFixtureProfile();report.definitions=profile.definitions;report.profileSha256=sha(profile.sql);await fs.writeFile(path.join(artifacts,'profile.sql'),profile.sql,{flag:'wx',mode:0o600});await q(a,profile.sql);
  const headers=JSON.stringify({'x-stockinsider-backend-id':profile.backend,'x-stockinsider-runner-principal':profile.principal,'x-stockinsider-writer-release':profile.release});
  for(const c of clients)await q(c,"SELECT set_config('request.headers',$1,false),set_config('request.jwt.claims',$2,false)",[headers,JSON.stringify({role:'service_role'})]);
  const raw=Buffer.from('synthetic source bytes\n'),rawHash=sha(raw);let operation,binding;
  await fs.writeFile(path.join(privateRoot,'.readback-input'),raw,{flag:'wx',mode:0o600});report.readbacks=[];
  const readback=async()=>{const inventory=await allocationInventory(privateRoot,{signal:life.signal});const actual=inventory.entries.find(x=>x.path==='.readback-input')?.sha256;assert.equal(actual,rawHash);report.readbacks.push({hash:actual,at:new Date().toISOString()});return actual;};
  const clearLease=()=>q(a,"DELETE FROM public.production_write_leases WHERE lease_key='production-data-plane'");
  const acquire=async()=>{await clearLease();operation=randomUUID();binding=await value(a,'SELECT archive_fixture.acquire($1,$2) AS value',[operation,rawHash]);return binding;};
  const journal=c=>value(c,'SELECT archive_fixture.journal() AS value');
  const active=c=>value(c,'SELECT public.internal_principal_role_is_exact_v3_internal($1,\'opportunity_runner\',clock_timestamp()) AS value',[profile.principal]);
  const appendRole=(c,status)=>q(c,"INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,status,configuration_hash,valid_from) VALUES($1,'opportunity_runner',$2,repeat('a',64),clock_timestamp()-interval '1 day')",[profile.principal,status]);
  await life.check('legacy_aba',async()=>{
   await q(a,'BEGIN');const owner=randomUUID();await q(a,"SELECT public.acquire_production_write_lease('production-data-plane',$1,300)",[owner]);const before=(await q(a,'SELECT * FROM public.production_write_leases')).rows;
   await q(a,"SELECT public.release_production_write_lease('production-data-plane',$1);",[owner]);await q(a,"SELECT public.acquire_production_write_lease('production-data-plane',$1,300)",[owner]);const after=(await q(a,'SELECT * FROM public.production_write_leases')).rows;assert.deepEqual(after,before);await q(a,'ROLLBACK');report.negativeControls.push({case:'legacy_transaction_now_ABA',falseAcceptanceObserved:true});
  });
  await life.check('isolation',async()=>{
   await q(a,'BEGIN ISOLATION LEVEL REPEATABLE READ');assert.equal(await active(a),true);await appendRole(b,'inactive');await q(a,'LOCK TABLE public.internal_principal_role_bindings_v3 IN SHARE MODE');assert.equal(await active(a),true);
   report.negativeControls.push({case:'RR_before_revoke_with_relation_lock',staleActiveObserved:true});await expectReject(q(a,'SELECT archive_fixture.acquire($1,$2)',[randomUUID(),rawHash]),/fixture_isolation_refused/);await q(a,'ROLLBACK');assert.equal(await active(a),false);
   await expectReject(q(a,'SELECT archive_fixture.acquire($1,$2)',[randomUUID(),rawHash]),/identity_rejected/);await appendRole(b,'active');
   for(const name of ['verify','terminal','renew']){await q(a,'BEGIN ISOLATION LEVEL SERIALIZABLE');await expectReject(q(a,`SELECT archive_fixture.${name}(${name==='verify'?'$1,$2':'$1'})`,name==='verify'?[randomUUID(),rawHash]:[randomUUID()]),/fixture_isolation_refused/);await q(a,'ROLLBACK');}
   assert.equal(await value(a,'SELECT count(*)::int AS value FROM archive_fixture.operations'),0);report.coverage.isolation='fixture-covered';
  });
  await life.check('authority_aba',async()=>{
   const cases=[['principal',async()=>{await appendRole(b,'inactive');await appendRole(b,'active');}],['backend',async()=>{await q(b,"UPDATE public.stockinsider_backend_identities_v1 SET status='retired'");await q(b,"UPDATE public.stockinsider_backend_identities_v1 SET status='active'");}],['settings',async()=>{await q(b,"UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=false,activated_at=NULL,activated_by=NULL");await q(b,"UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=true,activated_at=clock_timestamp(),activated_by='synthetic fixture'");}],['release',async()=>{await q(b,'SELECT public.register_production_writer_release($1)',['2'.repeat(40)]);await q(b,'SELECT public.register_production_writer_release($1)',[profile.release]);}]];
   for(const [name,change] of cases){await acquire();await q(a,'SELECT archive_fixture.verify($1,$2)',[binding,await readback()]);const leaseBefore=(await q(a,'SELECT * FROM public.production_write_leases')).rows;const j=await journal(a);await change();assert.deepEqual((await q(a,'SELECT * FROM public.production_write_leases')).rows,leaseBefore);assert.equal(await value(a,'SELECT public.assert_stockinsider_backend_request_v1(true) IS NOT NULL AS value'),true);report.negativeControls.push({case:`lease_only_${name}_ABA`,falseAcceptanceObserved:true});assert.notEqual(await journal(a),j);await expectReject(q(a,'SELECT archive_fixture.terminal($1)',[binding]),/old_verification/);report.coverage[name]='fixture-covered';}
   await q(b,'ALTER TABLE public.stockinsider_backend_identities_v1 DISABLE TRIGGER archive_authority_event');await expectReject(q(a,'SELECT archive_fixture.acquire($1,$2)',[randomUUID(),rawHash]),/observer_uncovered/);await q(b,'ALTER TABLE public.stockinsider_backend_identities_v1 ENABLE TRIGGER archive_authority_event');report.coverage.privilegedObserverDiscontinuity='uncovered; old attempts not reused';
  });
  await life.check('event_commit_order',async()=>{
   await q(a,'BEGIN');await q(a,"UPDATE public.stockinsider_backend_identities_v1 SET status=status");const low=await value(a,'SELECT max(slot)::int AS value FROM archive_fixture.events');
   await q(b,"UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=identity_fence_enabled");const high=await value(b,'SELECT max(slot)::int AS value FROM archive_fixture.events');assert.ok(high>low);const captured=await journal(b);await q(a,'COMMIT');assert.equal(await value(b,'SELECT max(slot)::int AS value FROM archive_fixture.events'),high);assert.notEqual(await journal(b),captured);report.negativeControls.push({case:'max_sequence_misses_late_commit',falseAcceptanceObserved:true});
  });
  await life.check('lease_observer',async()=>{
   for(const mutation of ['renew','same-values','reacquire','rollback']){await acquire();const owner=await value(a,'SELECT lease_owner::text AS value FROM archive_fixture.attempts WHERE id=$1',[binding]);await q(b,'BEGIN');if(mutation==='renew')await q(b,"SELECT public.acquire_production_write_lease('production-data-plane',$1,300)",[owner]);else if(mutation==='reacquire'){await q(b,"SELECT public.release_production_write_lease('production-data-plane',$1)",[owner]);await q(b,"SELECT public.acquire_production_write_lease('production-data-plane',$1,300)",[owner]);}else await q(b,'UPDATE public.production_write_leases SET owner_id=owner_id');await q(b,mutation==='rollback'?'ROLLBACK':'COMMIT');
    if(mutation==='rollback')assert.equal(await value(a,'SELECT archive_fixture.verify($1,$2) AS value',[binding,await readback()]),true);else await expectReject(q(a,'SELECT archive_fixture.verify($1,$2)',[binding,rawHash]),/old_verification/);}
   report.coverage.leaseMutations='fixture-covered';
  });
  await life.check('lock_order',async()=>{
   report.lockWaitEvidence=[];
   const patterns=[
    ['backend','UPDATE public.stockinsider_backend_identities_v1 SET status=status',()=>[]],
    ['settings','UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=identity_fence_enabled',()=>[]],
    ['principal_append',"INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,status,configuration_hash,valid_from) VALUES($1,'opportunity_runner','active',repeat('a',64),clock_timestamp()-interval '1 day')",()=>[profile.principal]],
    ['legacy_same_owner_acquire',"SELECT public.acquire_production_write_lease('production-data-plane',$1,300)",owner=>[owner]],
    ['legacy_release_after_recovery_read',"SELECT public.release_production_write_lease('production-data-plane',$1)",owner=>[owner]],
    ['runtime_rotation','SELECT public.activate_stockinsider_backend_release_v1($1)',()=>[profile.release]],
    ['cutover_order',`DELETE FROM public.production_write_leases WHERE lease_key='production-data-plane';SELECT public.register_production_writer_release('${profile.release}');UPDATE public.stockinsider_backend_identities_v1 SET status=status;UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=identity_fence_enabled;`,()=>[]],
   ];
   for(const [name,sql,params] of patterns){
    await acquire();const owner=await value(b,"SELECT owner_id::text AS value FROM public.production_write_leases WHERE lease_key='production-data-plane'");
    await q(a,'BEGIN');await q(a,'SELECT archive_fixture.gate()');
    const blocked=q(b,sql,params(owner)).then(value=>({value}),error=>({error}));let waiting=false;
    for(let i=0;i<100&&!waiting;i++){waiting=await value(control,'SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND NOT granted) AS value',[b.processID]);if(!waiting)await new Promise(r=>setTimeout(r,5));}
    assert.equal(waiting,true,`lock_barrier:${name}`);report.lockWaitEvidence.push({case:name,locks:(await q(control,'SELECT locktype,mode,granted FROM pg_locks WHERE pid=$1',[b.processID])).rows});
    await q(a,'COMMIT');const outcome=await blocked;if(outcome.error)throw outcome.error;
   }
   report.coverage.enumeratedWriterLockPatterns='fixture-covered; direct tracked mutation bodies, no HTTP or out-of-repository writer proof';
  });
  await life.check('attempt_cas',async()=>{
   await acquire();const first=binding;assert.equal(await value(a,'SELECT archive_fixture.acquire($1,$2) AS value',[operation,rawHash]),first);
   await clearLease();const contenders=await Promise.allSettled([q(a,'SELECT archive_fixture.acquire($1,$2,1) AS value',[operation,rawHash]),q(b,'SELECT archive_fixture.acquire($1,$2,1) AS value',[operation,rawHash])]);assert.equal(contenders.filter(x=>x.status==='fulfilled').length,1);const next=contenders.find(x=>x.status==='fulfilled').value.rows[0].value;
   await expectReject(q(a,'SELECT archive_fixture.verify($1,$2)',[first,rawHash]),/old_verification/);await expectReject(q(a,'SELECT archive_fixture.terminal($1)',[next]),/readback_required/);
   await q(a,'SET ROLE service_role');try{await expectReject(q(a,'INSERT INTO archive_fixture.events(relation_name,mutation,binding) VALUES(\'x\',\'INSERT\',\'{}\')'),/permission denied/);}finally{await q(a,'RESET ROLE');}
   assert.equal(await value(a,'SELECT reservation_bytes::int AS value FROM archive_fixture.operations WHERE id=$1',[operation]),12582912);
   const renewed=await value(a,'SELECT archive_fixture.renew($1) AS value',[next]);assert.notEqual(renewed,next);await expectReject(q(a,'SELECT archive_fixture.verify($1,$2)',[next,rawHash]),/old_verification/);
   await q(a,'SELECT archive_fixture.verify($1,$2)',[renewed,await readback()]);assert.equal(await value(a,'SELECT archive_fixture.terminal($1) AS value',[renewed]),true);
   assert.equal(await value(a,'SELECT archive_fixture.acquire($1,$2) AS value',[operation,rawHash]),renewed);await expectReject(q(a,'SELECT archive_fixture.acquire($1,$2,3)',[operation,rawHash]),/terminal_immutable/);
   await expectReject(q(a,"UPDATE archive_fixture.attempts SET state='active' WHERE id=$1",[renewed]),/history_immutable/);

  });
  await life.check('physical_files',async()=>{
   const {encodeInsiderArchiveV2,restoreInsiderArchiveV2}=await import(pathToFileURL(path.join(root,'web/src/lib/insider-completed-archive-codec-v2.ts')));const {publishInsiderArchiveV2,readInsiderArchiveV2}=await import(pathToFileURL(path.join(root,'web/src/lib/insider-completed-archive-io-v2.ts')));
   let firstBinding;for(const bytes of [raw,Buffer.alloc(12*1024**2,32),randomBytes(12*1024**2)]){const encoded=await encodeInsiderArchiveV2(bytes);firstBinding??=encoded.binding;const result=await publishInsiderArchiveV2(privateRoot,encoded.bytes,encoded.binding,{signal:life.signal});assert.equal(result.evictionAuthorized,false);assert.deepEqual(await readInsiderArchiveV2(privateRoot,encoded.binding),bytes);assert.deepEqual(await restoreInsiderArchiveV2(encoded.bytes,encoded.binding),bytes);report.metrics.push({phase:'verified-object',rawBytes:bytes.length,encodedBytes:encoded.bytes.length,allocation:await allocationInventory(privateRoot,{signal:life.signal})});}
   const staged=path.join(privateRoot,'.synthetic-retained-stage');await fs.writeFile(staged,raw,{mode:0o600});await fs.link(staged,staged+'.link');const fd=await fs.open(staged,'r');await fs.unlink(staged);await fs.unlink(staged+'.link');const orphan=await fd.stat();report.openUnlinkedLiabilityBytes=orphan.blocks*512;assert.ok(report.openUnlinkedLiabilityBytes>0);await fd.close();
   // A separate owned process performs real reopen/hash, rather than reusing buffers.
   const restartCode="import{createHash}from'node:crypto';const{readInsiderArchiveV2}=await import(process.argv[1]);const raw=await readInsiderArchiveV2(process.argv[2],JSON.parse(process.argv[3]));console.log(createHash('sha256').update(raw).digest('hex'))";
   const result=await runOwned(process.execPath,['--experimental-strip-types','--input-type=module','-e',restartCode,pathToFileURL(path.join(root,'web/src/lib/insider-completed-archive-io-v2.ts')).href,privateRoot,JSON.stringify(firstBinding)],{life,env});assert.equal(result.trim(),rawHash);
   report.coverage.sharedFinancialAuditReservations='uncovered; no common reservation protocol installed';report.coverage.publicationCrashPhaseMatrix='uncovered in this harness; frozen codec tests are separate evidence';report.coverage.originalSnapshotClocksAndPIT='uncovered; no snapshot SQL reader/finalize integration';
  });
  await life.check('database_metrics',async()=>{
   report.pgSettings=(await q(a,"SELECT name,setting FROM pg_settings WHERE name IN ('server_version','block_size','wal_level','full_page_writes','wal_compression','checkpoint_timeout','max_wal_size','autovacuum')")).rows;
   await q(a,'CHECKPOINT');const start=await value(a,'SELECT pg_current_wal_insert_lsn()::text AS value');await q(a,'INSERT INTO archive_fixture.payloads(raw,metadata) VALUES($1,$2)',[randomBytes(1024**2),JSON.stringify({synthetic:true})]);const end=await value(a,'SELECT pg_current_wal_insert_lsn()::text AS value');report.walGeneratedBytes=Number(await value(a,'SELECT pg_wal_lsn_diff($1,$2)::text AS value',[end,start]));assert.ok(report.walGeneratedBytes>0);
   report.relations=(await q(a,"SELECT c.relname,c.reltoastrelid::text,pg_relation_size(c.oid,'main')::text AS main,pg_relation_size(c.oid,'fsm')::text AS fsm,pg_relation_size(c.oid,'vm')::text AS vm,pg_table_size(c.oid)::text AS table_bytes,pg_indexes_size(c.oid)::text AS indexes,pg_total_relation_size(c.oid)::text AS total FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='archive_fixture' AND c.relkind='r' ORDER BY c.relname")).rows;
   for(const r of report.relations)assert.equal(BigInt(r.total),BigInt(r.table_bytes)+BigInt(r.indexes));report.toast=(await q(a,"SELECT c.relname,pg_relation_size(c.oid)::text AS main,pg_indexes_size(c.oid)::text AS indexes,pg_total_relation_size(c.oid)::text AS total FROM pg_class c WHERE c.oid IN(SELECT reltoastrelid FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace WHERE n.nspname='archive_fixture')")).rows;
   await q(a,'SELECT pg_stat_force_next_flush()');await q(a,'SELECT pg_stat_clear_snapshot()');report.walDiagnostic=(await q(a,'SELECT wal_records::text,wal_fpi::text,wal_bytes::text FROM pg_stat_wal')).rows[0];report.pgWalAllocated=await allocationInventory(path.join(cluster,'pg_wal'),{hashFiles:false,maxBytes:4*1024**3,signal:life.signal});report.clusterAllocation=await allocationInventory(cluster,{hashFiles:false,maxBytes:4*1024**3,signal:life.signal});report.memoryAtEnd=process.memoryUsage();report.parentPeakRssBytes=process.resourceUsage().maxRSS*1024;report.peakMemoryMeasured=false;report.hostAfter=await inspectHostResources(artifacts);
  });
  await life.check('shared_writers',async()=>{
   const reservedBefore=await value(a,'SELECT sum(reservation_bytes)::text AS value FROM archive_fixture.operations');const writerRoot=path.join(artifacts,'writer-probe');const output=await runOwned(process.execPath,['--experimental-strip-types',fileURLToPath(import.meta.url),'--writer-probe',writerRoot],{life,env});report.sharedWriterProbe=JSON.parse(output);
   assert.equal(report.sharedWriterProbe.sharedReservationInstalled,false);assert.ok(report.sharedWriterProbe.allocation.apparentFileBytes>1024);
   assert.equal(await value(a,'SELECT sum(reservation_bytes)::text AS value FROM archive_fixture.operations'),reservedBefore);report.negativeControls.push({case:'legacy_writer_allocation_has_no_archive_ledger_reservation',unchangedArchiveReservationBytes:reservedBefore,newActualBytes:report.sharedWriterProbe.allocation.apparentFileBytes,receiptTransport:'explicit stub; existing SQL receipt body has no reservation, not a full shared protocol'});
  });
  await life.check('event_exhaustion',async()=>{
   const last=await value(a,'SELECT last_value::int AS value FROM archive_fixture.event_slot');for(let i=last;i<128;i++)await q(a,'UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=identity_fence_enabled');const before=await journal(a);await expectReject(q(a,'UPDATE public.stockinsider_data_plane_settings_v1 SET identity_fence_enabled=identity_fence_enabled'),/maximum value/);assert.equal(await journal(a),before);
  });
  await life.check('receipt_integrity',async()=>{assert.equal(report.productionReady,false);assert.equal(report.evictionAuthorized,false);assert.ok(report.negativeControls.length>=6);});
  report.pgLog=pgLog.chunks.join('');
 }catch(error){report.error=String(error.message).slice(0,8192);report.sqlDiagnostic=Object.fromEntries(['code','detail','hint','where'].filter(k=>error[k]!=null).map(k=>[k,String(error[k]).slice(0,8192)]));life.cancel(error);}finally{
  const completion=await life.finish();Object.assign(report,measurementVerdict(completion));report.lifecycle=completion;report.queryLog=queryLog;report.pgLog=pgLog?.chunks.join('')??'';
  if(completion.cleanupComplete){try{report.workspaceAfterStop=await allocationInventory(artifacts,{hashFiles:false,maxBytes:4*1024**3});}catch(error){report.testOutcome='failed';report.finalInventoryError=error.message;}}
  let output=JSON.stringify(report,null,2)+'\n';if(Buffer.byteLength(output)>16*1024**2){report.testOutcome='failed';output=JSON.stringify({testOutcome:'failed',productionReady:false,evictionAuthorized:false,error:'report_bound',cleanupComplete:report.cleanupComplete});}
  await fs.writeFile(path.join(artifacts,'report.json'),output,{flag:'wx',mode:0o600});
 }
 if(report.testOutcome!=='passed')throw Error(`archive_measurement_failed:${report.error??report.lifecycle.failure}`);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length===2&&args[0]==='--writer-probe'){console.log(JSON.stringify(await writerProbe(args[1])));}else {if(args.length!==5||args[0]!=='--run-isolated'||args[1]!=='--pg-bin'||args[3]!=='--artifacts')throw Error('usage: --run-isolated --pg-bin ABSOLUTE --artifacts NEW_ABSOLUTE_DIRECTORY');
 const result=await runArchiveMeasurement({pgBin:args[2],artifacts:args[4]});console.log(JSON.stringify({testOutcome:result.testOutcome,fullContractAcceptance:false,productionReady:false,evictionAuthorized:false}));}
}
