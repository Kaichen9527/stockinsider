import type { SupabaseClient } from '@supabase/supabase-js';
import { readTaiwanCandidateUniverse } from './taiwan-candidate-refresh.ts';
import { runCandidateHistoryBackfill } from './candidate-history-backfill.ts';
import { candidateHistoryCoverage, candidateHistoryMonths, type CandidateHistoryInput } from './candidate-history-backfill-policy.ts';
import { isHistoryDate, isOfficialCandidatePriceProvider, isOfficialCandidatePriceSource } from './candidate-price-history.ts';

type Row = Record<string, unknown>;
export type CandidateHistoryBatchRequest = { requestBudget: number; perStockBudget: number };
export function parseCandidateHistoryBatchRequest(value: unknown): CandidateHistoryBatchRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Row;
  if (Object.keys(row).some((key) => !['requestBudget', 'perStockBudget'].includes(key))) return null;
  const requestBudget = row.requestBudget === undefined ? 80 : row.requestBudget;
  const perStockBudget = row.perStockBudget === undefined ? 4 : row.perStockBudget;
  if (!Number.isInteger(requestBudget) || Number(requestBudget) < 1 || Number(requestBudget) > 400
    || !Number.isInteger(perStockBudget) || Number(perStockBudget) < 1 || Number(perStockBudget) > 12) return null;
  return { requestBudget: Number(requestBudget), perStockBudget: Number(perStockBudget) };
}

/** Continue through short nonempty pages; a project REST cap may be lower than
 * the requested 500. Probe at the bound rather than silently truncating. */
