import { canonicalResponse } from './canonical.ts';
import { deploymentStateV3 } from './config.ts';

const DISABLED_BODY = { code: 'v3_disabled', error: 'v3_request_rejected' } as const;

export function requireV3Deployment(pathname: string, method: string): Response | null {
  const state = deploymentStateV3();
  if (state === 'shadow') return null;
  if (
    state === 'drain' &&
    ((method === 'GET' && /^\/api\/internal\/opportunity-run\/status\/[a-f0-9-]+$/u.test(pathname)) ||
      (method === 'POST' && pathname === '/api/internal/opportunity-worker-v3'))
  ) return null;
  return canonicalResponse(DISABLED_BODY, 404);
}

export function v3PublicEnabled(): boolean {
  return deploymentStateV3() === 'shadow';
}

// The shadow surface is additive. Keeping this as an identity boundary makes it
// impossible for V3 loading or projection code to reorder or replace legacy
// radar buckets before they reach the existing homepage and API serializers.
export function preserveLegacyRadarV3<T>(radar: T): T {
  return radar;
}

export async function layerHomepageOpportunityV3<LegacyRadar, ShadowEngine>({
  legacyRadar,
  loadShadowEngine,
  shadowEnabled,
}: {
  legacyRadar: LegacyRadar;
  loadShadowEngine: () => Promise<ShadowEngine>;
  shadowEnabled: boolean;
}): Promise<{ radar: LegacyRadar; opportunityEngineV3: ShadowEngine | null }> {
  const radar = preserveLegacyRadarV3(legacyRadar);
  const opportunityEngineV3 = shadowEnabled
    ? await loadShadowEngine()
    : null;
  return { radar, opportunityEngineV3 };
}
