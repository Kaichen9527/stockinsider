import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/market-observation-v3',rpc:'append_market_observation_v3',inputArgument:'input',keys:['factKey','scopeKey','sessionId','sessionAuthorityId','value','unit','provider','providerIdentity','breadthNumeratorCount','breadthObservedCount','breadthEligibleCount','breadthRosterManifestId','breadthRosterManifestHash','observedAt','collectedAt','sourceRef','providerRevision'],outputKeys:['observationId','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
