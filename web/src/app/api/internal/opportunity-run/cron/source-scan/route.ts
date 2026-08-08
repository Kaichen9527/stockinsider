import { beginCronRun, controlMethodNotAllowed } from '@/lib/opportunity-v3/control';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

export function GET(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, 'GET') ?? beginCronRun(request, 'source_scan', 'production_shadow_daily');
}

function wrongMethod(request: Request) {
  return requireV3Deployment(new URL(request.url).pathname, request.method) ?? controlMethodNotAllowed('GET');
}

export const POST = wrongMethod;
export const HEAD = wrongMethod;
export const PUT = wrongMethod;
export const PATCH = wrongMethod;
export const DELETE = wrongMethod;
export const OPTIONS = wrongMethod;
