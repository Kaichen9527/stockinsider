import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import schema2409 from './research-complete-2409.schema.json' with { type: 'json' };
import schema2383 from './research-complete-2383.schema.json' with { type: 'json' };
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
 const old=preparation.request as Row;
 ensure(old&&old.owner===request.owner&&old.jobId===request.jobId&&old.attempt===request.attempt&&old.reservationId===request.reservationId&&old.scope===request.scope&&old.snapshotHash===request.snapshotHash&&preparation.preparation_id===request.preparationId&&preparation.input_hash===request.preparationHash);
 const symbol=(preparation.payload as Row).symbol;ensure(symbol==='2409'||symbol==='2383');const m=mapping.companies[symbol];
 ensure(request.expectedArtifactManifestHash===m.inventoryHash&&request.expectedCalculatorExecutionHash===mapping.sourceClosureHash);
 const s=await loadResearchFinancialSupplement(db,{request:old as never,preparationId:request.preparationId,preparationInputHash:request.preparationHash},root,deadline);
 ensure(s.status==='unsealed_calculation_only');const projection={...s.projection as Row},calculation={...s.calculation as Row};
 delete projection.sourceManifestHash;for(const k of ['inputHash','resultHash','executionCodeHash'])delete calculation[k];
 const material={schemaVersion:'research-complete-financial-material-v2',symbol,artifactReadKnownAt:(projection.clocks as Row).currentLocalReadKnownAt,sourceClosureHash:mapping.sourceClosureHash,artifactInventoryHash:completeHash(financialInventory.companies[symbol].map(p=>({file:p.path,bytes:p.bytes,sha256:p.sha256}))),financialMaterial:{projection,calculation}};
 ensure(material.artifactInventoryHash===m.inventoryHash);validateCompleteSchema(material,(symbol==='2409'?schema2409:schema2383) as Row,String(material.artifactReadKnownAt));ensure(Buffer.byteLength(JSON.stringify(material))<=262144);deadline.check();return material;
}
export async function runCompleteInput(db:Pick<SupabaseClient,'rpc'>,request:CompleteRequest,seal:boolean,deadline:FinancialDeadline,root?:string):Promise<Row>{
 const rpc=async(name:string,args:Row)=>{deadline.check();const response=await deadline.wait(db.rpc(name,args).abortSignal(deadline.controller.signal));ensure(!response.error&&response.data&&typeof response.data==='object');return response.data as Row;};
 const before=await rpc('read_research_article_input_revision_v2',{p_request:request});
 if(before.status!=='absent'||!seal)return before;
 const material=await completeMaterial(db,request,before.preparation as Row,deadline,root);
 const saved=await rpc('seal_research_article_input_revision_v2',{p_request:request,p_calculation:material});
 ensure(saved.status==='sealed'&&saved.dispatchReady===false&&typeof saved.input_hash==='string'&&completeHash(saved.canonical_payload)===saved.input_hash);deadline.check();return saved;
}
