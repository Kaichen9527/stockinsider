import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {launchDetailQuery} from './launch-ranking-read.ts';

const require=createRequire(import.meta.url);
const run='00000000-0000-4000-8000-000000000001',research='00000000-0000-4000-8000-000000000010',score='00000000-0000-4000-8000-000000000100';
const launchQuery={launchRunId:run,launchResearchRevision:research,launchScoreRevision:score};
type Element={type:unknown;props:Record<string,unknown>};
type Component=(props:Record<string,unknown>)=>Promise<Element>;
function text(value:unknown):string {
  if(value===null||value===undefined||typeof value==='boolean')return '';
  if(typeof value==='string'||typeof value==='number')return String(value);
  if(Array.isArray(value))return value.map(text).join(' ');
  if(typeof value==='object'&&'props' in value)return text((value as Element).props.children);
  return '';
}
/** Execute the ACTUAL page and both ACTUAL server-detail implementations.
 * Only their imports/readers are mocked; there is no duplicated dispatch gate. */
function actualPages(newMode:boolean,oldGate=true){
  let oldReads=0,newReads=0,otherReads=0;
  const empty={availability:'not_published',reason:null,readAt:'2026-11-13T13:30:30Z',snapshot:null,current:[],detail:null};
  const Link=()=>null;
  const mock=(value:unknown)=>({__esModule:true,default:value});
  const modules:Record<string,unknown>={
    'react/jsx-runtime':require('react/jsx-runtime'),
    'next/link':mock(Link),
    '@/lib/vnext/policy':{vnextEnabled:()=>oldGate},
    '@/lib/vnext/launch-ranking-read':{launchRankingEnabled:()=>newMode,launchDetailQuery,launchRankingMemberCurrent:()=>false,
      readLaunchRankingSnapshot:async()=>{newReads++;return empty;}},
    '@/lib/vnext/store':{readPublished:async()=>{oldReads++;return {history:[]};}},
    '@/lib/vnext/ranking-read':{rankingEnabled:()=>true,rankingMemberCurrent:()=>false,
      readRankingSnapshot:async()=>{oldReads++;return {snapshot:null,detail:null,currentHome:null,readAt:empty.readAt};}},
    '@/lib/vnext/public-contract':{publicationQualificationCurrent:()=>false},
    '@/lib/vnext/citations':{publicCitation:()=>null},
    '@/lib/vnext/research':{REQUIRED_SECTIONS:[]},
    './LaunchTop10':{launchAvailabilityText:()=> 'NEW_POLICY_NOT_PUBLISHED'},
    './LaunchCurrentStatus':mock(()=>null),
  };
  function load(relative:string):Component {
    const file=new URL(relative,import.meta.url),source=fs.readFileSync(file,'utf8');
    const compiled=ts.transpileModule(source,{fileName:file.pathname,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
    const isolatedModule={exports:{} as Record<string,unknown>};
    const wrap=vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})`,{URL,Date,Intl,process:{env:{}}},{timeout:1000}) as (r:(name:string)=>unknown,m:typeof isolatedModule,e:Record<string,unknown>)=>void;
    wrap(name=>{
      if(Object.hasOwn(modules,name))return modules[name];
      // Unselected legacy dependencies must never perform a read or startup.
      return new Proxy({__esModule:true,default:()=>{otherReads++;throw Error('unexpected legacy branch');}},{get(target,key){if(key in target)return target[key as keyof typeof target];return ()=>{otherReads++;throw Error('unexpected legacy read');};}});
    },isolatedModule,isolatedModule.exports);
    return isolatedModule.exports.default as Component;
  }
  const oldDetail=load('../../app/components/vnext/Detail.tsx'),newDetail=load('../../app/components/vnext/LaunchDetail.tsx');
  modules['@/app/components/vnext/Detail']=mock(oldDetail);modules['@/app/components/vnext/LaunchDetail']=mock(newDetail);
  const page=load('../../app/stock/[symbol]/page.tsx');
  return {oldDetail,newDetail,counts:()=>({oldReads,newReads,otherReads}),async render(query:Record<string,string|string[]|undefined>){
    const selection=await page({params:Promise.resolve({symbol:'5274'}),searchParams:Promise.resolve(query)});
    assert.ok(selection.type===oldDetail||selection.type===newDetail,'actual page must choose a supported detail implementation');
    const rendered=await(selection.type as Component)(selection.props);
    return {selected:selection.type,rendered,text:text(rendered)};
  }};
}
test('actual stock page preserves pure explicit oldhistory under newmode and invokes only originaloldreaders',async()=>{
  for(const query of [{vnextRevision:research},{vnextRevision:research,rankingRunId:run}]){
    const f=actualPages(true),rendered=await f.render(query);
    assert.equal(rendered.selected,f.oldDetail);assert.deepEqual(f.counts(),{oldReads:1,newReads:0,otherReads:0});
  }
});
test('actual stock page sends mixedselectors to strictnewdetail rejection without anyreader',async()=>{
  const f=actualPages(true),rendered=await f.render({...launchQuery,vnextRevision:research,rankingRunId:run});
  assert.equal(rendered.selected,f.newDetail);assert.match(rendered.text,/參數不一致/u);assert.deepEqual(f.counts(),{oldReads:0,newReads:0,otherReads:0});
});
test('actual stock page explicitlaunch OFF remainsdisabled evenwhenlegacygateisOFF; no fallbackorreader',async()=>{
  const f=actualPages(false,false),rendered=await f.render(launchQuery);
  assert.equal(rendered.selected,f.newDetail);assert.match(rendered.text,/尚未啟用/u);assert.deepEqual(f.counts(),{oldReads:0,newReads:0,otherReads:0});
});
test('actual stock page unselected newmode usesnewlatestreader only',async()=>{
  const f=actualPages(true),rendered=await f.render({});
  assert.equal(rendered.selected,f.newDetail);assert.match(rendered.text,/NEW_POLICY_NOT_PUBLISHED/u);assert.deepEqual(f.counts(),{oldReads:0,newReads:1,otherReads:0});
});
