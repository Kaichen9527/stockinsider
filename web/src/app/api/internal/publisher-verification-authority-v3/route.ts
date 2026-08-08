import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/publisher-verification-authority-v3',
  role: 'publisher_reviewer' as const,
  keys: ['publisherIdentityId','sourceClass','domains','feedIdentity','institutionIdentity','validFrom','validTo','status'],
  rpc: 'append_publisher_verification_authority_v3', inputArgument: 'input', outputKeys: ['authorityId','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
