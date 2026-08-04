import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/trading-session-v3',rpc:'append_trading_session_v3',inputArgument:'input',keys:['sessionId','market','openAt','closeAt','status','provider','sourceTimestamp','collectedAt','sourceRef'],outputKeys:['sessionAuthorityId','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
