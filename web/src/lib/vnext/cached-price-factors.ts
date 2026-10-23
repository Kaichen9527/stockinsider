import {inputHash} from './policy.ts';
import type {Evidence} from './research.ts';
import type {TwEntryHistoricalAuthorityResult} from '../tw-entry-plan-authority.ts';
import type {ScreeningInputs} from './factors.ts';
import {publicCitation} from './citations.ts';
type Row=Record<string,unknown>;
const numeric=(v:unknown)=>typeof v==='number' && Number.isFinite(v)?v:null;
const observation=(value:number|null,source:string,observedAt:string)=>({value,source,observedAt});
export function historicalPriceFactors(history:TwEntryHistoricalAuthorityResult){
 const bars=history.bars;const current=bars.at(-1);const valid=history.notEntryAuthority===true && history.nextSessionAuthority===false && history.priceBasis?.status==='verified' && bars.length>=60 && bars.length===history.completedSessions.length && bars.every((bar,i)=>bar.session===history.completedSessions[i] && Number.isFinite(bar.close) && bar.close>0);
 const source=valid?history.sourceDatasetRevision:'';const at=valid?history.availableAt:'';
 const mean=(n:number)=>valid?bars.slice(-n).reduce((sum,b)=>sum+b.close,0)/n:null;
 const volumes=valid?bars.slice(-20).map((b)=>b.volume).sort((a,b)=>a-b):[];const median=volumes.length===20?(volumes[9]+volumes[10])/2:null;
 return {valid,close:valid?current!.close:null,ma20:mean(20),ma60:mean(60),volume:valid?current!.volume:null,session:valid?current!.session:null,
  priceReturn20:observation(valid?current!.close/bars.at(-21)!.close-1:null,source,at),volumeRatio20:observation(valid && median!==null && median>0?current!.volume/median:null,source,at),
  trend20:observation(valid?current!.close/mean(20)!-1:null,source,at),trend60:observation(valid?current!.close/mean(60)!-1:null,source,at),provenance:valid?[history.sourceDatasetRevision,history.priceBasis!.adjustmentEvidenceHash]:[],gaps:history.missingData};
}
export function comparableBenchmark(rows:Row[],exchange:string,sessions:string[],cutoff:string){
 const selected=sessions.slice(-21);const market=exchange==='TPEX'?'TPEX':'TWSE';
 const points=selected.map((session)=>rows.filter((row)=>row.market===market && row.session_date===session && numeric(row.index_close)!>0 && Date.parse(String(row.as_of))<=Date.parse(cutoff) && Date.parse(String(row.available_at))<=Date.parse(cutoff) && Array.isArray(row.source_urls) && row.source_urls.some(publicCitation)));
 if(selected.length!==21 || points.some((list)=>list.length!==1))return observation(null,'','');
 const first=points[0][0];const last=points.at(-1)![0];return observation(Number(last.index_close)/Number(first.index_close)-1,(last.source_urls as string[]).filter((url)=>publicCitation(url)).join(','),String(last.as_of));
}
export function operationsMonths(rows:Row[],cutoff:string):ScreeningInputs['operationsMonths']{
 const heads=new Map<string,Row>();for(const row of [...rows].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))){const month=String(row.as_of_date).slice(0,7);if(/^\d{4}-\d{2}$/u.test(month) && Date.parse(`${month}-01T00:00:00Z`)<=Date.parse(cutoff) && Date.parse(String(row.created_at))<=Date.parse(cutoff) && publicCitation(row.source_url) && !heads.has(month))heads.set(month,row);}
 return [...heads.entries()].sort(([a],[b])=>b.localeCompare(a)).slice(0,3).map(([month,row])=>({month,monthlyRevenue:numeric(row.monthly_revenue),yoyRatio:numeric(row.yoy_growth)===null?null:Number(row.yoy_growth)/100,source:String(row.source_url),observedAt:String(row.as_of_date),availableAt:String(row.created_at),reportedYoyPercent:numeric(row.yoy_growth)}));
}

export function currentPriceEvidence(history:TwEntryHistoricalAuthorityResult,originalIds:ReadonlySet<string>=new Set()):Evidence[]{
 if(!historicalPriceFactors(history).valid)return [];
 const current=history.bars.at(-1);return history.bars.filter((bar)=>bar===current || originalIds.has(bar.observationId)).map((bar)=>({id:bar.observationId,key:'current_price',value:bar.rawClose,unit:'TWD',period:bar.session,source:bar.sourceUrl,sourceTier:'official',kind:'fact',eventAt:bar.sourceTimestamp,availableAt:bar.recordedAt,contentHash:inputHash({observationId:bar.observationId,session:bar.session,rawClose:bar.rawClose,sourceTimestamp:bar.sourceTimestamp,recordedAt:bar.recordedAt,sourceUrl:bar.sourceUrl})}));
}
