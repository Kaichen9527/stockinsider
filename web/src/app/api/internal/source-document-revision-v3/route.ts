import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';
import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
const spec = {
  path:'/api/internal/source-document-revision-v3', rpc:'append_source_document_revision_v3', inputArgument:'input', maxBytes:1048576,
  keys:['sourceIdentityAuthorityId','stableConnectorDocumentId','canonicalUrlCandidate','publishedAt','collectedAt','adapterVersion','acquisitionStatus','rawFieldPayload','rawCodePointCount','rawFieldPayloadAlgorithmVersion','ingestionContentRevisionSha256','canonicalContentAlgorithmVersion','ingestionCanonicalContentHashV3','supersedesRevisionId'],
  outputKeys:['revisionId','recordedAt'],
};
export function POST(request:Request){return requireV3Deployment(spec.path,'POST')??ingestionHandler(request,spec);}
