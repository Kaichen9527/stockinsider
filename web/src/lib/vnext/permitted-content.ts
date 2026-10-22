import { inputHash, POLICY } from './policy.ts';
import { eligibleClue, type Clue } from './screening.ts';
import { publicCitation } from './citations.ts';
import type { Evidence } from './research.ts';
export type ContentScope='metadata'|'official_original'|'operator_claim';
export type PermittedContent={id:string;source:'ptt'|'official'|'telegram'|'investanchors';scope:ContentScope;url:string;eventAt:string;publishedAt:string;eventBasis:'source_publication'|'original_event'|'operator_attested';availableAt:string;symbols:string[];authorRoot:string;originalRoot:string;title?:string;body?:string;statement?:string;rightsAttested?:boolean;operatorAuthored?:boolean;catalystUntil?:string};
export type ContentExtraction={contentHash:string;source:string;scope:ContentScope;original:PermittedContent;clues:Clue[];evidence:Evidence|null;gaps:string[]};
export function operatorPublicCitation(value:string){
 const url=publicCitation(value);if(!url || !url.startsWith('https://'))return null;const parsed=new URL(url);
 if(/paid|member|premium|subscription|login|authenticate/iu.test(parsed.pathname) || /^(?:\/c\/|\/joinchat\/|\/\+)/u.test(parsed.pathname) && /(^|\.)(t\.me|telegram\.me)$/u.test(parsed.hostname) || [...parsed.searchParams.keys()].some((key)=>/token|password|auth|credential|secret|signature/iu.test(key)))return null;
 return url;
}
function contentIdentity(item:PermittedContent,cutoff:string) {
 const allowed=new Set(['id','source','scope','url','eventAt','publishedAt','eventBasis','availableAt','symbols','authorRoot','originalRoot','title','body','statement','rightsAttested','operatorAuthored','catalystUntil']);
 if(Object.keys(item).some((key)=>!allowed.has(key)) || !Number.isFinite(Date.parse(cutoff)) || !Number.isFinite(Date.parse(item.eventAt)) || !Number.isFinite(Date.parse(item.publishedAt)) || !Number.isFinite(Date.parse(item.availableAt)) || Date.parse(item.eventAt)>Date.parse(item.publishedAt) || Date.parse(item.publishedAt)>Date.parse(item.availableAt) || Date.parse(item.availableAt)>Date.parse(cutoff))throw new Error('vnext_content_original_clocks_required');
 if(!item.id || item.id.length>128 || !Array.isArray(item.symbols) || item.symbols.length>12 || item.symbols.some((s)=>!/^\d{4}$/u.test(s)))throw new Error('vnext_content_scope_invalid');
 if(!['source_publication','original_event','operator_attested'].includes(item.eventBasis))throw new Error('vnext_content_event_basis_required');
 if(item.catalystUntil){const end=new Date(cutoff);end.setUTCMonth(end.getUTCMonth()+3);if(!Number.isFinite(Date.parse(item.catalystUntil)) || Date.parse(item.catalystUntil)<Date.parse(cutoff) || Date.parse(item.catalystUntil)>end.getTime())throw new Error('vnext_catalyst_original_window');}
 let value:string;const gaps:string[]=[];if(item.eventBasis==='source_publication')gaps.push('underlying_event_time_unresolved_source_publication_only');
 if(item.scope==='operator_claim'){
  if(!['telegram','investanchors'].includes(item.source) || item.body!==undefined || item.title!==undefined || !operatorPublicCitation(item.url) || !item.symbols.length || !item.originalRoot || !item.authorRoot || item.rightsAttested!==true || item.operatorAuthored!==true || typeof item.statement!=='string' || !item.statement.trim() || item.statement.length>320)throw new Error('vnext_operator_authored_bounded_claim_required');
  value=item.statement;gaps.push('operator_authored_claim_not_original_channel_content','claim_not_independent_confirmation');
 }else if(item.scope==='official_original'){
  const url=publicCitation(item.url);if(item.source!=='official' || !url || !/^https:\/\/([A-Za-z0-9-]+\.)?(twse\.com\.tw|tpex\.org\.tw)(\/|$)/u.test(url) || typeof item.body!=='string' || !item.body.trim() || Buffer.byteLength(item.body)>16384 || item.statement!==undefined)throw new Error('vnext_official_bounded_original_required');value=item.body;
 }else{
  const url=publicCitation(item.url);if(item.source!=='ptt' || !url || !/^https:\/\/(www\.)?ptt\.cc\/bbs\/Stock\/[A-Za-z0-9._-]+\.html$/u.test(url) || item.body!==undefined || item.statement!==undefined || typeof item.title!=='string' || item.title.length>512)throw new Error('vnext_metadata_only_required');
  value=item.title;gaps.push('metadata_only_no_body_or_semantic_confirmation');
 }
 const originalRoot=item.originalRoot;const authorRoot=item.authorRoot;
 if(!originalRoot || !authorRoot || originalRoot.length>256 || authorRoot.length>256)gaps.push('original_root_or_author_unresolved');
 // Acquisition clocks are audit data, never new-content identity.
 const contentHash=inputHash({source:item.source,scope:item.scope,url:item.url,eventAt:item.eventAt,publishedAt:item.publishedAt,eventBasis:item.eventBasis,value,originalRoot,authorRoot,catalystUntil:item.catalystUntil||null});
 return {contentHash,source:item.source,scope:item.scope,original:item,gaps,value};
}
export function extractPermittedContent(item:PermittedContent,cutoff:string):ContentExtraction {
 const {contentHash,gaps,value}=contentIdentity(item,cutoff);const originalRoot=item.originalRoot;const authorRoot=item.authorRoot;
 const clues=item.symbols.map((symbol):Clue=>({symbol,source:item.source,root:originalRoot,authorRoot,eventAt:item.eventAt,availableAt:item.availableAt,contentHash,...(item.catalystUntil?{catalystUntil:item.catalystUntil}:{}),...(item.scope==='operator_claim'?{rightsAttested:true,operatorClaim:true}:{})})).filter((clue)=>eligibleClue(clue,cutoff));
 if(!clues.length)gaps.push('no_eligible_original_event_or_resolved_identity');
 const evidence=item.scope==='metadata'?null:{id:`content:${contentHash}`,key:'reported_event',value:{scope:item.scope,originSource:item.source,claimStatus:item.scope==='operator_claim'?'rumor':'reported',publishedAt:item.publishedAt,eventBasis:item.eventBasis,statement:value,originalContentHash:contentHash},source:item.url,sourceTier:item.scope==='operator_claim'?'operator' as const:'public' as const,kind:'assumption' as const,eventAt:item.eventAt,availableAt:item.availableAt,contentHash};
 return {contentHash,source:item.source,scope:item.scope,original:item,clues,evidence,gaps};
}
export function roundRobinContents<T extends {contentHash:string;source:string;original:PermittedContent}>(items:T[]){
 const groups=new Map<string,T[]>();const seen=new Set<string>();
 for(const item of [...items].sort((a,b)=>a.original.eventAt.localeCompare(b.original.eventAt)||a.contentHash.localeCompare(b.contentHash))){if(seen.has(item.contentHash))continue;seen.add(item.contentHash);const rows=groups.get(item.source)||[];rows.push(item);groups.set(item.source,rows);}
 const result:T[]=[];for(let i=0;i<POLICY.sourceContent && result.length<POLICY.dailyContent;i++)for(const source of [...groups.keys()].sort()){const row=groups.get(source)?.[i];if(row && result.length<POLICY.dailyContent)result.push(row);}return result;
}
export async function extractContentBatch(items:PermittedContent[],cutoff:string,send:(action:string,body:Record<string,unknown>)=>Promise<Record<string,unknown>>){
 const rejected:Array<{id:string;reason:string}>=[];const candidates:Array<ReturnType<typeof contentIdentity>>=[];
 for(const item of items)try{candidates.push(contentIdentity(item,cutoff));}catch(error){rejected.push({id:item.id,reason:error instanceof Error?error.message:'invalid_content'});}
 const selected=roundRobinContents(candidates);const results=[];
 for(const item of selected){const reservationItem={contentHash:item.contentHash,source:item.source,scope:item.scope,original:item.original,gaps:item.gaps};const reservation=await send('source-reserve',{item:reservationItem});if(reservation.parse!==true){results.push(reservation);continue;}results.push(await send('source-complete',{contentHash:item.contentHash,extraction:extractPermittedContent(item.original,cutoff)}));}
 return {selected:selected.length,rejected,results,deferredOutsideRoundRobin:candidates.length-selected.length,parserVersion:'vnext-permitted-content-v1',batchHash:inputHash(selected.map((r)=>r.contentHash))};
}
