import type {BusinessReceipt} from './business-criteria.ts';
import type {CatalystReceipt} from './semantic-criteria.ts';
import {readCurrentFinancialCache,currentEvidenceRead} from './current-evidence-read.ts';
import {thesisCommand} from './thesis-runtime.ts';
import {readActiveForecasts} from './forecast-active.ts';
import {auditThesisCycle} from './thesis-cycle.ts';
import { analysisCommand,analysisWriter } from './analysis-runtime.ts';
import type { ThesisAuditInput } from './thesis-audit.ts';
import type { VnextIdentity } from './auth.ts';
import type { Evidence,Artifact,Review } from './research.ts';
type Row=Record<string,unknown>;
export function runWeeklyThesisAudit(identity:VnextIdentity,options:{screen?:boolean}={}){
 return auditActiveTheses(identity,options,analysisWriter);
}

export async function runLaunchWeeklyThesisAudit(identity:VnextIdentity){
 if(identity.role!=='operator'||!identity.principal)throw Error('vnext_operator_required');
 const {launchRankingEnabled}=await import('./launch-ranking-read.ts');
 if(!launchRankingEnabled())throw Error('launch_ranking_disabled');
 return analysisWriter(async(leaseOwner)=>{
  const {getSupabaseServerClient}=await import('../supabase-server.ts');
  const reply=await getSupabaseServerClient().rpc('vnext_launch_weekly_audit_due_v1',{p_principal:identity.principal});
  const due=reply.data as Row|null;
  if(reply.error||!due||!['due','empty','current','deferred'].includes(String(due.status))
    ||typeof due.activeCount!=='number'||!Number.isInteger(due.activeCount)||due.activeCount<0||due.activeCount>20)
   throw Error('vnext_launch_weekly_context_unavailable');
  if(due.status!=='due')return {status:due.status,reviewed:0};
  if(typeof due.session!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(due.session)||due.activeCount===0)
   throw Error('vnext_launch_weekly_context_unavailable');
  const result=await auditActiveTheses(identity,{launchSession:due.session},work=>work(leaseOwner));
  if(result.reviewed!==due.activeCount||!('receipt' in result)||result.receipt?.reviewed!==due.activeCount)
   throw Error('vnext_launch_weekly_receipt_uncertain');
  return {status:'recorded',reviewed:result.reviewed};
 });
}

