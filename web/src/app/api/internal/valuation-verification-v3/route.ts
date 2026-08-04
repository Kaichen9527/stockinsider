import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/valuation-verification-v3', role: 'valuation_reviewer' as const,
  keys: ['symbol','inputHash','decision','reasonCodes','evidenceRefs','rationale','valuationComputedAt'],
  rpc: 'append_valuation_verification_v3', inputArgument: 'input', outputKeys: ['verificationId','expiresAt','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
