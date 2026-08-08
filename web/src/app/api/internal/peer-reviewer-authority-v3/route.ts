import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/peer-reviewer-authority-v3', role: 'peer_reviewer_admin' as const,
  keys: ['reviewerPrincipalId','validFrom','validTo','status'],
  rpc: 'append_peer_reviewer_authority_v3', inputArgument: 'input', outputKeys: ['reviewerAuthorityId','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
