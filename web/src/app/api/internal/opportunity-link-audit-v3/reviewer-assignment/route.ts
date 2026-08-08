import { blindedReviewHandler } from '@/lib/opportunity-v3/blinded-review';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/opportunity-link-audit-v3/reviewer-assignment',kind:'assignment' as const,adjudicator:false};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??blindedReviewHandler(request,spec);}
