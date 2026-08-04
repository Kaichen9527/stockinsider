import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/stock-alias-v3', role: 'identity_reviewer' as const,
  keys: ['stockId','proposedAlias','sourceTimestamp','validFrom','validTo','status'],
  rpc: 'append_manual_stock_alias_authority_v3', inputArgument: 'input', outputKeys: ['aliasAuthorityId','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
