import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {LAUNCH_CANDIDATE_FIXTURE,launchCandidateQuery,launchCandidateFixturePage,launchCandidatePoolPage,readLaunchCandidateCatalog,type LaunchCandidateQuery} from './launch-candidate-catalog.ts';
import {candidateQuery,candidateRankingRunId,candidateHistoryPage,candidateDetailHref} from './candidate-page.ts';
import {EPOCH_FIXTURE_SCHEMA,type CandidateEpochEvent} from './candidate-epoch-journal.ts';
import {POLICY} from './policy.ts';
const require=createRequire(import.meta.url),id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cutoff='2026-11-14T13:30:00Z',now='2026-11-14T13:31:00Z';
function synthetic(){
 const clues=Array.from({length:21},(_,i)=>({id:id(100+i),symbol:String(2300+i),eventAt:'2026-11-13T01:00:00Z',availableAt:'2026-11-13T02:00:00Z',source:'synthetic_original_mention',industrySnapshot:null,
  publication:{kind:'synthetic_public_metadata_fixture',bindingId:id(300+i)}}));
 const events:CandidateEpochEvent[]=clues.slice(0,20).map((c,i)=>({eventId:id(i+1),symbol:c.symbol,sequence:'1',previousEventId:null,epochId:id(i+1),epochStartedAt:'2026-11-13T03:00:00Z',kind:'admitted',state:'researching',reasonCode:'admitted',causePath:'core.enqueue.admitted',occurredAt:'2026-11-13T03:00:00Z',recordedAt:'2026-11-13T03:00:00Z',publicationRevisionId:null}));
 return {schemaVersion:LAUNCH_CANDIDATE_FIXTURE,scope:'synthetic_only',catalogId:id(900),cutoff,coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},clues,
  membership:{schemaVersion:EPOCH_FIXTURE_SCHEMA,policyVersion:POLICY.version,cutoff,coverage:{complete:false,preActivationHistory:'unavailable'},activation:'disabled_not_connected',events}};
}
const oldPacket={snapshot:{schemaVersion:'vnext-ranking-snapshot-v1',policyVersion:POLICY.version,rankingRunId:id(800),previousRankingRunId:null,cutoff,
 candidates:[2300,2301].map(symbol=>({symbol:String(symbol),state:'researching',date:'2026-11-13',revisionId:null,entryEligible:false,source:null,industry:null}))},previousSnapshot:null,nextSnapshot:null};
const oldCursor=candidateHistoryPage(oldPacket,candidateQuery({limit:'1'}),now).nextCursor!;
type Element=React.ReactElement<Record<string,unknown>>;
async function resolve(value:unknown):Promise<React.ReactNode>{
 if(Array.isArray(value))return Promise.all(value.map(resolve));
 if(!React.isValidElement(value))return value as React.ReactNode;
 const element=value as Element;
 if(typeof element.type==='function')return resolve(await(element.type as (p:Record<string,unknown>)=>unknown)(element.props));
 return React.cloneElement(element,undefined,await resolve(element.props.children));
}
/** Execute the ACTUAL canonical page, ACTUAL presenter and actualold/newquery
 * implementations. Only import-level readers are controlled test fixtures. */
