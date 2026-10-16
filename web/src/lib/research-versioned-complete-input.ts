import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {createCompatibleFinancialReader} from './research-compatible-financial-reader.ts';
import {createCandidateFinancialReaders} from './research-cash-financial-reader.ts';
import {parseBindingCore,type InputRow as Row,bindingCanonical} from './research-versioned-input-binding.ts';
import {completeEnsure as ensure,completeHash,validateCompleteSchema} from './research-v3-material-canonical.ts';
import {parseCompleteRequest,type CompleteRequest} from './research-versioned-input-request.ts';
import {validateHistoricalCompleteResponse} from './research-versioned-input-legacy-response.ts';
const historical='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41';
const capabilityKeys=['dispatchReady','entryEligible','financialVerified','historicalPITEligible','modelDispatched','publishableResearch','researchQualified','strategyApproved'];
type RpcResult={data:unknown;error:unknown};
// Dedicated trusted server dependency: promise must settle only when actual DB work settles.
// Do not inject a timeout facade that resolves early while the real query remains alive.
export type VersionedInputRpc={rpc(name:string,args:Row):Promise<RpcResult>};
const row=(v:unknown):Row=>{ensure(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;};
const equal=(a:unknown,b:unknown)=>ensure(completeHash(a)===completeHash(b));
/** Pure retained-response validation only. Authority comes from the calling current fenced RPC. */
export function createRetainedCandidateResponseValidator(bindings:readonly ReturnType<typeof parseBindingCore>[]) {
 const select=(request:CompleteRequest,symbol:unknown)=>{const matches=bindings.filter(b=>b.core.symbol===symbol&&b.core.inventoryHash===request.expectedArtifactManifestHash&&b.bindingCapsuleIdentity===request.expectedCalculatorExecutionHash);ensure(matches.length===1);return matches[0];};
 function validate(request:CompleteRequest,response:Row) {
  ensure(response.dispatchReady===false&&(response.status==='absent'||response.status==='sealed'));
  const absent=response.status==='absent',p=absent?row(row(response.preparation).payload):row(response.canonical_payload),symbol=absent?p.symbol:row(p.researchIdentity).symbol;
  const b=select(request,symbol);ensure(bindingCanonical(response.binding)===bindingCanonical(b));
  if(absent){const prep=row(response.preparation),old=row(prep.request);const {sourceDocumentIds,bundleId,...lineage}=old;void sourceDocumentIds;
   const {preparationId,preparationHash,expectedArtifactManifestHash,expectedCalculatorExecutionHash,...wanted}=request;void expectedArtifactManifestHash;void expectedCalculatorExecutionHash;
   ensure(bundleId===null);equal(lineage,wanted);ensure(prep.preparation_id===preparationId&&prep.input_hash===preparationHash&&prep.dispatchReady===false);
   ensure(typeof response.contextHash==='string'&&/^[a-f0-9]{64}$/u.test(response.contextHash));return b;
  }
  equal(response.canonical_request,request);ensure(response.request_hash===completeHash(request)&&response.input_hash===completeHash(p));
  ensure(response.job_id===request.jobId&&response.attempt===request.attempt&&response.reservation_id===request.reservationId&&response.preparation_id===request.preparationId&&response.snapshot_hash===request.snapshotHash&&response.research_scope===request.scope);
  ensure(p.schemaVersion===b.core.wireVersion&&p.assemblyStatus==='complete'&&p.evidenceStatus==='incomplete'&&p.producerAttribution==='internal_controller_asserted');
  const identity=row(p.researchIdentity),prep=row(p.preparation),job=row(p.originalJob),reservation=row(p.originalReservation);
  ensure(identity.researchCompanyId===response.research_company_id&&identity.scope===request.scope&&identity.snapshotHash===request.snapshotHash&&prep.id===request.preparationId&&prep.inputHash===request.preparationHash&&job.jobId===request.jobId&&job.owner===request.owner&&job.attempt===request.attempt&&reservation.reservationId===request.reservationId);
  const capabilities=row(p.capabilities);ensure(Object.keys(capabilities).sort().join(',')===capabilityKeys.join(',')&&Object.values(capabilities).every(v=>v===false));
  const f=row(p.financial),m=row(f.material),projection=row(m.projection),calculation=row(m.calculation),clocks=row(p.clocks),h=row(p.hashes);
  equal(f.artifactInventory,b.registration.inventory);equal(h,{preparationInputHash:request.preparationHash,artifactInventoryHash:b.core.inventoryHash,modelHistoricalCanonicalHash:b.registration.historicalHash,sourceManifestHash:completeHash(projection.sourceManifest),projectionHash:completeHash(projection),scenarioInputHash:completeHash(row(projection.projected).scenarios),resultHash:completeHash(calculation),sourceClosureHash:b.core.sourceExecutionHash});
  let material:Row;
  if(b.core.wireVersion==='research-article-input-v3'){equal(f.protocol,{...b.core,bindingCapsuleIdentity:b.bindingCapsuleIdentity});material={...row(f.candidate),financialMaterial:m};}
  else material={schemaVersion:'research-complete-financial-material-v2',symbol:b.core.symbol,artifactReadKnownAt:clocks.artifactReadKnownAt,sourceClosureHash:b.core.sourceExecutionHash,artifactInventoryHash:b.core.inventoryHash,financialMaterial:m};
  validateCompleteSchema(material,b.registration.schemaTemplate as Row,String(clocks.artifactReadKnownAt));return b;
 }
 return validate;
}
export function createVersionedCompleteInputController(config:{bindingTexts:readonly string[];executorFingerprint:string;roots:{'original75d-fixed8or6':string;'historical15d4-fixed9or7':string}}) {
 ensure(Array.isArray(config.bindingTexts)&&config.bindingTexts.length<=4&&/^[a-f0-9]{64}$/u.test(config.executorFingerprint));
 const bindings=config.bindingTexts.map(parseBindingCore);ensure(new Set(bindings.map(b=>b.bindingCapsuleIdentity)).size===bindings.length);
 // Capture trusted primitive selectors, not mutable caller configuration.
 const executor=config.executorFingerprint,roots=Object.freeze({...config.roots});
 const validate=createRetainedCandidateResponseValidator(bindings);
 return Object.freeze({
  async runCompleteInput(db:VersionedInputRpc,input:unknown,seal:boolean,deadline=new FinancialIoDeadline()):Promise<Row>{
   const request=parseCompleteRequest(input);ensure(Buffer.byteLength(JSON.stringify(request))<=8192);
   // Request tuple validation before any DB call. Parent symbol is checked independently below.
   if(request.expectedCalculatorExecutionHash!==historical)ensure(bindings.some(b=>b.bindingCapsuleIdentity===request.expectedCalculatorExecutionHash&&b.core.inventoryHash===request.expectedArtifactManifestHash));
   const rpc=async(name:string,args:Row)=>{deadline.check();const work=Promise.resolve().then(()=>{deadline.check();return db.rpc(name,args);});work.catch(()=>{});const result=await deadline.wait(work);ensure(!result.error);return row(result.data);};
   const before=await rpc('read_research_article_input_candidate_v3',{p_request:request});
   if(request.expectedCalculatorExecutionHash===historical){validateHistoricalCompleteResponse(request,before);if(before.status==='absent'&&seal)throw Error('original_fresh_v2_requires_retained_execution_realm');return before;}
   const b=validate(request,before);deadline.check();if(before.status==='sealed'||!seal)return before;
   ensure(b.core.compiledFingerprintIdentity===executor);const contextHash=String(before.contextHash);
   // Unraced RPC promise is tracked by runFinancialIoSession until real settlement.
   const assertion=async()=>{deadline.check();const result=await db.rpc('assert_research_input_candidate_v3',{p_request:request,p_context_hash:contextHash});ensure(!result.error);const c=row(result.data);ensure(c.contextHash===contextHash);ensure(bindingCanonical(c.binding)===bindingCanonical(b));return contextHash;};
   let material:Row;
   if(b.core.wireVersion==='research-article-input-v2'){
    const result=await createCompatibleFinancialReader(roots[b.core.artifactRootId],assertion).read(b.core.financialProfile,b.core.symbol,deadline);
    material={schemaVersion:'research-complete-financial-material-v2',symbol:b.core.symbol,artifactReadKnownAt:result.artifactReadKnownAt,sourceClosureHash:b.core.sourceExecutionHash,artifactInventoryHash:b.core.inventoryHash,financialMaterial:result.financialMaterial};
   } else {material=(await createCandidateFinancialReaders(roots[b.core.artifactRootId]).completeScenarioCash(b.core.financialProfile,b.core.symbol,assertion,deadline)).material;}
   validateCompleteSchema(material,b.registration.schemaTemplate as Row,String(material.artifactReadKnownAt));deadline.check();
   const saved=await rpc('seal_research_article_input_candidate_v3',{p_request:request,p_calculation:material,p_context_hash:contextHash});validate(request,saved);ensure(saved.status==='sealed');deadline.check();return saved;
  },
 });
}
