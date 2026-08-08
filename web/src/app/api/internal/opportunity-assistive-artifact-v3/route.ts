import { humanAuthorityHandler } from '@/lib/opportunity-v3/human-authority';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';

const spec = {
  path: '/api/internal/opportunity-assistive-artifact-v3', role: 'model_reviewer' as const,
  keys: ['artifactRef','artifactHash','artifactKind','licenseId','licenseEvidenceRef','trainingCutoff','evaluationManifestId','comparisonBaselineKey','oosPrecisionAt20','oosNdcgAt20','oosWorstDecileMae20Pct','status','supersedesRegistrationId'],
  rpc: 'append_assistive_artifact_registration_v3', inputArgument: 'input', outputKeys: ['registrationId','registeredAt','recordedAt'],
};
export function POST(request: Request) { return requireV3Deployment(spec.path, 'POST') ?? humanAuthorityHandler(request, spec); }
