import { controlMethodNotAllowed, readRunStatus } from '@/lib/opportunity-v3/control';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const disabled = requireV3Deployment(new URL(request.url).pathname, 'GET');
  if (disabled) return disabled;
  return readRunStatus(request, (await params).runId);
}

function wrongMethod(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, request.method) ??
    controlMethodNotAllowed('GET');
}

export const POST = wrongMethod;
export const HEAD = wrongMethod;
export const PUT = wrongMethod;
export const PATCH = wrongMethod;
export const DELETE = wrongMethod;
export const OPTIONS = wrongMethod;
