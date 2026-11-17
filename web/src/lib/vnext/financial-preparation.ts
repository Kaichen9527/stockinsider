import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {requireExactInternalBearer} from '../internal-auth.ts';
import {requireActiveVpsWriter} from '../taiwan-data-runtime.ts';
import {acquireProductionWriteLease,releaseProductionWriteLease} from '../production-write-lease.ts';
import {privateArtifactStore} from '../private-artifact-store.ts';
import {fixedRunnerPrincipal} from '../opportunity-v3/internal.ts';
import {readCandidateFinancialArtifact} from '../candidate-financial-artifact.ts';
import {candidateFinancialFactsFromValidatedManifest,validateCandidateFinancialDocument} from '../candidate-financial-documents.ts';
import {fetchPreparedCandidateMopsFiling,fetchPreparedOfficialFinancialPayload,candidateParsedExchangeFinancialFact,candidateFinancialFactInput} from '../candidate-official-financials.ts';
import {parseExchangeFinancialEndpoint} from '../candidate-financial-acquisition.ts';
import {runPreparedFinancialLocalParser} from '../candidate-financial-local-parser.ts';
import {candidateFinancialParserEvidence,candidateFinancialDocumentFactInput} from '../candidate-financial-document-worker.ts';
import {validatePendingOfficialFinancials} from '../official-financial-validation-worker.ts';
import {vnextEnabled} from './policy.ts';
import {vnextIdentity} from './auth.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {FINANCIAL_PREPARATION_RPC,FINANCIAL_PREPARATION_SCHEMA,parsePreparationContext,parsePreparationAttempt,preparationData,preparationExact,preparationUuid,preparationProfile,type PreparationAttempt,type PreparationContext,type PreparationOperation} from './financial-preparation-contract.ts';
type Client=Extract<Awaited<ReturnType<typeof requireActiveVpsWriter>>,{ok:true}>['supabase'];
type Row=Record<string,unknown>;
type Capability=Readonly<object>;
type Scope={attempt:PreparationAttempt;context:PreparationContext;client:Client;operator:string|null;lease:string|null;signal:AbortSignal;phase:'stage'|'commit'|'settled'};
const scopes=new WeakMap<Capability,Scope>();
class PreparationFailure extends Error{readonly reason:string;constructor(reason:string){super(reason);this.reason=reason;}}
function fail(reason:string):never{throw new PreparationFailure(reason);}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const reply=(status:number,value:unknown)=>NextResponse.json(value,{status,headers:{'cache-control':'no-store'}});
function scopeOf(capability:unknown){if(!capability||typeof capability!=='object')return fail('financial_preparation_capability_required');const scope=scopes.get(capability);if(!scope)return fail('financial_preparation_capability_required');return scope;}
async function rpc(scope:Pick<Scope,'client'|'operator'>&{signal?:AbortSignal},command:string,request:Row,lease:string|null=null){
 preparationData(request);
 const query=scope.client.rpc(FINANCIAL_PREPARATION_RPC,{p_operator:scope.operator,p_command:command,p_request:request,p_lease_owner:lease});
 const result=await(scope.signal&&typeof query.abortSignal==='function'?query.abortSignal(scope.signal):query);
 if(result.error?.message==='financial_preparation_legacy_validation_bridge_missing')fail('financial_preparation_legacy_validation_bridge_missing');
 if(result.error)fail(['42883','PGRST202','42P01','PGRST205'].includes(String(result.error.code))?'financial_preparation_bridge_unavailable':'financial_preparation_database_rejected');
 preparationData(result.data);return result.data;
}
function sameContext(a:PreparationContext,b:PreparationContext){return a.mode===b.mode&&a.backendId===b.backendId&&a.releaseId===b.releaseId&&a.runnerPrincipal===b.runnerPrincipal;}
function inspected(v:unknown,scope:Scope){
 if(!preparationExact(v,'context attemptId state commit')||v.attemptId!==scope.attempt.attemptId||!['claimed','committed','finished','known','expired'].includes(String(v.state)))fail('financial_preparation_inspection_invalid');
 if(!sameContext(parsePreparationContext(v.context),scope.context))fail('financial_preparation_mode_or_backend_changed');
 return v;
}
/** The only capabilities originate below, after a fixed real SQL claim. Neither
 * an arbitrary context nor caller callback/boolean can register one. */
