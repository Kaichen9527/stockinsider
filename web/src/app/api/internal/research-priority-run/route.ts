import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { loadPublishedCandidateSymbols } from '@/lib/candidate-screened-universe';
import { researchCanonicalHash } from '@/lib/research-agent-qualification';
import { RESEARCH_SOURCE_PLATFORMS } from '@/lib/research-source-registry';
import { hasDirectCompanyMentionScope, researchRootFromDocument } from '@/lib/research-source-roots';
import { DISCOVERY_FACTORS, validateDiscoveryFactors, validateDiscoverySourceBindings, type DiscoveryFactor } from '@/lib/research-discovery-evidence';
import { discoveryInstant } from '@/lib/research-discovery-evidence';
import { loadDiscoveryPriceEnrichment } from '@/lib/research-discovery-price-enrichment';
import { parseIndustryAssociations, loadIndustryAssociations, type AssociationRequests, type IndustryAssociationReceipt } from '@/lib/research-source-association';
import {
  selectResearchPriority, type ResearchPriorityCandidate, type ResearchSourceAttempt, type ResearchSourceRoot,
} from '@/lib/research-agent-priority';

type Row = Record<string, unknown>;
const SYMBOL = /^\d{4}$/u;
const MAX_DOCUMENTS = 20_000;
const PLATFORMS: readonly string[] = RESEARCH_SOURCE_PLATFORMS;
function instant(value: unknown) {
  return discoveryInstant(value);
}
function ordinal(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Row;
  return Number.isInteger(row.level) && Number(row.level) >= 0 && Number(row.level) <= 4
    && typeof row.reason === 'string' && row.reason.trim().length >= 4 && row.reason.length <= 400
    ? { level: row.level as 0 | 1 | 2 | 3 | 4, reason: row.reason } : null;
}
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maximum: number) {
  const rows: T[] = [];
  for (let from = 0; from <= maximum; from += 500) {
    const result = await read(from, from + Math.min(500, maximum + 1 - from) - 1);
    if (result.error || !Array.isArray(result.data)) throw new Error('research_priority_read_failed');
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
  if (!body || Object.keys(body).some((key) => !['asOf','sourceAttempts','assessments'].includes(key))
    || !instant(asOf) || Date.parse(asOf) > Date.now() || !Array.isArray(attemptsRaw)
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
    if (!row || Object.keys(row).some((key) => !['symbol','profitImpact','novelty','researchability','lane','disposition','inProgress','factors','associations'].includes(key))
      || !SYMBOL.test(symbol) || assessments.has(symbol) || !ordinal(row.profitImpact) || !ordinal(row.novelty)
      || !ordinal(row.researchability) || !['general', 'emerging'].includes(String(row.lane))
      || !['queued', 'researching', 'needs_evidence', 'rejected', 'qualified', 'stale'].includes(String(row.disposition))
      || typeof row.inProgress !== 'boolean') {
      return NextResponse.json({ ok: false, error: 'research_priority_assessment_invalid' }, { status: 400 });
    }
    assessments.set(symbol, row);
  }
  let associationRequests: AssociationRequests;
  try {
    associationRequests = parseIndustryAssociations([...assessments].map(([symbol, row]) => ({ symbol, associations: row.associations })), asOf);
  } catch {
    return NextResponse.json({ ok: false, error: 'research_priority_associations_invalid' }, { status: 400 });
  }
  const db = getSupabaseServerClient();
  try {
    const [official, screened, documents, domains, activeJobs] = await Promise.all([
      pages<Row>(async (from, to) => {
        const result = await db.rpc('candidate_research_stock_authority_page', {
          p_cutoff: asOf, p_page_offset: from, p_page_limit: to - from + 1,
        });
        return { data: result.data as Row[] | null, error: result.error };
      }, 5000),
      loadPublishedCandidateSymbols(db, asOf),
      pages<Row>(async (from, to) => {
        // The bounded head query includes corrections to old roots. A rolling
        // raw-document window would silently forget a prior discovery/retraction.
        const result = await db.rpc('research_source_heads_page_v1', {
          p_cutoff: asOf, p_offset: from, p_limit: to - from + 1,
        });
        return { data: result.data as Row[] | null, error: result.error };
      }, MAX_DOCUMENTS),
      pages<Row>(async (from, to) => {
        const result = await db.from('candidate_issuer_document_domains_v6').select('stock_id,host')
          .lte('approved_at', asOf).order('stock_id').order('host').range(from, to);
        return { data: result.data, error: result.error };
      }, 5000),
      pages<Row>(async (from, to) => {
        const result = await db.from('research_deep_jobs_v1').select('symbol,status')
          .in('status', ['queued', 'running']).lte('created_at', asOf).order('job_id').range(from, to);
        return { data: result.data, error: result.error };
      }, 5000),
    ]);
    const roster = new Map(official.filter((row) => SYMBOL.test(String(row.symbol || '')))
      .map((row) => [String(row.symbol), row]));
    if (!roster.size) throw new Error('research_priority_official_roster_missing');
    if ([...associationRequests].some(([symbol, associations]) => associations.length && !roster.has(symbol))) {
      throw new Error('research_priority_association_company_not_in_roster');
    }
    const symbols = new Set([...screened, ...roster.keys()]);
    const rootsBySymbol = new Map<string, ResearchSourceRoot[]>();
    const activeSymbols = new Set(activeJobs.map((job) => String(job.symbol)));
    for (const symbol of activeSymbols) symbols.add(symbol);
    for (const document of documents) {
      if (!hasDirectCompanyMentionScope(document)) continue;
      for (const rawSymbol of Array.isArray(document.symbols) ? document.symbols : []) {
        const symbol = String(rawSymbol);
        if (!SYMBOL.test(symbol) || !roster.has(symbol)) continue;
        const approvedHosts = domains.filter((domain) => domain.stock_id === roster.get(symbol)?.stock_id
          || domain.stock_id === roster.get(symbol)?.id).map((domain) => String(domain.host));
        const root = researchRootFromDocument(document, asOf, approvedHosts);
        if (!root) continue;
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
        inProgress: activeSymbols.has(symbol), disposition: activeSymbols.has(symbol) ? 'researching' : row
          ? row.disposition as ResearchPriorityCandidate['disposition'] : 'needs_evidence',
      };
    });
    const run = selectResearchPriority({ candidates, asOf });
    const discoveryEvidenceRows = run.rows.map((row) => {
      const candidate = candidates.find((candidate) => candidate.symbol === row.symbol)!;
      const supplied = assessments.get(row.symbol)?.factors;
      const factors: DiscoveryFactor[] = Array.isArray(supplied) ? supplied : DISCOVERY_FACTORS.map((factor) => ({
        factor, status: 'missing', explanation: '尚未完成此因子的可追溯證據核對',
        documentIds: [], rootIds: [], availableAt: null,
      }));
      validateDiscoveryFactors(factors, asOf);
      const sourceBindings = documents.filter((document) => hasDirectCompanyMentionScope(document) && Array.isArray(document.symbols)
        && document.symbols.includes(row.symbol)).flatMap((document) => {
        const root = researchRootFromDocument(document, asOf);
        return root ? [{ documentId: String(document.id), rootId: root.rootId,
          availableAt: new Date(Math.max(Date.parse(String(document.collected_at)),
            Date.parse(root.revisionObservedAt || root.firstObservedAt))).toISOString(),
          usable: root.status === 'current' && root.kind !== 'metadata_only' }] : [];
      });
      validateDiscoverySourceBindings(factors, sourceBindings);
      const contentRoots = candidate.roots.filter((root) => root.kind !== 'metadata_only');
      const firstSeenAt = contentRoots.reduce((earliest, root) => Date.parse(root.firstObservedAt) < Date.parse(earliest)
        ? root.firstObservedAt : earliest, asOf);
      return { ...row, factors, firstSeenAt: contentRoots.length ? firstSeenAt : null,
        hasDiscoveryEvidence: contentRoots.length > 0 };
    });
    // Server-owned, bounded PIT reads only. Price contexts cannot influence the
    // selection already computed above or replace immutable discovery gaps.
    const priceEnrichment = await loadDiscoveryPriceEnrichment(db, discoveryEvidenceRows.map((row) => ({
      symbol: row.symbol, stockId: String(roster.get(row.symbol)?.stock_id || ''),
      exchange: String(roster.get(row.symbol)?.exchange || ''), firstSeenAt: row.firstSeenAt,
      hasDiscoveryEvidence: row.hasDiscoveryEvidence,
    })), asOf, {currentRun:{serverClock:new Date().toISOString(),
      prioritySymbols:[...new Set([...run.queue.map((row)=>row.symbol),
        ...candidates.filter((candidate)=>candidate.inProgress).map((candidate)=>candidate.symbol).sort()])]}});
    if (priceEnrichment.accountedCount !== run.accountedCount || priceEnrichment.supplementAccountedCount !== run.accountedCount) throw new Error('research_priority_price_accounting_mismatch');
    // Supplementary hypotheses are resolved only after ranking. Their own server
    // observation clock is never a historical discovery time or a source count.
    const hasAssociations = [...associationRequests.values()].some((items) => items.length > 0);
    const associationObservedAt = new Date().toISOString();
    const associations = hasAssociations ? await loadIndustryAssociations(db, associationRequests, asOf, associationObservedAt)
      : new Map<string, IndustryAssociationReceipt[]>();
    const evidenceRows = discoveryEvidenceRows.map((row) => ({ ...row, priceContext: priceEnrichment.contexts.get(row.symbol)!,
      supplementaryObservation:priceEnrichment.supplements.get(row.symbol)!,
      ...(associations.get(row.symbol)?.length ? { sourceAssociations: associations.get(row.symbol)!,
        associationObservedAt, hasResearchCue: associations.get(row.symbol)!.some((item) => item.hasResearchCue) } : {}) }));
    const inputHash = researchCanonicalHash({ asOf, attempts, candidates, evidenceRows, excluded });
    const stored = await db.from('research_priority_runs_v1').insert({
      as_of: asOf, policy_version: run.policyVersion, input_hash: inputHash,
      expected_count: run.expectedCount, accounted_count: run.accountedCount,
      source_attempts: attempts, rows: evidenceRows, research_queue: run.queue,
    }).select('run_id').single();
    if (stored.error && stored.error.code !== '23505') throw new Error('research_priority_store_failed');
    const replay = stored.error ? await db.from('research_priority_runs_v1')
      .select('run_id').eq('policy_version', run.policyVersion).eq('input_hash', inputHash).maybeSingle() : null;
    if (replay?.error || (replay && !replay.data)) throw new Error('research_priority_replay_failed');
    const runId = String(stored.data?.run_id || replay?.data?.run_id || '');
    const queued = await db.rpc('enqueue_research_deep_jobs_v1', { p_run_id: runId });
    if (queued.error) throw new Error('research_priority_job_enqueue_failed');
    const discoveries = await db.rpc('capture_research_first_discoveries_v1', { p_run_id: runId });
    if (discoveries.error) throw new Error('research_priority_discovery_capture_failed');
    return NextResponse.json({ ok: true, runId,
      asOf, inputHash, expectedCount: run.expectedCount, accountedCount: run.accountedCount,
      priceEnrichment: { policyVersion: priceEnrichment.policyVersion, expectedCount: priceEnrichment.expectedCount,
        accountedCount: priceEnrichment.accountedCount, supplementAccountedCount:priceEnrichment.supplementAccountedCount, admittedReads: priceEnrichment.admittedReads,
        bounds: priceEnrichment.bounds, rankingInfluence: false },
      priceContexts: evidenceRows.map((row) => ({ symbol: row.symbol, priceContext: row.priceContext,
        supplementaryObservation:row.supplementaryObservation })),
      rows: run.rows, queue: run.queue, excludedNonCommon: excluded, sourceAttempts: attempts,
      unselectedCount: run.unselected.length, newDeepResearchJobs: queued.data,
      firstDiscoveryCaptures: discoveries.data,
      ...(hasAssociations ? { sourceAssociations: [...associations].filter(([, items]) => items.length > 0)
        .map(([symbol, items]) => ({ symbol, associationObservedAt, associations: items })) } : {}),
      idempotentReplay: Boolean(replay) });
  } catch (error) {
    const safeErrors = new Set(['research_priority_read_failed', 'research_priority_source_bound_exceeded',
      'research_priority_official_roster_missing', 'research_priority_association_company_not_in_roster',
      'research_priority_price_accounting_mismatch', 'research_priority_store_failed', 'research_priority_replay_failed',
      'research_priority_job_enqueue_failed', 'research_priority_discovery_capture_failed', 'research_association_clock_invalid']);
    return NextResponse.json({ ok: false, error: error instanceof Error && safeErrors.has(error.message)
      ? error.message : 'research_priority_run_failed' }, { status: 409 });
  }
}
