import type { SupabaseClient } from '@supabase/supabase-js';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { discoveryInstant, discoverySession, discoveryTaipeiDate, discoveryRelativeReturns,
  discoveryPricePhase, type DiscoveryPriceBar } from './research-discovery-evidence.ts';
import { isOfficialCandidatePriceSource } from './candidate-price-history.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import { TW_ENTRY_PLAN_RULESET } from './tw-entry-plan-contract.ts';

export const DISCOVERY_PRICE_POLICY = 'discovery-price-shadow-v1';
export const DISCOVERY_PRICE_BOUNDS = Object.freeze({ candidates: 5000, newReads: 32, readMs: 15_000,
  firstRows: 5000, calendarRows: 124, responseBytes: 8_000_000, perReadBytes: 64_000 });
type Row = Record<string, unknown>;
type Client = Pick<SupabaseClient, 'from'>;
export type DiscoveryPriceCandidate = { symbol: string; stockId: string; exchange: string;
  firstSeenAt: string | null; hasDiscoveryEvidence: boolean };
export type DiscoveryQuote = { session: string; close: number; volume: number | null;
  sourceUrl: string; availableAt: string; priceBasis: 'raw_exchange_quote' };
/** Server-adapter contract only. This is NOT an HTTP/model supplied context.
 * A future approved adapter must read actual validation records at cutoff. The
 * existing raw-quote adapter below cannot issue these verification receipts. */
export type DiscoveryOfficialWindow = {
  stock: DiscoveryPriceBar[]; benchmark: DiscoveryPriceBar[];
  calendar: { session: string; closeAt: string; availableAt: string }[];
  latestCompletedSession: string;
  priceBasis: { kind: 'adjusted_to_signal_session'; anchorSession: string; evidenceHash: string; availableAt: string } | null;
  validation: { status: 'passed' | 'failed'; recordedAt: string; evidenceHash: string; datasetHash: string } | null;
  phase: { ruleset: string; session: string; availableAt: string; datasetHash: string;
    close: number; ma20: number | null; atr14: number | null; rsi14: number | null;
    breakout: 'confirmed' | 'waiting'; pullback: 'confirmed' | 'waiting' } | null;
};
export type DiscoveryPriceRead = { quote: DiscoveryQuote | null; window: DiscoveryOfficialWindow | null;
  latestCompletedSession: string | null; missing: string[] };
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const known = (value: unknown, cutoff: string): value is string => discoveryInstant(value) && Date.parse(value) <= Date.parse(cutoff);
const unique = (values: string[]) => [...new Set(values)].sort();
function officialUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 800 || !isOfficialCandidatePriceSource(value)
    || sanitizePublicSourceUrl(value) !== value) return false;
  const url = new URL(value);
  return !url.hash && [...url.searchParams].every(([key, member]) => ['date','response','stockNo','type','lang'].includes(key)
    && /^[A-Za-z0-9_-]{1,40}$/u.test(member));
}
function validQuote(quote: DiscoveryQuote, cutoff: string) {
  return discoverySession(quote.session) && quote.session <= discoveryTaipeiDate(cutoff)
    && positive(quote.close) && (quote.volume === null || typeof quote.volume === 'number' && Number.isFinite(quote.volume) && quote.volume >= 0)
    && officialUrl(quote.sourceUrl) && known(quote.availableAt, cutoff)
    && Date.parse(quote.availableAt) >= Date.parse(`${quote.session}T13:30:00+08:00`)
    && quote.priceBasis === 'raw_exchange_quote';
}
export function discoveryWindowDatasetHash(window: Pick<DiscoveryOfficialWindow, 'stock' | 'benchmark' | 'calendar' | 'latestCompletedSession' | 'priceBasis'>) {
  return researchCanonicalHash({ stock: window.stock, benchmark: window.benchmark, calendar: window.calendar,
    latestCompletedSession: window.latestCompletedSession, priceBasis: window.priceBasis });
}

/** The pure shadow evaluator requires complete verified source/clock context.
 * No score/queue/entry eligibility is returned or changed. */