async function auditActiveTheses(identity:VnextIdentity,options:{screen?:boolean;launchSession?:string},withWriter:typeof analysisWriter){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');const {command}=await import('./store.ts');const client=getSupabaseServerClient();let cutoff=new Date().toISOString();
 const [context,screen]=await Promise.all([thesisCommand(identity,'context',{}),withWriter(async()=>{if(!options.launchSession)await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);return command(identity,'screen-context',{});})]);const members=(context.members||[]) as Row[];const symbols=members.map((m)=>String(m.symbol));
 if(options.launchSession&&screen.session!==options.launchSession)throw Error('vnext_launch_weekly_session_changed');
 if(!symbols.length)return {reviewed:0,reports:[],reason:'no_active_members',admission:options.screen?await withWriter(()=>(import('./discovery.ts').then((module)=>module.scanCachedCandidates(identity)))):{jobs:[]}};
 const activeForecasts=await readActiveForecasts(client,identity);
 if(JSON.stringify(activeForecasts.members.map(m=>[m.symbol,m.inputHash]))!==JSON.stringify(members.map(m=>[String(m.symbol),String(m.inputHash)]).sort(([a],[b])=>a.localeCompare(b))))throw Error('vnext_forecast_membership_changed');
 cutoff=activeForecasts.asOf;
 const stocks=await client.from('stocks').select('id,symbol').eq('market','TW').in('symbol',symbols);if(stocks.error)throw new Error('vnext_weekly_stock_cache_gap');const ids=(stocks.data||[]).map((s)=>String(s.id));
 const [financial,instruments]=await Promise.all([readCurrentFinancialCache(client,ids,cutoff),
  client.from('stock_instruments_v3').select('stock_id,listing_status,exchange').in('stock_id',ids).eq('instrument_type','common_stock').lte('source_timestamp',cutoff).lte('recorded_at',cutoff).lte('valid_from',cutoff).or(`valid_to.is.null,valid_to.gt.${cutoff}`).order('recorded_at',{ascending:false}).limit(100)]);
 const sourceProjection=await analysisCommand(identity,'source-projection',{symbols});
 const inputs:ThesisAuditInput[]=[];const currentEvidenceReads:ReturnType<typeof currentEvidenceRead>[]=[];const {loadTwEntryHistoricalPriceAuthority}=await import('../tw-entry-plan-authority.ts');
 for(const member of members){const publication=member.publication as Row|null;const originalInput=publication?.originalEvidence as Row|undefined;const original=(Array.isArray(originalInput?.evidence)?originalInput!.evidence:[]) as Evidence[];const symbol=String(member.symbol);const stockId=String((stocks.data||[]).find((s)=>s.symbol===symbol)?.id||'');
  const originalSources=original.filter((e)=>e.sourceTier!=='official');const validity=await thesisCommand(identity,'source-current',{items:originalSources.map((e)=>({symbol,evidence:e}))});
  const source=sourceProjection[symbol] as Row|undefined;const newContent=(Array.isArray(source?.evidence)?source!.evidence:[]) as Evidence[];
  const forecasts=activeForecasts.members.find(m=>m.symbol===symbol)!.forecast;if(forecasts.stockId!==stockId)throw Error('vnext_forecast_issuer_binding');
  const instrument=((instruments.data||[]) as Row[]).find((r)=>r.stock_id===stockId);
  const history=instrument && ['TWSE','TPEX'].includes(String(instrument.exchange))?await loadTwEntryHistoricalPriceAuthority(client,{stockId,symbol,exchange:instrument.exchange as 'TWSE'|'TPEX',signalSession:String((screen.priceSessions as string[]|undefined)?.[0]||''),cutoff}):null;
  const currentRead=currentEvidenceRead({symbol,stockId,inputHash:String(member.inputHash),revisionId:publication?String(publication.revision_id):null,publishedInputHash:publication?String(publication.input_hash):null,cutoff,signalSession:String((screen.priceSessions as string[]|undefined)?.[0]||''),financial,history,original});currentEvidenceReads.push(currentRead);
  const current=[...forecasts.evidence,...currentRead.evidence,...originalSources.filter((e)=>!e.id.startsWith('forecast:') && ((validity.valid||[]) as string[]).includes(e.id)),...newContent.filter((e)=>!originalSources.some((o)=>o.id===e.id))];
  // Consume the producer's typed eligibility decision and formal quote; cache
  // availability alone cannot promote its separately labelled comparison.
  const quote=currentRead.formalAudit.quote;
  const frozen=member.evidence as Row;inputs.push({financialObservationInventory:currentRead.financial.observationInventory,businessReceipt:publication?.businessReceipt as BusinessReceipt|null||null,semanticReceipt:publication?.semanticReceipt as CatalystReceipt|null||null,symbol,inputHash:String(member.inputHash),revisionId:publication?String(publication.revision_id):null,publishedInputHash:publication?String(publication.input_hash):null,previousAudit:member.previousAudit as {materialEvidence?:Row}|null,artifact:publication?.content as Artifact|null||null,review:publication?.review as Review|null||null,original,current,newContent,quote,cutoff,session:String(screen.session),market:{risk:String((screen.market as Row)?.risk||'unknown'),snapshotHash:String((screen.market as Row)?.snapshotHash||'')||null},previousMarketHash:String(frozen.marketSnapshotHash||'')||null,tradingValid:instrument?instrument.listing_status==='active':null});
 }
 return withWriter(async()=>({...await auditThesisCycle(inputs,{record:(reports)=>thesisCommand(identity,options.launchSession?'launch-weekly-record':'record',{reports}),...(options.screen?{screen:(audits)=>import('./discovery.ts').then((module)=>module.scanCachedCandidates(identity,undefined,audits))}:{})}),
  currentEvidenceReads,cacheGaps:[...activeForecasts.members.flatMap(m=>m.forecast.gaps.map(g=>`${m.symbol}:${g}`)),...currentEvidenceReads.flatMap(r=>r.refusalReasons.map(g=>`${r.symbol}:${g}`)),instruments.error?'instrument_cache_unavailable':null].filter(Boolean)}));
}
