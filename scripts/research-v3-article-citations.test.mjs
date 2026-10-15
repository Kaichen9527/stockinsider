// Pure consumer contracts over real pinned bytes; RPC responses are synthetic.
// No native DB/role/fence or publication approval is represented by these fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createV3CashCitationConsumer} from '../web/src/lib/research-v3-article-citations.ts';
import {bindingCanonical,bindingSha,fixedBindingInputs,parseBindingCore} from '../web/src/lib/research-versioned-input-binding.ts';
import {completeHash} from '../web/src/lib/research-v3-material-canonical.ts';
import {historicalCashPins as pins} from '../web/src/lib/research-historical-cash-pins.ts';
import {projectScenarioCashMaterial} from '../web/src/lib/research-scenario-cash-material.ts';
import {normalizeScenarioCashMaterial} from '../web/src/lib/research-v3-finite-material.ts';
import {calculateHistoricalCash} from '../web/src/lib/research-historical-cash-core.ts';
const sha=b=>createHash('sha256').update(b).digest('hex'),noop={check(){}};
const gz=fs.readFileSync(new URL('./fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(sha(gz),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const files=JSON.parse(gunzipSync(gz,{maxOutputLength:2000000})).files;
assert.equal(files.length,15);
for(const {pin,rawBase64}of files){const b=Buffer.from(rawBase64,'base64');assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
const raw=new Map(files.map(f=>[f.pin.path,JSON.parse(Buffer.from(f.rawBase64,'base64'))]));
const hs=sha(fs.readFileSync(new URL('../web/src/lib/research-v3-article-citations.ts',import.meta.url))),hc=sha(fs.readFileSync(process.execPath)); // engineering identities, NOT whole source/compiled Next approval
const uid=n=>'a1000000-0000-4000-8000-'+String(n).padStart(12,'0');
function make(symbol){
 const q=fixedBindingInputs(symbol,'research-article-input-v3');
 const text=bindingCanonical({artifactRootId:'historical15d4-fixed9or7',compiledFingerprintIdentity:hc,financialProfile:pins.profile,inventoryHash:completeHash(q.inventory),schemaTemplateIdentity:bindingSha(bindingCanonical(q.schemaTemplate)),sourceExecutionHash:hs,symbol,validationContract:'research-versioned-input-candidate-v3',wireVersion:'research-article-input-v3'}),binding=parseBindingCore(text);
 const request={owner:'synthetic-consumer-contract',jobId:uid(1),attempt:1,reservationId:uid(2),scope:'research_observed_v1',snapshotHash:sha('synthetic-snapshot'),preparationId:uid(3),preparationHash:sha('synthetic-preparation'),expectedArtifactManifestHash:binding.core.inventoryHash,expectedCalculatorExecutionHash:binding.bindingCapsuleIdentity};
 const readAt=new Date().toISOString();const carrier=Buffer.from(bindingCanonical({schemaVersion:'historical-cash-private-byte-material-v1',financialProfile:pins.profile,symbol,files:pins.companies[symbol].files.map(p=>({path:p.path,rawBase64:files.find(f=>f.pin.path===p.path).rawBase64}))}));let normalized;
 try{normalized=normalizeScenarioCashMaterial(pins.profile,symbol,JSON.stringify(projectScenarioCashMaterial(pins.profile,symbol,carrier,readAt,noop)),readAt,noop);}finally{carrier.fill(0);}
 const {financialMaterial,...candidate}=normalized,p=financialMaterial.projection,c=financialMaterial.calculation;
 const payload={schemaVersion:binding.core.wireVersion,assemblyStatus:'complete',evidenceStatus:'incomplete',producerAttribution:'internal_controller_asserted',preparation:{id:request.preparationId,inputHash:request.preparationHash},researchIdentity:{researchCompanyId:uid(4),symbol,scope:request.scope,snapshotHash:request.snapshotHash},priority:{},originalJob:{jobId:request.jobId,attempt:1,owner:request.owner},originalReservation:{reservationId:request.reservationId},sources:{},financial:{artifactInventory:q.inventory,material:financialMaterial,candidate,protocol:{...binding.core,bindingCapsuleIdentity:binding.bindingCapsuleIdentity}},hashes:{preparationInputHash:request.preparationHash,artifactInventoryHash:binding.core.inventoryHash,modelHistoricalCanonicalHash:q.historicalHash,sourceManifestHash:completeHash(p.sourceManifest),projectionHash:completeHash(p),scenarioInputHash:completeHash(p.projected.scenarios),resultHash:completeHash(c),sourceClosureHash:hs},clocks:{artifactReadKnownAt:readAt},gaps:[],capabilities:{financialVerified:false,dispatchReady:false,modelDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false}};
 const saved={revision_id:uid(symbol),status:'sealed',dispatchReady:false,binding,job_id:request.jobId,attempt:1,reservation_id:request.reservationId,preparation_id:request.preparationId,snapshot_hash:request.snapshotHash,research_scope:request.scope,research_company_id:uid(4),canonical_request:request,request_hash:completeHash(request),canonical_payload:payload,input_hash:completeHash(payload)};
 const consumer=createV3CashCitationConsumer({bindingTexts:[text],executorFingerprint:hc});const calls=[];
 const db={async rpc(name,args){calls.push({name,args:structuredClone(args)});return{data:structuredClone(saved),error:null};}};
 return{symbol,text,binding,request,saved,consumer,db,calls,normalized,readAt};
}
const fixtures=new Map(['2409','2383'].map(s=>[s,make(s)]));
const read=x=>x.consumer.read(x.db,JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash);
function citation(set,node){return Object.fromEntries([...['symbol','financialProfile','wireVersion','requestHash','bindingCapsuleIdentity','inputRevisionId','inputHash'].map(k=>[k,set.context[k]]),...['pointer','kind','value','unit','period','periodKind','classification','scenarioId'].map(k=>[k,node[k]])]);}
function resolve(locator){let v=raw.get(locator.file);assert.ok(v);assert.equal(pins.companies['2409'].files.concat(pins.companies['2383'].files).find(p=>p.path===locator.file).sha256,locator.fileSha256);for(const k of locator.jsonPointer.slice(1).split('/'))v=v[k];assert.notEqual(v,undefined,locator.jsonPointer);return v;}
for(const symbol of ['2409','2383']){
 const x=fixtures.get(symbol);
 test(`${symbol} actual pinned successor -> real controller READ only -> immutable exact revision citations`,async()=>{
  const before=x.calls.length,set=await read(x);assert.equal(set.nodes.length,symbol==='2409'?442:398);assert.deepEqual(x.calls.slice(before).map(c=>c.name),['read_research_article_input_candidate_v3']);assert.deepEqual(x.calls.at(-1).args,{p_request:x.request});
  assert.equal(set.context.inputRevisionId,x.saved.revision_id);assert.equal(set.context.inputHash,x.saved.input_hash);assert.equal(set.context.bindingCapsuleIdentity,x.binding.bindingCapsuleIdentity);
  assert.equal(set.context.artifactReadKnownAt,x.readAt);assert.equal(set.context.originalModelCutoff,symbol==='2409'?'2026-10-08T10:20:00Z':'2026-10-08T12:12:00Z');
  for(const flag of ['valuationApproved','technicalAdmission','sourceClosureApproved','formalRightsVerified','authorReviewerVerified','publishableResearch','dispatchReady'])assert.equal(set.context[flag],false);
  assert.equal(set.context.forecastCash,null);assert.equal(set.context.noFutureCash,true);assert.ok(Object.values(set.context.originalCapabilities).every(v=>v===false));
  assert.ok(Object.isFrozen(set.nodes)&&Object.isFrozen(set.context));assert.throws(()=>{set.nodes[0].value=9;});
  for(const node of set.nodes)assert.equal(set.validateCitation(JSON.stringify(citation(set,node))),node);
 });
 test(`${symbol} all ${symbol==='2409'?104:66} cash cells resolve independently to BOTH exact original source pointers`,async()=>{
  const set=await read(x),reported=set.nodes.filter(n=>n.pointer.startsWith('/cash/reported/'));assert.equal(reported.length,symbol==='2409'?104:66);
  for(const n of reported){assert.equal(n.sourcePairs.length,1);assert.equal(n.sourcePairs[0].evidence.kind,'retained_cash_cell');assert.ok(Number.isInteger(n.sourcePairs[0].evidence.pdfPage));for(const pair of n.sourcePairs){assert.equal(resolve(pair.packetLocator),n.value);assert.equal(resolve(pair.modelLocator),n.value);}assert.equal(n.unit,'TWD_thousands');assert.equal(n.scenarioId,null);assert.ok(n.period==='2026-01-01/2026-06-30'||n.period==='2025-01-01/2025-06-30');}
 });
 test(`${symbol} independent expected cash bridge, group denominator, signed outlay and disposal/lease separation`,async()=>{
  const set=await read(x),v=p=>set.nodes.find(n=>n.pointer===p),cash=x.normalized.financialMaterial.projection.historicalCash.calculation;
  assert.equal(v('/cash/derived/cfo/0').value,symbol==='2409'?6877414:5044825);
  assert.equal(v('/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0').value,symbol==='2409'?1134612:-5661917);
  const r=cash.rows[0],f=r.operands;assert.equal(v('/cash/ratio/cfoToGroupNetProfit/0').value,f.operatingCash/f.netProfit);assert.notEqual(f.netProfit,f.ownersNetProfit);
  assert.equal(v('/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0').value,f.operatingCash+f.ppeCash+f.intangibleCash);
  assert.equal(v('/cash/derived/afterLeasePrincipalSensitivity/0').value,f.operatingCash+f.ppeCash+f.intangibleCash+f.leasePrincipal);
  assert.equal(v('/cash/derived/closingCash/0').value,f.openingCash+f.cashChange);assert.match(v('/cash/derived/cfoLessPpeAndIntangibleCashOutlay/0').basis,/not IFRS FCF, FCFE/);
  for(const n of set.nodes.filter(n=>n.pointer.startsWith('/cash/derived/')||n.pointer.startsWith('/cash/ratio/')))for(const pair of n.sourcePairs){assert.equal(resolve(pair.packetLocator),resolve(pair.modelLocator));}
 });
 test(`${symbol} 306 conditional scenario values retain periods/units and original model locators, never reported cash`,async()=>{
  const set=await read(x),nodes=set.nodes.filter(n=>n.classification==='conditional_scenario');assert.equal(nodes.length,306);
  for(const n of nodes){assert.equal(n.kind,'calculation');assert.equal(n.periodKind,'quarter');assert.equal(n.scenarioLocators.length,2);assert.equal(typeof resolve(n.scenarioLocators[0]),'object');assert.ok(Math.abs(resolve(n.scenarioLocators[1])-n.value)<=1e-6,n.pointer);assert.match(n.basis,/future assumptions/);assert.ok(!n.pointer.includes('cash'));}
 });
 test(`${symbol} capital is finite instant June issued basis; unavailable EMC cannot acquire AUO capital`,async()=>{
  const set=await read(x),nodes=set.nodes.filter(n=>n.pointer.startsWith('/capital/'));assert.equal(nodes.length,symbol==='2409'?8:0);assert.equal(set.context.capitalAvailable,symbol==='2409');
  for(const n of nodes){assert.equal(n.period,'2026-06-30');assert.equal(n.periodKind,'instant');assert.match(n.basis,/not_weighted_diluted_or_October/);for(const p of n.sourcePairs)assert.equal(resolve(p.packetLocator),resolve(p.modelLocator));}
  if(symbol==='2409'){assert.equal(nodes.find(n=>n.pointer.endsWith('/treasuryCarryingAmountTwdThousands')).value,0);assert.equal(nodes.find(n=>n.pointer==='/capital/derived/ownersEquityPerIssuedCommonShare').value,154397339/7547099);const issued=nodes.find(n=>n.pointer==='/capital/derived/issuedSharesThousands');assert.equal(issued.value,75470990/10);assert.equal(issued.kind,'calculation');assert.match(issued.basis,/not_direct_share_register/);}
 });
 test(`${symbol} unknown pointer, metadata/page/hash/date and namespace/type/unit/classification/crosswire mutations reject`,async()=>{
  const set=await read(x),n=set.nodes.find(n=>n.pointer==='/cash/reported/operatingCash/0'),good=citation(set,n);
  const patches=[{pointer:'/cash/references/0/pdfPage'},{pointer:'/cash/rawPdfSha256'},{pointer:'/capital/reported/instant'},{pointer:'/cash/reported/unknown/0'},{kind:'assumption'},{kind:'calculation'},{classification:'conditional_scenario'},{unit:'TWD_million'},{period:'2026Q2'},{periodKind:'quarter'},{value:n.value+1},{scenarioId:'base'},{symbol:symbol==='2409'?'2383':'2409'},{financialProfile:'latest'},{wireVersion:'research-article-input-v2'},{bindingCapsuleIdentity:hs},{inputRevisionId:uid(999)},{inputHash:hc},{requestHash:hc},{validated:true}];
  for(const patch of patches)assert.throws(()=>set.validateCitation(JSON.stringify({...good,...patch})),undefined,JSON.stringify(patch));
  const scenario=set.nodes.find(n=>n.classification==='conditional_scenario');assert.throws(()=>set.validateCitation(JSON.stringify({...citation(set,scenario),kind:'reported_observation'})));
 });
 test(`${symbol} unknown/missing sealed binding, wrong lineage/revision/hash and forged arithmetic reject before citation success`,async()=>{
  const changes=[v=>v.binding.core.symbol=symbol==='2409'?'2383':'2409',v=>delete v.binding,v=>v.revision_id=uid(999),v=>v.canonical_request.attempt=2,v=>v.canonical_payload.financial.material.projection.historicalCash.references[0].values[0]+=1,v=>v.canonical_payload.financial.material.projection.historicalCash.references[0].values.reverse(),v=>v.canonical_payload.financial.material.projection.historicalCash.references[0].packetLocator.fileSha256=hc,v=>v.canonical_payload.financial.material.projection.historicalCash.references[0].pdfPage+=1,v=>v.canonical_payload.financial.material.projection.historicalCash.calculation.rows[0].calculated.cfo+=1,v=>v.canonical_payload.financial.material.calculation.scenarios[0].quarters[0].revenue+=1,v=>v.canonical_payload.financial.material.provenance.forecastCash=1,v=>v.canonical_payload.financial.material.provenance.technicalAdmission=true,v=>v.canonical_payload.financial.material.projection.clocks.originalModelCutoff=x.readAt];
  for(const mutate of changes){const bad=structuredClone(x.saved);mutate(bad);bad.input_hash=completeHash(bad.canonical_payload);let count=0;await assert.rejects(x.consumer.read({async rpc(name){count++;assert.equal(name,'read_research_article_input_candidate_v3');return{data:bad,error:null};}},JSON.stringify(x.request),x.saved.revision_id,bad.input_hash));assert.equal(count,1);}
 });
}
test('primitive citation ingress rejects duplicate keys, oversized/unknown objects without getters',async()=>{
 const set=await read(fixtures.get('2409')),good=JSON.stringify(citation(set,set.nodes[0]));let touched=0;const proxy=new Proxy({},{get(){touched++;throw Error('get');},ownKeys(){touched++;throw Error('keys');}});
 for(const input of [proxy,new Map(),good.replace('{','{"kind":"reported_observation",'),' '.repeat(4097),'"'+'漢'.repeat(2000)+'"'])assert.throws(()=>set.validateCitation(input));assert.equal(touched,0);
 const missing=JSON.parse(good);delete missing.unit;assert.throws(()=>set.validateCitation(JSON.stringify(missing)));
});
test('old77/v2, forged validated flags and request-selected paths cannot bypass actual READ composition',async()=>{
 const x=fixtures.get('2409');let calls=0;const db={rpc:async()=>{calls++;throw Error('no IO');}};
 for(const req of [{...x.request,expectedCalculatorExecutionHash:'77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41'},{...x.request,validated:true},{...x.request,root:'/tmp'}])await assert.rejects(x.consumer.read(db,JSON.stringify(req),x.saved.revision_id,x.saved.input_hash));assert.equal(calls,0);
 const c=JSON.parse(x.text);c.wireVersion='research-article-input-v2';assert.throws(()=>createV3CashCitationConsumer({bindingTexts:[bindingCanonical(c)],executorFingerprint:hc}));
});
test('actual READ revocation/error/absent is never turned into a citation set or seal',async()=>{
 const x=fixtures.get('2383');for(const result of [{data:null,error:{code:'P0001',message:'source_seal_invalidated_or_missing'}},{data:{status:'absent',dispatchReady:false},error:null}]){const calls=[];await assert.rejects(x.consumer.read({rpc:async name=>{calls.push(name);return result;}},JSON.stringify(x.request),x.saved.revision_id,x.saved.input_hash));assert.deepEqual(calls,['read_research_article_input_candidate_v3']);}
});
test('zero group denominator remains unavailable in existing fixed calculator; cannot inject replacement pinned cash',async()=>{
 const x=fixtures.get('2383'),cash=x.normalized.financialMaterial.projection.historicalCash,refs=cash.references;
 const facts=Object.fromEntries(refs.map(r=>[r.metric,[...r.values]]));facts.netProfit=[0,0];facts.ownersNetProfit=[0,0];facts.nonControllingNetProfit=[0,0];
 const c=calculateHistoricalCash({schemaVersion:'historical-cash-operands-v1',symbol:'2383',unit:'TWD_thousands',consolidated:true,grain:'half_year_cumulative',periods:['2026-01-01/2026-06-30','2025-01-01/2025-06-30'],facts,capital:null});
 for(const r of c.rows){assert.equal(r.ratio.value,null);assert.equal(r.ratio.unavailableReason,'zero_group_net_profit');}
 const bad=structuredClone(x.saved);bad.canonical_payload.financial.material.projection.historicalCash.calculation=c;bad.input_hash=completeHash(bad.canonical_payload);
 await assert.rejects(x.consumer.read({rpc:async()=>({data:bad,error:null})},JSON.stringify(x.request),bad.revision_id,bad.input_hash));
});

test('unavailable AUO ROU/EMC capital and metadata cannot become reported amounts; locators remain metadata',async()=>{
 for(const symbol of ['2409','2383']){const set=await read(fixtures.get(symbol));for(const n of set.nodes){if(n.classification==='conditional_scenario')assert.equal(n.scenarioLocators.length,2);else assert.ok(n.sourcePairs.length>0);}
  const good=citation(set,set.nodes[0]);for(const pointer of ['/capital/reported/treasurySharesThousands','/capital/reported/issuedSharesThousands','/cash/reported/pdfPage/0','/cash/reported/sourceLineSha256/0','/cash/reported/byteCount/0'])assert.throws(()=>set.validateCitation(JSON.stringify({...good,pointer})));
  if(symbol==='2409')for(const pointer of set.context.unavailableAmounts)assert.throws(()=>set.validateCitation(JSON.stringify({...good,pointer,value:null})));
  else{assert.equal(set.context.capitalUnavailableReason,'no_retained_EMC_capital_tuple');assert.throws(()=>set.validateCitation(JSON.stringify({...good,pointer:'/capital/derived/ownersEquityPerIssuedCommonShare'})));}
 }
});
test('validated set detaches from subsequent RPC object mutation; no external object validation shortcut',async()=>{
 const x=fixtures.get('2409'),mutable=structuredClone(x.saved),set=await x.consumer.read({rpc:async()=>({data:mutable,error:null})},JSON.stringify(x.request),mutable.revision_id,mutable.input_hash),n=set.nodes[0],before=JSON.stringify(n);
 mutable.canonical_payload.financial.material.projection.historicalCash.references[0].values[0]+=1;assert.equal(JSON.stringify(n),before);assert.equal(set.validateCitation(JSON.stringify(citation(set,n))),n);
 let calls=0;const db={rpc:async()=>{calls++;throw Error('unreachable');}};await assert.rejects(x.consumer.read(db,{validated:true,request:x.request},x.saved.revision_id,x.saved.input_hash));assert.equal(calls,0);
});