async function pages(read: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, bound: number, label: string) {
  const rows: Row[] = [];
  for (;;) {
    const result = await read(rows.length, Math.min(rows.length + 499, bound));
    if (result.error) throw new Error(`${label}:${result.error.message}`);
    if (!Array.isArray(result.data)) throw new Error(`${label}:invalid_page`);
    if (result.data.length === 0) return rows;
    if (rows.length + result.data.length > bound) throw new Error(`${label}:pagination_overflow`);
    if (result.data.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error(`${label}:invalid_row`);
    rows.push(...result.data as Row[]);
  }
}

async function batchedRows(ids: string[], read: (batch: string[], from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, label: string) {
  const rows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 40) {
    rows.push(...await pages((from, to) => read(ids.slice(offset, offset + 40), from, to), 150_000, label));
  }
  return rows;
}

function record(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function isConflict(row: Row) {
  return row.integrityStatus === 'conflict' || row.integrity_status === 'conflict'
    || row.validation_status === 'conflict' || row.validationStatus === 'conflict' || row.invalidated === true;
}
function positive(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function officialMultipleSource(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ((url.hostname === 'www.twse.com.tw' && /^\/rwd\/zh\/afterTrading\/BWIBBU(?:_d)?$/u.test(url.pathname))
        || (url.hostname === 'www.tpex.org.tw' && url.pathname === '/www/zh-tw/afterTrading/peQryDate'));
  } catch { return false; }
}
type InputConflict = { stockId: string; dataset: 'price' | 'multiple'; session: string; terminalReason: string };

export function normalizeCandidateHistoryInputs(metadata: Array<{ stockId: string; symbol: string; exchange: 'TWSE' | 'TPEx' }>,
  cached: Row[], authority: Row[], multiples: Row[], latestSession: string) {
  const knownIds = new Set(metadata.map((row) => row.stockId));
  const values = new Map<string, Set<string>>();
  const invalid = new Set<string>();
  const add = (stockId: string, dataset: 'price' | 'multiple', session: string, fingerprint: string, conflicted: boolean) => {
    if (!knownIds.has(stockId) || !isHistoryDate(session) || session > latestSession) return;
    const key = `${stockId}|${dataset}|${session}`;
    if (conflicted) invalid.add(key);
    const seen = values.get(key) || new Set<string>(); seen.add(fingerprint); values.set(key, seen);
  };
  for (const row of [...cached.map((row) => ({ row, authority: false })), ...authority.map((row) => ({ row, authority: true }))]) {
    const fact = row.row;
    const provenance = record(fact.provenance);
    const official = row.authority ? isOfficialCandidatePriceProvider(fact.provider) : isOfficialCandidatePriceSource(fact.source_url);
    if (!official || /finmind/iu.test(String(provenance.provider || '') + String(fact.source_ref || ''))) continue;
    if (isConflict(provenance)) {
      add(String(fact.stock_id), 'price', String(row.authority ? fact.session_id : fact.session_date), 'explicit_conflict', true);
      continue;
    }
    const keys = row.authority ? ['raw_open', 'raw_high', 'raw_low', 'raw_close'] : ['open', 'high', 'low', 'close'];
    const prices = keys.map((key) => fact[key]);
    if (!prices.every(positive) || prices[2] > Math.min(prices[0], prices[3]) || prices[1] < Math.max(prices[0], prices[3])) continue;
    if (fact.volume != null && (typeof fact.volume !== 'number' || !Number.isFinite(fact.volume) || fact.volume < 0)) continue;
    add(String(fact.stock_id), 'price', String(row.authority ? fact.session_id : fact.session_date),
      JSON.stringify([...prices, fact.volume ?? null]), isConflict(provenance));
  }
  for (const row of multiples) {
    const provenance = record(row.provenance);
    if (!officialMultipleSource(row.source_url) || /finmind/iu.test(String(provenance.provider || '')) || row.quality_status !== 'valid') continue;
    if (String(row.source_url).includes('tpex.org.tw') && row.valuation_parser_version !== 'tpex-header-v2') continue;
    if (![row.pe_ratio, row.pb_ratio].some(positive) || [row.pe_ratio, row.pb_ratio].some((value) => value != null && !positive(value))) continue;
    add(String(row.stock_id), 'multiple', String(row.month_end), JSON.stringify([row.pe_ratio ?? null, row.pb_ratio ?? null]), isConflict(provenance));
  }
  const conflicts: InputConflict[] = [];
  const known = new Map<string, { price: string[]; multiple: string[] }>();
  for (const [key, fingerprints] of values) {
    const [stockId, dataset, session] = key.split('|') as [string, 'price' | 'multiple', string];
    if (invalid.has(key) || fingerprints.size !== 1) {
      conflicts.push({ stockId, dataset, session, terminalReason: 'existing_official_history_conflict' });
      continue;
    }
    const lists = known.get(stockId) || { price: [], multiple: [] }; lists[dataset].push(session); known.set(stockId, lists);
  }
  return { candidates: metadata.map((row): CandidateHistoryInput => ({ ...row,
    knownPriceSessions: (known.get(row.stockId)?.price || []).sort(), knownMultipleSessions: (known.get(row.stockId)?.multiple || []).sort() })), conflicts };
}

type BatchDependencies = {
  now?: () => Date;
  runBackfill?: (options: Parameters<typeof runCandidateHistoryBackfill>[0]) => Promise<Awaited<ReturnType<typeof runCandidateHistoryBackfill>>>;
};
export async function runCandidateHistoryBackfillBatch(client: SupabaseClient, request: CandidateHistoryBatchRequest, dependencies: BatchDependencies = {}) {
  const evaluationAt = (dependencies.now || (() => new Date()))().toISOString();
  const universe = await readTaiwanCandidateUniverse(client, evaluationAt);
  const [sessionRows, authorityRows] = await Promise.all([
    pages((from, to) => client.rpc('candidate_research_official_sessions_page', { p_cutoff: evaluationAt, p_page_offset: from, p_page_limit: to - from + 1 }), 1320, 'history_calendar_read_failed'),
    pages((from, to) => client.rpc('candidate_research_stock_authority_page', { p_cutoff: evaluationAt, p_page_offset: from, p_page_limit: to - from + 1 }), 5000, 'history_stock_authority_read_failed'),
  ]);
  const officialSessions = [...new Set(sessionRows.map((row) => row.session_date).filter(isHistoryDate))].sort();
  if (officialSessions.length !== 1320 || officialSessions.length !== sessionRows.length) throw new Error('official_calendar_history_incomplete');
  const latestSession = officialSessions.at(-1)!;
  const stockBySymbol = new Map<string, Row[]>();
  for (const row of authorityRows) stockBySymbol.set(String(row.symbol), [...(stockBySymbol.get(String(row.symbol)) || []), row]);
  const metadata = universe.map((candidate) => {
    const rows = stockBySymbol.get(candidate.symbol) || [];
    const row = rows[0];
    if (rows.length !== 1 || typeof row.stock_id !== 'string' || !row.stock_id || String(row.exchange).toUpperCase() !== candidate.exchange)
      throw new Error(`candidate_history_official_identity_missing_or_conflicting:${candidate.symbol}`);
    return { stockId: row.stock_id, symbol: candidate.symbol, exchange: candidate.exchange === 'TPEX' ? 'TPEx' as const : 'TWSE' as const };
  });
  const ids = metadata.map((row) => row.stockId);
  const [cached, authority, multiples] = await Promise.all([
    batchedRows(ids, (batch, from, to) => client.from('official_price_history').select('stock_id,session_date,open,high,low,close,volume,source_url,provenance')
      .in('stock_id', batch).gte('session_date', officialSessions[0]).lte('session_date', latestSession).lte('available_at', evaluationAt)
      .order('stock_id').order('session_date').range(from, to), 'history_cached_price_read_failed'),
    batchedRows(ids, (batch, from, to) => client.from('opportunity_price_observations_v3').select('stock_id,session_id,raw_open,raw_high,raw_low,raw_close,volume,provider,source_ref')
      .in('stock_id', batch).gte('session_id', officialSessions[0]).lte('session_id', latestSession)
      .lte('source_timestamp', evaluationAt).lte('collected_at', evaluationAt).lte('recorded_at', evaluationAt)
      .order('stock_id').order('session_id').order('observation_id').range(from, to), 'history_authority_price_read_failed'),
    batchedRows(ids, (batch, from, to) => client.from('official_multiple_history').select('stock_id,month_end,pe_ratio,pb_ratio,source_url,quality_status,valuation_parser_version,provenance')
      .in('stock_id', batch).gte('month_end', candidateHistoryMonths(latestSession, 60).at(-1)!).lte('month_end', latestSession).lte('available_at', evaluationAt)
      .order('stock_id').order('month_end').range(from, to), 'history_multiple_read_failed'),
  ]);
  const inputs = normalizeCandidateHistoryInputs(metadata, cached, authority, multiples, latestSession);
  const result = await (dependencies.runBackfill || runCandidateHistoryBackfill)({ client, candidates: inputs.candidates,
    officialSessions, latestSession, evaluationAt, ...request });
  const expectedMultipleSessions = candidateHistoryMonths(latestSession, 60).map((month) => officialSessions.filter((session) => session.startsWith(month.slice(0, 7))).at(-1) || null);
  const perStock = inputs.candidates.map((candidate) => {
    const conflicts = [...inputs.conflicts.filter((row) => row.stockId === candidate.stockId), ...result.conflicts.filter((row) => row.stockId === candidate.stockId)];
    const refreshed = { ...candidate,
      knownPriceSessions: [...candidate.knownPriceSessions, ...(result.prices.get(candidate.stockId) || []).map((row) => row.time)],
      knownMultipleSessions: [...candidate.knownMultipleSessions, ...(result.multiples.get(candidate.stockId) || []).map((row) => row.date)] };
    const coverage = candidateHistoryCoverage(refreshed, officialSessions, latestSession);
    const knownMultiple = new Set(refreshed.knownMultipleSessions);
    const remainingMultipleSessions = expectedMultipleSessions.filter((session) => session === null || !knownMultiple.has(session));
    return { stockId: candidate.stockId, symbol: candidate.symbol, exchange: candidate.exchange,
      priceSessionsCovered: coverage.coveredSessions, priceSessionsRequired: coverage.expectedSessions,
      remainingPriceSessions: coverage.missingSessions.length, multipleMonthsCovered: 60 - remainingMultipleSessions.length,
      multipleMonthsRequired: 60, remainingMultipleMonths: remainingMultipleSessions.length,
      conflicts, coverageComplete: coverage.missingSessions.length === 0 && remainingMultipleSessions.length === 0 && conflicts.length === 0 };
  });
  const batchComplete = Number.isInteger(result.attempted) && result.attempted >= 0 && result.attempted <= request.requestBudget
    && result.attempted === result.items.length && result.items.every((item) => ['complete', 'retry', 'conflict'].includes(item.status));
  return { schemaVersion: 'candidate-history-backfill-batch-v1', evaluationAt, latestSession, policyVersion: result.policyVersion,
    requestBudget: request.requestBudget, perStockBudget: request.perStockBudget,
    batchComplete, universeCoverageComplete: perStock.length > 0 && perStock.every((row) => row.coverageComplete),
    candidateCount: perStock.length, attempted: result.attempted,
    successfulJobs: result.items.filter((item) => item.status === 'complete').length,
    retryJobs: result.items.filter((item) => item.status === 'retry').length,
    conflictJobs: result.items.filter((item) => item.status === 'conflict').length,
    remaining: { priceSessions: perStock.reduce((sum, row) => sum + row.remainingPriceSessions, 0),
      multipleMonths: perStock.reduce((sum, row) => sum + row.remainingMultipleMonths, 0),
      candidates: perStock.filter((row) => !row.coverageComplete).length },
    conflicts: [...inputs.conflicts, ...result.conflicts], items: result.items, perStock };
}
