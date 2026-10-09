import type { SupabaseClient } from '@supabase/supabase-js';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { researchDeepInstant } from './research-deep-claim-context.ts';
import type { TwEntryAuthorityResult } from './tw-entry-plan-authority.ts';

export const MONITOR_BENCHMARK_VERSION = 'research-monitor-benchmark-context-v1' as const;
export const MONITOR_BENCHMARK_LIMITS = Object.freeze({
  calendarRows: 4096, marketRows: 3904, readBytes: 8 * 1024 * 1024,
  pageRows: 500, deadlineMs: 15_000,
});
type Row = Record<string, unknown>;
export type MonitorBenchmarkInput = {
  symbol: string; exchange: 'TWSE' | 'TPEX'; signalSession: string; cutoff: string;
  authority: TwEntryAuthorityResult;
};
const calendarKeys = ['session_authority_id', 'session_id', 'market', 'open_at', 'close_at',
  'status', 'provider', 'source_timestamp', 'collected_at', 'recorded_at', 'source_ref'];
const marketKeys = ['observation_id', 'fact_key', 'scope_key', 'session_id', 'session_authority_id',
  'value', 'unit', 'provider', 'provider_identity', 'authority_date', 'provider_session_date',
  'observed_at', 'collected_at', 'source_ref', 'provider_revision', 'recorded_at'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
function ensure(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`benchmark_${reason}`); }
function text(value: unknown, maximum = 4096): asserts value is string {
  ensure(typeof value === 'string' && value.length > 0 && value === value.trim()
    && !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.byteLength(value, 'utf8') <= maximum, 'text_invalid');
}
function date(value: unknown): asserts value is string {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'session_invalid');
}
function instant(value: unknown) {
  text(value, 40);
  try { return researchDeepInstant(value); } catch { throw new Error('benchmark_clock_invalid'); }
}
function record(value: unknown, keys: string[]): asserts value is Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'row_invalid');
  ensure(Object.keys(value).sort().join(',') === [...keys].sort().join(','), 'row_shape');
}
function benchmark(exchange: 'TWSE' | 'TPEX') {
  return exchange === 'TWSE'
    ? { fact: 'taiex_close', scope: 'TAIEX', provider: 'twse' }
    : { fact: 'otc_close', scope: 'OTC', provider: 'tpex' };
}
function authorityWindow(input: MonitorBenchmarkInput) {
  ensure(/^\d{4}$/u.test(input.symbol) && ['TWSE', 'TPEX'].includes(input.exchange), 'identity_invalid');
  date(input.signalSession); const cutoff = instant(input.cutoff), a = input.authority;
  ensure(a && a.missingData.length === 0 && a.calendar && a.calendar.signalSession === input.signalSession
    && a.priceBasis?.status === 'verified' && a.priceBasis.kind === 'adjusted_to_signal_session'
    && a.priceBasis.anchorSession === input.signalSession && HASH.test(a.priceBasis.adjustmentEvidenceHash)
    && a.bars.length === 240, 'stock_authority_unavailable');
  text(a.sourceDatasetRevision, 2048); text(a.calendar.version, 2048);
  ensure(instant(a.calendar.knownAt) <= cutoff && instant(a.availableAt) <= cutoff, 'stock_authority_future');
  const sessions = a.calendar.completedSessions.slice(-61), bars = a.bars.slice(-61);
  ensure(sessions.length === 61 && sessions.at(-1) === input.signalSession, 'stock_window_missing');
  for (let i = 0; i < sessions.length; i++) {
    date(sessions[i]); const bar = bars[i];
    ensure((i === 0 || sessions[i] > sessions[i - 1]) && bar.session === sessions[i]
      && typeof bar.close === 'number' && Number.isFinite(bar.close) && bar.close > 0
      && instant(bar.availableAt) <= cutoff, 'stock_window_invalid');
    text(bar.sourceRef, 4096);
  }
  return { cutoff, sessions, bars };
}
function clocks(row: Row, keys: string[], cutoff: bigint) {
  const values = keys.map((key) => instant(row[key]));
  ensure(values.every((value, i) => value <= cutoff && (i === 0 || values[i - 1] <= value)), 'clock_order');
}
function selectedHeads(rows: Row[], id: string, semanticKeys: string[]) {
  const bySession = new Map<string, Row[]>(), ids = new Set<string>();
  for (const row of rows) {
    ensure(typeof row[id] === 'string' && UUID.test(row[id] as string) && !ids.has(row[id] as string), 'row_identity');
    ids.add(row[id] as string);
    const group = bySession.get(row.session_id as string) || [];
    group.push(row); bySession.set(row.session_id as string, group);
  }
  const selected = new Map<string, Row>();
  for (const [session, group] of bySession) {
    group.sort((a, b) => {
      const left = instant(a.recorded_at), right = instant(b.recorded_at);
      return left === right ? (a[id] as string) < (b[id] as string) ? -1 : 1 : left > right ? -1 : 1;
    });
    const head = group[0];
    const semantics = (row: Row) => semanticKeys.map((key) => key.endsWith('_at') || key === 'source_timestamp'
      ? instant(row[key]).toString() : row[key]);
    const signature = researchCanonicalHash(semantics(head));
    for (const row of group) if (instant(row.recorded_at) === instant(head.recorded_at))
      ensure(researchCanonicalHash(semantics(row)) === signature, 'conflicting_head');
    selected.set(session, head);
  }
  return selected;
}
function baseContext(input: MonitorBenchmarkInput) {
  return {
    version: MONITOR_BENCHMARK_VERSION, symbol: input.symbol, exchange: input.exchange,
    signalSession: input.signalSession, cutoff: input.cutoff, benchmark: benchmark(input.exchange),
    formula: '(stockEnd/stockStart)/(indexEnd/indexStart)-1' as const, unit: 'fraction' as const,
    returnBasis: 'signal_session_adjusted_stock_price_vs_official_price_index' as const,
    sourceDatasetRevision: input.authority?.sourceDatasetRevision || null,
    stockPriceBasisHash: input.authority?.priceBasis ? researchCanonicalHash(input.authority.priceBasis) : null,
    calendarVersion: input.authority?.calendar?.version || null,
    strategyAuthority: false as const,
  };
}
function unavailable(input: MonitorBenchmarkInput, error: unknown) {
  const reason = error instanceof Error && /^benchmark_[a-z_]+$/u.test(error.message)
    ? error.message : 'benchmark_read_failed';
  const value = { ...baseContext(input), available: false as const, coverageSessions: 0,
    sourceEvidenceHash: null, stockWindowHash: null,
    returns: { 5: null, 20: null, 60: null }, missingData: [reason] };
  return { ...value, contextHash: researchCanonicalHash(value) };
}

