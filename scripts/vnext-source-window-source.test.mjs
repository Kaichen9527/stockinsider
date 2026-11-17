/** Actual configured worker composition; synthetic typed cache/ledger/SQL replies.
 * Not PG, PostgREST, HTTP, writer-lease, real source or native acceptance. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import * as content from '../web/src/lib/vnext/permitted-content.ts';import {inputHash} from '../web/src/lib/vnext/policy.ts';
import * as cachedAdmission from '../web/src/lib/vnext/cached-source-admission.ts';
import {canonicalContentHash} from '../web/src/lib/source-content-semantics.ts';
const ts=createRequire(new URL('../web/package.json',import.meta.url))('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,identity={role:'operator',principal:'synthetic-source-operator'};
function lab({rows=[],parseLimit=50,policies=['official'],completeError=false,appendError=false,enabled=true,reply,withdrawOnPolicyRead=Infinity,expireOnPolicyRead=Infinity,withdrawAfterReservation=false,withdrawAfterCompletion=false,withdrawAfterReplay=false}={}){
 const trace=[],progress=[],receipts=new Map();let completions=0,reservations=0,binding='synthetic-current-rights',corrupt,policyReads=0,withdrawn=false;
 const before=new Date(Date.now()-2*86400000).toISOString(),until=new Date(Date.now()+3600000).toISOString();
 const queryFor=table=>{const filters=[],orders=[];let count,projection;
  const chain={select(columns){projection=columns;return chain;},eq(column,value){filters.push({kind:'eq',column,value});return chain;},gte(column,value){filters.push({kind:'gte',column,value});return chain;},lte(column,value){filters.push({kind:'lte',column,value});return chain;},or(value){filters.push({kind:'or',value});return chain;},order(column,options){orders.push({column,ascending:options.ascending});return chain;},async limit(max){count=max;trace.push({table,projection,filters,orders,count});
   if(table==='source_run_ledger'){const connector=filters.find(f=>f.column==='connector').value;const saved=progress.filter(p=>p.connector===connector).slice(-1).reverse().map(p=>({id:p.id,attempted_at:p.attempted_at,metadata:corrupt||p.metadata}));return {data:saved,error:null};}
   assert.equal(table,'source_raw_documents');assert.equal(count,200);assert.deepEqual(orders,[{column:'published_at',ascending:false},{column:'id',ascending:false}]);const platform=filters.find(f=>f.column==='platform').value;assert.equal(projection.includes('content_text'),platform==='twse_insider','no PTT body reads');
   let selected=rows.filter(row=>row.platform===platform);for(const filter of filters){if(filter.kind==='gte')selected=selected.filter(r=>Date.parse(r[filter.column])>=Date.parse(filter.value));if(filter.kind==='lte')selected=selected.filter(r=>Date.parse(r[filter.column])<=Date.parse(filter.value));if(filter.kind==='or'){
    const match=/^published_at\.lt\.(.+),and\(published_at\.eq\.(.+),id\.lt\.([a-f0-9-]{36})\)$/u.exec(filter.value);assert.ok(match);assert.equal(match[1],match[2]);selected=selected.filter(r=>r.published_at<match[1]||r.published_at===match[1]&&r.id<match[3]);}}
   selected.sort((a,b)=>b.published_at.localeCompare(a.published_at)||b.id.localeCompare(a.id));return {data:selected.slice(0,max),error:null};
  },async insert(row){assert.equal(table,'source_run_ledger');assert.equal(row.content_analyzable,false);assert.equal(row.succeeded_at,null);assert.equal(row.written,0);progress.push({id:id(progress.length+9000),...structuredClone(row)});trace.push({insert:true,connector:row.connector});return {data:null,error:appendError?{synthetic:true}:null};}};return chain;};
 const send=async(_identity,action,body)=>{trace.push({action,contentHash:body?.item?.contentHash||body?.contentHash});if(action==='source-policies'){policyReads++;return {policies:withdrawn||policyReads>=withdrawOnPolicyRead?[]:policies.map(source=>({source,scope:source==='official'?'official_original':'metadata',enabled:true,rights_subject:binding,license_basis:'synthetic-public-license',valid_until:policyReads>=expireOnPolicyRead?new Date(Date.now()-1000).toISOString():until}))};}
  if(action==='source-reserve'){reservations++;const hash=body.item.contentHash;if(receipts.has(hash)){if(withdrawAfterReplay)withdrawn=true;return {...{parse:false,replay:true,state:receipts.get(hash),contentHash:hash},...reply};}if(completions>=parseLimit)return {parse:false,deferred:'daily_content_budget'};receipts.set(hash,'reserved');if(withdrawAfterReservation)withdrawn=true;return {parse:true,contentHash:hash};}
  assert.equal(action,'source-complete');if(completeError)throw Error('synthetic completion uncertainty');completions++;receipts.set(body.contentHash,'completed');if(withdrawAfterCompletion)withdrawn=true;return {parsed:true,contentHash:body.contentHash,...reply};};
 const modules={'./permitted-content.ts':content,'./cached-source-admission.ts':cachedAdmission,'./policy.ts':{inputHash,vnextEnabled:()=>enabled},'./analysis-runtime.ts':{analysisCommand:send,analysisWriter:async work=>{trace.push({writer:true});return work();}},'../supabase-server.ts':{getSupabaseServerClient:()=>({from:queryFor})},'../source-policy.ts':{sourceExecutionPolicy:()=>({disposition:'active',licenseBasis:'synthetic-public-license'})},'./twse-snapshot-store.ts':{readTwseSnapshotCoverage:async()=>({eventVolume:null,eventCoverage:'unknown',observations:[]})}};
 const filename='web/src/lib/vnext/source-window-worker.ts',compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:filename}).outputText,output={exports:{}};vm.compileFunction(compiled,['exports','require','module'],{filename})(output.exports,name=>{assert.ok(Object.hasOwn(modules,name),'unexpected dependency '+name);return modules[name];},output);
 const seed=(n,extra={})=>({id:id(n),platform:'twse_insider',document_url:`https://www.twse.com.tw/synthetic-window-${n}`,title:'Synthetic cache only',published_at:before,collected_at:before,symbols:['2409'],metadata:{},content_text:`Synthetic original ${n}, not acquired.`,...extra});
 return {run:()=>output.exports.runSourceWindowWorker(identity),as:who=>output.exports.runSourceWindowWorker(who),trace,progress,receipts,seed,get completions(){return completions;},get reservations(){return reservations;},setBinding(value){binding=value;},corrupt(value){corrupt=value;}};
}
test('actual worker persists keyset progress past more than200 known cache rows and keeps original50 new-work cap',async()=>{
 const rows=[],f=lab({rows});for(let n=1;n<=250;n++)rows.push(f.seed(n));
 for(const row of rows.slice(-200)){const item={id:row.id,source:'official',scope:'official_original',url:row.document_url,eventAt:row.published_at,publishedAt:row.published_at,eventBasis:'source_publication',availableAt:row.collected_at,symbols:['2409'],authorRoot:'official:twse-tpex',originalRoot:row.document_url,body:row.content_text};f.receipts.set(content.permittedContentFingerprint(item,new Date().toISOString()),'completed');}
 const first=await f.run();assert.equal(first.selected,0);assert.equal(first.replayed,200);assert.equal(first.coverage[1].pageAdvanced,true);const cursor=f.progress[0].metadata.cursor;assert.equal(cursor.id,id(51));assert.equal(first.upstreamCoverage,'unknown');assert.equal(first.eventVolume,null);
 const second=await f.run();assert.equal(second.selected,50);assert.equal(f.completions,50);assert.equal(second.coverage[1].status,'cached_window_enumerated');assert.equal(f.progress[1].metadata.finished,true);assert.equal(f.progress[1].metadata.cursor,null);assert.ok(f.trace.some(x=>x.table==='source_raw_documents'&&x.filters.some(y=>y.kind==='or'&&y.value.includes(id(51)))));
});
test('budget exhaustion holds the exact page instead of skipping unseen originals; duplicate raw IDs share one extraction',async()=>{
 const rows=[],f=lab({rows,parseLimit:1});rows.push(f.seed(1),f.seed(2));const first=await f.run();assert.equal(first.selected,1);assert.equal(f.progress[0].metadata.cursor,null);assert.equal(f.progress[0].metadata.finished,false);assert.equal(f.progress[0].metadata.accounted,1);assert.equal((await f.run()).selected,0);assert.equal(f.completions,1);
 const duplicateRows=[],d=lab({rows:duplicateRows});const one=d.seed(10);duplicateRows.push(one,{...one,id:id(11)});const result=await d.run();assert.equal(result.selected,1);assert.equal(d.completions,1);assert.equal(d.progress[0].metadata.accounted,2);assert.equal(d.progress[0].metadata.finished,true);
});
test('unknown completion stops without advancing; uncertain append is not retried; configured roles and closed progress fail before cache reads',async()=>{
 const rows=[],f=lab({rows,completeError:true});rows.push(f.seed(1));await assert.rejects(f.run,/synthetic completion uncertainty/);assert.equal(f.progress.length,0);assert.equal(f.reservations,1);
 const a=lab({appendError:true});await assert.rejects(a.run,/write_outcome_uncertain/);assert.equal(a.progress.length,1);
 const disabled=lab({enabled:false});await assert.rejects(disabled.run,/source_window_disabled/);assert.deepEqual(disabled.trace,[]);
 const wrong=lab();await assert.rejects(()=>wrong.as({role:'author',principal:'synthetic-author'}),/operator_required/);assert.deepEqual(wrong.trace,[]);
 const broken=lab();await broken.run();broken.corrupt({...broken.progress[0].metadata,arbitraryPath:'/tmp'});const before=broken.trace.length;await assert.rejects(broken.run,/progress_invalid/);assert.equal(broken.trace.slice(before).some(x=>x.table==='source_raw_documents'),false);
});
test('rights changes restart cache enumeration without resetting original extraction ledger; metadata scopes never read body or fabricate volume',async()=>{
 const rows=[],f=lab({rows,parseLimit:0,policies:['ptt','official']});rows.push(f.seed(1));await f.run();f.setBinding('changed-current-rights');const start=f.trace.length;const result=await f.run();assert.equal(f.trace.slice(start).some(x=>x.table==='source_raw_documents'&&x.filters.some(y=>y.kind==='or')),false);assert.equal(f.receipts.size,0);assert.ok(result.coverage.every(x=>x.eventCoverage==='unknown'&&x.eventVolume===null));assert.ok(f.progress.every(x=>x.content_analyzable===false&&x.index_updated===false&&x.auth_status==='not_applicable'));
 const source=fs.readFileSync('web/src/lib/vnext/http.ts','utf8'),cycle=fs.readFileSync('web/src/lib/vnext/research-cycle.ts','utf8');assert.ok(source.includes("import('./source-window-worker.ts')).runSourceWindowWorker(identity)"));assert.ok(cycle.includes("import('./source-window-worker.ts')).runSourceWindowWorker(identity)"));
});

test('actual keyset page retains PostgreSQL microsecond ordering and refuses clock drift beyond its frozen cutoff',async()=>{
 const rows=[],f=lab({rows});const before=new Date(Date.now()-86400000).toISOString().replace(/\.\d{3}Z$/u,'.123000Z');rows.push(f.seed(1,{published_at:before.replace('123000','123999'),collected_at:before.replace('123000','124000')}),f.seed(2,{published_at:before.replace('123000','123001'),collected_at:before.replace('123000','124000')}));const result=await f.run();assert.equal(result.selected,2);assert.equal(f.progress[0].metadata.accounted,2);assert.equal(f.progress[0].metadata.finished,true);
 const malformed=[],bad=lab({rows:malformed});malformed.push(bad.seed(1,{collected_at:'2026-10-22T00:00:00.000001Z',published_at:'2026-10-22T00:00:00.000002Z'}));await assert.rejects(bad.run,/cache_window_row/);assert.equal(bad.progress.length,0);assert.equal(bad.reservations,0);
});

// Run the configured producer twice: unresolved receipts must never become
// successful coverage, a cursor advance or an automatic completion retry.
test('reserved and failed replays hold the actual producer page with zero new parsing',async()=>{
 for(const state of ['reserved','failed']){
  const rows=[],f=lab({rows});const row=f.seed(1);rows.push(row);
  const item={id:row.id,source:'official',scope:'official_original',url:row.document_url,eventAt:row.published_at,publishedAt:row.published_at,eventBasis:'source_publication',availableAt:row.collected_at,symbols:['2409'],authorRoot:'official:twse-tpex',originalRoot:row.document_url,body:row.content_text};
  f.receipts.set(content.permittedContentFingerprint(item,new Date().toISOString()),state);
  for(let run=0;run<2;run++){const result=await f.run();assert.equal(result.selected,0);assert.equal(result.coverage[1].pageAdvanced,false);assert.equal(result.coverage[1].eventVolume,null);const saved=f.progress.at(-1).metadata;assert.equal(saved.accounted,0);assert.equal(saved.finished,false);assert.equal(saved.cursor,null);}
  assert.equal(f.completions,0);assert.equal(f.trace.some(event=>event.action==='source-complete'),false);
 }
});
test('actual producer refuses completed replay or completion bound to another content hash',async()=>{
 for(const replay of [true,false]){
  const rows=[],f=lab({rows,reply:{contentHash:'f'.repeat(64)}});const row=f.seed(1);rows.push(row);
  if(replay){const item={id:row.id,source:'official',scope:'official_original',url:row.document_url,eventAt:row.published_at,publishedAt:row.published_at,eventBasis:'source_publication',availableAt:row.collected_at,symbols:['2409'],authorRoot:'official:twse-tpex',originalRoot:row.document_url,body:row.content_text};f.receipts.set(content.permittedContentFingerprint(item,new Date().toISOString()),'completed');}
  await assert.rejects(f.run,/receipt_hash_mismatch/);assert.equal(f.progress.length,0);assert.equal(f.reservations,1);assert.equal(f.completions,replay?0:1);
 }
});


test('actual producer retains exact cached versions without claiming current publisher revision; same URL correction is new content',async()=>{
 const rows=[],f=lab({rows});const original=f.seed(1);rows.push(original);
 const first=await f.run(),lineage=first.cacheLineage[0];assert.equal(first.selected,1);
 assert.equal(lineage.rawDocumentId,original.id);assert.equal(lineage.eventAt,original.published_at);assert.equal(lineage.publishedAt,original.published_at);assert.equal(lineage.availableAt,original.collected_at);
 assert.equal(lineage.sourceRevision,null);assert.deepEqual(lineage.gaps,['publisher_revision_not_recorded_in_cache']);assert.match(lineage.contentHash,/^[a-f0-9]{64}$/u);assert.equal(Object.hasOwn(lineage,'body'),false);
 const retained=structuredClone(first.cacheLineage);
 // This simulates a different version already present in the cache. It makes
 // no claim that the upstream ingester acquired or retained a correction.
 original.content_text='Synthetic corrected public original, same citation and event.';
 const second=await f.run();assert.equal(second.selected,1);assert.notEqual(second.cacheLineage[0].contentHash,lineage.contentHash);assert.equal(f.receipts.size,2);assert.deepEqual(first.cacheLineage,retained);
 original.collected_at=new Date(Date.parse(original.collected_at)+1000).toISOString();
 const third=await f.run();assert.equal(third.selected,0);assert.equal(third.cacheLineage[0].contentHash,second.cacheLineage[0].contentHash);assert.equal(third.cacheLineage[0].sourceRevision,null);assert.equal(third.eventVolume,null);assert.equal(third.upstreamCoverage,'unknown');
});
test('current permission absence, mid-scan withdrawal and expiry stop before new extraction commands',async()=>{
 for(const options of [{withdrawOnPolicyRead:1},{withdrawOnPolicyRead:2},{expireOnPolicyRead:2}]){
  const rows=[],f=lab({rows,...options});rows.push(f.seed(1));
  if(options.withdrawOnPolicyRead===1){const result=await f.run();assert.equal(result.coverage[1].status,'blocked');assert.equal(f.trace.some(e=>e.table==='source_raw_documents'),false);}
  else await assert.rejects(f.run,/rights_changed_during_scan/);
  assert.equal(f.reservations,0);assert.equal(f.completions,0);assert.equal(f.progress.length,0);
 }
});
test('permission changes during a reservation, completion or completed replay never account or advance the page',async()=>{
 for(const options of [{withdrawAfterReservation:true},{withdrawAfterCompletion:true},{withdrawAfterReplay:true}]){
  const rows=[],f=lab({rows,...options});const row=f.seed(1);rows.push(row);
  if(options.withdrawAfterReplay){const item={id:row.id,source:'official',scope:'official_original',url:row.document_url,eventAt:row.published_at,publishedAt:row.published_at,eventBasis:'source_publication',availableAt:row.collected_at,symbols:['2409'],authorRoot:'official:twse-tpex',originalRoot:row.document_url,body:row.content_text};f.receipts.set(content.permittedContentFingerprint(item,new Date().toISOString()),'completed');}
  await assert.rejects(f.run,/rights_changed_during_scan/);assert.equal(f.progress.length,0);assert.equal(f.reservations,1);assert.equal(f.completions,options.withdrawAfterCompletion?1:0);
  const before=f.trace.length;await f.run();assert.equal(f.trace.slice(before).some(e=>e.table==='source_raw_documents'),false);assert.equal(f.reservations,1);
 }
});
test('permitted original clocks reject submillisecond lookahead and unresolved timestamps before reserve',async()=>{
 const base={id:'synthetic-microseconds',source:'official',scope:'official_original',url:'https://www.twse.com.tw/synthetic-clock',eventAt:'2026-11-01T01:00:00.123001Z',publishedAt:'2026-11-01T01:00:00.123002Z',eventBasis:'original_event',availableAt:'2026-11-01T01:00:00.123003Z',symbols:['2409'],authorRoot:'official:twse-tpex',originalRoot:'https://www.twse.com.tw/synthetic-clock',body:'Synthetic original clock fixture.'},cutoff='2026-11-01T01:00:00.123004Z';
 assert.match(content.permittedContentFingerprint(base,cutoff),/^[a-f0-9]{64}$/u);
 for(const invalid of [{...base,eventAt:'2026-11-01T01:00:00.123003Z'},{...base,publishedAt:'2026-11-01T01:00:00.123004Z'},{...base,availableAt:'2026-11-01T01:00:00.123005Z'},{...base,eventAt:'2026-11-01'}]){
  let calls=0;const result=await content.extractContentBatch([invalid],cutoff,async()=>{calls++;return {};});assert.equal(calls,0);assert.equal(result.rejected[0].reason,'vnext_content_original_clocks_required');
 }
 const sameInstant={...base,eventAt:'2026-11-01T09:00:00.123001+08:00'};assert.match(content.permittedContentFingerprint(sameInstant,cutoff),/^[a-f0-9]{64}$/u);
 // The configured cache producer also validates original_event_at rather than
 // allowing metadata event time to bypass its published/collected row checks.
 const rows=[],f=lab({rows});const row=f.seed(1);row.published_at=row.published_at.replace(/\.\d{3}Z$/u,'.123001Z');row.collected_at=row.published_at.replace('123001','124000');row.metadata={original_event_at:row.published_at.replace('123001','123002')};rows.push(row);
 const result=await f.run();assert.equal(result.rejected[0].reason,'vnext_content_original_clocks_required');assert.equal(f.reservations,0);assert.equal(f.completions,0);assert.equal(result.cacheLineage[0].contentHash,null);
});

test('permission expiry or withdrawal before progress also holds empty and completed pages',async()=>{
 for(const empty of [true,false]){
  const rows=[],f=lab({rows,withdrawOnPolicyRead:empty?2:6});if(!empty)rows.push(f.seed(1));
  await assert.rejects(f.run,/rights_changed_during_scan/);assert.equal(f.progress.length,0);assert.equal(f.completions,empty?0:1);
 }
});

test('actual cache worker filters truncated or changed stored originals before reserve while retaining terminal refusal evidence',async()=>{
 const rows=[],f=lab({rows});const good=f.seed(1),changed=f.seed(2),truncated=f.seed(3);
 good.canonical_content_hash=canonicalContentHash(good.content_text);
 changed.canonical_content_hash=canonicalContentHash(changed.content_text);changed.content_text+=' unrecorded changed body';
 truncated.metadata={content_truncated:true};rows.push(good,changed,truncated);
 const original=structuredClone(rows),result=await f.run();assert.equal(result.selected,1);assert.equal(f.reservations,1);assert.equal(f.completions,1);assert.deepEqual(rows,original);
 assert.deepEqual(result.rejected.map(row=>row.reason).sort(),['vnext_cached_canonical_content_mismatch','vnext_cached_original_truncated']);
 assert.equal(result.sourceAdmissions.evidence.length,3);assert.equal(result.sourceAdmissions.upstreamCoverage,'unknown');assert.equal(result.sourceAdmissions.recent7,null);assert.equal(result.sourceAdmissions.prior21,null);
 assert.equal(f.progress[0].metadata.accounted,3);assert.equal(f.progress[0].metadata.finished,true);assert.equal(result.coverage[1].status,'cached_window_enumerated');assert.equal(result.coverage[1].eventCoverage,'unknown');
 assert.ok(result.cacheLineage.every(row=>row.sourceRevision===null&&row.cacheAdmission.publisherRevision===null));
});
test('actual cache worker reuses both same-citation observed versions without creating a publisher head or independent voices',async()=>{
 const rows=[],f=lab({rows});const original=f.seed(1),correction={...f.seed(2),document_url:original.document_url,content_text:'Synthetic correction already stored as another row.'};rows.push(original,correction);
 const first=await f.run();assert.equal(first.selected,2);assert.equal(first.sourceAdmissions.observedSameCitationVersions.length,1);assert.equal(first.sourceAdmissions.observedSameCitationVersions[0].contentHashes.length,2);
 const admissions=first.sourceAdmissions.evidence;assert.equal(admissions[0].conservativeOriginGroup,admissions[1].conservativeOriginGroup);assert.ok(admissions.every(row=>row.publisherRevision===null&&row.verifiedIndependentOrigin===null));
 const second=await f.run();assert.equal(second.selected,0);assert.equal(f.completions,2);assert.deepEqual(second.sourceAdmissions.evidence.map(row=>row.cacheVersionHash),admissions.map(row=>row.cacheVersionHash));assert.equal(second.eventVolume,null);
});
test('actual cache worker retains an older unverified original clock and ignores metadata publisher/origin/coverage assertions',async()=>{
 const rows=[],f=lab({rows});const row=f.seed(1);const older=new Date(Date.parse(row.published_at)-40*86400000).toISOString();row.metadata={original_event_at:older,publisher_revision:'forged',original_root:'invented',coverage:'complete',rights_attested:true};rows.push(row);
 const result=await f.run();const evidence=result.sourceAdmissions.evidence[0];assert.equal(evidence.eventAt,older);assert.ok(evidence.gaps.includes('declared_original_event_not_authority'));
 assert.equal(evidence.publisherRevision,null);assert.equal(evidence.verifiedIndependentOrigin,null);assert.equal(result.sourceAdmissions.independentOriginVerified,false);assert.equal(result.sourceAdmissions.recent7,null);
 assert.equal(evidence.reason,'vnext_cached_original_event_authority_unavailable');assert.equal(evidence.identityEventBasis,'original_event');assert.equal(f.reservations,0);assert.equal(f.completions,0);
});
test('completed legacy original-event identity is preserved as evidence without relabelling, reserving or charging it again',async()=>{
 const rows=[],f=lab({rows});const row=f.seed(1);row.metadata={original_event_at:new Date(Date.parse(row.published_at)-3600000).toISOString()};rows.push(row);
 const legacy={id:row.id,source:'official',scope:'official_original',url:row.document_url,eventAt:row.metadata.original_event_at,publishedAt:row.published_at,eventBasis:'original_event',availableAt:row.collected_at,symbols:row.symbols,authorRoot:'official:twse-tpex',originalRoot:row.document_url,body:row.content_text};
 const legacyHash=content.permittedContentFingerprint(legacy,new Date().toISOString());f.receipts.set(legacyHash,'completed');
 const result=await f.run();assert.equal(result.selected,0);assert.equal(f.reservations,0);assert.equal(f.completions,0);assert.deepEqual([...f.receipts],[ [legacyHash,'completed'] ]);
 assert.equal(result.cacheLineage[0].contentHash,legacyHash);assert.equal(result.cacheLineage[0].eventAt,legacy.eventAt);assert.equal(result.cacheLineage[0].sourceRevision,null);
 assert.equal(result.sourceAdmissions.evidence[0].reason,'vnext_cached_original_event_authority_unavailable');assert.equal(result.sourceAdmissions.evidence[0].identityEventBasis,'original_event');
});
test('actual cache worker cannot erase malformed present cache metadata, canonical hashes or restriction flags into missing legacy fields',async()=>{
 const rows=[],f=lab({rows});for(const [index,extra] of [{metadata:[]},{canonical_content_hash:123},{metadata:{content_truncated:'true'}},{metadata:{invalidated:'true'}},{metadata:{discovery_eligible:'false'}},{metadata:{candidate_discovery_eligible:0}}].entries())rows.push(f.seed(index+1,extra));
 const result=await f.run();assert.equal(result.selected,0);assert.equal(f.reservations,0);assert.equal(f.completions,0);assert.equal(result.rejected.length,6);
 assert.equal(result.sourceAdmissions.evidence.filter(row=>row.reason==='vnext_cached_source_metadata_invalid').length,5);assert.equal(result.sourceAdmissions.evidence.filter(row=>row.reason==='vnext_cached_canonical_content_invalid').length,1);
 assert.equal(result.coverage[1].eventCoverage,'unknown');assert.equal(result.eventVolume,null);assert.equal(f.progress[0].metadata.finished,true);
});
