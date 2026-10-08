import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const ts=require('typescript');
const source=readFileSync('web/src/lib/research-v2.ts','utf8');
const body=source.slice(source.indexOf('async function scrapeTwseInsider('),source.indexOf('export async function runReportIngest'));
const tw=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/insider-schema-relay.json','utf8'));
const otc=JSON.parse(readFileSync('docs/research/2026-10-08-discovery-live/tpex-insider-schema-relay.json','utf8'));
function library(path){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Buffer,URL,Date,Response,TextDecoder,AbortSignal,fetch});return exports;}
const official=library('web/src/lib/research-insider-official.ts');
const evidence=library('web/src/lib/research-insider-evidence.ts');
function harness({rows,prior=null,failWrite=false,failCursor=false}={}){
 const cursors=new Map();if(prior)for(const d of official.OFFICIAL_INSIDER_DATASETS.filter(d=>d.kind==='holding'))cursors.set(d.url,prior);const written=[];const audits=[];let fetches=0;
 const client={from(table){assert.equal(table,'source_connector_cursors');const filters={};let mutation=null;let value;
  const query={select(){return query},eq(key,v){filters[key]=v;return query},maybeSingle:async()=>({data:cursors.has(filters.scope_key)?{cursor_value:cursors.get(filters.scope_key)}:null,error:null}),
   insert(v){mutation='insert';value=v;return query},update(v){mutation='update';value=v;return query},
   then(resolve,reject){return Promise.resolve().then(()=>{if(failCursor)return {error:{message:'synthetic CAS conflict'},data:null};if(mutation==='insert'&&cursors.has(value.scope_key))return {error:{message:'duplicate'},data:null};if(mutation==='update'&&filters.cursor_value!==cursors.get(value.scope_key))return {error:null,data:[]};cursors.set(value.scope_key,value.cursor_value);return {error:null,data:[{cursor_value:value.cursor_value}]};}).then(resolve,reject)}};return query;}};
 const context={...official,...evidence,Date,JSON,Number,String,Error,
  fetchOfficialInsiderRows:async dataset=>{fetches++;const data=rows&&dataset.kind==='holding'?rows:(dataset.url===official.OFFICIAL_INSIDER_DATASETS[0].url?tw.holding.selectedRows.map(r=>r.rawFields):dataset.url===official.OFFICIAL_INSIDER_DATASETS[2].url?[tw.transfer.exampleRow.rawFields]:dataset.url===official.OFFICIAL_INSIDER_DATASETS[3].url?otc.selectedHoldings5347.map(r=>r.values):dataset.url===official.OFFICIAL_INSIDER_DATASETS[4].url?[{...otc.transferPlaceholder,Date:'1151007'}]:[]);return {rows:data,hash:'a'.repeat(64),bytes:123,attemptedAt:'2026-10-08T13:00:00Z',observedAt:'2026-10-08T13:00:01Z'};},
  getSupabaseServerClient:()=>client,startConnectorRun:async()=> 'run',startAgentRun:async()=> 'agent',upsertSourceEntity:async()=>({id:'synthetic-local-entity'}),
  createSourceAudit:async audit=>audits.push(audit),upsertSourceRawDocuments:async docs=>{if(failWrite)throw Error('synthetic persistence failure');written.push(...docs);return docs.length;},
  filterSymbolScopedDocs:(docs,connector,scope)=>scope?docs.filter(d=>d.symbols.includes(scope.symbol)):docs,upsertCredentialRegistry:async()=>{},finishAgentRun:async()=>{},finishConnectorRun:async()=>{},
  writeAgentTask:async()=> 'task',writeAgentFinding:async()=>{},};
 vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.run=scrapeTwseInsider;',context);
 return {run:context.run,written,audits,get saved(){return cursors.get(official.OFFICIAL_INSIDER_DATASETS[0].url)??null},get fetches(){return fetches}};
}
test('existing guarded collector consumes actual TWSE/TPEx professional relays with honest clocks',async()=>{const h=harness();const result=await h.run();assert.equal(h.fetches,5);const twDocs=h.written.filter(d=>d.metadata.market==='TWSE');assert.equal(twDocs.length,68);for(const d of h.written)assert.equal(d.publishedAt,null);const transfer=twDocs.find(d=>d.metadata.insider_evidence.kind==='transfer_declaration');assert.equal(transfer.metadata.transfer_shares,null);assert.equal(transfer.metadata.insider_evidence.currentShares,40781855);assert.ok(h.saved);assert.equal(result.metadata.full_market_analyzed,false);});
test('symbol scope passes all67 rather than first60',async()=>{const rows=Array.from({length:67},(_,i)=>({...tw.holding.selectedRows[0].rawFields,姓名:`p${i}`}));const h=harness({rows});await h.run({symbol:'2383'});assert.equal(h.written.filter(d=>d.metadata.market==='TWSE'&&d.metadata.source_report_period).length,67);});
test('market partial coverage and persisted next page are explicit',async()=>{const rows=Array.from({length:1001},(_,i)=>({...tw.holding.selectedRows[0].rawFields,姓名:`p${i}`}));const h=harness({rows});const result=await h.run();assert.equal(JSON.parse(h.saved).offset,500);assert.equal(result.degradedReason,'insider_bounded_response_pages_remaining');assert.equal(result.metadata.dataset_outcomes[0].coverage.remaining_rows,501);const next=harness({rows,prior:h.saved});await next.run();assert.equal(JSON.parse(next.saved).offset,1000);assert.ok(next.written.some(d=>d.summary.includes('p999')));});
test('persistence failure never advances cursor',async()=>{const prior=JSON.stringify({hash:'a'.repeat(64),offset:0});const h=harness({failWrite:true,prior});await assert.rejects(h.run(),/persistence/);assert.equal(h.saved,prior);});
test('CAS conflict rejects collector success after idempotent document writes',async()=>{const h=harness({failCursor:true});await assert.rejects(h.run(),/cursor_commit_failed/);assert.equal(h.saved,null);assert.ok(h.written.length>0);});
test('existing source endpoint still authenticates and enforces production lease',()=>{const route=readFileSync('web/src/app/api/internal/source-sync/route.ts','utf8');assert.match(route,/requireInternalAuth\(req\)/);assert.match(route,/acquireProductionWriteLease/);});