export function evaluateDiscoveryPrice(read: DiscoveryPriceRead, cutoff: string) {
  if (!discoveryInstant(cutoff)) throw new Error('discovery_cutoff_invalid');
  const missing = [...read.missing];
  let quote = read.quote;
  if (quote && !validQuote(quote, cutoff)) { quote = null; missing.push('quote_invalid_or_unavailable_at_discovery'); }
  if (!quote) missing.push('quote_missing_at_discovery');
  else if (quote.volume === null) missing.push('quote_volume_missing');
  let relative = { relative5d: null as number | null, relative20d: null as number | null, relative60d: null as number | null };
  let phase: ReturnType<typeof discoveryPricePhase> = 'unknown';
  const window = read.window;
  if (!window) missing.push('aligned_61_session_window_missing', 'benchmark_pit_validation_missing',
    'corporate_action_basis_missing', 'official_dataset_validation_missing', 'price_phase_metadata_missing');
  else {
    const gaps: string[] = [...read.missing];
    const sessions = window.calendar;
    if (sessions.length !== 61 || sessions.some((row, i) => !discoverySession(row.session)
      || i > 0 && row.session <= sessions[i - 1].session || !known(row.closeAt, cutoff) || !known(row.availableAt, cutoff)
      || discoveryTaipeiDate(row.closeAt) !== row.session || Date.parse(row.availableAt) < Date.parse(row.closeAt))
      || sessions.at(-1)?.session !== window.latestCompletedSession
      || read.latestCompletedSession !== window.latestCompletedSession) gaps.push('latest_completed_session_or_calendar_invalid');
    if (!window.priceBasis || window.priceBasis.kind !== 'adjusted_to_signal_session'
      || window.priceBasis.anchorSession !== window.latestCompletedSession || !HASH.test(window.priceBasis.evidenceHash)
      || !known(window.priceBasis.availableAt, cutoff)) gaps.push('corporate_action_basis_missing');
    const datasetHash = discoveryWindowDatasetHash(window);
    if (!window.validation || window.validation.status !== 'passed' || !known(window.validation.recordedAt, cutoff)
      || !HASH.test(window.validation.evidenceHash) || window.validation.datasetHash !== datasetHash)
      gaps.push('official_dataset_validation_missing_or_failed');
    if (window.validation && (window.priceBasis && Date.parse(window.priceBasis.availableAt) > Date.parse(window.validation.recordedAt)
      || sessions.some((row) => Date.parse(row.availableAt) > Date.parse(window.validation!.recordedAt))))
      gaps.push('price_session_or_validation_clock_invalid');
    if (window.stock.length !== 61 || window.benchmark.length !== 61 || window.stock.some((bar, i) => bar.session !== sessions[i]?.session)
      || window.benchmark.some((bar, i) => bar.session !== sessions[i]?.session)) gaps.push('aligned_61_session_window_missing');
    try {
      const computed = discoveryRelativeReturns(window.stock, window.benchmark, cutoff, { requireComplete61: true });
      if (computed.relative60d === null) gaps.push('aligned_61_session_window_missing');
      for (const bars of [window.stock, window.benchmark]) if (bars.some((bar, i) =>
        Date.parse(bar.availableAt) < Date.parse(sessions[i]?.closeAt)
        || Date.parse(bar.availableAt) > Date.parse(window.validation?.recordedAt || 'invalid')))
        gaps.push('price_session_or_validation_clock_invalid');
      if (quote && (quote.session !== window.latestCompletedSession || quote.close !== window.stock.at(-1)?.close))
        gaps.push('quote_window_binding_invalid');
      if (!gaps.length && quote) relative = computed;
    } catch { gaps.push('price_session_or_availability_invalid'); }
    const metadata = window.phase;
    if (!metadata || metadata.ruleset !== TW_ENTRY_PLAN_RULESET || metadata.session !== window.latestCompletedSession
      || metadata.datasetHash !== datasetHash || !known(metadata.availableAt, cutoff)
      || Date.parse(metadata.availableAt) < Date.parse(window.validation?.recordedAt || 'invalid')
      || metadata.close !== window.stock.at(-1)?.close || !['confirmed','waiting'].includes(metadata.breakout)
      || !['confirmed','waiting'].includes(metadata.pullback)) missing.push('price_phase_metadata_missing_or_invalid');
    else if (!gaps.length && quote) {
      phase = discoveryPricePhase({ ...metadata, officialDatasetVerified: true,
        breakoutConfirmed: metadata.breakout === 'confirmed', pullbackConfirmed: metadata.pullback === 'confirmed' });
      if (phase === 'unknown') missing.push('price_phase_features_invalid_or_conflicted');
    }
    missing.push(...gaps);
  }
  if (!read.latestCompletedSession) missing.push('latest_completed_session_missing');
  return { policyVersion: DISCOVERY_PRICE_POLICY, cutoff, quote, quoteStatus: quote ? 'official_raw_quote' : 'missing_at_discovery',
    latestCompletedSession: read.latestCompletedSession, ...relative, pricePhase: phase,
    phaseIsResearchSignalOnly: true, researchEvidenceRequired: true, rankingInfluence: false,
    missing: unique(missing), sourceDatasetHash: window ? discoveryWindowDatasetHash(window) : null };
}

