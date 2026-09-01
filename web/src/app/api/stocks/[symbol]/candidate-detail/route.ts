import { NextResponse } from 'next/server';
import { loadCandidateDetail } from '@/lib/candidate-detail';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const normalized = symbol.toUpperCase();
  if (!/^\d{4}$/u.test(normalized)) return NextResponse.json({ ok: false, error: 'invalid_symbol' }, { status: 400 });
  const revision = new URL(request.url).searchParams.get('revision');
  if (revision && !/^[0-9a-f-]{36}$/iu.test(revision)) return NextResponse.json({ ok: false, error: 'invalid_revision' }, { status: 400 });
  try {
    const detail = await loadCandidateDetail(normalized, revision);
    return detail
      ? NextResponse.json({ ok: true, detail }, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } })
      : NextResponse.json({ ok: false, error: 'candidate_detail_not_found' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
