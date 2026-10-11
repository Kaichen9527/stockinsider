import {createHash} from 'node:crypto';
import {reconcileObservedResearchCohort} from './research-observed-classifier.mjs';
import {assertSourcePacketBoundary,sourceControllerInstant} from './research-source-attempt-controller.ts';
import {researchCanonicalHash} from './research-agent-qualification.ts';

export const OBSERVED_ROSTER_SCHEMA='research-observed-roster-admission-v1';
export const OBSERVED_CLASSIFIER_VERSION='source-cohort-consumer-v1';
/** Exact reviewed classifier artifact; no request-supplied code/version/path. */
export const OBSERVED_CLASSIFIER_SHA256='9eb59b03bd3b89cbe9813a93f49dc2247e5d7e12a6e31e145d042fef493f8f63';
const SHA=/^[a-f0-9]{64}$/u;
type Member={symbol:string;name:string;exchange:'TWSE'|'TPEX';isin:string;cfi:string;observedAt:string;sourceSection:string;sector:string;listingDate:string};
type Source={url:string;observedAt:string;responseBytes:number;responseSha256:string};
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('observed_roster_shape_invalid');return value as Record<string,unknown>;}
function closed(value:unknown,keys:string[]){const r=record(value);if(Object.keys(r).some(k=>!keys.includes(k)))throw Error('observed_roster_unknown_field');return r;}
function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
export function prepareObservedRosterAdmission(value:unknown,now=new Date().toISOString()) {
 assertSourcePacketBoundary(value);
 const request=closed(value,['legacyClassification','securityScope']);
 const legacy=closed(request.legacyClassification,['schemaVersion','recordedAt','sources','scope','historicalPITEligible','currentTradingEligibilityVerified','trustedAuthorityActivated','members']);
 if(legacy.schemaVersion!=='stockinsider-observed-security-classification-relay-v1'||legacy.historicalPITEligible!==false||legacy.currentTradingEligibilityVerified!==false||legacy.trustedAuthorityActivated!==false||typeof legacy.scope!=='string'||!Array.isArray(legacy.members)||!Array.isArray(legacy.sources)||legacy.members.length>5000||legacy.sources.length!==2)throw Error('observed_legacy_shape_invalid');
 const serverTime=sourceControllerInstant(now),recorded=sourceControllerInstant(legacy.recordedAt as string);
 if(recorded>serverTime)throw Error('observed_roster_future');
 const urls=['https://isin.twse.com.tw/isin/class_main.jsp?Page=&issuetype=1&market=1','https://isin.twse.com.tw/isin/C_public.jsp?strMode=4'];
 const counts={TWSE:0,TPEX:0};const seen=new Set<string>();
 for(const member of legacy.members){const r=closed(member,['symbol','name','exchange','cfi','isin','listingDate','sector']);
  if(!Object.values(r).every(v=>typeof v==='string')||!/^[1-9]\d{3}$/u.test(r.symbol as string)||seen.has(r.symbol as string)||r.cfi!=='ESVUFR'||!['TWSE','TPEX'].includes(r.exchange as string)||!/^[A-Z0-9]{12}$/u.test(r.isin as string)||!(r.name as string).trim())throw Error('observed_legacy_member_invalid');
  seen.add(r.symbol as string);counts[r.exchange as keyof typeof counts]++;
 }
 for(const [index,source]of legacy.sources.entries()){const r=closed(source,['url','observedAt','responseBytes','responseSha256','selectedCount']);
  if(r.url!==urls[index]||typeof r.responseSha256!=='string'||!SHA.test(r.responseSha256)||!Number.isInteger(r.responseBytes)||Number(r.responseBytes)<1||Number(r.responseBytes)>4_000_000||r.selectedCount!==counts[index===0?'TWSE':'TPEX']||sourceControllerInstant(r.observedAt as string)>recorded)throw Error('observed_legacy_source_invalid');
 }
 const cohort=reconcileObservedResearchCohort(legacy,request.securityScope,now);
 if(!cohort.evidence||!cohort.excluded)throw Error('observed_scope_required');
 const members=(cohort.members as Member[]).map(member=>({...member})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
 const excluded=cohort.excluded.sort((a:{symbol:string},b:{symbol:string})=>a.symbol.localeCompare(b.symbol));
 if(members.some(m=>!/^[A-Z0-9]{12}$/u.test(m.isin)||!m.name.trim()))throw Error('observed_identity_invalid');
 const classificationHash=researchCanonicalHash({members,excluded});
 const payload={schemaVersion:OBSERVED_ROSTER_SCHEMA,classifierVersion:OBSERVED_CLASSIFIER_VERSION,classifierHash:OBSERVED_CLASSIFIER_SHA256,
  classificationHash,legacySnapshotHash:researchCanonicalHash(legacy),members,excluded,
  sourceReferences:cohort.evidence.sourceReferences as Source[],rawSourceHashesVerifiedByVm:false,
  researchQualified:false,strategyApproved:false,entryEligible:false,trustedAuthorityActivated:false,historicalPITEligible:false};
 const packet={request,payload};const canonicalPacket=canonical(packet);
 if(Buffer.byteLength(canonicalPacket)>2_000_000)throw Error('observed_packet_size_limit');
 return {snapshotHash:createHash('sha256').update(canonicalPacket).digest('hex'),canonicalPacket,payload};
}
