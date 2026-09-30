import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { loadPublishedCandidateSymbols } from '@/lib/candidate-screened-universe';
import { researchCanonicalHash } from '@/lib/research-agent-qualification';
import {
  selectResearchPriority, type ResearchPriorityCandidate, type ResearchSourceAttempt, type ResearchSourceRoot,
} from '@/lib/research-agent-priority';

type Row = Record<string, unknown>;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const SYMBOL = /^\d{4}$/u;
const MAX_DOCUMENTS = 20_000;
const PLATFORMS = ['official', 'news', 'broker', 'ptt', 'investanchors', 'threads', 'instagram', 'facebook'];
function instant(value: unknown) {
  return typeof value === 'string' && INSTANT.test(value) && Number.isFinite(Date.parse(value));
}
function ordinal(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Row;
  return Number.isInteger(row.level) && Number(row.level) >= 0 && Number(row.level) <= 4
    && typeof row.reason === 'string' && row.reason.trim().length >= 4 && row.reason.length <= 400
    ? { level: row.level as 0 | 1 | 2 | 3 | 4, reason: row.reason } : null;
}
function rootKind(platform: string, url: URL, metadata: Row): ResearchSourceRoot['kind'] {
  const officialDomain = /(^|\.)(twse\.com\.tw|tpex\.org\.tw|auo\.com)$/iu.test(url.hostname);
  if (officialDomain && metadata.claim_status !== 'rumor' && metadata.claim_status !== 'reported') return 'official_verified';
  if (/^(industry|omdia|peer)/iu.test(platform) && metadata.claim_status !== 'rumor') return 'primary_industry';
  if (/broker|anue/iu.test(platform)) return 'public_broker';
  if (/^(ptt|threads|instagram|facebook|investanchors|telegram|bulltalk)/iu.test(platform)) return 'social_rumor';
  return 'news';
}
function rootFromDocument(row: Row, asOf: string): ResearchSourceRoot | null {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
  const publishedAt = String(row.published_at || '');
  const firstObservedAt = String(metadata.first_observed_at || row.collected_at || '');
  const canonical = String(metadata.parent_source_url || metadata.canonical_url || row.document_url || '');
  if (!instant(publishedAt) || !instant(firstObservedAt) || Date.parse(publishedAt) > Date.parse(asOf)
    || Date.parse(firstObservedAt) > Date.parse(asOf)) return null;
  let url: URL;
  try { url = new URL(canonical); } catch { return null; }
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  url.hash = '';
  const status = metadata.retracted_at ? 'retracted'
    : metadata.claim_status === 'denied' ? 'contradicted' : 'current';
  return {
    rootId: url.toString(), url: url.toString(), publishedAt, firstObservedAt,
    kind: rootKind(String(row.platform || ''), url, metadata), status,
  };
}
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maximum: number) {
  const rows: T[] = [];
  for (let from = 0; from <= maximum; from += 500) {
    const result = await read(from, from + Math.min(500, maximum + 1 - from) - 1);
    if (result.error || !Array.isArray(result.data)) throw new Error(result.error?.message || 'research_priority_read_failed');
    rows.push(...result.data);
    if (rows.length > maximum) throw new Error('research_priority_source_bound_exceeded');
    if (result.data.length < 500) break;
  }
  return rows;
}

