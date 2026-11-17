import { candidateHistoryPage, candidateRankingRunId, type CandidateQuery } from './candidate-page.ts';
import { rankingEnabled } from './ranking-read.ts';

type HistoryReader = { rpc: (name: 'vnext_candidate_history_read_v1', args: { p_ranking_run_id: string | null }) => PromiseLike<{ data: unknown; error: unknown }> };
/** One bounded immutable read; does not load current market/research or start work. */
export async function readCandidateHistory(query: CandidateQuery, client?: HistoryReader) {
  if (!rankingEnabled()) throw Error('vnext_ranking_disabled');
  const rankingRunId = candidateRankingRunId(query);
  if (!client) {
    const { getSupabaseServerClient } = await import('../supabase-server.ts');
    client = getSupabaseServerClient();
  }
  const result = await client.rpc('vnext_candidate_history_read_v1', { p_ranking_run_id: rankingRunId });
  if (result.error) throw Error('vnext_candidates_unavailable');
  return candidateHistoryPage(result.data, query);
}
