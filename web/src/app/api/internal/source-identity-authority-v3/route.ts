import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/source-identity-authority-v3',
  role: 'source_reviewer' as const,
  keys: ['sourceIdentityId','sourceKey','sourceClass','distributionIdentity','validFrom','validTo','status'],
  rpc: 'append_source_identity_authority_v3',
  inputArgument: 'input',
  outputKeys: ['authorityId','recordedAt'],
};
export function POST(request: Request) {
  return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec);
}