function actualPage(mode:boolean,reader:(q:LaunchCandidateQuery)=>unknown=readLaunchCandidateCatalog,oldGate=true){
 let oldReads=0,newReads=0;
 const navigationIntents:Array<{href:unknown;prefetch:unknown}>=[];
 const modules:Record<string,unknown>={
  'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:({children,prefetch,...props}:Record<string,unknown>)=>{navigationIntents.push({href:props.href,prefetch});return React.createElement('a',props,children as React.ReactNode);}},
  'next/navigation':{notFound:()=>{throw Error('not_found');}},
  '@/lib/vnext/ranking-read':{rankingEnabled:()=>oldGate},'@/lib/vnext/launch-ranking-read':{launchRankingEnabled:()=>mode},
  '@/lib/vnext/candidate-page':{candidateQuery,candidateRankingRunId,candidateDetailHref},
  '@/lib/vnext/candidate-history-read':{readCandidateHistory:async(q:ReturnType<typeof candidateQuery>)=>{oldReads++;return candidateHistoryPage(oldPacket,q,now);}},
  '@/lib/vnext/launch-candidate-catalog':{launchCandidateQuery,readLaunchCandidateCatalog:(q:LaunchCandidateQuery)=>{newReads++;return reader(q);}},
 };
 function load(relative:string){
  const file=new URL(relative,import.meta.url),source=fs.readFileSync(file,'utf8');
  const compiled=ts.transpileModule(source,{fileName:file.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
  const isolatedModule={exports:{} as {default:(p:Record<string,unknown>)=>unknown}};
  const run=vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})`,{URLSearchParams,Date},{timeout:1000}) as (r:(name:string)=>unknown,m:typeof isolatedModule,e:typeof isolatedModule.exports)=>void;
  run(name=>{if(Object.hasOwn(modules,name))return modules[name];throw Error(`unexpected_import:${name}`);},isolatedModule,isolatedModule.exports);return isolatedModule.exports;
 }
 modules['@/app/components/vnext/LaunchCandidateCatalog']=load('../../app/components/vnext/LaunchCandidateCatalog.tsx');
 const page=load('../../app/candidates/page.tsx').default;
 return {counts:()=>({oldReads,newReads}),navigationIntents:()=>navigationIntents,async render(params:Record<string,string|string[]|undefined>={}){
  const element=await page({searchParams:Promise.resolve(params)});return renderToStaticMarkup(await resolve(element));
 }};
}
test('ACTUALcanonicalpage defaultOFF retainsoldhistory/namedcursor/cursor-only includingON explicitoldhistory',async()=>{
 for(const mode of [false,true])for(const params of [{rankingRunId:id(800),limit:'1',cursor:oldCursor},{limit:'1',cursor:oldCursor}]){
  const f=actualPage(mode),html=await f.render(params);assert.match(html,/vnext-candidates/u);assert.match(html,/2301/u);assert.deepEqual(f.counts(),{oldReads:1,newReads:0});
 }
 const off=actualPage(false);assert.match(await off.render(),/尚未涵蓋未入池候選/u);assert.deepEqual(off.counts(),{oldReads:1,newReads:0});
});
test('ACTUALcanonicalpage newplain istruthfullyunavailable withno legacyfallback; explicitnewOFF isdisabled',async()=>{
 const on=actualPage(true),html=await on.render();assert.match(html,/無法讀取已發布的新版研究池快照/u);assert.match(html,/這不代表沒有候選/u);assert.ok(!html.includes('vnext-candidates'));assert.deepEqual(on.counts(),{oldReads:0,newReads:1});
 const off=actualPage(false,readLaunchCandidateCatalog,false);assert.match(await off.render({catalogId:id(900)}),/新候選目錄尚未啟用/u);assert.deepEqual(off.counts(),{oldReads:0,newReads:0});
});
test('ACTUALcanonicalpage mixednew/old orduplicatequeryrejects withoutreader; newtokenmissingcatalogId neverbecomeslatest',async()=>{
 for(const params of [{catalogId:id(900),rankingRunId:id(800)},{catalogId:[id(900),id(901)]},{status:'admission_history_unknown',rankingRunId:id(800)}]){
  const f=actualPage(true);assert.match(await f.render(params),/參數不一致/u);assert.deepEqual(f.counts(),{oldReads:0,newReads:0});
 }
 const p=synthetic(),first=launchCandidateFixturePage(p,launchCandidateQuery(new URLSearchParams('limit=20')),{catalogId:p.catalogId,checkedAt:now,withdrawnClueIds:[]},now),f=actualPage(true);
 assert.ok(first.nextCursor);assert.match(await f.render({cursor:first.nextCursor,limit:'20'}),/參數無效/u);assert.deepEqual(f.counts(),{oldReads:0,newReads:0});
});
test('ACTUALcanonicalSSR shows21 syntheticmentions with20 recordedepochs andunknownhistory; links/forms pin catalog andresetcursor',async()=>{
 const old=synthetic(),newer=synthetic();newer.catalogId=id(901);newer.clues.push({...newer.clues[0],id:id(999),symbol:'9999'});let latest=old;
 const f=actualPage(true,q=>{const p=q.catalogId===old.catalogId?old:latest;return launchCandidateFixturePage(p,q,{catalogId:p.catalogId,checkedAt:now,withdrawnClueIds:[]},now);});
 const first=await f.render({catalogId:old.catalogId,limit:'20'});assert.match(first,/受控合成投影示例/u);assert.equal((first.match(/已記錄的研究池期間<\/td>/gu)||[]).length,20);
 assert.ok(f.navigationIntents().length>=2);assert.ok(f.navigationIntents().every(link=>link.prefetch===false),'new presenter links must not prefetch Home/ranking RPC or other candidate pages');
 const href=/href="([^"]+)"[^>]*>下一頁/u.exec(first)?.[1]?.replaceAll('&amp;','&');assert.ok(href);const params=Object.fromEntries(new URL(href,'http://127.0.0.1').searchParams);assert.equal(params.catalogId,old.catalogId);
 latest=newer;const second=await f.render(params);assert.match(second,/2320/u);assert.match(second,/未觀察到入池事件；歷史未知/u);assert.ok(!second.includes('9999'));
 const form=/<form[\s\S]*?<\/form>/u.exec(second)?.[0];assert.ok(form);assert.ok(form.includes('name="catalogId"'));assert.ok(!form.includes('name="cursor"'),'changing filters resets cursor');
 const filtered=await f.render({catalogId:old.catalogId,status:'admission_history_unknown'});assert.match(filtered,/2320/u);assert.ok(!filtered.includes('2300</td>'));
});
test('ACTUALSSR withdrawalleavespositiononly andstaticfilteroptions; no symbol/source/event leaks orfilteredoracle',async()=>{
 const p=synthetic();p.clues[20].source='withdrawn_private_source';p.clues[20].eventAt='2026-11-12T01:00:00Z';
 const base=launchCandidateFixturePage(p,launchCandidateQuery(new URLSearchParams('limit=20')),{catalogId:p.catalogId,checkedAt:now,withdrawnClueIds:[]},now);assert.ok(base.nextCursor);
 const f=actualPage(true,q=>launchCandidateFixturePage(p,q,{catalogId:p.catalogId,checkedAt:now,withdrawnClueIds:[p.clues[20].id]},now));
 const html=await f.render({catalogId:p.catalogId,limit:'20',cursor:base.nextCursor});assert.match(html,/此位置的公開資訊已撤回/u);assert.match(html,/<td>21<\/td>/u);
 for(const secret of ['2320','withdrawn_private_source','2026-11-12',p.clues[20].id])assert.ok(!html.includes(secret));
 for(const source of ['withdrawn_private_source','does_not_match']){const result=await f.render({catalogId:p.catalogId,source});assert.match(result,/無法安全提供篩選結果/u);assert.ok(!result.includes('<table'));}
});

test('canonical page renders saved pool states and pins the next page',async()=>{
 const p={schemaVersion:'launch-candidate-pool-history-v1',
  current:{id:id(960),cutoff,rows:[{symbol:'2300',state:'waiting'},{symbol:'2301',state:'eligible'}]},
  previous:{id:id(959),cutoff:'2026-11-13T13:30:00Z',rows:[{symbol:'2299',state:'eligible'}]},next:null};
 const f=actualPage(true,q=>launchCandidatePoolPage(p,q,now));
 const first=await f.render({limit:'1'});
 for(const label of ['快照日期','本版未出現','確切離池時間與原因未保存','較早版本'])assert.ok(first.includes(label));
 const href=/href="([^"]+)"[^>]*>下一頁/u.exec(first)?.[1]?.replaceAll('&amp;','&');
 assert.ok(href);
 const params=Object.fromEntries(new URL(href,'http://127.0.0.1').searchParams);
 assert.equal(params.catalogId,p.current.id);
 const second=await f.render(params);
 assert.match(second,/快照當時等待/u);
 assert.ok(!second.includes('2299'));
});
