import { createHash } from 'node:crypto';
import { getSupabaseServerClient } from './supabase-server.ts';
import type { TaiwanDataset, TaiwanExchange, TaiwanRefreshPhase } from './taiwan-data-provider.ts';

export type TaiwanQueueRequest = {
  datasets: TaiwanDataset[];
  phase: TaiwanRefreshPhase;
  sessionDate: string;
  symbols: Array<{ symbol: string; exchange: TaiwanExchange }>;
};

function taipeiDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function taiwanRefreshQueueKey(input: { dataset: TaiwanDataset; symbol: string | null; exchange: TaiwanExchange; phase: TaiwanRefreshPhase; sessionDate: string }) {
  return createHash('sha256').update(JSON.stringify({ schema: 'taiwan-data-refresh-queue-v5', ...input })).digest('hex');
}

export function parseTaiwanQueueRequest(value: unknown): TaiwanQueueRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort().join(',');
  if (!['datasets,phase,sessionDate,symbols', 'datasets,phase,symbols'].includes(keys)
    || !Array.isArray(object.datasets) || !Array.isArray(object.symbols)
    || !['preliminary', 'final'].includes(String(object.phase))
    || (object.sessionDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(String(object.sessionDate)))) return null;
  const datasets = [...new Set(object.datasets.map(String))];
  if (datasets.length < 1 || datasets.length > 9 || datasets.some((dataset) => !['daily_price', 'daily_valuation', 'monthly_revenue', 'financial_statement', 'institutional_flow', 'margin_short', 'market_index', 'stock_master', 'trading_calendar'].includes(dataset))) return null;
  const symbols = object.symbols.map((item) => item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : null);
  if (symbols.some((item) => !item || Object.keys(item).sort().join(',') !== 'exchange,symbol' || !/^\d{4}$/u.test(String(item.symbol)) || !['TWSE', 'TPEX'].includes(String(item.exchange))) || symbols.length > 5_000) return null;
  return { datasets: datasets as TaiwanDataset[], phase: object.phase as TaiwanRefreshPhase, sessionDate: object.sessionDate === undefined ? taipeiDate() : String(object.sessionDate), symbols: symbols as Array<{ symbol: string; exchange: TaiwanExchange }> };
}

/**
 * Resolve the latest session for which production already has authoritative
 * evidence.  The maintained calendar is preferred, while a persisted official
 * closing-price row can advance a stale calendar without guessing weekdays or
 * exchange holidays.
 */
export async function resolveLatestCompletedTaiwanSession(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  onOrBefore: string,
) {
  const now = new Date().toISOString();
  const [calendar, price] = await Promise.all([
    supabase.from('tw_trading_sessions_v3')
      .select('session_id')
      .eq('status', 'completed')
      .lte('session_id', onOrBefore)
      .lte('close_at', now)
      .order('session_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('official_price_history')
      .select('session_date')
      .lte('session_date', onOrBefore)
      .lte('available_at', now)
      .order('session_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (calendar.error && price.error) {
    throw new Error(`latest_completed_trading_session_read_failed:${calendar.error.message};${price.error.message}`);
  }
  const candidates = [calendar.data?.session_id, price.data?.session_date]
    .map((value) => String(value || ''))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/u.test(value));
  if (candidates.length === 0) throw new Error('latest_completed_trading_session_missing');
  return candidates.sort().at(-1)!;
}

export async function requireActiveVpsWriter() {
  const releaseId = String(process.env.STOCKINSIDER_WRITER_RELEASE_ID || '');
  if (!/^[0-9a-f]{40}$/u.test(releaseId)) return { ok: false as const, error: 'writer_release_identity_missing' };
  const supabase = getSupabaseServerClient();
  const active = await supabase.from('production_writer_releases').select('release_id,writer_kind').eq('active', true).single();
  if (active.error || active.data?.release_id !== releaseId || active.data?.writer_kind !== 'vps') return { ok: false as const, error: 'writer_release_not_active' };
  return { ok: true as const, releaseId, supabase };
}