/** A read-only candidate evaluation followed by one immutable research-queue receipt. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Row | null;
  const asOf = String(body?.asOf || '');
  const attemptsRaw = body?.sourceAttempts;
  const assessmentsRaw = body?.assessments;
  if (!instant(asOf) || Date.parse(asOf) > Date.now() || !Array.isArray(attemptsRaw)
    || attemptsRaw.length > 50 || !Array.isArray(assessmentsRaw) || assessmentsRaw.length > 5000) {
    return NextResponse.json({ ok: false, error: 'research_priority_request_invalid' }, { status: 400 });
  }
  const attempts: ResearchSourceAttempt[] = [];
  for (const item of attemptsRaw) {
    const row = item as Row;
    if (!PLATFORMS.includes(String(row?.platform)) || !['success', 'no_relevant', 'failed', 'not_attempted'].includes(String(row?.status))
      || !instant(row?.attemptedAt) || Date.parse(String(row.attemptedAt)) > Date.parse(asOf)
      || Date.parse(String(row.attemptedAt)) < Date.parse(asOf) - 36 * 3600_000
      || typeof row.scope !== 'string' || row.scope.trim().length < 4 || row.scope.length > 500
      || !Number.isInteger(row.resultCount) && row.resultCount !== null
      || (row.resultCount !== null && (Number(row.resultCount) < 0 || Number(row.resultCount) > 20_000))
      || row.status === 'no_relevant' && row.resultCount !== 0
      || row.status === 'success' && row.resultCount === null
      || ['failed', 'not_attempted'].includes(String(row.status)) && row.resultCount !== null
      || row.status === 'failed' && (typeof row.errorCode !== 'string' || row.errorCode.trim().length < 3)
      || row.status !== 'failed' && row.errorCode != null
      || typeof row.receiptHash !== 'string' || !/^[0-9a-f]{64}$/u.test(row.receiptHash)) {
      return NextResponse.json({ ok: false, error: 'research_priority_source_attempt_invalid' }, { status: 400 });
    }
    attempts.push({ platform: String(row.platform), status: row.status as ResearchSourceAttempt['status'],
      attemptedAt: String(row.attemptedAt), scope: row.scope, resultCount: row.resultCount as number | null,
      errorCode: row.errorCode == null ? null : String(row.errorCode), receiptHash: row.receiptHash });
  }
  for (const platform of PLATFORMS) if (!attempts.some((attempt) => attempt.platform === platform)) {
    attempts.push({ platform, status: 'not_attempted', attemptedAt: asOf,
      scope: 'platform_not_attempted_in_this_run', resultCount: null,
      errorCode: null, receiptHash: researchCanonicalHash({ platform, asOf, status: 'not_attempted' }) });
  }
  const assessments = new Map<string, Row>();
  for (const item of assessmentsRaw) {
    const row = item as Row;
    const symbol = String(row?.symbol || '');
    if (!SYMBOL.test(symbol) || assessments.has(symbol) || !ordinal(row.profitImpact) || !ordinal(row.novelty)
      || !ordinal(row.researchability) || !['general', 'emerging'].includes(String(row.lane))
      || !['queued', 'researching', 'needs_evidence', 'rejected', 'qualified', 'stale'].includes(String(row.disposition))
      || typeof row.inProgress !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'research_priority_assessment_invalid' }, { status: 400 });
    }
    assessments.set(symbol, row);
  }
  const db = getSupabaseServerClient();
  try {
    const [official, screened, documents] = await Promise.all([
      pages<Row>(async (from, to) => {
        const result = await db.rpc('candidate_research_stock_authority_page', {
          p_cutoff: asOf, p_page_offset: from, p_page_limit: to - from + 1,
        });
        return { data: result.data as Row[] | null, error: result.error };
      }, 5000),
      loadPublishedCandidateSymbols(db, asOf),
      pages<Row>(async (from, to) => {
        const start = new Date(Date.parse(asOf) - 14 * 86_400_000).toISOString();
        const result = await db.from('source_raw_documents')
          .select('id,platform,document_url,published_at,collected_at,symbols,metadata')
          .gte('collected_at', start).lte('collected_at', asOf)
          .order('collected_at', { ascending: false }).order('id').range(from, to);
        return { data: result.data as Row[] | null, error: result.error };
      }, MAX_DOCUMENTS),
    ]);
    const roster = new Map(official.filter((row) => SYMBOL.test(String(row.symbol || '')))
      .map((row) => [String(row.symbol), row]));
    if (!roster.size) throw new Error('research_priority_official_roster_missing');
    const symbols = new Set(screened);
    const rootsBySymbol = new Map<string, ResearchSourceRoot[]>();
    for (const document of documents) {
      const root = rootFromDocument(document, asOf);
      if (!root) continue;
      for (const rawSymbol of Array.isArray(document.symbols) ? document.symbols : []) {
        const symbol = String(rawSymbol);
        if (!SYMBOL.test(symbol) || !roster.has(symbol)) continue;
        symbols.add(symbol);
        rootsBySymbol.set(symbol, [...(rootsBySymbol.get(symbol) || []), root]);
      }
    }
    for (const symbol of assessments.keys()) symbols.add(symbol);
    const excluded = [...symbols].filter((symbol) => !roster.has(symbol)).sort();
    const candidates: ResearchPriorityCandidate[] = [...symbols].filter((symbol) => roster.has(symbol)).sort().map((symbol) => {
      const row = assessments.get(symbol);
      const unrated = { level: 0 as const, reason: '尚未完成有理由的人工研究評分' };
      return {
        symbol, sector: String(roster.get(symbol)?.sector || ''), roots: rootsBySymbol.get(symbol) || [],
        attempts, profitImpact: ordinal(row?.profitImpact) || unrated,
        novelty: ordinal(row?.novelty) || unrated, researchability: ordinal(row?.researchability) || unrated,
        lane: row?.lane === 'emerging' ? 'emerging' : 'general',
        inProgress: row?.inProgress === true, disposition: row
          ? row.disposition as ResearchPriorityCandidate['disposition'] : 'needs_evidence',
      };
    });
    const run = selectResearchPriority({ candidates, asOf });
    const inputHash = researchCanonicalHash({ asOf, attempts, candidates, excluded });
    const stored = await db.from('research_priority_runs_v1').insert({
      as_of: asOf, policy_version: run.policyVersion, input_hash: inputHash,
      expected_count: run.expectedCount, accounted_count: run.accountedCount,
      source_attempts: attempts, rows: run.rows, research_queue: run.queue,
    }).select('run_id').single();
    if (stored.error && stored.error.code !== '23505') throw new Error(stored.error.message);
    const replay = stored.error ? await db.from('research_priority_runs_v1')
      .select('run_id').eq('policy_version', run.policyVersion).eq('input_hash', inputHash).maybeSingle() : null;
    if (replay?.error || (replay && !replay.data)) throw new Error('research_priority_replay_failed');
    const runId = String(stored.data?.run_id || replay?.data?.run_id || '');
    const queued = await db.rpc('enqueue_research_deep_jobs_v1', { p_run_id: runId });
    if (queued.error) throw new Error(`research_priority_job_enqueue_failed:${queued.error.message}`);
    return NextResponse.json({ ok: true, runId,
      asOf, expectedCount: run.expectedCount, accountedCount: run.accountedCount,
      queue: run.queue, excludedNonCommon: excluded, sourceAttempts: attempts,
      unselectedCount: run.unselected.length, newDeepResearchJobs: queued.data,
      idempotentReplay: Boolean(replay) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_priority_run_failed' }, { status: 409 });
  }
}
