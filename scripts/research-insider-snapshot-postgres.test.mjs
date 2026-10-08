// VM-only actual PostgreSQL acceptance; no unavailable-tool skip is a pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
const binaries=process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN;
const migration=fs.readFileSync('migrations/20261008_insider_snapshots_v1.sql','utf8');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const holding={公司代號:'2330',公司名稱:'台積電',職稱:'董事',姓名:'Synthetic Person',出表日期:'1151007',資料年月:'11509',目前持股:'123,456'};
const transfer={公司代號:'2330',公司名稱:'台積電',申報人身分:'董事',姓名:'Synthetic Person',出表日期:'1151007','預定轉讓方式及股數-轉讓股數':'100','目前持有股數-自有持股':'1000','目前持有股數-保留運用決定權信託股數':'','預定轉讓方式及股數-轉讓方式':'一般交易',有效轉讓期間:'1151007-1151107'};
test('actual PostgreSQL snapshot admission, document proof, replay, restart and bounded metadata',async t=>{
 assert.ok(binaries&&['initdb','pg_ctl','psql'].every(name=>fs.existsSync(path.join(binaries,name))),'set RESEARCH_LOCAL_DATAPLANE_PG_BIN; run in the VM single queue');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'si-snapshot-pg-'));const cluster=path.join(tmp,'pg');const port=56000+process.pid%7000;let started=false;
 const run=(name,args,options={})=>execFileSync(path.join(binaries,name),args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024,...options}).trim();
 const sql=query=>run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'],{input:query});
 const json=query=>JSON.parse(sql(query));
 const rpc=(fn,args)=>json(`SET ROLE service_role; SELECT public.${fn}(${args});`);
 const begin=rid=>rpc('insider_snapshot_run_v1',`${literal(rid)}::uuid`);
 function admit(rid,dataset,rows,{raw=Buffer.from(JSON.stringify(rows)),hash=createHash('sha256').update(raw).digest('hex'),parser='insider-db-projection-v1',rights='official-insider-private-research-retain-v1',tokenOverride=undefined,observed="clock_timestamp()-interval '1 second'",attempted="clock_timestamp()-interval '2 seconds'"}={}) {
  const token=tokenOverride===undefined?sql(`SELECT acquisition_token FROM insider_run_members_v1 WHERE run_id=${literal(rid)}::uuid AND dataset=${dataset};`):tokenOverride;
  return rpc('admit_insider_snapshot_v1',[literal(rid)+'::uuid',dataset,token?literal(token)+'::uuid':'NULL::uuid',literal(raw.toString('base64')),literal(hash),rows.length,attempted,observed,literal(parser),literal(rights)].join(','));
 }
 const page=(rid,m)=>rpc('read_insider_snapshot_page_v1',`${literal(rid)},${m.dataset},${literal(m.snapshotId)}`);
 const commit=(rid,p)=>rpc('commit_insider_snapshot_page_v1',`${literal(rid)},${p.dataset},${literal(p.snapshotId)},${p.offset},${p.generation},${p.nextOffset}`);
 function persist(p) {
  for(const d of p.documents)sql(`INSERT INTO public.source_raw_documents(platform,document_url,title,summary,content_text,symbols,published_at,metadata,sentiment_label,content_semantics,stance_semantics,canonical_content_hash) VALUES('twse_insider',${literal(d.documentUrl)},${literal(d.title)},${literal(d.summary)},${literal(d.contentText)},${literal(JSON.stringify(d.symbols))}::jsonb,NULL,${literal(JSON.stringify(d.metadata))}::jsonb,'neutral','official_chip_evidence','neutral',${literal(createHash('sha256').update(d.contentText.toLowerCase()).digest('hex'))}) ON CONFLICT(platform,document_url) DO NOTHING;`);
 }
 try {
  run('initdb',['-D',cluster,'-A','trust','--no-instructions']);run('pg_ctl',['-D',cluster,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);started=true;
  // Narrow explicit dependency fixture: snapshot migration is loaded verbatim.
  // This is not the full production predecessor/ACL rehearsal or guarded HTTP acceptance.
  sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role NOLOGIN;CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
   CREATE TABLE public.source_raw_documents(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,platform text NOT NULL,document_url text NOT NULL,title text,summary text,content_text text,symbols jsonb,published_at timestamptz,collected_at timestamptz NOT NULL DEFAULT clock_timestamp(),metadata jsonb,sentiment_label text,content_semantics text,stance_semantics text,canonical_content_hash text,UNIQUE(platform,document_url));`);
  sql(migration);
  let rid=randomUUID(),state;
  await t.test('service role has only narrow RPC writes, public has no snapshot read or helper execution',()=>{
   assert.throws(()=>sql('SET ROLE service_role;INSERT INTO insider_acquisition_runs_v1(id)VALUES(gen_random_uuid());'),/permission denied/);
   assert.throws(()=>sql('SET ROLE anon;SELECT * FROM insider_snapshots_v1;'),/permission denied/);
   assert.throws(()=>sql(`SET ROLE service_role;SELECT public.insider_snapshot_assert_v1(gen_random_uuid());`),/permission denied/);
  });
  await t.test('run identity precedes fetch; clocks/hash/schema/parser/rights reject without admission',()=>{
   assert.throws(()=>admit(rid,0,[holding]),/run_before_fetch/);begin(rid);
   for(const options of [{hash:'b'.repeat(64)},{parser:'other'},{rights:'other'},{observed:"clock_timestamp()+interval '1 day'"},{raw:Buffer.from('[invalid')},{raw:Buffer.from([0xff,0xfe])}])assert.throws(()=>admit(rid,0,[holding],options));
   assert.throws(()=>admit(rid,0,[{...holding,姓名:3}]));
   assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'0');
  });
  await t.test('whole response validated before activation including row501',()=>{
   const rows=Array.from({length:501},()=>({...holding}));delete rows[500].職稱;assert.throws(()=>admit(rid,0,rows),/schema_required_field/);assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'0');
  });
  await t.test('escaped-control500row projection rejects before any snapshot/progress/member admission',()=>{
   const rows=Array.from({length:500},()=>({...holding,姓名:'\u0001'.repeat(512),公司名稱:'\u0001'.repeat(512),職稱:'\u0001'.repeat(512)}));
   const raw=Buffer.from(JSON.stringify(rows));assert.ok(raw.length<12*1024*1024);
   const metadataMinimum=Buffer.byteLength(JSON.stringify(rows.map(r=>({metadata:{insider_evidence:{person:r.姓名,companyName:r.公司名稱,role:r.職稱}}}))));assert.ok(metadataMinimum>4*1024*1024);
   assert.throws(()=>admit(rid,0,rows),/projection_transport_bound/);
   assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'0');assert.ok(begin(rid).members.every(m=>m.snapshotId===null));
  });
  await t.test('five fixed members freeze before reading; mixed sizes and derived exclusions',()=>{
   const rows=Array.from({length:1001},(_,i)=>({...holding,姓名:`Synthetic ${i}`}));rows[123].公司代號='ETF';
   state=admit(rid,0,rows);assert.equal(state.frozen,false);assert.throws(()=>page(rid,state.members[0]),/frozen_run_binding/);
   state=admit(rid,1,[holding]);state=admit(rid,2,[transfer]);state=admit(rid,3,[]);state=admit(rid,4,[]);assert.equal(state.frozen,true);
   const p=page(rid,state.members[0]);assert.equal(p.nextOffset,500);assert.equal(p.documents.length,499);assert.equal(p.excludedRows,1);assert.equal(p.documents[0].publishedAt,null);
  });
  await t.test('invented or changed persisted content cannot advance; documents precede CAS',()=>{
   const p=page(rid,state.members[0]);assert.throws(()=>commit(rid,p),/document_missing_or_mismatch/);
   persist(p);sql(`UPDATE source_raw_documents SET content_text='forged' WHERE document_url=${literal(p.documents[0].documentUrl)}`);
   assert.throws(()=>commit(rid,p),/document_missing_or_mismatch/);sql(`UPDATE source_raw_documents SET content_text=${literal(p.documents[0].contentText)} WHERE document_url=${literal(p.documents[0].documentUrl)}`);
   assert.equal(commit(rid,p).offset,500);assert.equal(commit(rid,p).offset,500);
   assert.throws(()=>commit(rid,{...p,nextOffset:499}),/page_span_invalid/);
  });
  await t.test('fresh run reuses original active snapshot and never admits new bytes',()=>{
   const other=randomUUID();const shared=begin(other);assert.equal(shared.members[0].snapshotId,state.members[0].snapshotId);const reused=admit(other,0,[]);assert.equal(reused.members[0].snapshotId,state.members[0].snapshotId);assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'5');
  });
  await t.test('crash after documents, restart, exact CAS replay and completed empty receipts',()=>{
   let p=page(rid,state.members[0]);persist(p);
   run('pg_ctl',['-D',cluster,'-m','fast','-w','stop']);started=false;run('pg_ctl',['-D',cluster,'-l',path.join(tmp,'pg.log'),'-o',`-h '' -k ${tmp} -p ${port}`,'-w','start']);started=true;
   assert.equal(page(rid,state.members[0]).offset,500);assert.equal(commit(rid,p).offset,1000);
   for(const m of state.members){p=page(rid,m);if(!p.complete){persist(p);const after=commit(rid,p);assert.equal(after.complete,true);assert.equal(commit(rid,p).complete,true);}}
   const replay=begin(rid);assert.deepEqual(replay.members.map(m=>m.snapshotId),state.members.map(m=>m.snapshotId));assert.ok(replay.members.every(m=>m.complete));
   assert.equal(sql('SELECT count(*) FROM insider_snapshots_v1;'),'5');assert.equal(sql('SELECT count(*) FROM insider_snapshot_progress_v1 WHERE NOT complete;'),'0');
  });
  await t.test('immutable raw and run bindings cannot be rewritten',()=>{
   assert.throws(()=>sql('UPDATE insider_snapshots_v1 SET raw=raw;'),/immutable/);assert.throws(()=>sql('DELETE FROM insider_run_members_v1;'),/immutable/);
  });
  await t.test('existing run remains replayable at128run limit;129 rejected without deleting maps',()=>{
   sql(`INSERT INTO insider_acquisition_runs_v1(id) SELECT gen_random_uuid() FROM generate_series(1,128-(SELECT count(*)::int FROM insider_acquisition_runs_v1));`);
   assert.throws(()=>begin(randomUUID()),/run_capacity/);assert.equal(begin(rid).members.length,5);assert.equal(sql('SELECT count(*) FROM insider_acquisition_runs_v1;'),'128');
  });
  await t.test('reapply is non-destructive and preserves exact clocks, bytes, progress',()=>{
   const before=sql('SELECT md5(string_agg(id::text||raw_sha256||observed_at::text,\'\' ORDER BY id)) FROM insider_snapshots_v1;');sql(migration);assert.equal(sql('SELECT md5(string_agg(id::text||raw_sha256||observed_at::text,\'\' ORDER BY id)) FROM insider_snapshots_v1;'),before);assert.ok(begin(rid).members.every(m=>m.complete));
  });
  // New disposable capacity fixture only; all preceding evidence is synthetic.
  const reset=()=>sql('TRUNCATE insider_run_members_v1,insider_acquisition_runs_v1,insider_snapshot_progress_v1,insider_acquisitions_v1,insider_snapshots_v1,source_raw_documents;');
  const retained=lengths=>sql(`DO $fixture$ DECLARE n integer; bytes bytea; sid uuid; BEGIN FOREACH n IN ARRAY ARRAY[${lengths.join(',')}] LOOP
   bytes:=convert_to('[]'||repeat(' ',n-2),'UTF8');
   INSERT INTO insider_snapshots_v1(dataset,raw,raw_sha256,row_count,attempted_at,observed_at,parser_identity,rights_identity)
    VALUES(0,bytes,encode(extensions.digest(bytes,'sha256'),'hex'),0,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second','insider-db-projection-v1','official-insider-private-research-retain-v1') RETURNING id INTO sid;
   INSERT INTO insider_snapshot_progress_v1(snapshot_id,dataset,offset_rows,generation,complete,completed_at)VALUES(sid,0,0,1,true,clock_timestamp());
   INSERT INTO insider_acquisitions_v1(dataset,snapshot_id,resolved_at)VALUES(0,sid,clock_timestamp());
  END LOOP; END $fixture$;`);
  await t.test('stranded112MiB example rejects entire reservation before fetch with no token/run leak',()=>{
   reset();retained([...Array(9).fill(12*1024*1024),4*1024*1024]);
   assert.throws(()=>begin(randomUUID()),/reserved_capacity/);
   assert.equal(sql('SELECT count(*) FROM insider_acquisition_runs_v1;'),'0');assert.equal(sql('SELECT count(*) FROM insider_acquisitions_v1 WHERE snapshot_id IS NULL;'),'0');assert.equal(sql('SELECT sum(octet_length(raw)) FROM insider_snapshots_v1;'),String(112*1024*1024));
  });
  await t.test('actual+pending exact128MiB accepted, +1byte rejected atomically',()=>{
   reset();retained([...Array(5).fill(12*1024*1024),8*1024*1024]);const first=randomUUID();const second=randomUUID();const one=begin(first);const two=begin(second);
   assert.deepEqual(one.members.map(m=>m.acquisitionToken),two.members.map(m=>m.acquisitionToken));assert.equal(sql('SELECT count(*) FROM insider_acquisitions_v1 WHERE snapshot_id IS NULL;'),'5');
   const shared=admit(first,0,[]);assert.equal(begin(second).members[0].snapshotId,shared.members[0].snapshotId);
   assert.throws(()=>admit(first,1,[],{tokenOverride:one.members[0].acquisitionToken}),/token_mismatch/);
   reset();retained([...Array(5).fill(12*1024*1024),8*1024*1024+1]);assert.throws(()=>begin(randomUUID()),/reserved_capacity/);assert.equal(sql('SELECT count(*) FROM insider_acquisitions_v1 WHERE snapshot_id IS NULL;'),'0');
  });
  await t.test('27actual+5pending exact32slots accepted;28actual refuses before partial activation',()=>{
   reset();retained(Array(27).fill(2));assert.equal(begin(randomUUID()).members.length,5);
   reset();retained(Array(28).fill(2));assert.throws(()=>begin(randomUUID()),/reserved_capacity/);assert.equal(sql('SELECT count(*) FROM insider_acquisitions_v1 WHERE snapshot_id IS NULL;'),'0');
  });
  await t.test('consumed token retains exact lost-response identity even after newer acquisition exists',()=>{
   reset();const original=randomUUID();let before=begin(original);for(let d=0;d<5;d++)before=admit(original,d,[]);
   const token=before.members[0].acquisitionToken;const snapshotId=before.members[0].snapshotId;
   for(const m of before.members)commit(original,page(original,m));
   const later=begin(randomUUID());assert.notEqual(later.members[0].acquisitionToken,token);
   assert.equal(admit(original,0,[],{tokenOverride:token}).members[0].snapshotId,snapshotId);
   assert.throws(()=>admit(later.runId,0,[],{tokenOverride:token}),/token_mismatch/);
   assert.equal(sql(`SELECT snapshot_id FROM insider_acquisitions_v1 WHERE id=${literal(token)};`),snapshotId);
  });

 } finally {if(started)run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);const target=process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS;if(target&&fs.existsSync(path.join(tmp,'pg.log'))){fs.mkdirSync(target,{recursive:true,mode:0o700});fs.copyFileSync(path.join(tmp,'pg.log'),path.join(target,'insider-snapshot-postgres.log'));}fs.rmSync(tmp,{recursive:true,force:true});}
});
