/* PUBLIC SYNTHETIC COMPONENT HARNESS ONLY. Not a frozen standalone artifact,
 * real Next router/process, OS admission or product HTTP acceptance. Exact
 * source blobs + real Supabase SDK + actual NextResponse, private SQL-backed
 * HTTP adapter. Test-only dependency root never enters staging runtime. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 const root=path.resolve(process.argv[2]),modules=path.resolve(process.argv[3]);
 const ts=require(path.join(modules,'typescript'));
 const {createClient}=require(path.join(modules,'@supabase/supabase-js'));
 const next=require(path.join(modules,'next/server'));
 const pins={
  'candidate-detail.ts':'37cb3fa5ad0046db3a03c5a73a3670fe2e16af56',
  'tw-market.ts':'d98636ebceeb53899f133bb8729cd899becc292c',
  '../app/api/stocks/[symbol]/candidate-detail/route.ts':'3b06b3833a409830b9e4879ab68197c9ba7d2b02'};
 const lib=path.join(root,'web/src/lib');
 for(const [file,pin]of Object.entries(pins)){
  const raw=fs.readFileSync(path.resolve(lib,file));
  if(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex')!==pin)throw Error('pin');
 }
 const client=createClient('http://127.0.0.1:3302',input.token,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:'Bearer '+input.token}}});
 const market=fs.readFileSync(path.join(lib,'tw-market.ts'),'utf8');
 const start=market.indexOf('export function resolveTaiwanFinalPublicationSemantics');
 const end=market.indexOf('\nasync function withOfficialMarketSlot',start);
 const pure="const TAIWAN_FINAL_DATASETS=['daily_price','daily_valuation'];\n"+market.slice(start,end);
 const cache=new Map();
 function compile(source,file){
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};cache.set(file,module);
  function localRequire(id){
   if(id==='next/server')return next;
   if(id==='./supabase-server')return {getSupabaseServerClient:()=>client};
   if(id==='./tw-market.ts')return compile(pure,path.join(lib,'PURE_MARKET_COMPONENT')).exports;
   if(id.startsWith('@/lib/'))return load(path.join(lib,id.slice(6)));
   if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id));
   return require(id);
  }
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:'PUBLIC_PINNED_COMPONENT'})(localRequire,module,module.exports);
  return module;
 }
 function load(file){
  if(!fs.existsSync(file))file+='.ts';
  if(cache.has(file))return cache.get(file).exports;
  return compile(fs.readFileSync(file,'utf8'),file).exports;
 }
 const route=load(path.join(root,'web/src/app/api/stocks/[symbol]/candidate-detail/route.ts'));
 const url='http://127.0.0.1:3000/api/stocks/'+input.symbol+'/candidate-detail?revision='+input.revision;
 const response=await route.GET(new Request(url),{params:Promise.resolve({symbol:input.symbol})});
 const body=await response.json();
 if(response.status!==200||!body.ok||body.detail.revisionId!==input.revision||body.detail.summary!==input.expectedSummary||body.detail.narrativeKind!=='deterministic_fact')throw Error('body');
 for(const query of ['?revision=invalid','?revision='+input.revision+'&revision='+input.revision]){
  const bad=await route.GET(new Request(url.split('?')[0]+query),{params:Promise.resolve({symbol:input.symbol})});
  if(bad.status!==400)throw Error('negative');
 }
 process.stdout.write(JSON.stringify({status:'PINNED_SOURCE_COMPONENT_VERIFIED',httpAdapter:true,nextVersion:require(path.join(modules,'next/package.json')).version,sections:body.detail.sections.length,facts:body.detail.facts.length,asOf:body.detail.asOf,availableAt:body.detail.availableAt,revisionNegatives:2}));
})().catch(()=>{process.stdout.write(JSON.stringify({status:'PUBLIC_PINNED_COMPONENT_FAILED'}));process.exitCode=2;});
