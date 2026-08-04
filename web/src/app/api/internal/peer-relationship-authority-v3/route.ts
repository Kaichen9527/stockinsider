import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/peer-relationship-authority-v3', role: 'peer_reviewer' as const,
  keys: ['supplierInstrumentAuthorityId','customerInstrumentAuthorityId','sourceTimestamp','validFrom','validTo','status','evidenceRef'],
  rpc: 'append_peer_relationship_authority_v3', inputArgument: 'input', outputKeys: ['relationshipAuthorityId','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
