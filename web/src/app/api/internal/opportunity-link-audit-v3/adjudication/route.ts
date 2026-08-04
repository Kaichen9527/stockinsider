import { blindedReviewHandler } from '@/lib/opportunity-v3/blinded-review';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/opportunity-link-audit-v3/adjudication',kind:'label' as const,adjudicator:true};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??blindedReviewHandler(request,spec);}
