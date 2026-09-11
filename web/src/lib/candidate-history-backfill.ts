import type { SupabaseClient } from '@supabase/supabase-js';
import { collectBatchedAuthorityRows } from './candidate-research-policy.ts';
import { isHistoryDate } from './candidate-price-history.ts';
import { fetchTwStockHistoryMonth, twStockHistoryMonthUrl, type TwMarketDailyBar, type TwValuationHistoryPoint } from './tw-market.ts';
import {
  CANDIDATE_HISTORY_POLICY_VERSION, historyRetryAt, planCandidateHistoryBackfill,
  type CandidateHistoryInput, type HistoryMonthCheckpoint,
} from './candidate-history-backfill-policy.ts';

export async function readCandidateHistoryCheckpoints(client: SupabaseClient, stockIds: string[]) {
  return collectBatchedAuthorityRows([...new Set(stockIds)], async (batch, from, to) => {
    const result = await client.from('candidate_history_backfill_months_v1').select('*')
      .in('stock_id', batch).order('stock_id').order('dataset').order('month').range(from, to);
    if (result.error) throw new Error(`candidate_history_checkpoint_read_failed:${result.error.message}`);
    return (result.data || []) as HistoryMonthCheckpoint[];
  }, { batchSize: 50, pageSize: 500, maxRowsPerBatch: 20000, requireComplete: true });
}

/** Called only from the existing authenticated candidate-research writer. Each
 * completion RPC atomically stores downloaded evidence and its month checkpoint;
 * a crash cannot advance the cursor past prices/multiples that were never saved.
 */
export async function runCandidateHistoryBackfill(options: {
  client: SupabaseClient; candidates: CandidateHistoryInput[]; officialSessions: string[];
  latestSession: string; evaluationAt: string; requestBudget?: number; perStockBudget?: number;
}, dependencies = { fetchMonth: fetchTwStockHistoryMonth }) {
  const checkpoints = await readCandidateHistoryCheckpoints(options.client, options.candidates.map((item) => item.stockId));
  const jobs = planCandidateHistoryBackfill({ ...options, checkpoints });
  const prices = new Map<string, TwMarketDailyBar[]>();
  const multiples = new Map<string, TwValuationHistoryPoint[]>();
  const items: Array<{ stockId: string; dataset: string; month: string; status: string; terminalReason: string; rows: number }> = [];
  // At most four pending requests; TWSE/TPEx's existing host pacing serializes
  // same-host traffic and a circuit-open result is recorded, never called empty.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const fetched = await dependencies.fetchMonth(job).catch((error: unknown) => ({
        bars: [] as TwMarketDailyBar[], multiples: [] as TwValuationHistoryPoint[], sourceUrl: twStockHistoryMonthUrl(job),
        httpStatus: null, terminalReason: error instanceof Error && /timeout|abort/iu.test(`${error.name} ${error.message}`)
          ? 'official_timeout' : 'official_network_error',
      }));
      const acquiredAt = new Date().toISOString();
      const candidate = options.candidates.find((item) => item.stockId === job.stockId)!;
      const validSession = (date: string) => isHistoryDate(date) && date.slice(0, 7) === job.month.slice(0, 7)
        && date <= options.latestSession && (!candidate.listing || date >= candidate.listing.date);
      const rowsValid = fetched.bars.every((bar) => validSession(bar.time)
        && [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
        && bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close)
        && bar.low <= bar.high && (bar.volume == null || (Number.isFinite(bar.volume) && bar.volume >= 0)))
        && fetched.multiples.every((point) => validSession(point.date)
          && [point.peRatio, point.pbRatio].every((value) => value == null || (Number.isFinite(value) && value > 0)));
      const bars = rowsValid ? fetched.bars : [];
      const points = rowsValid ? fetched.multiples : [];
      const sessions = (job.dataset === 'price' ? bars.map((row) => row.time) : points.map((row) => row.date)).sort();
      let reason = rowsValid ? fetched.terminalReason : 'official_schema_error';
      if (reason === 'complete' && job.dataset === 'price' && job.expectedSessions.some((date) => !sessions.includes(date))) {
        // A suspension or partial response is an explicit gap, not a made-up
        // pre-listing boundary. It is rechecked at bounded, backed-off intervals.
        reason = 'official_session_rows_missing';
      }
      if (reason === 'complete' && job.dataset === 'multiple' && sessions.at(-1) !== job.lastSession) reason = 'official_session_rows_missing';
      const status = reason === 'complete' ? 'complete' : 'retry';
      const result = await options.client.rpc('complete_candidate_history_month_v1', {
        p_stock_id: job.stockId, p_dataset: job.dataset, p_month: job.month,
        p_attempted_at: acquiredAt, p_latest_session: options.latestSession,
        p_observed_through: job.lastSession, p_status: status, p_terminal_reason: reason,
        p_next_attempt_at: status === 'complete' ? null : historyRetryAt(acquiredAt, (job.previous?.attempts || 0) + 1, reason),
        p_source_url: fetched.sourceUrl, p_parser_version: CANDIDATE_HISTORY_POLICY_VERSION,
        p_prices: bars, p_multiples: points,
      });
      if (result.error) throw new Error(`candidate_history_month_write_failed:${result.error.message}`);
      const completion = result.data as { status: string; terminal_reason: string };
      if (completion.status !== 'conflict') {
        prices.set(job.stockId, [...(prices.get(job.stockId) || []), ...bars]);
        multiples.set(job.stockId, [...(multiples.get(job.stockId) || []), ...points]);
      }
      items.push({ stockId: job.stockId, dataset: job.dataset, month: job.month,
        status: completion.status, terminalReason: completion.terminal_reason, rows: sessions.length });
    }
  }));
  return { policyVersion: CANDIDATE_HISTORY_POLICY_VERSION, attempted: jobs.length, prices, multiples,
    items: items.sort((a, b) => a.stockId.localeCompare(b.stockId) || a.dataset.localeCompare(b.dataset) || a.month.localeCompare(b.month)) };
}

