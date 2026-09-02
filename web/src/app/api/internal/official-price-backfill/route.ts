import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { collectPagedOfficialAuthorityRows, officialPriceBackfillBatchHash, parseOfficialPriceBackfillPage, type OfficialPriceBackfillPage, type OfficialPriceBackfillRow } from '@/lib/official-price-backfill';

const BODY_LIMIT = 2_000_000;

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const releaseId = String(process.env.STOCKINSIDER_WRITER_RELEASE_ID || '');
  if (!/^[0-9a-f]{40}$/u.test(releaseId)) return NextResponse.json({ ok: false, error: 'writer_release_identity_missing' }, { status: 503 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  const object = body as Record<string, unknown>;
  if (Object.keys(object).sort().join(',') !== 'availableAt,batchHash,pages,source') return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  if (object.source !== 'official_exchange_operator_backfill_v1' || !Array.isArray(object.pages) || object.pages.length < 1 || object.pages.length > 30) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  }
  const pages = object.pages as OfficialPriceBackfillPage[];
  const parsedPages = pages.map(parseOfficialPriceBackfillPage);
  if (parsedPages.some((rows) => rows === null) || object.batchHash !== officialPriceBackfillBatchHash(pages)) {
    return NextResponse.json({ ok: false, error: 'invalid_official_price_evidence' }, { status: 422 });
  }
  const rows = parsedPages.flatMap((value) => value || []);
  if (rows.length < 1 || rows.length > 750) return NextResponse.json({ ok: false, error: 'invalid_official_price_evidence' }, { status: 422 });
  const availableAt = String(object.availableAt || '');
  const availableMs = Date.parse(availableAt);
  if (!Number.isFinite(availableMs) || availableMs > Date.now() + 300_000 || rows.some((row) => row.sessionDate > availableAt.slice(0, 10))) {
    return NextResponse.json({ ok: false, error: 'invalid_available_at' }, { status: 422 });
  }
  const identity = new Map<string, OfficialPriceBackfillRow>();
  for (const row of rows) {
    const key = `${row.exchange}:${row.symbol}:${row.sessionDate}`;
    const prior = identity.get(key);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) return NextResponse.json({ ok: false, error: 'conflicting_duplicate' }, { status: 409 });
    identity.set(key, row);
  }
  const uniqueRows = [...identity.values()];
  const supabase = getSupabaseServerClient();
  const symbols = [...new Set(uniqueRows.map((row) => row.symbol))];
  const dates = [...new Set(uniqueRows.map((row) => row.sessionDate))];
  const [writer, stocks, instruments, sessions] = await Promise.all([
    supabase.from('production_writer_releases').select('release_id').eq('active', true).single(),
    supabase.from('stocks').select('id,symbol').eq('market', 'TW').in('symbol', symbols),
    collectPagedOfficialAuthorityRows<{ symbol: string; exchange: string; instrument_type: string; listing_status: string }>((from, to) => supabase.from('stock_instruments_v3')
      .select('symbol,exchange,instrument_type,listing_status').in('symbol', symbols)
      .eq('instrument_type', 'common_stock').eq('listing_status', 'active').range(from, to)),
    collectPagedOfficialAuthorityRows<{ session_id: string; market: string; status: string }>((from, to) => supabase.from('tw_trading_sessions_v3')
      .select('session_id,market,status').in('session_id', dates).eq('status', 'completed').range(from, to)),
  ]);
  if (writer.error || writer.data?.release_id !== releaseId) return NextResponse.json({ ok: false, error: 'writer_release_not_active' }, { status: 409 });
  if (stocks.error || instruments.error || sessions.error) return NextResponse.json({ ok: false, error: stocks.error?.message || instruments.error || sessions.error }, { status: 500 });
  const stockBySymbol = new Map((stocks.data || []).map((row) => [String(row.symbol), String(row.id)]));
  const officialInstruments = new Set(instruments.rows.map((row) => `${row.exchange}:${row.symbol}`));
  const officialSessions = new Set(sessions.rows.map((row) => `${String(row.market).toUpperCase()}:${row.session_id}`));
  if (uniqueRows.some((row) => !stockBySymbol.has(row.symbol) || !officialInstruments.has(`${row.exchange}:${row.symbol}`) || !officialSessions.has(`${row.exchange}:${row.sessionDate}`))) {
    return NextResponse.json({ ok: false, error: 'official_authority_reference_missing' }, { status: 422 });
  }
  const stockIds = [...new Set(uniqueRows.map((row) => stockBySymbol.get(row.symbol)!))];
  const existing = await supabase.from('official_price_history').select('stock_id,session_date').in('stock_id', stockIds).in('session_date', dates);
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  const existingKeys = new Set((existing.data || []).map((row) => `${row.stock_id}:${row.session_date}`));
  const write = await supabase.from('official_price_history').upsert(uniqueRows.map((row) => ({
    stock_id: stockBySymbol.get(row.symbol), session_date: row.sessionDate,
    open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
    source_url: row.sourceUrl, as_of: `${row.sessionDate}T13:30:00+08:00`, available_at: availableAt,
    provenance: { source: object.source, response_sha256: row.responseSha256, writer_release_id: releaseId },
  })), { onConflict: 'stock_id,session_date' });
  if (write.error) return NextResponse.json({ ok: false, error: write.error.message }, { status: 500 });
  const duplicate = uniqueRows.filter((row) => existingKeys.has(`${stockBySymbol.get(row.symbol)}:${row.sessionDate}`)).length;
  return NextResponse.json({ ok: true, result: { accepted: uniqueRows.length, written: uniqueRows.length - duplicate, duplicate, releaseId } });
}