/** Pure calculation over actual server reads; cannot authenticate an authority. */
export function calculateMonitorBenchmarkContext(input: MonitorBenchmarkInput, calendarRows: Row[], marketRows: Row[]) {
  try {
    const { sessions, bars, cutoff } = authorityWindow(input), expected = benchmark(input.exchange);
    ensure(calendarRows.length <= MONITOR_BENCHMARK_LIMITS.calendarRows
      && marketRows.length <= MONITOR_BENCHMARK_LIMITS.marketRows, 'row_bound');
    ensure(Buffer.byteLength(JSON.stringify([calendarRows, marketRows]), 'utf8') <= MONITOR_BENCHMARK_LIMITS.readBytes, 'byte_bound');
    const dates = new Set(sessions);
    for (const row of calendarRows) {
      record(row, calendarKeys); date(row.session_id); text(row.source_ref);
      ensure(dates.has(row.session_id) && row.market === input.exchange && row.provider === expected.provider
        && typeof row.status === 'string' && ['completed', 'cancelled'].includes(row.status), 'calendar_invalid');
      clocks(row, ['source_timestamp', 'collected_at', 'recorded_at'], cutoff);
      const open = instant(row.open_at), close = instant(row.close_at);
      const civil = (time: bigint) => {
        const millis = time >= 0 ? time / BigInt(1000) : -((-time + BigInt(999)) / BigInt(1000));
        return new Date(Number(millis) + 8 * 3600_000).toISOString().slice(0, 10);
      };
      ensure(open < close && civil(open) === row.session_id && civil(close) === row.session_id, 'calendar_invalid');
    }
    const calendar = selectedHeads(calendarRows, 'session_authority_id', calendarKeys.filter((key) => key !== 'session_authority_id' && key !== 'recorded_at'));
    ensure(sessions.every((session) => calendar.get(session)?.status === 'completed'
      && instant(calendar.get(session)!.close_at) <= cutoff), 'calendar_incomplete');
    for (const row of marketRows) {
      record(row, marketKeys); date(row.session_id); text(row.source_ref); text(row.provider_revision);
      ensure(dates.has(row.session_id) && row.fact_key === expected.fact && row.scope_key === expected.scope
        && row.provider === expected.provider && row.unit === 'index_points'
        && row.authority_date === row.session_id && row.provider_identity === null && row.provider_session_date === null
        && typeof row.session_authority_id === 'string' && UUID.test(row.session_authority_id)
        && typeof row.value === 'number' && Number.isFinite(row.value) && row.value > 0, 'market_invalid');
      clocks(row, ['observed_at', 'collected_at', 'recorded_at'], cutoff);
    }
    const market = selectedHeads(marketRows, 'observation_id', marketKeys.filter((key) => key !== 'observation_id' && key !== 'recorded_at'));
    ensure(sessions.every((session) => market.has(session)), 'market_incomplete');
    for (const session of sessions) {
      const row = market.get(session)!, day = calendar.get(session)!;
      ensure(row.session_authority_id === day.session_authority_id
        && instant(row.observed_at) >= instant(day.close_at), 'calendar_binding_invalid');
    }
    const stockRatio = (n: number) => bars.at(-1)!.close / bars[bars.length - 1 - n].close;
    const marketRatio = (n: number) => Number(market.get(sessions.at(-1)!)!.value) / Number(market.get(sessions[sessions.length - 1 - n])!.value);
    const result = (n: number) => ({ stockPriceReturn: stockRatio(n) - 1, indexPriceReturn: marketRatio(n) - 1,
      relativeWealthRatioMinusOne: stockRatio(n) / marketRatio(n) - 1 });
    const returns = { 5: result(5), 20: result(20), 60: result(60) };
    ensure(Object.values(returns).every((row) => Object.values(row).every(Number.isFinite)), 'numeric_invalid');
    const value = { ...baseContext(input), available: true as const, coverageSessions: 61,
      sourceEvidenceHash: researchCanonicalHash({ calendar: sessions.map((session) => calendar.get(session)),
        market: sessions.map((session) => market.get(session)) }),
      stockWindowHash: researchCanonicalHash(bars.map((bar) => [bar.session, bar.close, bar.availableAt, bar.sourceRef])),
      returns, missingData: [] as string[] };
    return { ...value, contextHash: researchCanonicalHash(value) };
  } catch (error) { return unavailable(input, error); }
}

