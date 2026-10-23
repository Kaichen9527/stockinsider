import type {BusinessReceipt} from './business-criteria.ts';
import type {CatalystReceipt} from './semantic-criteria.ts';
import {historicalPriceFactors,currentPriceEvidence} from './cached-price-factors.ts';
import {thesisCommand} from './thesis-runtime.ts';
import {auditThesisCycle} from './thesis-cycle.ts';
import { analysisCommand,analysisWriter } from './analysis-runtime.ts';
import { currentEvidenceFromFacts,type AuditQuote,type ThesisAuditInput } from './thesis-audit.ts';
import type { VnextIdentity } from './auth.ts';
import type { Evidence,Artifact,Review } from './research.ts';
type Row=Record<string,unknown>;
const numeric=(value:unknown)=>typeof value==='number' && Number.isFinite(value)?value:null;
export async function runWeeklyThesisAudit(identity:VnextIdentity,options:{screen?:boolean}={}){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');const {command}=await import('./store.ts');const client=getSupabaseServerClient();const cutoff=new Date().toISOString();
 const [context,screen]=await Promise.all([thesisCommand(identity,'context',{}),analysisWriter(async()=>{await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);return command(identity,'screen-context',{});})]);const members=(context.members||[]) as Row[];const symbols=members.map((m)=>String(m.symbol));
 if(!symbols.length)return {reviewed:0,reports:[],reason:'no_active_members',admission:options.screen?await analysisWriter(()=>(import('./discovery.ts').then((module)=>module.scanCachedCandidates(identity)))):{jobs:[]}};
 const stocks=await client.from('stocks').select('id,symbol').eq('market','TW').in('symbol',symbols);if(stocks.error)throw new Error('vnext_weekly_stock_cache_gap');const ids=(stocks.data||[]).map((s)=>String(s.id));
 const [facts,technicals,instruments]=await Promise.all([client.rpc('read_financial_facts_for_stocks_as_of',{p_cutoff:cutoff,p_stock_ids:ids}).limit(10000),
  client.from('technical_feature_snapshots').select('stock_id,ma20,ma60,volume_ratio_20_median,institutional_flow_20d_norm,provenance,ruleset_version').in('stock_id',ids).eq('session_date',(screen.priceSessions as string[]|undefined)?.[0]||screen.session).lte('available_at',cutoff).order('available_at',{ascending:false}).limit(100),
  client.from('stock_instruments_v3').select('stock_id,listing_status,exchange').in('stock_id',ids).eq('instrument_type','common_stock').lte('source_timestamp',cutoff).lte('recorded_at',cutoff).lte('valid_from',cutoff).or(`valid_to.is.null,valid_to.gt.${cutoff}`).order('recorded_at',{ascending:false}).limit(100)]);
 const sourceProjection=await analysisCommand(identity,'source-projection',{symbols});
 const inputs:ThesisAuditInput[]=[];const {loadTwEntryHistoricalPriceAuthority}=await import('../tw-entry-plan-authority.ts');
 for(const member of members){const publication=member.publication as Row|null;const originalInput=publication?.originalEvidence as Row|undefined;const original=(Array.isArray(originalInput?.evidence)?originalInput!.evidence:[]) as Evidence[];const symbol=String(member.symbol);const stockId=String((stocks.data||[]).find((s)=>s.symbol===symbol)?.id||'');
  const originalSources=original.filter((e)=>e.sourceTier!=='official');const validity=await thesisCommand(identity,'source-current',{items:originalSources.map((e)=>({symbol,evidence:e}))});
  const source=sourceProjection[symbol] as Row|undefined;const newContent=(Array.isArray(source?.evidence)?source!.evidence:[]) as Evidence[];
  const current=[...currentEvidenceFromFacts(((facts.data||[]) as Row[]).filter((f)=>f.stock_id===stockId)),...originalSources.filter((e)=>((validity.valid||[]) as string[]).includes(e.id)),...newContent.filter((e)=>!originalSources.some((o)=>o.id===e.id))];
  const technical=((technicals.data||[]) as Row[]).find((r)=>r.stock_id===stockId);const instrument=((instruments.data||[]) as Row[]).find((r)=>r.stock_id===stockId);
  const history=instrument && ['TWSE','TPEX'].includes(String(instrument.exchange))?await loadTwEntryHistoricalPriceAuthority(client,{stockId,symbol,exchange:instrument.exchange as 'TWSE'|'TPEX',signalSession:String((screen.priceSessions as string[]|undefined)?.[0]||''),cutoff}):null;
  if(history)current.push(...currentPriceEvidence(history,new Set(original.filter((e)=>e.key==='current_price').map((e)=>e.id))));
  const price=history?historicalPriceFactors(history):null;const actualBar=history?.bars.at(-1);
  const technicalProvenance=technical?.provenance as Row|undefined;
  const validTechnical=price?.valid===true && technical?.ruleset_version==='technical-features-v3.0.0' && technicalProvenance?.promotionEligible===true && technicalProvenance?.authorityTier==='official_primary';
  const quote:AuditQuote={close:price?.close??null,session:price?.session||null,source:actualBar?.sourceUrl||'',adjusted:price?.valid===true,volume:price?.volume??null,ma20:price?.ma20??null,ma60:price?.ma60??null,volumeRatio:price?.volumeRatio20.value??null,institutionalFlow:validTechnical?numeric(technical?.institutional_flow_20d_norm):null,provenance:price?.provenance||[]};
  const frozen=member.evidence as Row;inputs.push({businessReceipt:publication?.businessReceipt as BusinessReceipt|null||null,semanticReceipt:publication?.semanticReceipt as CatalystReceipt|null||null,symbol,inputHash:String(member.inputHash),revisionId:publication?String(publication.revision_id):null,publishedInputHash:publication?String(publication.input_hash):null,previousAudit:member.previousAudit as {materialEvidence?:Row}|null,artifact:publication?.content as Artifact|null||null,review:publication?.review as Review|null||null,original,current,newContent,quote,cutoff,session:String(screen.session),market:{risk:String((screen.market as Row)?.risk||'unknown'),snapshotHash:String((screen.market as Row)?.snapshotHash||'')||null},previousMarketHash:String(frozen.marketSnapshotHash||'')||null,tradingValid:instrument?instrument.listing_status==='active':null});
 }
 return analysisWriter(async()=>({...await auditThesisCycle(inputs,{record:(reports)=>thesisCommand(identity,'record',{reports}),...(options.screen?{screen:(audits)=>import('./discovery.ts').then((module)=>module.scanCachedCandidates(identity,undefined,audits))}:{})}),
  cacheGaps:[facts.error?'verified_financial_cache_unavailable':null,technicals.error?'technical_cache_unavailable':null,instruments.error?'instrument_cache_unavailable':null].filter(Boolean)}));
}
