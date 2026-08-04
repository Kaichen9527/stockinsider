import { canonicalResponse } from '@/lib/opportunity-v3/canonical';
import { DETAIL_UNAVAILABLE_V3, loadOpportunityDetailV3 } from '@/lib/opportunity-v3/detail';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ runId: string; symbol: string }> };

export async function GET(request: Request, context: RouteContext) {
  const disabled = requireV3Deployment(new URL(request.url).pathname, 'GET');
  if (disabled) return disabled;
  const { runId, symbol } = await context.params;
  const detail = await loadOpportunityDetailV3(runId, symbol);
  return canonicalResponse(detail ?? DETAIL_UNAVAILABLE_V3, detail ? 200 : 404);
}

export function POST(request: Request) {
  const disabled = requireV3Deployment(new URL(request.url).pathname, 'POST');
  if (disabled) return disabled;
  return canonicalResponse(
    { code: 'method_not_allowed', error: 'v3_request_rejected' },
    405,
    { Allow: 'GET' },
  );
}