export async function verifyFinancialPreparation(capability:unknown,expected:{operation:PreparationOperation;symbol?:string;sourceUrl?:string;artifactHash?:string;periodEnd?:string;minimumRemainingMs?:number}){
 const scope=scopeOf(capability),a=scope.attempt;
 if(scope.phase!=='stage'||scope.lease!==null||a.operation!==expected.operation||expected.symbol!==undefined&&expected.symbol!==a.symbol||expected.sourceUrl!==undefined&&expected.sourceUrl!==a.sourceUrl
  ||expected.artifactHash!==undefined&&expected.artifactHash!==a.artifact?.hash||expected.periodEnd!==undefined&&expected.periodEnd!==a.periodEnd)fail('financial_preparation_scope_mismatch');
 const deadline=Number(evidenceInstant(a.deadline)!/BigInt(1000));
 if(deadline-Date.now()<(expected.minimumRemainingMs??1))fail('financial_preparation_deadline');
 const current=inspected(await rpc(scope,'inspect',{attemptId:a.attemptId}),scope);if(current.state!=='claimed')fail('financial_preparation_attempt_not_claimed');
 const remaining=deadline-Date.now();
 if(remaining<(expected.minimumRemainingMs??1))fail('financial_preparation_deadline');
 return remaining;
}
async function owned<T>(scope:Pick<Scope,'client'|'operator'>,work:(lease:string)=>Promise<T>){
 const lease=await acquireProductionWriteLease(120).catch(()=>fail('financial_preparation_lease_unavailable'));
 if(!lease)fail('financial_preparation_busy');
 try{return await work(lease);}finally{try{await releaseProductionWriteLease(lease);}catch{fail('financial_preparation_release_uncertain');}}
}
async function bodyLimit(request:Request,operation:PreparationOperation){
 const reader=request.body?.getReader();if(!reader)fail('financial_preparation_limit_required');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8192){await reader.cancel();fail('financial_preparation_body_too_large');}chunks.push(next.value);}}finally{reader.releaseLock();}
 let value:unknown;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{return fail('financial_preparation_invalid_json');}
 preparationData(value);if(!preparationExact(value,'limit')||!Number.isInteger(value.limit)||Number(value.limit)<1||Number(value.limit)>(operation==='acquire'?240:20))fail('financial_preparation_limit_required');return Number(value.limit);
}
function commitEnvelope(value:unknown,a:PreparationAttempt){
 if(!preparationExact(value,'attemptId receiptId subjectIdentities')||value.attemptId!==a.attemptId||!(value.receiptId===null||preparationUuid(value.receiptId))||!Array.isArray(value.subjectIdentities)||value.subjectIdentities.length>128)fail('financial_preparation_commit_receipt_invalid');
 const identities=value.subjectIdentities.map(v=>{if(!preparationExact(v,'factId recordedAt')||!preparationUuid(v.factId)||typeof v.recordedAt!=='string'||evidenceInstant(v.recordedAt)===null)fail('financial_preparation_fact_identity_invalid');return {factId:v.factId,recordedAt:v.recordedAt};});
 if(new Set(identities.map(v=>`${v.factId}:${evidenceInstant(v.recordedAt)}`)).size!==identities.length)fail('financial_preparation_fact_identity_invalid');
 return {attemptId:a.attemptId,receiptId:value.receiptId as string|null,subjectIdentities:identities};
}
/** Existing validator retains every peer/cohort and all financial math. Only its
 * selected persisted identities can reach the new exact-owned SQL write gate. */
