import { NextResponse } from 'next/server';
import { getDailyRadarData } from '@/lib/domain';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { loadCandidateStageCards } from '@/lib/candidate-research';
import { publishRadarPublicSnapshots } from '@/lib/radar-public-snapshot';
import { requireActiveVpsWriter, resolveLatestCompletedTaiwanSession } from '@/lib/taiwan-data-runtime';

function taipeiDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  }
  const raw = await request.text();
  if (raw && raw !== '{}') return NextResponse.json({ ok: false, error: 'unexpected_request_body' }, { status: 422 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  let sessionDate: string;
  try {
    sessionDate = await resolveLatestCompletedTaiwanSession(writer.supabase, taipeiDate());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'latest_completed_trading_session_missing';
    return NextResponse.json({ ok: false, error: message }, { status: message.startsWith('latest_completed_trading_session_read_failed:') ? 500 : 503 });
  }
  const metadata = await writer.supabase.rpc('read_taiwan_data_publication_metadata_v5', {
    p_session_date: sessionDate,
    p_publication_phase: 'preliminary',
  });
  if (metadata.error || !metadata.data) {
    return NextResponse.json({ ok: false, error: `preliminary_dataset_metadata_missing:${metadata.error?.message || sessionDate}` }, { status: 409 });
  }
  const evidence = metadata.data as Record<string, unknown>;
  const [payload, stages] = await Promise.all([getDailyRadarData(), loadCandidateStageCards()]);
  const publication = await publishRadarPublicSnapshots({
    payload,
    stages,
    phase: 'preliminary',
    dataCutoffAt: String(evidence.dataCutoffAt || new Date().toISOString()),
    datasetCompletenessPct: Number(evidence.datasetCompletenessPct ?? 0),
  });
  return NextResponse.json({
    ok: true,
    result: { sessionDate, shadowObservationWritten: false, publication, releaseId: writer.releaseId },
  });
}
