import { createHash } from 'node:crypto';
import { POLICY } from './policy.ts';

/** Read-only pagination over an already persisted immutable ranking catalog.
 * It neither validates review authority nor extends the catalog's coverage. */
export const CANDIDATE_GAPS = ['not_admitted_catalog_not_available', 'complete_historical_catalog_not_available', 'source_metadata_not_available', 'industry_metadata_not_available'] as const;
const statuses = ['researching', 'waiting', 'eligible', 'exited'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type CandidateFilters = { date: string | null; source: string | null; industry: string | null; status: typeof statuses[number] | null };
export type CandidateQuery = { filters: CandidateFilters; limit: number; cursor: string | null };
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
  return { filters: { date, source, industry, status: status as CandidateFilters['status'] }, limit: limitValue ? Number(limitValue) : 10, cursor };
}
function decodeCursor(value: string): Cursor {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 1000) return fail();
  let data: unknown; try { data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { return fail(); }
  if (!plain(data) || Object.keys(data).sort().join(',') !== 'after,catalogHash,filtersHash,rankingRunId,version' || data.version !== 1 || typeof data.rankingRunId !== 'string' || !uuid.test(data.rankingRunId)
    || typeof data.after !== 'string' || !/^\d{4}$/u.test(data.after) || typeof data.catalogHash !== 'string' || !/^[a-f0-9]{64}$/u.test(data.catalogHash) || typeof data.filtersHash !== 'string' || !/^[a-f0-9]{64}$/u.test(data.filtersHash)) return fail();
  return data as Cursor;
}
export function candidateRankingRunId(query: CandidateQuery): string | null {
  if (!query.cursor) return null;
  const cursor = decodeCursor(query.cursor);
  if (cursor.filtersHash !== hash(query.filters)) return fail();
  return cursor.rankingRunId;
}
/** Strict public allowlist: input hashes, reasons, evidence and all unknown keys stay private. */
export function candidatePage(value: unknown, query: CandidateQuery) {
  if (!plain(value) || !plain(value.snapshot)) return fail();
  const snapshot = value.snapshot;
  if (snapshot.schemaVersion !== 'vnext-ranking-snapshot-v1' || snapshot.policyVersion !== POLICY.version || typeof snapshot.rankingRunId !== 'string' || !uuid.test(snapshot.rankingRunId) || typeof snapshot.cutoff !== 'string' || !Number.isFinite(Date.parse(snapshot.cutoff)) || !Array.isArray(snapshot.candidates) || snapshot.candidates.length > 20) return fail();
  const all: PublicCandidate[] = snapshot.candidates.map((raw: unknown) => {
    if (!plain(raw) || typeof raw.symbol !== 'string' || !/^\d{4}$/u.test(raw.symbol) || !statuses.includes(raw.state as typeof statuses[number]) || typeof raw.entryEligible !== 'boolean'
      || !(raw.date === null || typeof raw.date === 'string' && validDate(raw.date)) || !(raw.revisionId === null || typeof raw.revisionId === 'string' && uuid.test(raw.revisionId)) || raw.source !== null || raw.industry !== null) return fail();
    return { symbol: raw.symbol, state: raw.state as PublicCandidate['state'], date: raw.date as string | null, revisionId: raw.revisionId as string | null, entryEligible: raw.entryEligible, source: null, industry: null };
  }).sort((a, b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
  if (new Set(all.map(row => row.symbol)).size !== all.length) return fail();
  const catalogHash = hash({ rankingRunId: snapshot.rankingRunId, cutoff: snapshot.cutoff, rows: all });
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (cursor && (cursor.rankingRunId !== snapshot.rankingRunId || cursor.catalogHash !== catalogHash || cursor.filtersHash !== hash(query.filters) || !all.some(row => row.symbol === cursor.after))) return fail();
  const filtered = all.filter(row => (!query.filters.date || row.date === query.filters.date) && (!query.filters.status || row.state === query.filters.status) && !query.filters.source && !query.filters.industry);
  const remaining = filtered.filter(row => !cursor || row.symbol > cursor.after);
  const rows = remaining.slice(0, query.limit);
  const nextCursor = remaining.length > rows.length ? Buffer.from(JSON.stringify({ version: 1, rankingRunId: snapshot.rankingRunId, catalogHash, after: rows.at(-1)!.symbol, filtersHash: hash(query.filters) })).toString('base64url') : null;
  return { rankingRunId: snapshot.rankingRunId, cutoff: snapshot.cutoff, rows, nextCursor, gaps: [...CANDIDATE_GAPS], scope: 'frozen_active_pool_only' as const };
}

/** Catalog members outside Top10 have publication history, not a ranked detail binding. */
export function candidateDetailHref(candidate: Pick<PublicCandidate, 'symbol' | 'revisionId'>) {
  if (typeof candidate.symbol !== 'string' || !/^\d{4}$/u.test(candidate.symbol) || !(candidate.revisionId === null || typeof candidate.revisionId === 'string' && uuid.test(candidate.revisionId))) return fail();
  return `/stock/${candidate.symbol}${candidate.revisionId ? `?vnextRevision=${encodeURIComponent(candidate.revisionId)}` : ''}`;
}