function clockSequence(row: Row, cutoff: string) {
  const clocks = ['source_timestamp','collected_at','recorded_at'].map((key) => row[key]);
  return clocks.every((value, i) => known(value, cutoff) && (i === 0 || Date.parse(String(clocks[i - 1])) <= Date.parse(String(value))));
}
/** Fixed read-only surfaces, no network fetch/live backfill/model flags. These
 * tables do not prove a full adjusted benchmark window, so no returns/phase are
 * manufactured from raw cached quotes. */
export async function readDiscoveryRawQuote(client: Client, candidate: DiscoveryPriceCandidate, cutoff: string,
  signal: AbortSignal): Promise<DiscoveryPriceRead> {
  const empty = (reason: string): DiscoveryPriceRead => ({ quote: null, window: null, latestCompletedSession: null, missing: [reason] });
  if (!UUID.test(candidate.stockId) || !['TWSE','TPEX'].includes(candidate.exchange)) return empty('official_instrument_identity_missing');
  try {
    const calendar = await client.from('tw_trading_sessions_v3')
      .select('session_id,status,market,provider,open_at,close_at,source_timestamp,collected_at,recorded_at,source_ref')
      .eq('market', candidate.exchange).lte('close_at', cutoff).lte('source_timestamp', cutoff)
      .lte('collected_at', cutoff).lte('recorded_at', cutoff)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false })
      .limit(DISCOVERY_PRICE_BOUNDS.calendarRows).abortSignal(signal);
    if (calendar.error || !Array.isArray(calendar.data)) return empty('official_calendar_read_failed');
    if (calendar.data.length >= DISCOVERY_PRICE_BOUNDS.calendarRows
      || Buffer.byteLength(JSON.stringify(calendar.data)) > DISCOVERY_PRICE_BOUNDS.perReadBytes) return empty('official_calendar_read_bound');
    const heads = new Map<string, Row>();
    for (const row of calendar.data as Row[]) {
      if (!discoverySession(row.session_id) || !['completed','cancelled'].includes(String(row.status))
        || row.market !== candidate.exchange || row.provider !== candidate.exchange.toLowerCase()
        || !clockSequence(row, cutoff) || !known(row.open_at, cutoff) || !known(row.close_at, cutoff)
        || Date.parse(row.open_at) >= Date.parse(row.close_at) || discoveryTaipeiDate(row.close_at) !== row.session_id
        || discoveryTaipeiDate(row.open_at) !== row.session_id || typeof row.source_ref !== 'string' || !row.source_ref || row.source_ref.length > 512
        || row.status === 'completed' && Date.parse(String(row.recorded_at)) < Date.parse(row.close_at))
        return empty('official_calendar_validation_failed');
      const previous = heads.get(row.session_id);
      const semantic = (value: Row) => [value.status,value.provider,value.source_ref,
        ...['open_at','close_at','source_timestamp','collected_at'].map((key)=>Date.parse(String(value[key])))];
      if (previous && Date.parse(String(previous.recorded_at)) === Date.parse(String(row.recorded_at))
        && researchCanonicalHash(semantic(previous)) !== researchCanonicalHash(semantic(row)))
        return empty('official_calendar_conflict');
      if (!previous || Date.parse(String(row.recorded_at)) > Date.parse(String(previous.recorded_at))) heads.set(row.session_id, row);
    }
    const latest = [...heads.values()].filter((row) => row.status === 'completed')
      .sort((a,b) => String(b.session_id).localeCompare(String(a.session_id)))[0];
    if (!latest) return empty('latest_completed_session_missing');
    const session = String(latest.session_id);
    const prices = await client.from('official_price_history')
      .select('session_date,close,volume,source_url,as_of,available_at,provider:provenance->>provider,integrityStatus:provenance->>integrityStatus,integrity_status:provenance->>integrity_status')
      .eq('stock_id', candidate.stockId).eq('session_date', session)
      .lte('as_of', cutoff).lte('available_at', cutoff).limit(2).abortSignal(signal);
    if (prices.error || !Array.isArray(prices.data)) return empty('official_quote_read_failed');
    if (Buffer.byteLength(JSON.stringify(prices.data)) > DISCOVERY_PRICE_BOUNDS.perReadBytes) return empty('official_quote_read_bound');
    const row = prices.data[0] as Row | undefined;
    const gaps = ['aligned_benchmark_adapter_unavailable', 'adjusted_history_adapter_unavailable'];
    // Persisted completed rows alone cannot prove a later holiday/closure or
    // rule out an absent more recent session. No weekday/weekend inference.
    const latestKnown = session === discoveryTaipeiDate(cutoff);
    if (!latestKnown) gaps.push('latest_completed_session_freshness_unverified');
    const latestCompletedSession = latestKnown ? session : null;
    if (prices.data.length !== 1 || !row) return { quote:null,window:null,latestCompletedSession,missing:[...gaps,'official_quote_missing_at_discovery'] };
    if (!['twse','tpex','official_primary'].includes(String(row.provider))
      || row.provider !== 'official_primary' && row.provider !== candidate.exchange.toLowerCase()
      || row.integrityStatus !== 'valid' && row.integrity_status !== 'valid'
      || row.integrityStatus === 'conflict' || row.integrity_status === 'conflict'
      || !officialUrl(row.source_url)
      || !(candidate.exchange === 'TWSE' ? ['www.twse.com.tw','twse.com.tw','openapi.twse.com.tw']
        : ['www.tpex.org.tw','tpex.org.tw','openapi.tpex.org.tw']).includes(new URL(String(row.source_url)).hostname)
      || !known(row.as_of, cutoff) || !known(row.available_at, cutoff)
      || Date.parse(row.as_of) < Date.parse(String(latest.close_at)) || Date.parse(row.as_of) > Date.parse(row.available_at))
      return {quote:null,window:null,latestCompletedSession,missing:[...gaps,'official_quote_validation_failed']};
    const quote = {session:String(row.session_date),close:row.close as number,volume:row.volume as number | null,
      sourceUrl:String(row.source_url),availableAt:String(row.available_at),priceBasis:'raw_exchange_quote' as const};
    return {quote:validQuote(quote,cutoff) ? quote : null,window:null,latestCompletedSession,
      missing:[...gaps,...(validQuote(quote,cutoff) ? [] : ['official_quote_validation_failed'])]};
  } catch { return empty(signal.aborted ? 'price_read_deadline' : 'official_price_read_failed'); }
}

