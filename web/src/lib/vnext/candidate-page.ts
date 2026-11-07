import { createHash } from 'node:crypto';
import { POLICY } from './policy.ts';

/** Read-only pagination over an already persisted immutable ranking catalog.
 * It neither validates review authority nor extends the catalog's coverage. */
export const CANDIDATE_GAPS = ['not_admitted_catalog_not_available', 'complete_historical_catalog_not_available', 'source_metadata_not_available', 'industry_metadata_not_available'] as const;
const statuses = ['researching', 'waiting', 'eligible', 'exited'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type CandidateFilters = { date: string | null; source: string | null; industry: string | null; status: typeof statuses[number] | null };
export type CandidateQuery = { filters: CandidateFilters; limit: number; cursor: string | null; rankingRunId: string | null };
export type PublicCandidate = { symbol: string; state: typeof statuses[number]; date: string | null; revisionId: string | null; entryEligible: boolean; source: null; industry: null };
type Cursor = { version: 1; rankingRunId: string; catalogHash: string; after: string; filtersHash: string };
const fail = () => { throw new Error('vnext_candidate_page_invalid'); };
const plain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function validDate(value: string) { const parsed = Date.parse(`${value}T00:00:00.000Z`); return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value; }
export function candidateQuery(params: Record<string, string | string[] | undefined>): CandidateQuery {
  for (const value of Object.values(params)) if (Array.isArray(value)) fail();
  const text = (key: string) => typeof params[key] === 'string' && params[key] !== '' ? params[key] as string : null;
  const date = text('date'), source = text('source'), industry = text('industry'), status = text('status');
  if (date && !validDate(date) || source && !/^[a-z][a-z0-9_-]{0,39}$/u.test(source) || industry && (!industry.trim() || industry.length > 60) || status && !statuses.includes(status as typeof statuses[number])) fail();
  const limitValue = text('limit');
  if (limitValue && !/^(?:[1-9]|1[0-9]|20)$/u.test(limitValue)) fail();
  const cursor = text('cursor');
  if (cursor && cursor.length > 1000) fail();
  const rankingRunId = text('rankingRunId');
  if (rankingRunId && !uuid.test(rankingRunId)) fail();
  return { filters: { date, source, industry, status: status as CandidateFilters['status'] }, limit: limitValue ? Number(limitValue) : 10, cursor, rankingRunId };
}
function decodeCursor(value: string): Cursor {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 1000) return fail();
  let data: unknown; try { data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { return fail(); }
  if (!plain(data) || Object.keys(data).sort().join(',') !== 'after,catalogHash,filtersHash,rankingRunId,version' || data.version !== 1 || typeof data.rankingRunId !== 'string' || !uuid.test(data.rankingRunId)
    || typeof data.after !== 'string' || !/^\d{4}$/u.test(data.after) || typeof data.catalogHash !== 'string' || !/^[a-f0-9]{64}$/u.test(data.catalogHash) || typeof data.filtersHash !== 'string' || !/^[a-f0-9]{64}$/u.test(data.filtersHash)) return fail();
  return data as Cursor;
}
export function candidateRankingRunId(query: CandidateQuery): string | null {
  if (!query.cursor) return query.rankingRunId;
  const cursor = decodeCursor(query.cursor);
  if (cursor.filtersHash !== hash(query.filters) || query.rankingRunId && query.rankingRunId !== cursor.rankingRunId) return fail();
  return cursor.rankingRunId;
}
/** Strict public allowlist: input hashes, reasons, evidence and all unknown keys stay private. */
function parseCatalog(snapshot: Record<string, unknown>) {
  if (snapshot.schemaVersion !== 'vnext-ranking-snapshot-v1' || snapshot.policyVersion !== POLICY.version || typeof snapshot.rankingRunId !== 'string' || !uuid.test(snapshot.rankingRunId) || typeof snapshot.cutoff !== 'string' || !Number.isFinite(Date.parse(snapshot.cutoff)) || !Array.isArray(snapshot.candidates) || snapshot.candidates.length > 20) return fail();
  const all: PublicCandidate[] = snapshot.candidates.map((raw: unknown) => {
    if (!plain(raw) || typeof raw.symbol !== 'string' || !/^\d{4}$/u.test(raw.symbol) || !statuses.includes(raw.state as typeof statuses[number]) || typeof raw.entryEligible !== 'boolean'
      || !(raw.date === null || typeof raw.date === 'string' && validDate(raw.date)) || !(raw.revisionId === null || typeof raw.revisionId === 'string' && uuid.test(raw.revisionId)) || raw.source !== null || raw.industry !== null) return fail();
    return { symbol: raw.symbol, state: raw.state as PublicCandidate['state'], date: raw.date as string | null, revisionId: raw.revisionId as string | null, entryEligible: raw.entryEligible, source: null, industry: null };
  }).sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
  if (new Set(all.map(row => row.symbol)).size !== all.length) return fail();
  return all;
}
function paginate<T extends PublicCandidate>(snapshot: Record<string, unknown>, all: T[], query: CandidateQuery) {
  const requested = candidateRankingRunId(query);
  if (requested && requested !== snapshot.rankingRunId) return fail();
  const catalogHash = hash({ rankingRunId: snapshot.rankingRunId, cutoff: snapshot.cutoff, rows: all });
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor && (cursor.rankingRunId !== snapshot.rankingRunId || cursor.catalogHash !== catalogHash || cursor.filtersHash !== hash(query.filters) || !all.some(row => row.symbol === cursor.after))) return fail();
  const filtered = all.filter(row => (!query.filters.date || row.date === query.filters.date) && (!query.filters.status || row.state === query.filters.status) && !query.filters.source && !query.filters.industry);
  const remaining = filtered.filter(row => !cursor || row.symbol > cursor.after);
  const rows = remaining.slice(0, query.limit);
  const nextCursor = remaining.length > rows.length ? Buffer.from(JSON.stringify({ version: 1, rankingRunId: snapshot.rankingRunId, catalogHash, after: rows.at(-1)!.symbol, filtersHash: hash(query.filters) })).toString('base64url') : null;
  return { rankingRunId: snapshot.rankingRunId as string, cutoff: snapshot.cutoff as string, rows, nextCursor };
}
export function candidatePage(value: unknown, query: CandidateQuery) {
  if (!plain(value) || !plain(value.snapshot)) return fail();
  return { ...paginate(value.snapshot, parseCatalog(value.snapshot), query), gaps: [...CANDIDATE_GAPS], scope: 'frozen_active_pool_only' as const };
}

