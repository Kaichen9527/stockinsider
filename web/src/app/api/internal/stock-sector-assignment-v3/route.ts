import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec={path:'/api/internal/stock-sector-assignment-v3',rpc:'append_stock_sector_assignment_v3',inputArgument:'input',keys:['stockId','market','officialIndustryCode','canonicalSectorKey','provider','sourceTimestamp','validFrom','validTo','taxonomyVersion','status'],outputKeys:['assignmentAuthorityId','recordedAt']};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
