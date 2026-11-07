import { POLICY, vnextEnabled } from './policy.ts';
import { publicHome } from './public-contract.ts';
import { readPublishedStockTarget } from './published-target-read.ts';
type Row = Record<string, unknown>;
const row = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 240;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 50 && v.every(text);
export const rankingEnabled = () => vnextEnabled() && process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED === 'true';
export type RankingMember = { rank: number; symbol: string; revisionId: string; inputHash: string; confirmedPoints: number; availableWeight: 100; entryEligible: boolean; reasons: string[]; revisions: Record<'research'|'score'|'financial'|'price'|'market', string> };
export type RankingSnapshot = { schemaVersion: string; rankingRunId: string; previousRankingRunId: string|null; cutoff: string; policyVersion: string; marketRevision: string; market: Row; members: RankingMember[] };
function invalid(): never { throw Error('vnext_ranking_contract_invalid'); }
/** Fixed DB read transport only; does not establish review authority or publish. */
export function parseRankingRead(value: unknown, requestedRun?: string, now = new Date().toISOString()) {
  if (!row(value) || !row(value.current) || Buffer.byteLength(JSON.stringify(value)) > 2 * 1024 * 1024) invalid();
  if (requestedRun !== undefined && !uuid(requestedRun)) invalid();
  if (value.snapshot === null) return { snapshot: null, currentHome: publicHome(value.current.home, now), detail: value.current.detail };
  const s = value.snapshot;
  if (!row(s) || s.schemaVersion !== 'vnext-ranking-snapshot-v1' || !uuid(s.rankingRunId) || (requestedRun !== undefined && s.rankingRunId !== requestedRun)
    || s.previousRankingRunId !== null && !uuid(s.previousRankingRunId) || s.policyVersion !== POLICY.version || !hash(s.marketRevision)
    || typeof s.cutoff !== 'string' || !Number.isFinite(Date.parse(s.cutoff)) || !Number.isFinite(Date.parse(now)) || Date.parse(s.cutoff) > Date.parse(now)
    || !row(s.market) || !Array.isArray(s.members) || s.members.length > 10) invalid();
  const members: RankingMember[] = s.members.map((m, i) => {
    if (!row(m) || m.rank !== i + 1 || typeof m.symbol !== 'string' || !/^\d{4}$/u.test(m.symbol) || !uuid(m.revisionId) || !hash(m.inputHash)
      || typeof m.confirmedPoints !== 'number' || !Number.isFinite(m.confirmedPoints) || m.confirmedPoints < 0 || m.confirmedPoints > 100
      || m.availableWeight !== 100 || typeof m.entryEligible !== 'boolean' || !strings(m.reasons) || !row(m.revisions)) invalid();
    const r = m.revisions;
    if (!['research', 'score', 'financial', 'price', 'market'].every(k => text(r[k])) || r.research !== m.revisionId || r.market !== s.marketRevision) invalid();
    return { rank: i + 1, symbol: m.symbol, revisionId: m.revisionId, inputHash: m.inputHash, confirmedPoints: m.confirmedPoints, availableWeight: 100,
      entryEligible: m.entryEligible, reasons: [...m.reasons], revisions: { research: r.research as string, score: r.score as string, financial: r.financial as string, price: r.price as string, market: r.market as string } };
  });
  if (new Set(members.map(m => m.symbol)).size !== members.length) invalid();
  const snapshot: RankingSnapshot = { schemaVersion: s.schemaVersion, rankingRunId: s.rankingRunId, previousRankingRunId: s.previousRankingRunId as string|null,
    cutoff: s.cutoff, policyVersion: s.policyVersion, marketRevision: s.marketRevision, market: structuredClone(s.market), members };
  return { snapshot, currentHome: publicHome(value.current.home, now), detail: value.current.detail };
}
export async function readRankingSnapshot(rankingRunId?: string, symbol?: string) {
  if (!rankingEnabled()) throw Error('vnext_ranking_disabled');
  if (rankingRunId !== undefined && !uuid(rankingRunId) || symbol !== undefined && !/^\d{4}$/u.test(symbol)) invalid();
  const { getSupabaseServerClient } = await import('../supabase-server.ts');
  const response = await getSupabaseServerClient().rpc('vnext_ranking_read_v1', { p_ranking_run_id: rankingRunId || null, p_symbol: symbol || null });
  if (response.error) throw Error('vnext_ranking_unavailable');
  const read = parseRankingRead(response.data, rankingRunId);
  if (symbol) read.detail = await readPublishedStockTarget({ rpc: async () => ({ data: read.detail, error: null }) }, symbol);
  return read;
}
export function rankingMemberCurrent(member: RankingMember, current: ReturnType<typeof publicHome>) {
  const live = current?.members.find(m => m.symbol === member.symbol);
  return !!live && live.revisionId === member.revisionId && live.inputHash === member.inputHash && live.publishedInputHash === member.inputHash
    && live.sourceRights?.current === true && live.entryEligible === true && live.deepScore?.availableWeight === 100
    && typeof live.deepScore.confirmedPoints === 'number' && Number.isFinite(live.deepScore.confirmedPoints)
    && live.deepScore.confirmedPoints >= 0 && live.deepScore.confirmedPoints <= 100;
}
