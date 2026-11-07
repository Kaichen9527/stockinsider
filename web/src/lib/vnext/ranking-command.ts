import type { VnextIdentity } from './auth.ts';
import { inputHash, POLICY } from './policy.ts';
import { rankingEnabled, readRankingSnapshot, type RankingSnapshot } from './ranking-read.ts';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(v);
export function rankingPublishRequest(body: Record<string, unknown>) {
  if (Object.keys(body).sort().join('|') !== 'expectedPreviousRankingRunId|rankingRunId' || !uuid(body.rankingRunId)
    || body.expectedPreviousRankingRunId !== null && !uuid(body.expectedPreviousRankingRunId)) throw Error('vnext_ranking_closed_request');
  return { rankingRunId: body.rankingRunId, expectedPreviousRankingRunId: body.expectedPreviousRankingRunId };
}
/** Existing operator/writer lease, SQL shared lock and DB authority remain mandatory. */
export async function publishRanking(identity: VnextIdentity, body: Record<string, unknown>) {
  if (!rankingEnabled() || identity.role !== 'operator' || !identity.principal) throw Error('vnext_ranking_operator_required');
  const request = rankingPublishRequest(body);
  const { analysisWriter } = await import('./analysis-runtime.ts');
  return analysisWriter(async () => {
    const { getSupabaseServerClient } = await import('../supabase-server.ts');
    const response = await getSupabaseServerClient().rpc('vnext_ranking_command_v1', { p_principal: identity.principal, p_request: request });
    if (response.error) throw Error('vnext_ranking_publication_rejected');
    return response.data;
  });
}

/** Stable session identity; reruns reuse the original predecessor, not self-CAS. */
export function cycleRankingRequest(session: unknown, previous: RankingSnapshot|null) {
  if (typeof session !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(session) || !Number.isFinite(Date.parse(session)) || new Date(session).toISOString().slice(0,10)!==session) throw Error('vnext_ranking_session_required');
  const digest=inputHash({purpose:'vnext-ranking-cycle-v1',policyVersion:POLICY.version,session});
  const run=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  return rankingPublishRequest({rankingRunId:run,expectedPreviousRankingRunId:previous?.rankingRunId===run?previous.previousRankingRunId:previous?.rankingRunId||null});
}
export async function publishCycleRanking(identity: VnextIdentity, session: unknown) {
  if (!rankingEnabled()) return {status:'disabled',scheduleEnabled:false};
  const current=await readRankingSnapshot();
  return publishRanking(identity,cycleRankingRequest(session,current.snapshot));
}