async function validateSubjects(scope:Scope,identities:Array<{factId:string;recordedAt:string}>){
 if(!identities.length)return {status:'partial' as const};
 const client=new Proxy(scope.client,{get(target,key){
  if(key==='from')return (table:string)=>{const builder=target.from(table);return new Proxy(builder,{get(query,property){
   if(property==='select')return (...args:unknown[])=>Reflect.apply(query.select,query,args).abortSignal(scope.signal);
   const value=Reflect.get(query,property,query);return typeof value==='function'?value.bind(query):value;
  }});};
  if(key==='rpc')return async(name:string,args:Row)=>{
  if(name!=='record_official_financial_validation')return fail('financial_preparation_validation_operation_forbidden');
  const result=await owned(scope,lease=>rpc(scope,'validation-write',{attemptId:scope.attempt.attemptId,payload:args},lease));
  if(!preparationExact(result,'procedureResult')||typeof result.procedureResult!=='boolean')fail('financial_preparation_validation_receipt_invalid');
  return {data:result.procedureResult,error:null};
 };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 return validatePendingOfficialFinancials([scope.attempt.stockId],{client,runnerPrincipal:()=>scope.context.runnerPrincipal,subjectIdentities:identities,acknowledgeSubject:async value=>{await owned(scope,lease=>rpc(scope,'validation-ack',{attemptId:scope.attempt.attemptId,payload:{p_fact_id:value.factId,p_recorded_at:value.recordedAt,p_source_sha256:value.sourceSha256,p_input_hash:value.inputHash}},lease));}});
}
async function stage(capability:Capability){
 const scope=scopeOf(capability),a=scope.attempt,profile=preparationProfile(a);if(!profile)fail('financial_preparation_resource_unmapped');
 if(a.operation==='acquire'){
  await verifyFinancialPreparation(capability,{operation:'acquire',minimumRemainingMs:15000});
  if(profile.kind==='document'){
   const year=Number(a.periodEnd.slice(0,4)),quarter=['03-31','06-30','09-30','12-31'].indexOf(a.periodEnd.slice(5))+1;
   const fetched=await fetchPreparedCandidateMopsFiling(capability,{stockId:a.stockId,symbol:a.symbol,exchange:a.exchange,statementKind:a.statementKind},year,quarter);
   return {bytes:Buffer.from(fetched.document.bytes),mediaType:fetched.document.contentType,observedAt:fetched.document.collectedAt,facts:null,parse:null};
  }
  const fetched=await fetchPreparedOfficialFinancialPayload(capability,a.sourceUrl),observedAt=new Date().toISOString();
  const parsed=parseExchangeFinancialEndpoint(profile.provider,profile.endpoint,JSON.parse(fetched.body));if(parsed.terminalReason!=='complete')fail('financial_preparation_schema_unrecognized');
  const facts=parsed.facts.filter(f=>f.symbol===a.symbol&&f.periodEnd===a.periodEnd).map(f=>candidateParsedExchangeFinancialFact(f,{stockId:a.stockId,symbol:a.symbol,exchange:a.exchange},observedAt));
  if(!facts.length)fail('financial_preparation_requested_period_missing');
  return {bytes:Buffer.from(fetched.rawBytes),mediaType:'application/json',observedAt,facts:facts.map(f=>({input:candidateFinancialFactInput(f),locator:{source_ref:f.sourceRef,period_end:f.periodEnd,fact_key:f.factKey,...f.locator},validation:null})),parse:null};
 }
 if(!a.artifact)fail('financial_preparation_artifact_missing');
 await verifyFinancialPreparation(capability,{operation:'parse',artifactHash:a.artifact.hash,minimumRemainingMs:30000});
 const bytes=Buffer.from(await readCandidateFinancialArtifact({client:scope.client,objectKey:a.artifact.objectKey,sha256:a.artifact.hash}));
 try{
  if(bytes.length!==a.artifact.bytes||sha(bytes)!==a.artifact.hash)fail('financial_preparation_artifact_integrity');
  const verified=validateCandidateFinancialDocument({bytes,contentType:a.artifact.mediaType});if('error' in verified)fail('financial_preparation_artifact_format');
  const parse=await runPreparedFinancialLocalParser(capability,{bytes,documentSha256:a.artifact.hash,format:verified.format,expectedEntity:a.symbol,expectedPeriodEnd:a.periodEnd});
  const observedAt=new Date().toISOString();const missing=[...parse.missingRequirements];
  const facts=verified.format==='pdf'?[]:candidateFinancialFactsFromValidatedManifest({bytes,parse,documentSha256:a.artifact.hash,candidate:{stockId:a.stockId,symbol:a.symbol,exchange:a.exchange},periodEnd:a.periodEnd,sourceUrl:a.sourceUrl,collectedAt:observedAt});
  if(verified.format==='pdf')missing.push('pdf_financial_extraction_not_supported_requires_verified_xbrl');if(!facts.length)missing.push('no_verified_financial_facts_extracted');
  if(parse.status==='partial')missing.push('document_structural_validation_incomplete');
  return {bytes:Buffer.from(bytes),mediaType:a.artifact.mediaType,observedAt,facts:null,parse:{facts:facts.map(f=>({input:candidateFinancialDocumentFactInput(f),locator:f.locator||{}})),locators:parse.locators,
   evidence:candidateFinancialParserEvidence(parse,a.artifact.hash),missing:[...new Set(missing)],rejections:[]}};
 }finally{bytes.fill(0);}
}
async function finishCommitted(scope:Scope,committed:ReturnType<typeof commitEnvelope>,state:'committed'|'finished'){
 const validation=state==='finished'?{status:'success' as const}:committed.subjectIdentities.length?await validateSubjects(scope,committed.subjectIdentities):{status:'partial' as const};
 if(state!=='finished')await owned(scope,lease=>rpc(scope,'finish',{attemptId:scope.attempt.attemptId},lease));
 // A separate post-return transaction witnesses knowledge of committed facts.
 const known=await owned(scope,lease=>rpc(scope,'witness',{attemptId:scope.attempt.attemptId},lease));
 if(!preparationExact(known,'attemptId status availableAt')||known.attemptId!==scope.attempt.attemptId||!['validated','acquired_pending_parse','partial','rejected'].includes(String(known.status))||typeof known.availableAt!=='string'||evidenceInstant(known.availableAt)===null)fail('financial_preparation_knowledge_invalid');
 return {attemptId:scope.attempt.attemptId,status:known.status==='validated'&&validation.status!=='success'?'partial':known.status,availableAt:known.availableAt,validation:state==='finished'?'existing_terminal_receipt':validation.status};
}
async function processAttempt(scope:Scope){
 const capability=Object.freeze({});scopes.set(capability,scope);let staged:Awaited<ReturnType<typeof stage>>|null=null;
 try{
  staged=await stage(capability);const hash=sha(staged.bytes);scope.phase='commit';
  const committed=await owned(scope,async lease=>{
   scope.lease=lease;
   try{
    const checked=inspected(await rpc(scope,'commit-check',{attemptId:scope.attempt.attemptId},lease),scope);if(checked.state!=='claimed')fail('financial_preparation_attempt_not_claimed');
    // Local hash-addressed persistence is not an HTTP storage upload. Its DB
    // receipt is registered atomically by the purpose-specific commit RPC.
    const root=process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;if(!root)fail('financial_preparation_artifact_root_unavailable');
    await privateArtifactStore(root).put(hash,staged!.bytes);
    const common={attemptId:scope.attempt.attemptId,artifactHash:hash,byteLength:staged!.bytes.length,mediaType:staged!.mediaType,observedAt:staged!.observedAt};
    const response=scope.attempt.operation==='acquire'?await rpc(scope,'commit-acquire',{...common,facts:staged!.facts},lease)
     :await rpc(scope,'commit-parse',{...common,payload:staged!.parse},lease);
    return commitEnvelope(response,scope.attempt);
   }finally{scope.lease=null;}
  });
  return await finishCommitted(scope,committed,'committed');
 }catch(error){
  // A failed response may follow a successful transaction. Inspect first and
  // conserve terminal work; never blindly retry fetch/commit or mark it failed.
  let state='unknown';try{state=String(inspected(await rpc(scope,'inspect',{attemptId:scope.attempt.attemptId}),scope).state);}catch{/* remains explicitly uncertain */}
  if(state==='claimed'&&scope.phase==='stage'&&!(error instanceof PreparationFailure&&/database|mode|scope|deadline|capability/u.test(error.reason))){
   const reason=scope.attempt.operation==='parse'?'parser_unavailable':error instanceof PreparationFailure&&error.reason==='financial_preparation_requested_period_missing'?'requested_period_missing':error instanceof PreparationFailure&&error.reason==='financial_preparation_schema_unrecognized'?'official_schema_unrecognized':'official_transport_failed';
   try{
    await owned(scope,lease=>rpc(scope,'settle-failure',{attemptId:scope.attempt.attemptId,reason},lease));
    const known=await owned(scope,lease=>rpc(scope,'witness',{attemptId:scope.attempt.attemptId},lease));
    if(preparationExact(known,'attemptId status availableAt')&&known.attemptId===scope.attempt.attemptId&&known.status==='deferred'&&typeof known.availableAt==='string'&&evidenceInstant(known.availableAt)!==null)return {attemptId:scope.attempt.attemptId,status:'deferred',availableAt:known.availableAt,reason};
   }catch{/* Preserve pending when even failure settlement is uncertain. */}
  }
  return {attemptId:scope.attempt.attemptId,status:'pending',availableAt:null,reason:error instanceof PreparationFailure?error.reason:'financial_preparation_stage_failed',observedState:state};
 }finally{staged?.bytes.fill(0);scope.phase='settled';scopes.delete(capability);}
}
/** Dedicated authenticated preparation entry, in BOTH modes. No generic enqueue,
 * research author context, models, financial qualification or ranking writes. */
export async function handleFinancialDataPreparation(request:Request,operation:PreparationOperation){
 if(!requireExactInternalBearer(request))return reply(401,{ok:false,error:'exact_internal_bearer_required'});
 const enabled=vnextEnabled(),identity=vnextIdentity(request);
 if(enabled&&identity?.role!=='operator')return reply(403,{ok:false,error:'financial_preparation_operator_required'});
 try{
  const limit=await bodyLimit(request,operation),writer=await requireActiveVpsWriter();if(!writer.ok)return reply(409,{ok:false,error:writer.error});
  const actor={client:writer.supabase,operator:identity?.role==='operator'?identity.principal:null};
  const context=parsePreparationContext(await rpc(actor,'context',{}));
  if(context.mode!==(enabled?'vnext_on':'legacy_off')||context.releaseId!==writer.releaseId||context.runnerPrincipal!==fixedRunnerPrincipal())fail('financial_preparation_mode_or_backend_changed');
  const results:Row[]=[];const started=Date.now();const budget=Math.min(limit,20);let claimed=0,recovered=0;
  const batchDurationMs = operation === 'parse' ? 210_000 : 120_000;
  const claimWindowMs = operation === 'parse' ? 180_000 : 90_000;
  const remainingBatch = () => batchDurationMs - (Date.now() - started);
  const recovery=await owned(actor,lease=>rpc(actor,`recover-${operation}`,{limit:budget},lease));
  if(!preparationExact(recovery,'context pending known blockedCount')||!sameContext(parsePreparationContext(recovery.context),context)||!Array.isArray(recovery.pending)||recovery.pending.length>budget||!Array.isArray(recovery.known)||recovery.known.length>20||!Number.isSafeInteger(recovery.blockedCount)||Number(recovery.blockedCount)<0)fail('financial_preparation_recovery_invalid');
  const known=recovery.known.map(value=>{if(!preparationExact(value,'attemptId status availableAt')||!preparationUuid(value.attemptId)||!['validated','acquired_pending_parse','partial','rejected','deferred'].includes(String(value.status))||typeof value.availableAt!=='string'||evidenceInstant(value.availableAt)===null)fail('financial_preparation_knowledge_invalid');return value;});
  for(const entry of recovery.pending){
   if(!preparationExact(entry,'attempt commit state')||!['committed','finished'].includes(String(entry.state)))fail('financial_preparation_recovery_invalid');
   const attempt=parsePreparationAttempt(entry.attempt,context,operation),scope:Scope={...actor,attempt,context,lease:null,signal:AbortSignal.timeout(Math.max(1,remainingBatch())),phase:'commit'};
   recovered++;
   try{
    if(entry.state==='finished'&&entry.commit===null){
     const terminal=await owned(scope,lease=>rpc(scope,'witness',{attemptId:attempt.attemptId},lease));
     if(!preparationExact(terminal,'attemptId status availableAt')||terminal.attemptId!==attempt.attemptId||terminal.status!=='deferred'||typeof terminal.availableAt!=='string'||evidenceInstant(terminal.availableAt)===null)fail('financial_preparation_knowledge_invalid');
     results.push({attemptId:attempt.attemptId,status:'deferred',availableAt:terminal.availableAt,validation:'existing_terminal_receipt'});
    }else results.push(await finishCommitted(scope,commitEnvelope(entry.commit,attempt),entry.state as 'committed'|'finished'));
   }catch{results.push({attemptId:attempt.attemptId,status:'pending',availableAt:null,reason:'financial_preparation_recovery_pending'});}
  }
  while(claimed+recovered<budget&&remainingBatch()>=claimWindowMs){
   const claimedResult=await owned(actor,lease=>rpc(actor,`claim-${operation}`,{limit:1},lease));
   if(!preparationExact(claimedResult,'context attempts')||!sameContext(parsePreparationContext(claimedResult.context),context)||!Array.isArray(claimedResult.attempts)||claimedResult.attempts.length>1)fail('financial_preparation_claim_invalid');
   if(!claimedResult.attempts.length)break;
   const attempt=parsePreparationAttempt(claimedResult.attempts[0],context,operation);claimed++;
   results.push(await processAttempt({...actor,attempt,context,lease:null,signal:AbortSignal.timeout(Math.max(1,Math.min(remainingBatch(),Math.floor(Number(evidenceInstant(attempt.deadline)!/BigInt(1000))-Date.now())))),phase:'stage'}));
  }
  const pending=Number(recovery.blockedCount)>0||results.some(r=>r.status==='pending'),partial=results.some(r=>r.status==='partial'||r.status==='rejected'||r.status==='deferred');
  return reply(pending?202:partial?500:200,{ok:!pending&&!partial,schemaVersion:FINANCIAL_PREPARATION_SCHEMA,purpose:'private_financial_data_preparation',mode:context.mode,requestedLimit:limit,claimed,recovered,known,results,
   batchBudget:budget,budgetReached:claimed+recovered===budget,qualificationAuthority:false,rankingAuthority:false,gaps:Number(recovery.blockedCount)>0?['financial_preparation_operator_reconciliation_required']:pending?['financial_preparation_pending_requires_receipt_reconciliation']:[]});
 }catch(error){const reason=error instanceof PreparationFailure?error.reason:'financial_preparation_unavailable';return reply(reason.includes('limit')||reason.includes('json')?422:reason.includes('body_too_large')?413:reason.includes('busy')?409:503,{ok:false,error:reason});}
}
