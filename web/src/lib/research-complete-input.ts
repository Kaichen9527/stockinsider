import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schema2409, schema2383 } from './research-complete-schema-bundles.ts';
import mapping from './research-complete-mapping.json' with { type: 'json' };
import { financialInventory } from './research-financial-inventory.ts';
import { loadResearchFinancialSupplement } from './research-financial-supplement.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { completeEnsure as ensure, completeCanonical, completeHash, parseCompleteJson, validateCompleteSchema } from './research-complete-canonical.ts';
type Row=Record<string,unknown>;
export type CompleteRequest={owner:string;jobId:string;attempt:number;reservationId:string;scope:'research_observed_v1';snapshotHash:string;preparationId:string;preparationHash:string;expectedArtifactManifestHash:string;expectedCalculatorExecutionHash:string};
const keys=['owner','jobId','attempt','reservationId','scope','snapshotHash','preparationId','preparationHash','expectedArtifactManifestHash','expectedCalculatorExecutionHash'];
export function parseCompleteRequest(value:unknown):CompleteRequest {
 ensure(value&&typeof value==='object'&&!Array.isArray(value));const v=value as Row;
 ensure(Object.keys(v).sort().join(',')===keys.slice().sort().join(',')&&v.scope==='research_observed_v1'&&typeof v.owner==='string'&&/^[A-Za-z0-9:_-]{3,120}$/u.test(v.owner)&&Number.isInteger(v.attempt)&&Number(v.attempt)>=1&&Number(v.attempt)<=3);
 for(const key of ['jobId','reservationId','preparationId'])ensure(typeof v[key]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v[key]));
 for(const key of ['snapshotHash','preparationHash','expectedArtifactManifestHash','expectedCalculatorExecutionHash'])ensure(typeof v[key]==='string'&&/^[a-f0-9]{64}$/u.test(v[key]));
 completeCanonical(v);return v as CompleteRequest;
}
export async function readCompleteBody(request:Request,deadline:FinancialDeadline):Promise<Row>{
 ensure(request.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&request.body);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const v=await deadline.wait(reader.read());if(v.done)break;length+=v.value.byteLength;ensure(length<=8192);chunks.push(v.value);}const v=parseCompleteJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));ensure(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;}
 finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function completeMaterial(db:Pick<SupabaseClient,'rpc'>,request:CompleteRequest,preparation:Row,deadline:FinancialDeadline,root=path.resolve(process.cwd(),'..')) {
 let materialStage='parent_binding';try {
 const old=preparation.request as Row;
 ensure(old&&old.owner===request.owner&&old.jobId===request.jobId&&old.attempt===request.attempt&&old.reservationId===request.reservationId&&old.scope===request.scope&&old.snapshotHash===request.snapshotHash&&preparation.preparation_id===request.preparationId&&preparation.input_hash===request.preparationHash);
 const symbol=(preparation.payload as Row).symbol;ensure(symbol==='2409'||symbol==='2383');const m=mapping.companies[symbol];
 ensure(request.expectedArtifactManifestHash===m.inventoryHash&&request.expectedCalculatorExecutionHash===mapping.sourceClosureHash);
 materialStage='supplement';const s=await loadResearchFinancialSupplement(db,{request:old as never,preparationId:request.preparationId,preparationInputHash:request.preparationHash},root,deadline);
 materialStage='supplement_shape';ensure(s.status==='unsealed_calculation_only');const projection={...s.projection as Row},calculation={...s.calculation as Row};
 delete projection.sourceManifestHash;for(const k of ['inputHash','resultHash','executionCodeHash'])delete calculation[k];
 const material={schemaVersion:'research-complete-financial-material-v2',symbol,artifactReadKnownAt:(projection.clocks as Row).currentLocalReadKnownAt,sourceClosureHash:mapping.sourceClosureHash,artifactInventoryHash:completeHash(financialInventory.companies[symbol].map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256}))),financialMaterial:{projection,calculation}};
 materialStage='inventory_hash';ensure(material.artifactInventoryHash===m.inventoryHash);materialStage='fixed_schema';validateCompleteSchema(material,(symbol==='2409'?schema2409:schema2383) as Row,String(material.artifactReadKnownAt));ensure(Buffer.byteLength(JSON.stringify(material))<=262144);deadline.check();return material;
 }catch(error){console.error('research_complete_material_failure_stage',materialStage);if(error instanceof Error){const trail=(error as Error & {schemaPath?:unknown}).schemaPath;if(typeof trail==='string'&&/^[/A-Za-z0-9_:-]{1,400}$/u.test(trail))console.error('research_complete_schema_failure_path',trail);}throw error;}
}
const capabilityKeys=['financialVerified','dispatchReady','modelDispatched','publishableResearch','researchQualified','strategyApproved','entryEligible','historicalPITEligible'];
function object(value:unknown):Row {ensure(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;}
function equal(a:unknown,b:unknown){ensure(completeHash(a)===completeHash(b));}
/** Current application support is checked on every read, including an old DB replay.
 * This does not open artifacts, renew a lease, or change the persisted clocks. */
export function validateCompleteResponse(request:CompleteRequest,response:Row):void {
 parseCompleteRequest(request);ensure(response.dispatchReady===false&&(response.status==='absent'||response.status==='sealed'));
 let symbol:unknown;
 if(response.status==='absent'){
  const parent=object(response.preparation),old=object(parent.request),p=object(parent.payload);
  const {sourceDocumentIds,bundleId,...lineage}=old;void sourceDocumentIds;ensure(bundleId===null);
  const {preparationId,preparationHash,expectedArtifactManifestHash,expectedCalculatorExecutionHash,...wanted}=request;void expectedArtifactManifestHash;void expectedCalculatorExecutionHash;
  equal(lineage,wanted);ensure(parent.preparation_id===preparationId&&parent.input_hash===preparationHash&&parent.dispatchReady===false&&p.scope===request.scope&&p.snapshotHash===request.snapshotHash&&p.modelDispatched===false);symbol=p.symbol;
 }else{
  const p=object(response.canonical_payload),identity=object(p.researchIdentity),prep=object(p.preparation),job=object(p.originalJob),reservation=object(p.originalReservation),hashes=object(p.hashes),financial=object(p.financial),clocks=object(p.clocks),capabilities=object(p.capabilities);
  symbol=identity.symbol;ensure(response.job_id===request.jobId&&response.attempt===request.attempt&&response.reservation_id===request.reservationId&&response.preparation_id===request.preparationId&&response.research_scope===request.scope&&response.snapshot_hash===request.snapshotHash);
  equal(response.canonical_request,request);ensure(response.request_hash===completeHash(request)&&response.input_hash===completeHash(p));
  ensure(p.schemaVersion==='research-article-input-v2'&&p.assemblyStatus==='complete'&&p.evidenceStatus==='incomplete'&&p.producerAttribution==='internal_controller_asserted'&&prep.id===request.preparationId&&prep.inputHash===request.preparationHash&&hashes.preparationInputHash===request.preparationHash
   &&identity.scope===request.scope&&identity.snapshotHash===request.snapshotHash&&identity.researchCompanyId===response.research_company_id&&job.jobId===request.jobId&&job.attempt===request.attempt&&job.owner===request.owner&&reservation.reservationId===request.reservationId);
  ensure(Object.keys(capabilities).sort().join(',')===capabilityKeys.slice().sort().join(',')&&Object.values(capabilities).every(x=>x===false));
  ensure(symbol==='2409'||symbol==='2383');const supported=mapping.companies[symbol],f=object(financial.material),projection=object(f.projection),calculation=object(f.calculation);
  equal(financial.artifactInventory,supported.inventory);ensure(hashes.artifactInventoryHash===supported.inventoryHash&&hashes.sourceClosureHash===mapping.sourceClosureHash&&hashes.modelHistoricalCanonicalHash===supported.historicalHash
   &&hashes.sourceManifestHash===completeHash(projection.sourceManifest)&&hashes.projectionHash===completeHash(projection)&&hashes.scenarioInputHash===completeHash(object(projection.projected).scenarios)&&hashes.resultHash===completeHash(calculation));
  const material={schemaVersion:'research-complete-financial-material-v2',symbol,artifactReadKnownAt:clocks.artifactReadKnownAt,sourceClosureHash:hashes.sourceClosureHash,artifactInventoryHash:hashes.artifactInventoryHash,financialMaterial:f};
  validateCompleteSchema(material,(symbol==='2409'?schema2409:schema2383)as Row,String(clocks.artifactReadKnownAt));
 }
 ensure(symbol==='2409'||symbol==='2383');ensure(request.expectedArtifactManifestHash===mapping.companies[symbol].inventoryHash&&request.expectedCalculatorExecutionHash===mapping.sourceClosureHash);
}
export async function runCompleteInput(db:Pick<SupabaseClient,'rpc'>,request:CompleteRequest,seal:boolean,deadline:FinancialDeadline,root?:string):Promise<Row>{
 const rpc=async(name:string,args:Row)=>{deadline.check();const response=await deadline.wait(db.rpc(name,args).abortSignal(deadline.controller.signal));ensure(!response.error&&response.data&&typeof response.data==='object');return response.data as Row;};
 let phase='read_rpc';try {
 const before=await rpc('read_research_article_input_revision_v2',{p_request:request});phase='read_validate';
 validateCompleteResponse(request,before);deadline.check();if(before.status!=='absent'||!seal)return before;
 phase='financial_calculation';const material=await completeMaterial(db,request,before.preparation as Row,deadline,root);
 phase='seal_rpc';const saved=await rpc('seal_research_article_input_revision_v2',{p_request:request,p_calculation:material});
 phase='seal_validate';validateCompleteResponse(request,saved);ensure(saved.status==='sealed');deadline.check();return saved;
 }catch(error){const codes=['research_complete_input_invalid','research_financial_supplement_invalid','research_business_calculator_invalid','financial_deadline','financial_recovery_required','financial_file_bound','financial_file_replaced','financial_parent_replaced'];console.error('research_complete_input_failure_phase',phase,error instanceof Error&&codes.includes(error.message)?error.message:'unclassified');throw error;}
}
