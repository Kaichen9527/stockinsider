import { requireV3Deployment } from '@/lib/opportunity-v3/deployment';
import { ingestionHandler } from '@/lib/opportunity-v3/ingestion';

const spec = {
  path: '/api/internal/stock-flow-observation-v3',
  rpc: 'append_stock_flow_observation_v3',
  inputArgument: 'input',
  keys: [
    'stockId',
    'exchange',
    'sessionId',
    'sessionAuthorityId',
    'factKey',
    'value',
    'unit',
    'provider',
    'sourceTimestamp',
    'collectedAt',
    'sourceRef',
    'providerRevision',
  ],
  outputKeys: ['observationId', 'recordedAt'],
};

export function POST(request: Request) {
  return requireV3Deployment(spec.path, 'POST') ?? ingestionHandler(request, spec);
}