/** Bounded readonly adapter. One shared deadline covers every page and relation. */
export async function loadMonitorBenchmarkContext(db: Pick<SupabaseClient, 'from'>, input: MonitorBenchmarkInput) {
  let controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { sessions } = authorityWindow(input), expected = benchmark(input.exchange);
    controller = new AbortController(); const signal = controller.signal;
    const deadline = performance.now() + MONITOR_BENCHMARK_LIMITS.deadlineMs;
    const expired = new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('benchmark_deadline')), { once: true });
    });
    timer = setTimeout(() => controller!.abort(), MONITOR_BENCHMARK_LIMITS.deadlineMs);
    let readBytes = 7; // JSON.stringify([[], []]); charge each retained row/comma once.
    const read = async (table: string, keys: string[], maximum: number, id: string) => {
      const rows: Row[] = []; let expectedCount: number | undefined;
      for (let from = 0; from <= maximum; from += MONITOR_BENCHMARK_LIMITS.pageRows) {
        ensure(!signal.aborted && performance.now() < deadline, 'deadline');
        const count = Math.min(MONITOR_BENCHMARK_LIMITS.pageRows, maximum + 1 - from);
        let query = db.from(table).select(keys.join(','), { count: 'exact' }).in('session_id', sessions)
          .lte('collected_at', input.cutoff).lte('recorded_at', input.cutoff)
          .order('session_id').order('recorded_at', { ascending: false }).order(id)
          .range(from, from + count - 1).abortSignal(signal);
        query = table === 'tw_trading_sessions_v3'
          ? query.eq('market', input.exchange).eq('provider', expected.provider).lte('source_timestamp', input.cutoff)
          : query.eq('fact_key', expected.fact).eq('scope_key', expected.scope).eq('provider', expected.provider)
            .eq('unit', 'index_points').lte('observed_at', input.cutoff);
        const result = await Promise.race([query, expired]);
        ensure(!signal.aborted && performance.now() < deadline, 'deadline');
        ensure(!result.error && Array.isArray(result.data) && result.data.length <= count, 'read_failed');
        ensure(typeof result.count === 'number' && Number.isInteger(result.count) && result.count >= 0, 'read_incomplete');
        ensure(result.count <= maximum, 'row_bound');
        ensure(expectedCount === undefined || expectedCount === result.count, 'read_incomplete');
        expectedCount = result.count;
        for (let i = 0; i < result.data.length; i++)
          readBytes += Buffer.byteLength(JSON.stringify(result.data[i]), 'utf8') + (rows.length + i > 0 ? 1 : 0);
        ensure(readBytes <= MONITOR_BENCHMARK_LIMITS.readBytes, 'byte_bound');
        rows.push(...result.data as Row[]); ensure(rows.length <= maximum, 'row_bound');
        ensure(rows.length <= expectedCount && (result.data.length === count || rows.length === expectedCount), 'read_incomplete');
        if (rows.length === expectedCount) return rows;
      }
      return rows;
    };
    const calendarRows = await read('tw_trading_sessions_v3', calendarKeys, MONITOR_BENCHMARK_LIMITS.calendarRows, 'session_authority_id');
    const marketRows = await read('opportunity_market_observations_v3', marketKeys, MONITOR_BENCHMARK_LIMITS.marketRows, 'observation_id');
    ensure(!signal.aborted && performance.now() < deadline, 'deadline');
    const result = calculateMonitorBenchmarkContext(input, calendarRows, marketRows);
    ensure(!signal.aborted && performance.now() < deadline, 'deadline');
    return result;
  } catch (error) { return unavailable(input, error); }
  finally { if (timer) clearTimeout(timer); controller?.abort(); }
}
