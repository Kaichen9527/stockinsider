import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/instrument-roster-v3',rpc:'append_instrument_roster_authority_v3',inputArgument:'input',keys:['stockId','symbol','exchange','instrumentType','listingStatus','officialLegalName','officialShortName','provider','sourceTimestamp','validFrom','validTo','rosterVersion'],outputKeys:['instrumentAuthorityId','officialAliasAuthorityIds','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
