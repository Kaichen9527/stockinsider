/** Actual server RPC transport. No caller descriptor, clock, source path or
 * validated flag can create forecast authority. SQL rechecks every frozen item. */
import type {getSupabaseServerClient} from '../supabase-server.ts';
import type {VnextIdentity} from './auth.ts';
import type {Evidence} from './research.ts';
import {inputHash} from './policy.ts';
type Row=Record<string,unknown>;
export type CurrentForecasts={schemaVersion:'vnext-current-forecasts-v1';stockId:string;symbol:string;asOf:string;evidence:Evidence[];receipts:Row[];gaps:string[]};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const object=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Row,k:string)=>Object.keys(v).sort().join('|')===k.split(' ').sort().join('|');
function civil(value:string){const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
export async function readCurrentForecasts(client:Pick<ReturnType<typeof getSupabaseServerClient>,'rpc'>,identity:VnextIdentity,jobId:string,executionId:string):Promise<CurrentForecasts>{
 if(identity.role!=='author'||!identity.principal||!uuid.test(jobId)||!uuid.test(executionId))throw Error('vnext_forecast_author_execution_required');
 const result=await client.rpc('vnext_forecast_read_v1',{p_principal:identity.principal,p_job:jobId,p_execution:executionId});
 if(result.error)throw Error('vnext_forecast_current_source_unavailable');
 const r:unknown=result.data;
 if(!object(r)||!keys(r,'schemaVersion stockId symbol asOf evidence receipts gaps')||r.schemaVersion!=='vnext-current-forecasts-v1'||!uuid.test(String(r.stockId))||typeof r.symbol!=='string'||!/^\d{4}$/u.test(r.symbol)||typeof r.asOf!=='string'||!Number.isFinite(Date.parse(r.asOf))||Date.parse(r.asOf)>Date.now()||!Array.isArray(r.evidence)||r.evidence.length>32||!Array.isArray(r.receipts)||r.receipts.length!==r.evidence.length||!Array.isArray(r.gaps)||r.gaps.some(g=>typeof g!=='string'||g.length>200))throw Error('vnext_forecast_current_shape');
 const seen=new Set<string>();for(const [index,value] of r.evidence.entries()){
  const receipt=r.receipts[index];if(!object(value)||!keys(value,'id key value unit period contentHash source sourceTier kind eventAt availableAt')||typeof value.id!=='string'||!/^forecast:[a-f0-9-]{36}:[a-f0-9-]{36}$/iu.test(value.id)||seen.has(value.id)||value.kind!=='assumption'||value.sourceTier!=='public'||value.unit!=='TWD_per_share'||!['source_quarterly_diluted_eps_estimate','source_target_price_12m'].includes(String(value.key))||typeof value.value!=='number'||!Number.isFinite(value.value)||typeof value.period!=='string'||!/^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/u.test(value.period)||typeof value.source!=='string'||!value.source.startsWith('https://')||typeof value.contentHash!=='string'||!/^[a-f0-9]{64}$/u.test(value.contentHash)||typeof value.eventAt!=='string'||typeof value.availableAt!=='string'||![value.eventAt,value.availableAt].every(v=>Number.isFinite(Date.parse(v)))||Date.parse(value.eventAt)>Date.parse(value.availableAt)||Date.parse(value.availableAt)>Date.parse(r.asOf)||!object(receipt)||!keys(receipt,'schemaVersion stockId symbol evidenceHash classification verificationId revisionId sourceHash publisherAuthorityId sourceAuthorityId policyId manifestHash estimateKind estimateHorizon shareBasis denominatorShares annualEps nextFourQuarterEps')||!['verificationId','revisionId','publisherAuthorityId','sourceAuthorityId','policyId'].every(k=>typeof receipt[k]==='string'&&uuid.test(receipt[k] as string))||!['sourceHash','manifestHash'].every(k=>typeof receipt[k]==='string'&&/^[a-f0-9]{64}$/u.test(receipt[k] as string))||receipt.schemaVersion!=='vnext-forecast-source-receipt-v1'||receipt.symbol!==r.symbol||receipt.stockId!==r.stockId||receipt.evidenceHash!==inputHash(value)||receipt.classification!=='source_estimate_not_reported_or_fair_value'||receipt.annualEps!==null||receipt.nextFourQuarterEps!==null||receipt.denominatorShares!==null)throw Error('vnext_forecast_current_binding');
  if(value.key==='source_quarterly_diluted_eps_estimate'&&(receipt.estimateKind!=='analyst_estimate'||receipt.estimateHorizon!=='next_twelve_months'||receipt.shareBasis!=='source_diluted_eps_denominator_not_supplied')||value.key==='source_target_price_12m'&&(receipt.estimateKind!=='broker_consensus'||receipt.estimateHorizon!=='target_12m'||receipt.shareBasis!=='not_applicable_price_target'))throw Error('vnext_forecast_horizon_crosswire');
  const [start,end]=value.period.split('/');const source=new URL(value.source);
  if(!civil(start)||!civil(end)||start>end||value.id.split(':')[2]!==receipt.verificationId||source.protocol!=='https:'||source.username||source.password||source.search||source.hash||value.value!==0&&(Math.abs(value.value)<0.000001||Math.abs(value.value)>=1e21))throw Error('vnext_forecast_current_binding');
  if(value.key==='source_quarterly_diluted_eps_estimate'){
   const date=new Date(start+'T00:00:00Z'),quarterEnd=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+3,0)).toISOString().slice(0,10);
   if(date.getUTCDate()!==1||date.getUTCMonth()%3!==0||end!==quarterEnd)throw Error('vnext_forecast_horizon_crosswire');
  }else if(value.value<=0)throw Error('vnext_forecast_horizon_crosswire');
  seen.add(value.id);
 }
 return structuredClone(r) as CurrentForecasts;
}
