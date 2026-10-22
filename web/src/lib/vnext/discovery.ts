import { getSupabaseServerClient } from '../supabase-server';
import { command, enqueue, normalizedInput } from './store.ts';
import { inputHash } from './policy.ts';
import { initialFactors, type ScreeningInputs } from './factors.ts';
import { screenRoundRobin, type Clue } from './screening.ts';
import { rotateCachedObservations, type RotationObservation } from './rotation.ts';
import type { Candidate } from './replacement.ts';
import type { VnextIdentity } from './auth.ts';
type Row = Record<string, unknown>;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Shared cache screening only. No financial coverage, downloads, parsers, external quotes or models. */
export async function scanCachedCandidates(identity: VnextIdentity, transport?: { client: ReturnType<typeof getSupabaseServerClient>; command: typeof command; enqueue: typeof enqueue; now: string }) {
  const send = transport?.command || command; const admit = transport?.enqueue || enqueue;
  const context = await send(identity, 'screen-context', {}); const cutoff = transport?.now || new Date().toISOString();
  const clues = screenRoundRobin((Array.isArray(context.clues) ? context.clues : []) as Clue[], cutoff);
  const active = (Array.isArray(context.active) ? context.active : []) as Row[];
  const symbols = [...new Set([...clues.map((c) => c.symbol), ...active.map((r) => String(r.symbol))])].sort();
  if (!symbols.length) return { jobs: [], scope: { screened: 0, admitted: 0, deferred: 0 }, gaps: ['allowed_source_cache_empty_or_identity_unresolved'] }; const client = transport?.client || getSupabaseServerClient();
  const instruments = await client.from('stock_instruments_v3').select('stock_id,symbol,listing_status,recorded_at,source_timestamp')
    .in('symbol', symbols).eq('instrument_type', 'common_stock')
    .lte('recorded_at', cutoff).lte('source_timestamp', cutoff).lte('valid_from', cutoff)
    .or(`valid_to.is.null,valid_to.gt.${cutoff}`).order('recorded_at', { ascending: false }).limit(2000);
  if (instruments.error) throw new Error('vnext_shared_instrument_cache_unavailable');
  const master = new Map<string, Row>(); for (const row of (instruments.data || []) as Row[]) if (!master.has(String(row.symbol))) master.set(String(row.symbol), row);
  const ids = [...new Set([...master.values()].map((r) => String(r.stock_id)))];
  if (!ids.length) return { jobs: [], scope: { screened: clues.length, admitted: 0, deferred: symbols.length }, gaps: ['official_instrument_cache_empty'] };
  const [technicals, revenues] = await Promise.all([
    client.from('technical_feature_snapshots').select('stock_id,session_date,close,volume_ratio_20_median,institutional_flow_20d_norm,as_of,available_at,provenance')
      .in('stock_id', ids).eq('session_date', context.session).lte('available_at', cutoff).order('available_at', { ascending: false }).limit(1000),
    client.from('revenue_signals').select('stock_id,yoy_growth,as_of_date,source_url,created_at').in('stock_id', ids)
      .gte('as_of_date', new Date(Date.parse(cutoff) - 65 * 86400000).toISOString().slice(0, 10)).lte('created_at', cutoff).order('as_of_date', { ascending: false }).limit(1000),
  ]);
  if (technicals.error || revenues.error) throw new Error('vnext_shared_screening_cache_unavailable');
  const priceRows: Row[] = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    const read = await client.from('official_price_history').select('stock_id,session_date,close,source_url,available_at,provenance')
      .in('stock_id', ids.slice(offset, offset + 20)).gte('session_date', new Date(Date.parse(cutoff) - 45 * 86400000).toISOString().slice(0, 10))
      .lte('session_date', context.session).lte('available_at', cutoff).order('session_date', { ascending: false }).limit(1000);
    if (read.error) throw new Error('vnext_shared_price_cache_unavailable'); priceRows.push(...(read.data || []) as Row[]);
  }
  const frozen: Array<{ symbol: string; input: Row; points: number; weight: number; eventAt: string }> = [];
  for (const symbol of symbols) {
    const stockId = String(master.get(symbol)?.stock_id || ''); const member = active.find((r) => r.symbol === symbol);
    const previous = member?.evidence as Row | undefined;
    const matching = screenRoundRobin([...clues.filter((c) => c.symbol === symbol), ...((Array.isArray(previous?.clues) ? previous.clues : []) as Clue[])], cutoff);
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
    const score = initialFactors(screening);
    const input = { cutoff, clues: matching, screening, evidence: [], tradingValid: Boolean(stockId) && master.get(symbol)?.listing_status === 'active', marketSnapshotHash: (context.market as Row | null)?.snapshotHash || null,
      gaps: ['comparable_source_volume_baseline_unavailable', ...(!screening.corporateActionAdjusted ? ['shared_adjusted_price_basis_unavailable'] : [])],
      reasons: ['recent_original_event', 'shared_cached_screening'], initialScore: score };
    frozen.push({ symbol, input, points: score.confirmedPoints, weight: score.availableWeight, eventAt: matching.map((c) => c.eventAt).sort().at(-1) || '' });
  }
  frozen.sort((a, b) => b.points - a.points || b.weight - a.weight || b.eventAt.localeCompare(a.eventAt) || a.symbol.localeCompare(b.symbol));
  const observations: RotationObservation[] = frozen.map((row) => {
    const normalized = normalizedInput(row.symbol, row.input); const member = active.find((r) => r.symbol === row.symbol);
    const instrument = master.get(row.symbol);
    return { symbol: row.symbol, input: normalized, active: Boolean(member), state: String(member?.state || ''),
      candidate: { ...normalized, symbol: row.symbol, eventAt: normalized.eventAt || '', catalystCancelled: false, tradingInvalid: false, targetHit: false, newThesis: false } as Candidate,
      ...(member && instrument && ['delisted','suspended'].includes(String(instrument.listing_status)) ? { verifiedExit: { reason: 'trading_invalid', evidence: [`official_instrument:${instrument.stock_id}:${instrument.source_timestamp}:${instrument.listing_status}`] } } : {}) };
  });
  const rotation = await rotateCachedObservations({ session: String(context.session), completed: context.completed === true, postclose: context.postclose === true, weeklyDue: context.weeklyDue === true }, observations, (action, request) => send(identity, action, request));
  const considered = frozen.filter((r) => !active.some((m) => m.symbol === r.symbol) || context.weeklyDue === true && context.postclose === true && context.completed === true).slice(0, 20);
  const result = await admit(identity, { symbols: considered.map((c) => c.symbol), inputs: Object.fromEntries(considered.map((c) => [c.symbol, c.input])),
    requestKey: `shared-screen:${context.session}:${inputHash(considered.map((c) => ({ symbol: c.symbol, points: c.points, clues: c.input.clues })))}` }, 'shared-cache-screen');
  return { ...result, rotation, scope: { screened: clues.length, candidates: frozen.length, considered: considered.length,
    deferredOutsideBound: frozen.length - considered.length }, gaps: ['source_health_and_comparable_volume_not_attested', 'verified_catalyst_cancellation_target_and_contraindication_authority_unavailable'] };
}
