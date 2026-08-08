import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/financial-fact-v3',rpc:'append_financial_fact_v3',inputArgument:'input',keys:['stockId','factKey','periodStart','periodEnd','durationKind','value','unit','provider','authorityTier','estimateKind','estimateHorizon','filingPublishedAt','sourceTimestamp','collectedAt','filingRestatementId','sourceRef'],outputKeys:['factId','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
