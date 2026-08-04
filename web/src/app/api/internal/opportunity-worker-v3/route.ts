import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
import { runOpportunityWorker } from '@/lib/opportunity-v3/worker';
import { canonicalResponse } from '@/lib/opportunity-v3/canonical';

export async function POST(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, 'POST') ?? runOpportunityWorker(request);
}

function wrongMethod(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, request.method) ??
    canonicalResponse(
      { code: 'method_not_allowed', error: 'opportunity_worker_request_rejected' },
      405,
      { Allow: 'POST' },
    );
}

export const GET = wrongMethod;
export const HEAD = wrongMethod;
export const PUT = wrongMethod;
export const PATCH = wrongMethod;
export const DELETE = wrongMethod;
export const OPTIONS = wrongMethod;
