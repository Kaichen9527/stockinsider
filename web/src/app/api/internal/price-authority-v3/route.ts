import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/price-authority-v3',rpc:'append_price_authority_v3',inputArgument:'input',maxBytes:8388608,keys:['kind','rawPrice','corporateActionSnapshot','exchangeReportedPe'],outputKeys:['kind','observationId','snapshotId','reportedPeId','datasetHash','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
