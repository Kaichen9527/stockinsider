import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { collectPagedOfficialAuthorityRows } from '@/lib/official-price-backfill';
import { intersectOfficialCalendarPages, officialCalendarBackfillBatchHash, parseOfficialCalendarBackfillPage, type OfficialCalendarBackfillPage } from '@/lib/official-calendar-backfill';

const BODY_LIMIT = 1_200_000;

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
  if (Object.keys(object).sort().join(',') !== 'availableAt,batchHash,pages,source' || object.source !== 'official_calendar_operator_backfill_v1'
    || !Array.isArray(object.pages) || object.pages.length !== 2) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  const pages = object.pages as OfficialCalendarBackfillPage[];
  const evidence = pages.map(parseOfficialCalendarBackfillPage);
  const verified = evidence.every(Boolean) ? intersectOfficialCalendarPages(evidence as NonNullable<(typeof evidence)[number]>[]) : null;
  if (!verified || object.batchHash !== officialCalendarBackfillBatchHash(pages)) return NextResponse.json({ ok: false, error: 'invalid_official_calendar_evidence' }, { status: 422 });
  const availableAt = String(object.availableAt || '');
  const availableMs = Date.parse(availableAt);
  if (!Number.isFinite(availableMs) || availableMs > Date.now() + 300_000 || verified.dates.some((date) => date > availableAt.slice(0, 10))) {
    return NextResponse.json({ ok: false, error: 'invalid_available_at' }, { status: 422 });
  }
  const supabase = getSupabaseServerClient();
  const [writer, existing] = await Promise.all([
    supabase.from('production_writer_releases').select('release_id').eq('active', true).single(),
    collectPagedOfficialAuthorityRows<{ session_id: string; market: string }>((from, to) => supabase.from('tw_trading_sessions_v3')
      .select('session_id,market').in('session_id', verified.dates).eq('status', 'completed').range(from, to)),
  ]);
  if (writer.error || writer.data?.release_id !== releaseId) return NextResponse.json({ ok: false, error: 'writer_release_not_active' }, { status: 409 });
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error }, { status: 500 });
  const existingKeys = new Set(existing.rows.map((row) => `${row.market}:${row.session_id}`));
  const rows = verified.dates.flatMap((date) => ([
    { market: 'TWSE', provider: 'twse', source_ref: verified.twse.sourceUrl },
    { market: 'TPEX', provider: 'tpex', source_ref: verified.tpex.sourceUrl },
  ] as const).flatMap((identity) => existingKeys.has(`${identity.market}:${date}`) ? [] : [{
    session_id: date, market: identity.market, open_at: `${date}T09:00:00+08:00`, close_at: `${date}T13:30:00+08:00`,
    status: 'completed', provider: identity.provider, source_timestamp: `${date}T13:30:00+08:00`, collected_at: availableAt,
    source_ref: identity.source_ref,
  }]));
  if (rows.length > 0) {
    const write = await supabase.from('tw_trading_sessions_v3').insert(rows);
    if (write.error) return NextResponse.json({ ok: false, error: write.error.message }, { status: 500 });
  }
  const marketHistory = verified.dates.flatMap((date) => ([
    { market: 'TWSE', evidence: verified.twse },
    { market: 'TPEX', evidence: verified.tpex },
  ] as const).map(({ market, evidence: item }) => ({
    market, session_date: date, index_close: item.closes[date], source_urls: [item.sourceUrl],
    as_of: `${date}T13:30:00+08:00`, available_at: availableAt,
    provenance: { source: object.source, response_sha256: item.responseSha256, writer_release_id: releaseId },
  })));
  const marketWrite = await supabase.from('official_market_evidence_history').upsert(marketHistory, { onConflict: 'market,session_date' });
  if (marketWrite.error) return NextResponse.json({ ok: false, error: marketWrite.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: { accepted: verified.dates.length * 2, written: rows.length, duplicate: verified.dates.length * 2 - rows.length, releaseId } });
}