type FirstRow = {symbol:string;run_id:string;first_seen_at:string;captured_at:string;snapshot:Row};
function frozenContext(row: FirstRow, cutoff: string) {
  if (!known(row.first_seen_at, cutoff) || !known(row.captured_at, cutoff)
    || Date.parse(row.first_seen_at) > Date.parse(row.captured_at) || !UUID.test(row.run_id)
    || !row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot))
    throw new Error('immutable_first_discovery_invalid');
  const raw = row.snapshot.price as DiscoveryQuote | null;
  // The canonical capture stores raw quote/gaps and null relative returns. Keep
  // that frozen truth; a later reader must never fill its gaps with newer data.
  const projected = raw ? {session:raw.session,close:raw.close,volume:raw.volume,sourceUrl:raw.sourceUrl,
    availableAt:raw.availableAt,priceBasis:raw.priceBasis} : null;
  return { ...evaluateDiscoveryPrice({quote:projected,window:null,latestCompletedSession:null,
    missing:['immutable_capture_retained_without_backfill']},row.first_seen_at),
    origin:'immutable_first_discovery' as const, firstRunId:row.run_id,
    capturedAt:row.captured_at, immutableSnapshotHash:researchCanonicalHash(row.snapshot) };
}
export type DiscoveryPriceContext = ReturnType<typeof evaluateDiscoveryPrice> & {
  origin: 'immutable_first_discovery' | 'cutoff_read' | 'not_read'; firstRunId: string | null;
  capturedAt: string | null; immutableSnapshotHash: string | null; contextHash?: string };

/** Every candidate gets an immutable shadow receipt, even if admission or the
 * registry fails. Sorted symbol admission has no effect on existing Top20. */
