import { NextResponse } from 'next/server';
import { loadCandidateDetail } from '@/lib/candidate-detail';
import { parseCandidateRevision } from '@/lib/candidate-revision-query';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await context.params;
  const normalized = symbol.toUpperCase();
  if (!/^\d{4}$/u.test(normalized)) return NextResponse.json({ ok: false, error: 'invalid_symbol' }, { status: 400 });
  const revisions = new URL(request.url).searchParams.getAll('revision');
  const revision = parseCandidateRevision(revisions.length > 1 ? revisions : revisions[0]);
  if (revision.status === 'invalid') return NextResponse.json({ ok: false, error: 'invalid_revision' }, { status: 400 });
  try {
    const detail = await loadCandidateDetail(normalized, revision.status === 'valid' ? revision.revisionId : undefined);
    return detail
      ? NextResponse.json({ ok: true, detail }, { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } })
      : NextResponse.json({ ok: false, error: 'candidate_detail_not_found' }, { status: 404 });
  } catch {
    return NextResponse.json({ ok: false, error: 'candidate_detail_temporarily_unavailable' }, { status: 503 });
  }
}