let dailyPriceAttemptMs = 0;

/** Append only newly acquired daily evidence. Never rewrite a cached history or
 * advance a month to complete from rows that were not submitted in this call. */
export async function persistCandidateDailyPriceEvidence(options: {
  client: SupabaseClient; stockId: string; bars: TwMarketDailyBar[];
  officialSessions: string[]; latestSession: string;
}) {
  if (options.bars.length > 5) throw new Error('candidate_daily_price_batch_exceeds_limit');
  const sessions = [...new Set(options.officialSessions.filter((date) => isHistoryDate(date)
    && date <= options.latestSession))].sort();
  if (!isHistoryDate(options.latestSession) || sessions.at(-1) !== options.latestSession) {
    throw new Error('candidate_daily_price_calendar_invalid');
  }
  const dailySessions = new Set(sessions.slice(-5));
  const groups = new Map<string, { month: string; sourceUrl: string; bars: TwMarketDailyBar[] }>();
  const conflicts = new Map<string, { stockId: string; dataset: 'price'; month: string; terminalReason: string }>();
  const providerConflicts = new Map<string, { sourceUrl: string; session: string }>();
  const items: Array<{ stockId: string; dataset: 'price'; month: string; status: string; terminalReason: string; rows: number }> = [];
  for (const bar of options.bars) {
    if (bar.provider !== 'official_primary' || bar.authorityTier !== 'official_primary'
      || !dailySessions.has(bar.time)
      || ![bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0)
      || bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)
      || (bar.volume != null && (!Number.isFinite(bar.volume) || bar.volume < 0))) continue;
    let source: URL;
    try { source = new URL(bar.sourceUrl || ''); } catch { continue; }
    if (source.protocol !== 'https:' || source.username || source.password || source.port) continue;
    const officialPriceEndpoint = source.hostname === 'www.twse.com.tw'
      ? /^\/(?:exchangeReport|rwd\/zh\/afterTrading)\/(?:STOCK_DAY(?:_ALL)?|MI_INDEX)$/u.test(source.pathname)
      : source.hostname === 'www.tpex.org.tw' && [
        '/www/zh-tw/afterTrading/tradingStock', '/web/stock/aftertrading/daily_trading_info/st43_result.php',
        '/openapi/v1/tpex_mainboard_daily_close_quotes',
      ].includes(source.pathname);
    if (!officialPriceEndpoint) continue;
    const month = `${bar.time.slice(0, 7)}-01`;
    if (bar.integrityStatus === 'conflict') {
      const terminalReason = 'official_history_provider_conflict';
      conflicts.set(month, { stockId: options.stockId, dataset: 'price', month, terminalReason });
      providerConflicts.set(month, { sourceUrl: bar.sourceUrl!, session: bar.time });
      continue;
    }
    // The RPC verifies every row against its exact download URL. Daily market
    // endpoints have distinct query strings; do not replace these with a base URL.
    const key = `${month}:${bar.sourceUrl}`;
    const group = groups.get(key) || { month, sourceUrl: bar.sourceUrl!, bars: [] };
    group.bars.push(bar);
    groups.set(key, group);
  }
  const accepted = new Map<string, TwMarketDailyBar>();
  for (const [month, evidence] of providerConflicts) {
    dailyPriceAttemptMs = Math.max(Date.now(), dailyPriceAttemptMs + 1);
    const result = await options.client.rpc('complete_candidate_history_month_v1', {
      p_stock_id: options.stockId, p_dataset: 'price', p_month: month,
      p_attempted_at: new Date(dailyPriceAttemptMs).toISOString(), p_latest_session: options.latestSession,
      p_observed_through: evidence.session, p_status: 'conflict',
      p_terminal_reason: 'official_history_provider_conflict', p_next_attempt_at: null,
      p_source_url: evidence.sourceUrl, p_parser_version: CANDIDATE_HISTORY_POLICY_VERSION,
      p_prices: [], p_multiples: [],
    });
    if (result.error) throw new Error(`candidate_daily_price_write_failed:${result.error.message}`);
    const completion = result.data as { status?: string; terminal_reason?: string } | null;
    if (completion?.status !== 'conflict' || !completion.terminal_reason) throw new Error('candidate_daily_price_completion_invalid');
    conflicts.set(month, { stockId: options.stockId, dataset: 'price', month, terminalReason: completion.terminal_reason });
    items.push({ stockId: options.stockId, dataset: 'price', month, status: 'conflict', terminalReason: completion.terminal_reason, rows: 0 });
  }
  for (const group of [...groups.values()].sort((a, b) => a.month.localeCompare(b.month) || a.sourceUrl.localeCompare(b.sourceUrl))) {
    if (conflicts.has(group.month)) continue;
    const expectedSessions = sessions.filter((session) => session.slice(0, 7) === group.month.slice(0, 7));
    const submittedSessions = new Set(group.bars.map((bar) => bar.time));
    const complete = expectedSessions.length > 0 && expectedSessions.every((session) => submittedSessions.has(session));
    dailyPriceAttemptMs = Math.max(Date.now(), dailyPriceAttemptMs + 1);
    const attemptedAt = new Date(dailyPriceAttemptMs).toISOString();
    const result = await options.client.rpc('complete_candidate_history_month_v1', {
      p_stock_id: options.stockId, p_dataset: 'price', p_month: group.month,
      p_attempted_at: attemptedAt, p_latest_session: options.latestSession,
      p_observed_through: expectedSessions.at(-1), p_status: complete ? 'complete' : 'retry',
      p_terminal_reason: complete ? 'complete' : 'daily_refresh_partial',
      p_next_attempt_at: complete ? null : historyRetryAt(attemptedAt, 1, 'daily_refresh_partial'),
      p_source_url: group.sourceUrl, p_parser_version: CANDIDATE_HISTORY_POLICY_VERSION,
      p_prices: group.bars, p_multiples: [],
    });
    if (result.error) throw new Error(`candidate_daily_price_write_failed:${result.error.message}`);
    const completion = result.data as { status?: string; terminal_reason?: string } | null;
    if (!completion || !['complete', 'retry', 'conflict'].includes(completion.status || '')
      || !completion.terminal_reason || (completion.status === 'complete' && !complete)) {
      throw new Error('candidate_daily_price_completion_invalid');
    }
    if (completion.status === 'conflict') {
      conflicts.set(group.month, { stockId: options.stockId, dataset: 'price', month: group.month, terminalReason: completion.terminal_reason });
      for (const date of accepted.keys()) if (date.slice(0, 7) === group.month.slice(0, 7)) accepted.delete(date);
    } else {
      for (const bar of group.bars) accepted.set(bar.time, bar);
    }
    items.push({ stockId: options.stockId, dataset: 'price', month: group.month,
      status: completion.status!, terminalReason: completion.terminal_reason, rows: group.bars.length });
  }
  return { acceptedBars: [...accepted.values()].sort((a, b) => a.time.localeCompare(b.time)),
    conflicts: [...conflicts.values()], items };
}