export async function loadDiscoveryPriceEnrichment(client: Client, candidates: DiscoveryPriceCandidate[], asOf: string,
  options: { reader?: typeof readDiscoveryRawQuote; monotonicNow?: () => number } = {}) {
  if (!discoveryInstant(asOf) || candidates.length > DISCOVERY_PRICE_BOUNDS.candidates
    || new Set(candidates.map((row)=>row.symbol)).size !== candidates.length
    || candidates.some((row)=>!/^\d{4}$/u.test(row.symbol) || row.firstSeenAt !== null && !known(row.firstSeenAt,asOf)))
    throw new Error('discovery_price_candidates_invalid');
  const abort = new AbortController();
  const timer = setTimeout(()=>abort.abort(),DISCOVERY_PRICE_BOUNDS.readMs);
  const now = options.monotonicNow || (()=>performance.now());
  const deadline = now() + DISCOVERY_PRICE_BOUNDS.readMs;
  const first = new Map<string,FirstRow>();
  let registryFailure: string | null = null;
  try {
    let bytes = 0;
    for (let from=0;from<=DISCOVERY_PRICE_BOUNDS.firstRows;from+=500) {
      const count=Math.min(500,DISCOVERY_PRICE_BOUNDS.firstRows+1-from);
      const result=await client.from('research_first_discoveries_v1')
        .select('symbol,run_id,first_seen_at,captured_at,snapshot').lte('captured_at',asOf)
        .order('symbol').range(from,from+count-1).abortSignal(abort.signal);
      if(result.error || !Array.isArray(result.data)) throw new Error('first_discovery_registry_read_failed');
      bytes+=Buffer.byteLength(JSON.stringify(result.data));
      if(first.size+result.data.length>DISCOVERY_PRICE_BOUNDS.firstRows || bytes>DISCOVERY_PRICE_BOUNDS.responseBytes)
        throw new Error('first_discovery_registry_read_bound');
      for(const row of result.data as FirstRow[]) {
        if(!/^\d{4}$/u.test(row.symbol) || first.has(row.symbol)) throw new Error('first_discovery_registry_invalid');
        first.set(row.symbol,row);
      }
      if(result.data.length<count) break;
    }
  } catch(error) { registryFailure=error instanceof Error && /^first_discovery_[a-z_]+$/u.test(error.message)
    ? error.message : 'first_discovery_registry_read_failed'; }
  const contexts = new Map<string,DiscoveryPriceContext>();
  let admitted = 0;
  try {
    for(const candidate of [...candidates].sort((a,b)=>a.symbol.localeCompare(b.symbol))) {
      const cutoff=candidate.firstSeenAt || asOf;
      let context: DiscoveryPriceContext;
      const retained=first.get(candidate.symbol);
      if(registryFailure) context={...evaluateDiscoveryPrice({quote:null,window:null,latestCompletedSession:null,
        missing:[registryFailure]},cutoff),origin:'not_read',firstRunId:null,capturedAt:null,immutableSnapshotHash:null};
      else if(retained) {
        try {context=frozenContext(retained,asOf);}
        catch {context={...evaluateDiscoveryPrice({quote:null,window:null,latestCompletedSession:null,
          missing:['immutable_first_discovery_invalid']},cutoff),origin:'not_read',firstRunId:null,capturedAt:null,immutableSnapshotHash:null};}
      } else {
        const reason=!candidate.hasDiscoveryEvidence || !candidate.firstSeenAt ? 'discovery_evidence_missing'
          : admitted>=DISCOVERY_PRICE_BOUNDS.newReads ? 'price_read_admission_bound'
          : now()>=deadline || abort.signal.aborted ? 'price_read_deadline' : null;
        let read:DiscoveryPriceRead={quote:null,window:null,latestCompletedSession:null,missing:reason ? [reason] : []};
        if(!reason) {
          admitted++;
          try {read=await (options.reader || readDiscoveryRawQuote)(client,candidate,cutoff,abort.signal);}
          catch {read={quote:null,window:null,latestCompletedSession:null,missing:['official_price_read_failed']};}
        }
        context={...evaluateDiscoveryPrice(read,cutoff),origin:reason ? 'not_read' : 'cutoff_read',
          firstRunId:null,capturedAt:null,immutableSnapshotHash:null};
      }
      contexts.set(candidate.symbol,{...context,contextHash:researchCanonicalHash(context)});
    }
    return {policyVersion:DISCOVERY_PRICE_POLICY,contexts,expectedCount:candidates.length,accountedCount:contexts.size,
      admittedReads:admitted,bounds:DISCOVERY_PRICE_BOUNDS,rankingInfluence:false};
  } finally {clearTimeout(timer);}
}
