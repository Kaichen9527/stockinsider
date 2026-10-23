import {historicalPriceFactors,comparableBenchmark,operationsMonths} from './cached-price-factors.ts';
import { getSupabaseServerClient } from '../supabase-server';
import { command, enqueue, normalizedInput,type TrustedThesisAdmission } from './store.ts';
import { inputHash } from './policy.ts';
import { initialFactors, type ScreeningInputs } from './factors.ts';
import { screenRoundRobin, type Clue } from './screening.ts';
import { rotateCachedObservations, type RotationObservation } from './rotation.ts';
import type { Candidate } from './replacement.ts';
import type { VnextIdentity } from './auth.ts';
type Row = Record<string, unknown>;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Shared cache screening only. No financial coverage, downloads, parsers, external quotes or models. */
export async function scanCachedCandidates(identity: VnextIdentity, transport?: { client: ReturnType<typeof getSupabaseServerClient>; command: typeof command; enqueue: typeof enqueue; now: string; targets?:()=>Promise<unknown> }, audits?:Record<string,TrustedThesisAdmission>,options?:{symbols:string[];requestKey:string;admissionOnly:true}) {
  if(identity.role!=='operator')throw new Error('vnext_operator_required');
  if(options && !options.symbols.length)return {jobs:[],reason:'empty_scope',expensiveCalls:0};
  const send = transport?.command || command; const admit = transport?.enqueue || enqueue;
  // Evaluate all active target baselines before any routine update/admission can
  // create new work. The SQL command rechecks current membership under the same
  // mutex; explicit scope admission retains its original zero/limited behavior.
  const targets=options?null:transport?transport.targets?await transport.targets():null:await(await import('./reviewed-target.ts')).evaluateCachedTargets(identity);
  const context = await send(identity, 'screen-context', {}); const cutoff = transport?.now || new Date().toISOString();
  const sourceCommand = transport ? null : (await import('./analysis-runtime.ts')).analysisCommand;
  const sourceContext:Row = sourceCommand ? await sourceCommand(identity,'source-clues',{}) : {};
  const clues = screenRoundRobin([...(transport && Array.isArray(context.clues) ? context.clues : []), ...(Array.isArray(sourceContext.clues) ? sourceContext.clues : [])].filter((clue)=>!options || options.symbols.includes((clue as Clue).symbol)) as Clue[], cutoff);
  const active = ((Array.isArray(context.active) ? context.active : []) as Row[]).filter((row)=>!options || options.symbols.includes(String(row.symbol)));
  const candidateSymbols=[...new Set(clues.map((clue)=>clue.symbol))].filter((symbol)=>!active.some((member)=>member.symbol===symbol)).sort((a,b)=>{
    const latest=(symbol:string)=>clues.filter((clue)=>clue.symbol===symbol).map((clue)=>clue.eventAt).sort().at(-1)||'';
    return latest(b).localeCompare(latest(a))||a.localeCompare(b);
  });
  const symbols=options?options.symbols:[...new Set([...candidateSymbols.slice(0,200),...active.map((row)=>String(row.symbol))])].sort();
  const deferredOutsideSymbolBound=options?0:Math.max(0,candidateSymbols.length-200);
  if (!symbols.length) return { jobs: [], targets, scope: { screened: 0, admitted: 0, deferred: 0 }, gaps: ['allowed_source_cache_empty_or_identity_unresolved'] }; const client = transport?.client || getSupabaseServerClient();
  const instruments = await client.from('stock_instruments_v3').select('stock_id,symbol,exchange,listing_status,recorded_at,source_timestamp')
    .in('symbol', symbols).eq('instrument_type', 'common_stock')
    .lte('recorded_at', cutoff).lte('source_timestamp', cutoff).lte('valid_from', cutoff)
    .or(`valid_to.is.null,valid_to.gt.${cutoff}`).order('recorded_at', { ascending: false }).limit(2000);
  if (instruments.error) throw new Error('vnext_shared_instrument_cache_unavailable');
  const master = new Map<string, Row>(); for (const row of (instruments.data || []) as Row[]) if (!master.has(String(row.symbol))) master.set(String(row.symbol), row);
  const ids = [...new Set([...master.values()].map((r) => String(r.stock_id)))];
  if (!ids.length) return { jobs: [], targets, scope: { screened:new Set(clues.map((clue)=>clue.contentHash)).size,screenedClues:clues.length, admitted: 0, deferred: symbols.length }, gaps: ['official_instrument_cache_empty'] };
  const [technicals, revenues] = await Promise.all([
    client.from('technical_feature_snapshots').select('stock_id,session_date,close,volume_ratio_20_median,institutional_flow_20d_norm,as_of,available_at,provenance,ruleset_version')
      .in('stock_id', ids).eq('session_date', (context.priceSessions as string[]|undefined)?.[0]||context.session).lte('available_at', cutoff).order('available_at', { ascending: false }).limit(1000),
    client.from('revenue_signals').select('stock_id,monthly_revenue,yoy_growth,mom_growth,as_of_date,source_url,created_at').in('stock_id', ids)
      .gte('as_of_date', new Date(Date.parse(cutoff) - 120 * 86400000).toISOString().slice(0, 10)).lte('created_at', cutoff).order('as_of_date', { ascending: false }).limit(1000),
  ]);
  if (technicals.error || revenues.error) throw new Error('vnext_shared_screening_cache_unavailable');
  const priceRows: Row[] = [];
  for (let offset = 0; transport && offset < ids.length; offset += 20) {
    const read = await client.from('official_price_history').select('stock_id,session_date,close,source_url,available_at,provenance')
      .in('stock_id', ids.slice(offset, offset + 20)).gte('session_date', new Date(Date.parse(cutoff) - 45 * 86400000).toISOString().slice(0, 10))
      .lte('session_date', context.session).lte('available_at', cutoff).order('session_date', { ascending: false }).limit(1000);
    if (read.error) throw new Error('vnext_shared_price_cache_unavailable'); priceRows.push(...(read.data || []) as Row[]);
  }
  const histories=new Map<string,Awaited<ReturnType<typeof import('../tw-entry-plan-authority.ts')['loadTwEntryHistoricalPriceAuthority']>>>();
  let benchmarkRows:Row[]=[];
  if(!transport){
    const {loadTwEntryHistoricalPriceAuthority}=await import('../tw-entry-plan-authority.ts');
    for(let offset=0;offset<symbols.length;offset+=4)await Promise.all(symbols.slice(offset,offset+4).map(async(symbol)=>{const stock=master.get(symbol);if(stock && ['TWSE','TPEX'].includes(String(stock.exchange)))histories.set(symbol,await loadTwEntryHistoricalPriceAuthority(client,{stockId:String(stock.stock_id),symbol,exchange:stock.exchange as 'TWSE'|'TPEX',signalSession:String((context.priceSessions as string[]|undefined)?.[0]||''),cutoff}));}));
    const sessions=(context.priceSessions||[]) as string[];const benchmarks=await client.from('official_market_evidence_history').select('market,session_date,index_close,source_urls,as_of,available_at').in('market',['TWSE','TPEX']).gte('session_date',sessions.at(-1)||String(context.session)).lte('session_date',context.session).lte('as_of',cutoff).lte('available_at',cutoff).limit(50);
    if(!benchmarks.error)benchmarkRows=(benchmarks.data||[]) as Row[];
  }
  const frozen: Array<{ symbol: string; input: Row; points: number; weight: number; eventAt: string }> = [];
  for (const symbol of symbols) {
    const stockId = String(master.get(symbol)?.stock_id || ''); const member = active.find((r) => r.symbol === symbol);
    const previous = member?.evidence as Row | undefined;
    const matching = screenRoundRobin([...clues.filter((c) => c.symbol === symbol), ...((transport && Array.isArray(previous?.clues) ? previous.clues : []) as Clue[])], cutoff);
    const technical = ((technicals.data || []) as Row[]).find((r) => r.stock_id === stockId);
    const revenue = ((revenues.data || []) as Row[]).find((r) => r.stock_id === stockId);
    const bars = priceRows.filter((r) => r.stock_id === stockId).sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)));
    const provenance = technical?.provenance as Row | undefined;
    const expectedSessions = (Array.isArray(context.priceSessions) ? context.priceSessions : []) as string[];
    const validBars = expectedSessions.length === 21 && bars.length >= 21 && bars.slice(0, 21).every((r, index) => r.session_date === expectedSessions[index] && number(r.close) !== null && number(r.close)! > 0 && (r.provenance as Row | null)?.adjustment_status === 'verified');
    const observation = (value: number | null, source: string, observedAt: string) => ({ value, source, observedAt });
    const screening: ScreeningInputs = { cutoff, clues: matching, sourceHealthy: false, recent7: null, prior21: null,
      priceReturn20: observation(validBars ? Number(bars[0].close) / Number(bars[20].close) - 1 : null, String(bars[0]?.source_url || ''), String(bars[0]?.session_date || '')),
      volumeRatio20: observation(number(technical?.volume_ratio_20_median), String(bars[0]?.source_url || ''), String(technical?.as_of || '')),
      institutionalFlowRatio: observation(number(technical?.institutional_flow_20d_norm), String(provenance?.source || ''), String(technical?.as_of || '')),
      revenueGrowth: observation(number(revenue?.yoy_growth), String(revenue?.source_url || ''), String(revenue?.as_of_date || '')),
      catalystVerified: observation(null, '', ''), corporateActionAdjusted: provenance?.adjustment_status === 'verified' };
    const history=histories.get(symbol);const price=history?historicalPriceFactors(history):null;
    if(!transport){
      const missing={value:null,source:'',observedAt:''};const benchmark=history?comparableBenchmark(benchmarkRows,String(master.get(symbol)?.exchange),history.completedSessions,cutoff):missing;
      screening.priceReturn20=price?.priceReturn20||missing;screening.volumeRatio20=price?.volumeRatio20||missing;screening.trend20=price?.trend20||missing;screening.trend60=price?.trend60||missing;
      screening.relativeReturn20={value:price?.priceReturn20.value!==null && price?.priceReturn20.value!==undefined && benchmark.value!==null?price.priceReturn20.value-benchmark.value:null,source:[price?.priceReturn20.source,benchmark.source].filter(Boolean).join(','),observedAt:price?.priceReturn20.observedAt||''};
      screening.corporateActionAdjusted=price?.valid===true;
      const validTechnical=screening.corporateActionAdjusted && technical?.ruleset_version==='technical-features-v3.0.0' && provenance?.promotionEligible===true && provenance?.authorityTier==='official_primary';
      screening.institutionalFlowRatio=validTechnical?observation(number(technical?.institutional_flow_20d_norm),String(provenance?.source||''),String(technical?.as_of||'')):missing;
      screening.operationsMonths=operationsMonths(((revenues.data||[]) as Row[]).filter((row)=>row.stock_id===stockId),cutoff);
      screening.revenueGrowth=missing;
    }
    const score = initialFactors(screening);
    const input = { cutoff, clues: matching, screening, evidence: [], tradingValid: Boolean(stockId) && master.get(symbol)?.listing_status === 'active', marketSnapshotHash: (context.market as Row | null)?.snapshotHash || null,
      gaps: ['comparable_source_volume_baseline_unavailable', ...(!screening.corporateActionAdjusted ? ['shared_adjusted_price_basis_unavailable'] : [])],
      reasons: ['recent_original_event', 'shared_cached_screening'], initialScore: score };
    frozen.push({ symbol, input, points: score.confirmedPoints, weight: score.availableWeight, eventAt: matching.map((c) => c.eventAt).sort().at(-1) || '' });
  }
  frozen.sort((a, b) => b.points - a.points || b.weight - a.weight || b.eventAt.localeCompare(a.eventAt) || a.symbol.localeCompare(b.symbol));
  const sourceEvidence:Row={};if(sourceCommand)for(let offset=0;offset<symbols.length;offset+=20)Object.assign(sourceEvidence,await sourceCommand(identity,'source-projection',{symbols:symbols.slice(offset,offset+20)}));
  for(const row of frozen) row.input.evidence = (sourceEvidence[row.symbol] as Row|undefined)?.evidence || [];
  const observations: RotationObservation[] = frozen.map((row) => {
    const normalized = normalizedInput(row.symbol, row.input,audits?.[row.symbol]); const member = active.find((r) => r.symbol === row.symbol);
    // The preceding empty-scope server command owns trading-invalidity exits.
    // This projection can lack conflicting/history/clock fields and must never
    // turn a deferred roster check into a second caller-authored exit proof.
    return { symbol: row.symbol, input: normalized, active: Boolean(member), state: String(member?.state || ''),
      candidate: { ...normalized, symbol: row.symbol, eventAt: normalized.eventAt || '', catalystCancelled: false, tradingInvalid: false, targetHit: false, newThesis: false } as Candidate };
  });
  const rotation = options?{reason:'explicit_admission_does_not_rotate'}:await rotateCachedObservations({ session: String(context.session), completed: context.completed === true, postclose: context.postclose === true, weeklyDue: context.weeklyDue === true }, observations, (action, request) => send(identity, action, request));
  const considered = frozen.filter((r) => options || !active.some((m) => m.symbol === r.symbol) || audits?.[r.symbol]?.materialChanged===true && audits[r.symbol].revisionId && context.postclose === true && context.completed === true).slice(0, 20);
  const result = await admit(identity, { symbols: considered.map((c) => c.symbol), inputs: Object.fromEntries(considered.map((c) => [c.symbol, c.input])),
    requestKey: options?.requestKey || `shared-screen:${context.session}:${inputHash(considered.map((c) => ({ symbol: c.symbol, hash:normalizedInput(c.symbol,c.input,audits?.[c.symbol]).hash })))}` }, 'shared-cache-screen',audits);
  return { ...result, rotation, targets, scope: { screened:new Set(clues.map((clue)=>clue.contentHash)).size,screenedClues:clues.length, candidates: frozen.length, considered: considered.length,
    deferredOutsideSymbolBound,deferredOutsideBound: frozen.length - considered.length }, gaps: ['source_health_and_comparable_volume_not_attested', 'verified_catalyst_cancellation_and_contraindication_authority_unavailable'] };
}
