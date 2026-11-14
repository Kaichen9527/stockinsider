import type { VnextIdentity } from './auth.ts';
import { types } from 'node:util';
import { inputHash, POLICY } from './policy.ts';
import { rankingEnabled, readRankingSnapshot, type RankingSnapshot } from './ranking-read.ts';
import {launchRankingEnabled} from './launch-ranking-read.ts';
import {assertLegacyPublicationAllowed} from './launch-cutover.ts';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(v);
export function rankingPublishRequest(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || types.isProxy(body)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) throw Error('vnext_ranking_closed_request');
  const descriptors = Object.getOwnPropertyDescriptors(body);
  if (Reflect.ownKeys(descriptors).length !== 2 || !['rankingRunId', 'expectedPreviousRankingRunId'].every(key =>
    descriptors[key]?.enumerable === true && Object.hasOwn(descriptors[key], 'value'))) throw Error('vnext_ranking_closed_request');
  const rankingRunId: unknown = descriptors.rankingRunId.value;
  const expectedPreviousRankingRunId: unknown = descriptors.expectedPreviousRankingRunId.value;
  if (!uuid(rankingRunId) || expectedPreviousRankingRunId !== null && !uuid(expectedPreviousRankingRunId)) throw Error('vnext_ranking_closed_request');
  return { rankingRunId, expectedPreviousRankingRunId };
}
/** Existing operator/writer lease, SQL shared lock and DB authority remain mandatory. */
export async function publishRanking(identity: VnextIdentity, body: Record<string, unknown>) {
  // This legacy writer accepts only run/CAS identity. Launch arithmetic, even
  // complete weight100, has no reviewed publication adapter into this command.
  const request = rankingPublishRequest(body);
  assertLegacyPublicationAllowed();
  if (!rankingEnabled() || identity.role !== 'operator' || !identity.principal) throw Error('vnext_ranking_operator_required');
  const { analysisWriter } = await import('./analysis-runtime.ts');
  return analysisWriter(async () => {
    const { getSupabaseServerClient } = await import('../supabase-server.ts');
    const response = await getSupabaseServerClient().rpc('vnext_ranking_command_v1', { p_principal: identity.principal, p_request: request });
    if (response.error) throw Error('vnext_ranking_publication_rejected');
    return response.data;
  });
}

/** Stable session identity; reruns reuse the original predecessor, not self-CAS. */
export function cycleRankingRequest(session: unknown, previous: RankingSnapshot|null, existing?: RankingSnapshot|null) {
  if (typeof session !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(session) || !Number.isFinite(Date.parse(session)) || new Date(session).toISOString().slice(0,10)!==session) throw Error('vnext_ranking_session_required');
  const digest=inputHash({purpose:'vnext-ranking-cycle-v1',policyVersion:POLICY.version,session});
  const run=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  if (existing && existing.rankingRunId !== run) throw Error('vnext_ranking_existing_run_mismatch');
  if (existing) previous=existing;
  return rankingPublishRequest({rankingRunId:run,expectedPreviousRankingRunId:previous?.rankingRunId===run?previous.previousRankingRunId:previous?.rankingRunId||null});
}
export async function publishCycleRanking(identity: VnextIdentity, session: unknown) {
  if(launchRankingEnabled()){cycleRankingRequest(session,null);assertLegacyPublicationAllowed();}
  if (!rankingEnabled()) return {status:'disabled',scheduleEnabled:false};
  const requested=cycleRankingRequest(session,null).rankingRunId;
  const historical=await readRankingSnapshot(requested);
  if (historical.snapshot) return publishRanking(identity,cycleRankingRequest(session,null,historical.snapshot));
  const current=await readRankingSnapshot();
  return publishRanking(identity,cycleRankingRequest(session,current.snapshot));
}
