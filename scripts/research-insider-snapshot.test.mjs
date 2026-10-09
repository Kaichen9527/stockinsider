import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const ts=require('typescript');
function load(file,imports={}) {const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>imports[name]??require(name),Buffer,URL,Date,Response,TextDecoder,AbortSignal,fetch,console});return exports;}
const official=load('web/src/lib/research-insider-official.ts');
test('baseline red witness: changing full response hash repeatedly starves raw rows500+',()=>{
 const rows=Array.from({length:1001},(_,i)=>({i}));let cursor=null;
 for(const hash of ['a','b','c']){const page=official.insiderPage(rows,hash.repeat(64),cursor);cursor=page.nextCursor;assert.equal(cursor.offset,500);assert.equal(page.remainingRows,501);}
});
const snapshot=load('web/src/lib/research-insider-snapshot.ts',{'./research-insider-official':official,'./data-plane-runtime':{resolveStockInsiderDataPlaneConfiguration:()=>{throw Error('no real credentials');}}});
const runId='11111111-1111-4111-8111-111111111111';
const member=(dataset,totalRows)=>({dataset,snapshotId:`00000000-0000-4000-8000-00000000000${dataset}`,complete:false,offset:0,generation:0,totalRows,observedAt:'2026-10-07T00:00:01.000Z',attemptedAt:'2026-10-07T00:00:00.000Z',hash:'a'.repeat(64)});
function harness({sizes=[1001,1,0,1,0],failPersist=false}={}) {
 const members=Array.from({length:5},(_,dataset)=>({dataset,snapshotId:null,acquisitionToken:`99999999-9999-4999-8999-99999999999${dataset}`,complete:false}));const fetched=[];const persisted=[];const calls=[];
 const run=()=>structuredClone({runId,frozen:members.every(m=>m.snapshotId!==null),members:members.toSorted((a,b)=>a.dataset-b.dataset)});
 const page=m=>({...m,runId,nextOffset:Math.min(m.offset+500,m.totalRows),documents:m.complete?[]:Array.from({length:Math.min(500,m.totalRows-m.offset)},(_,i)=>({documentUrl:`https://example.test/${m.snapshotId}/${m.offset+i}`,title:'x',summary:'x',contentText:'x',publishedAt:null,symbols:['2330'],metadata:{}})),excludedRows:0});
 const deps={now:()=>Date.parse('2026-10-08T00:00:00Z'),acquire:async(dataset)=>{const i=official.OFFICIAL_INSIDER_DATASETS.indexOf(dataset);fetched.push(i);return {raw:Buffer.from('[]'),hash:'a'.repeat(64),rows:Array(sizes[i]).fill({}),attemptedAt:'2026-10-07T00:00:00.000Z',observedAt:'2026-10-07T00:00:01.000Z'};},persist:async docs=>{if(failPersist)throw Error('persist failed');persisted.push(...docs);return docs.length;},rpc:async(name,args)=>{calls.push(name);if(name==='insider_snapshot_run_v1')return run();if(name==='admit_insider_snapshot_v1'){assert.equal(args.p_token,members[args.p_dataset].acquisitionToken);members[args.p_dataset]={...member(args.p_dataset,sizes[args.p_dataset]),acquisitionToken:args.p_token};return run();}const m=members.find(m=>m.dataset===args.p_dataset);if(name==='read_insider_snapshot_page_v1')return page(m);if(name==='commit_insider_snapshot_page_v1'){assert.equal(args.p_offset,m.offset);assert.equal(args.p_generation,m.generation);m.offset=args.p_next;m.generation++;m.complete=m.offset===m.totalRows;return page(m);}throw Error(name);}};
 return {deps,members,fetched,persisted,calls};
}
test('mixed pinned run completes in3rounds including empty/completed members without reacquiring after restart',async()=>{const h=harness();let pins;let result;for(let i=0;i<3;i++){result=await snapshot.processInsiderSnapshotRun({runId,...(pins?{pins}:{})},h.deps);pins=result.pins;assert.equal(result.outcome,i===2?'coverage_complete':'pages_remaining');}assert.deepEqual(h.fetched,[0,1,2,3,4]);assert.equal(h.persisted.length,1003);const replay=await snapshot.processInsiderSnapshotRun({runId,pins},h.deps);assert.equal(replay.processedRows,0);assert.equal(replay.recordsWritten,0);assert.equal(replay.originalSourceObservedAt,'2026-10-07T00:00:01.000Z');assert.equal(replay.liveAcquisitions.length,0);assert.equal(h.fetched.length,5);});
test('failed document persistence never invokes commit',async()=>{const h=harness({failPersist:true});await assert.rejects(snapshot.processInsiderSnapshotRun({runId},h.deps),/persist failed/);assert.equal(h.calls.includes('commit_insider_snapshot_page_v1'),false);assert.equal(h.members[0].offset,0);});
test('changed or missing closed pins cannot reacquire or progress',async()=>{const h=harness();const result=await snapshot.processInsiderSnapshotRun({runId},h.deps);const pins=structuredClone(result.pins);pins[0].snapshotId=runId;await assert.rejects(snapshot.processInsiderSnapshotRun({runId,pins},h.deps),/binding/);assert.equal(h.fetched.length,5);await assert.rejects(snapshot.processInsiderSnapshotRun({runId,pins:pins.slice(1)},h.deps),/pins/);});
test('partial initialization restart reads stable map and fetches missing datasets only',async()=>{const h=harness();const acquire=h.deps.acquire;h.deps.acquire=async d=>{if(h.fetched.length===2)throw Error('lost transport');return acquire(d);};await assert.rejects(snapshot.processInsiderSnapshotRun({runId},h.deps),/lost transport/);h.deps.acquire=acquire;await snapshot.processInsiderSnapshotRun({runId},h.deps);assert.deepEqual(h.fetched,[0,1,2,3,4]);});

test('escaped-control500row witness: raw below12MiB can exceed4MiB in DB-derived metadata alone',()=>{
 const row={公司代號:'2330',公司名稱:'\u0001'.repeat(512),職稱:'\u0001'.repeat(512),姓名:'\u0001'.repeat(512),出表日期:'1151007',資料年月:'11509',目前持股:'123456'};
 const rows=Array.from({length:500},()=>row);official.validateOfficialInsiderResponseRows(rows,official.OFFICIAL_INSIDER_DATASETS[0]);
 const raw=Buffer.byteLength(JSON.stringify(rows));const lowerBound=Buffer.byteLength(JSON.stringify(rows.map(r=>({metadata:{insider_evidence:{person:r.姓名,companyName:r.公司名稱,role:r.職稱}}}))));
 assert.ok(raw<12*1024*1024);assert.ok(lowerBound>4*1024*1024);
});
