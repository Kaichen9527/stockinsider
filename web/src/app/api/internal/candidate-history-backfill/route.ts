import { NextResponse } from 'next/server';
import { candidateHistoryBackfillResponse } from '@/lib/candidate-history-backfill-api';

export const runtime = 'nodejs';

/** One bounded batch only. The entry-plan purpose acquires frozen official
 * authority; neither purpose classifies or publishes research. */
export async function POST(request: Request) {
  const response = await candidateHistoryBackfillResponse(request);
  return NextResponse.json(response.body, { status: response.status });
}
