/* SOURCE-ONLY SYNTHETIC DESIGN. Not imported/staged by live restore. A matching
 * consumer result is NOT data/privacy/bound/collision/runtime admission. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const SOURCE_BLOB='d98636ebceeb53899f133bb8729cd899becc292c';
const DATASETS=['daily_price','daily_valuation'];
const TERMINALS=new Set(['complete','conflict','stale','missing','empty','timeout','usage_limited','auth_failed','http_error','network_error','schema_invalid','not_configured','']);
function sourceOnlyCompose(metadata){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return {status:'GAP_SOURCE_ONLY_PROFILE'};
 if(Object.keys(metadata).some(k=>!['publicationPhase','dataCutoffAt','datasetCompleteness','datasetCompletenessPct','shadowEligible'].includes(k)))return {status:'GAP_SOURCE_ONLY_PROFILE'};
 const map=metadata.datasetCompleteness;
 if(!map||typeof map!=='object'||Array.isArray(map))return {status:'GAP_SOURCE_ONLY_PROFILE'};
 const states=DATASETS.map(()=>({seen:false,allComplete:true,conflict:false,stale:false,firstOther:null}));
 for(const [key,entry]of Object.entries(map)){
  const index=DATASETS.findIndex(d=>key===d||key.startsWith(d+':'));
  if(index<0)continue;
  const terminal=entry&&typeof entry==='object'&&!Array.isArray(entry)?String(entry.terminal||'missing'):'missing';
  if(!TERMINALS.has(terminal))return {status:'GAP_UNSUPPORTED_TERMINAL'};
  const state=states[index];state.seen=true;
  if(terminal!=='complete'){state.allComplete=false;if(state.firstOther===null)state.firstOther=terminal;}
  state.conflict=state.conflict||terminal==='conflict';state.stale=state.stale||terminal==='stale';
 }
 const summary=Object.create(null);
 states.forEach((s,i)=>{summary[DATASETS[i]]={terminal:!s.seen?'missing':s.allComplete?'complete':s.conflict?'conflict':s.stale?'stale':s.firstOther||'missing'};});
 return {status:'SOURCE_ONLY_COMPOSED',metadata:{...metadata,datasetCompleteness:summary}};
}
function frozenOracle(root,modules){
 const raw=fs.readFileSync(path.join(root,'web/src/lib/tw-market.ts'));
 if(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+raw.length+'\0'),raw])).digest('hex')!==SOURCE_BLOB)throw Error('frozen_source_mismatch');
 const ts=require(path.join(modules,'typescript'));
 const parsed=ts.createSourceFile('PUBLIC_FROZEN_SOURCE.ts',raw.toString(),ts.ScriptTarget.ES2022,true);
 const decl=parsed.statements.find(x=>ts.isVariableStatement(x)&&x.declarationList.declarations.some(d=>d.name.getText(parsed)==='TAIWAN_FINAL_DATASETS'));
 const func=parsed.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text==='resolveTaiwanFinalPublicationSemantics');
 if(!decl||!func)throw Error('frozen_declaration_missing');
 const code=ts.transpileModule(decl.getText(parsed)+'\n'+func.getText(parsed),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(code,{exports},{timeout:1000});
 return value=>JSON.parse(JSON.stringify(exports.resolveTaiwanFinalPublicationSemantics(value)));
}
function run(root,modules){
 const oracle=frozenOracle(root,modules);let equivalent=0,negative=0;
 const make=map=>({publicationPhase:'final',dataCutoffAt:'2026-09-12T00:00:00Z',datasetCompleteness:map,datasetCompletenessPct:100,shadowEligible:false});
 const full={'daily_price:TWSE':{terminal:'complete'},'daily_valuation:TWSE':{terminal:'complete'}};
 function same(value){const out=sourceOnlyCompose(value);assert.equal(out.status,'SOURCE_ONLY_COMPOSED');assert.deepEqual(oracle(value),oracle(out.metadata));equivalent++;return oracle(value);}
 same(make(full));same(make({}));same(make({'daily_price':{terminal:'complete'}}));same(make({'daily_valuation':{terminal:'complete'}}));
 same(make({...full,'monthly_revenue:TWSE':{terminal:'conflict'},'unrelated':{terminal:'stale'}}));
 assert.equal(same(make({...full,'daily_price:':{terminal:'stale'}})).status,'stale_readonly');
 assert.equal(same(make({...full,'daily_price::suffix':{terminal:'conflict'}})).missingComponents[0],'daily_price:conflict');
 same(make({...full,'daily_price_extra':{terminal:'conflict'},'DAILY_PRICE':{terminal:'conflict'},'daily_priceX':{terminal:'stale'}}));
 for(const terminals of [['timeout','empty'],['empty','timeout'],['timeout','stale','conflict'],['conflict','stale','timeout'],['complete','stale'],['complete','conflict']]){
  const map={'daily_valuation':{terminal:'complete'}};terminals.forEach((t,i)=>{map['daily_price:'+String.fromCharCode(122-i)]={terminal:t};});same(make(map));
 }
 for(const entry of [null,[],0,false,'complete',{}, {terminal:null},{terminal:false},{terminal:0},{terminal:''},{terminal:['complete']},{terminal:[]}])same(make({'daily_price':entry,'daily_valuation':{terminal:'complete'}}));
 assert.equal(same(make({'daily_price:z':{terminal:[]},'daily_price:a':{terminal:'timeout'},'daily_valuation':{terminal:'complete'}})).missingComponents[0],'daily_price:missing');
 for(const pct of [101,-1,0,99.5,100,'100','0x64','invalid',null,true,false,[],[100],Infinity,-Infinity,NaN])same({...make(full),datasetCompletenessPct:pct});
 for(const phase of ['final','FINAL','preliminary',null,0])same({...make(full),publicationPhase:phase});
 for(const shadow of [false,true,null])same({...make(full),shadowEligible:shadow});
 // Poisoning tests prove tempting reductions are NOT equivalent.
 const ordered=make({'daily_price:z':{terminal:'timeout'},'daily_price:a':{terminal:'empty'},'daily_valuation':{terminal:'complete'}});
 const sorted={...ordered,datasetCompleteness:Object.fromEntries(Object.entries(ordered.datasetCompleteness).sort(([a],[b])=>a.localeCompare(b)))};
 assert.notDeepEqual(oracle(ordered),oracle(sorted));negative++;
 assert.notDeepEqual(oracle(make({...full,'daily_price:poison':{terminal:'conflict'}})),oracle(make(full)));negative++;
 assert.notDeepEqual(oracle(make({'daily_price':{terminal:'complete'}})),oracle(make(full)));negative++;
 assert.notDeepEqual(oracle({...make(full),datasetCompletenessPct:99}),oracle({...make(full),datasetCompletenessPct:100}));negative++;
 assert.equal(sourceOnlyCompose(make({'daily_price':{terminal:'PUBLIC_UNKNOWN_TERMINAL'},'daily_valuation':{terminal:'complete'}})).status,'GAP_UNSUPPORTED_TERMINAL');negative++;
 assert.equal(sourceOnlyCompose({...make(full),unreviewedField:'PUBLIC_CANARY'}).status,'GAP_SOURCE_ONLY_PROFILE');negative++;
 assert.equal(sourceOnlyCompose(make([])).status,'GAP_SOURCE_ONLY_PROFILE');negative++;
 assert.equal(oracle(make(full)).status,'confirmed');assert.equal(oracle({...make(full),datasetCompletenessPct:Infinity}).completenessPct,0);
 return {status:'SOURCE_ONLY_METADATA_EQUIVALENCE_VERIFIED',sourceBlob:SOURCE_BLOB,equivalenceCases:equivalent,negativeCases:negative,liveImported:false,liveBoundRelaxed:false,actualMetadataRegion:'NOT_OBSERVED'};
}
module.exports={sourceOnlyCompose,frozenOracle,run};
if(require.main===module){try{process.stdout.write(JSON.stringify(run(process.argv[2],process.argv[3])));}catch{process.stdout.write(JSON.stringify({status:'SOURCE_ONLY_METADATA_EQUIVALENCE_FAILED'}));process.exitCode=2;}}
