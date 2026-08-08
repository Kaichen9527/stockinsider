import { beginAdHocRun, controlMethodNotAllowed } from '@/lib/opportunity-v3/control';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

export async function POST(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, 'POST') ?? beginAdHocRun(request);
}

function wrongMethod(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, request.method) ??
    controlMethodNotAllowed('POST');
}

export const GET = wrongMethod;
export const HEAD = wrongMethod;
export const PUT = wrongMethod;
export const PATCH = wrongMethod;
export const DELETE = wrongMethod;
export const OPTIONS = wrongMethod;
