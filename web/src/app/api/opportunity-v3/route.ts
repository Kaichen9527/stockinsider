import { canonicalResponse } from '@/lib/opportunity-v3/canonical';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
import { loadOpportunityEngineV3 } from '@/lib/opportunity-v3/projection';

export const dynamic = 'force-dynamic';

function cutoffFromRequest(request: Request): string | null {
  const url = new URL(request.url);
  if (url.search) return null;
  return new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export async function GET(request: Request) {
  const disabled = requireV3Deployment('/api/opportunity-v3', 'GET');
  if (disabled) return disabled;
  const cutoff = cutoffFromRequest(request);
  if (!cutoff) return canonicalResponse({ code: 'invalid_request', error: 'v3_request_rejected' }, 422);
  try {
    const payload = await loadOpportunityEngineV3(cutoff);
    return canonicalResponse(payload, 200);
  } catch {
    return canonicalResponse({ code: 'v3_projection_unavailable', error: 'v3_request_rejected' }, 503);
  }
}

export function POST(request: Request) {
  const disabled = requireV3Deployment('/api/opportunity-v3', 'POST');
  if (disabled) return disabled;
  return canonicalResponse(
    { code: 'method_not_allowed', error: 'v3_request_rejected' },
    405,
    { Allow: 'GET' },
  );
}
