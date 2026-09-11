import { NextResponse } from 'next/server';
import { candidateHistoryBackfillResponse } from '@/lib/candidate-history-backfill-api';

export const runtime = 'nodejs';

/** One bounded batch only. Operator retries do not run classification, publish
 * research, bypass backoff, or alter the scheduler. */
export async function POST(request: Request) {
  const response = await candidateHistoryBackfillResponse(request);
  return NextResponse.json(response.body, { status: response.status });
}
