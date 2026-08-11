import { NextRequest, NextResponse } from 'next/server';
import { getHotRadarData } from '@/lib/domain';
import { legacyCorrectnessProjectionEnabled, loadPublishedRadarProjection,
  RadarProjectionUnavailableError } from '@/lib/radar-projection-read';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { compactProducerRadarPayload } from '@/lib/radar-producer-payload';
import { radarResponseHeaders } from '@/lib/radar-response-policy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = radarResponseHeaders('fresh');

export async function GET(request: NextRequest) {
  try {
    const producerRead = request.headers.get('x-stockinsider-projection-source') === 'tracked-producer';
    if (producerRead && !requireExactInternalBearer(request)) {
      return NextResponse.json({ error: 'authentication_rejected' }, { status: 401, headers: NO_STORE });
    }
    const compact = producerRead ? null : await loadPublishedRadarProjection('hot');
    if (compact) {
      return NextResponse.json(compact, { headers: NO_STORE });
    }
    const data = await getHotRadarData();
    return NextResponse.json(producerRead
      ? compactProducerRadarPayload(data as unknown as Record<string, unknown>)
      : data, { headers: NO_STORE });
  } catch (error) {
    if (legacyCorrectnessProjectionEnabled() && error instanceof RadarProjectionUnavailableError) {
      return NextResponse.json({ error: 'radar_projection_unavailable', retryable: true }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500, headers: NO_STORE });
  }
}