export type CandidateHistoryRow = PublicCandidate & { stateBasis: 'saved_active_pool' | 'absent_from_successor'; observedAt: string; lastObservedAt: string };
export const CANDIDATE_HISTORY_GAPS = ['not_admitted_catalog_not_available', 'between_snapshot_transitions_not_available', 'exact_exit_time_and_reason_not_available', 'source_metadata_not_available', 'industry_metadata_not_available'] as const;
/** Only stored adjacent snapshots establish these observations. An absence is not
 * an exact ledger exit event; never use it for current validity or entry authority. */
export function candidateHistoryPage(value: unknown, query: CandidateQuery) {
  if (!plain(value) || !plain(value.snapshot) || Buffer.byteLength(JSON.stringify(value)) > 256 * 1024) return fail();
  const current = value.snapshot;
  const active = parseCatalog(current);
  if (active.some(row => row.state === 'exited')) return fail();
  if (!(current.previousRankingRunId === null || typeof current.previousRankingRunId === 'string' && uuid.test(current.previousRankingRunId)) || current.previousRankingRunId === current.rankingRunId) return fail();
  let prior: PublicCandidate[] = [];
  let previousSnapshot: { rankingRunId: string; cutoff: string } | null = null;
  if (current.previousRankingRunId === null) { if (value.previousSnapshot !== null) return fail(); }
  else {
    if (!plain(value.previousSnapshot)) return fail();
    prior = parseCatalog(value.previousSnapshot);
    if (prior.some(row => row.state === 'exited')) return fail();
    if (value.previousSnapshot.rankingRunId !== current.previousRankingRunId || Date.parse(value.previousSnapshot.cutoff as string) > Date.parse(current.cutoff as string)) return fail();
    previousSnapshot = { rankingRunId: value.previousSnapshot.rankingRunId as string, cutoff: value.previousSnapshot.cutoff as string };
  }
  let nextSnapshot: { rankingRunId: string; cutoff: string } | null = null;
  if (value.nextSnapshot !== null) {
    const next = value.nextSnapshot;
    if (!plain(next) || typeof next.rankingRunId !== 'string' || !uuid.test(next.rankingRunId) || next.rankingRunId === current.rankingRunId || next.rankingRunId === current.previousRankingRunId
      || next.previousRankingRunId !== current.rankingRunId || typeof next.cutoff !== 'string' || !Number.isFinite(Date.parse(next.cutoff)) || Date.parse(next.cutoff) < Date.parse(current.cutoff as string)) return fail();
    nextSnapshot = { rankingRunId: next.rankingRunId, cutoff: next.cutoff };
  }
  const rows: CandidateHistoryRow[] = active.map(row => ({ ...row, stateBasis: 'saved_active_pool', observedAt: current.cutoff as string, lastObservedAt: current.cutoff as string }));
  const currentSymbols = new Set(active.map(row => row.symbol));
  for (const old of prior) if (!currentSymbols.has(old.symbol)) rows.push({ ...old, state: 'exited', entryEligible: false, stateBasis: 'absent_from_successor', observedAt: current.cutoff as string, lastObservedAt: previousSnapshot!.cutoff });
  rows.sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
  return { ...paginate(current, rows, query), previousSnapshot, nextSnapshot, gaps: [...CANDIDATE_HISTORY_GAPS], scope: 'saved_adjacent_active_pool_snapshots' as const };
}

/** Catalog members outside Top10 have publication history, not a ranked detail binding. */
export function candidateDetailHref(candidate: Pick<PublicCandidate, 'symbol' | 'revisionId'>) {
  if (typeof candidate.symbol !== 'string' || !/^\d{4}$/u.test(candidate.symbol) || !(candidate.revisionId === null || typeof candidate.revisionId === 'string' && uuid.test(candidate.revisionId))) return fail();
  return `/stock/${candidate.symbol}${candidate.revisionId ? `?vnextRevision=${encodeURIComponent(candidate.revisionId)}` : ''}`;
}
