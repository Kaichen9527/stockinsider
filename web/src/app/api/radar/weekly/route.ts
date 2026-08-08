import { NextRequest, NextResponse } from 'next/server';
import { getWeeklyRadarData } from '@/lib/domain';
import { compactRadarEtag, legacyCorrectnessProjectionEnabled, loadPublishedRadarProjection,
  RadarProjectionUnavailableError } from '@/lib/radar-projection-read';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { compactProducerRadarPayload } from '@/lib/radar-producer-payload';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const producerRead = request.headers.get('x-stockinsider-projection-source') === 'tracked-producer';
    if (producerRead && !requireExactInternalBearer(request)) {
      return NextResponse.json({ error: 'authentication_rejected' }, { status: 401 });
    }
    const compact = producerRead ? null : await loadPublishedRadarProjection('weekly');
    if (compact) {
      const etag = compactRadarEtag(compact);
      const headers = { ETag: etag, 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };
      if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
      return NextResponse.json(compact, { headers });
    }
    const data = await getWeeklyRadarData();
    return NextResponse.json(producerRead
      ? compactProducerRadarPayload(data as unknown as Record<string, unknown>)
      : data);
  } catch (error) {
    if (legacyCorrectnessProjectionEnabled() && error instanceof RadarProjectionUnavailableError) {
      return NextResponse.json({ error: 'radar_projection_unavailable', retryable: true }, { status: 503 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
