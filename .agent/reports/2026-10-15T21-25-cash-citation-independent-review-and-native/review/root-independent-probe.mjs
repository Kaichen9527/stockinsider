// Pure consumer contracts over real pinned bytes; RPC responses are synthetic.
// No native DB/role/fence or publication approval is represented by these fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createV3CashCitationConsumer} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-article-citations.ts';
import {bindingCanonical,bindingSha,fixedBindingInputs,parseBindingCore} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-versioned-input-binding.ts';
import {completeHash} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-material-canonical.ts';
import {historicalCashPins as pins} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-historical-cash-pins.ts';
import {projectScenarioCashMaterial} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-scenario-cash-material.ts';
import {normalizeScenarioCashMaterial} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-finite-material.ts';
import {calculateHistoricalCash} from '/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-historical-cash-core.ts';
const sha=b=>createHash('sha256').update(b).digest('hex'),noop={check(){}};
const gz=fs.readFileSync(new URL('file:///tmp/stockinsider-discovery-release-root-review-oct14/scripts/fixtures/research-historical-cash/pinned-source-15d4ef54.json.gz',import.meta.url));
assert.equal(sha(gz),'afedf2d089958abf289a9e407f789621b34e0f33a8c096ddb0835475fb0f518f');
const files=JSON.parse(gunzipSync(gz,{maxOutputLength:2000000})).files;
assert.equal(files.length,15);
for(const {pin,rawBase64}of files){const b=Buffer.from(rawBase64,'base64');assert.equal(b.length,pin.bytes);assert.equal(sha(b),pin.sha256);}
const raw=new Map(files.map(f=>[f.pin.path,JSON.parse(Buffer.from(f.rawBase64,'base64'))]));
const hs=sha(fs.readFileSync(new URL('/tmp/stockinsider-discovery-release-root-review-oct14/web/src/lib/research-v3-article-citations.ts',import.meta.url))),hc=sha(fs.readFileSync(process.execPath)); // engineering identities, NOT whole source/compiled Next approval
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

let groups=0;
for(const symbol of ['2409','2383']){
 const x=fixtures.get(symbol);const set=await read(x);
 const refs=x.normalized.financialMaterial.projection.historicalCash.references;
 const ordinals=refs.filter(r=>r.metric==='openingCash'||r.metric==='closingCash');
 for(const ref of ordinals)for(let i=0;i<2;i++){
  const n=set.nodes.find(n=>n.pointer===`/cash/reported/${ref.metric}/${i}`);
  assert.equal(n.periodKind,ref.metric==='openingCash'?'opening_cash_balance':'closing_cash_balance');
  assert.throws(()=>set.validateCitation(JSON.stringify({...citation(set,n),periodKind:'half_year_cumulative'})));
 }
 groups++;
 const first=set.nodes[0],good=JSON.stringify(citation(set,first));
 assert.throws(()=>set.validateCitation(good.replace('"pointer":','"pointer":"/cash/reported/fake/0","pointer":')));
 const unknown=JSON.parse(x.text);unknown.symbol=symbol==='2409'?'2383':'2409';
 assert.throws(()=>createV3CashCitationConsumer({bindingTexts:[bindingCanonical(unknown)],executorFingerprint:hc}));groups++;
 const all=new Set(set.nodes.map(n=>n.pointer));assert.equal(all.size,set.nodes.length);
 for(const node of set.nodes){assert.ok(Object.isFrozen(node));if(node.sourcePairs.length){for(const pair of node.sourcePairs){assert.ok(Object.isFrozen(pair));assert.equal(resolve(pair.modelLocator),resolve(pair.packetLocator));}}}
 groups++;
 const ratio=set.nodes.find(n=>n.pointer==='/cash/ratio/cfoToGroupNetProfit/0');assert.equal(ratio.unit,'dimensionless');assert.throws(()=>set.validateCitation(JSON.stringify({...citation(set,ratio),unit:'TWD_per_share'})));groups++;
}
console.log(JSON.stringify({rootIndependentGroups:groups,pass:groups,fail:0,notNative:true,fixturePrefixReused:true,checks:'separate opening-closing kind, duplicate pointer, swapped trusted tuple rejects, all source chains/freeze, ratio unit rejection'}));
