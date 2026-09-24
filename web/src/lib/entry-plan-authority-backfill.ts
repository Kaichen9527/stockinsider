import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';
import { canonicalJson } from './opportunity-v3/canonical.ts';
import { validateIngestionValuesV3 } from './opportunity-v3/request-values.ts';
import { CORPORATE_ACTION_FEEDS, corporateActionRangeUrl, loadCorporateActionSnapshotsRange, loadOfficialPriceHistoryMonth } from './generated/official-authority/official-twse-valuation.js';

type Row = Record<string, unknown>;
type Exchange = 'TWSE' | 'TPEX';
type FrozenSession = { session: string; sessionAuthorityId: string; market: Exchange; status: 'completed' };
type RosterItem = { stockId: string; symbol: string; exchange: Exchange | 'TPEx' };
type RunRow = Row & { run_id: string; source_cutoff: string; latest_session: string; roster: RosterItem[];
  calendar: Record<Exchange, FrozenSession[]>; status: string };
type JobRow = Row & { run_id: string; job_key: string; kind: 'price_month' | 'action_range';
  exchange: Exchange; symbol: string | null; month: string | null; sessions: string[];
  status: string; attempt_count: number };
export type AuthorityBackfillRequest = { purpose: 'entry_plan_authority'; runId: string | null; requestBudget: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[0-9a-f]{64}$/u;
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
function fail(label: string): never { throw new Error(label); }

export function parseAuthorityBackfillRequest(value: unknown): AuthorityBackfillRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Row;
  if (row.purpose !== 'entry_plan_authority' || Object.keys(row).some((key) => !['purpose', 'runId', 'requestBudget'].includes(key))) return null;
  const budget = row.requestBudget === undefined ? 12 : row.requestBudget;
  if (!Number.isInteger(budget) || Number(budget) < 1 || Number(budget) > 24) return null;
  const runId = row.runId === undefined ? null : row.runId;
  if (runId !== null && (typeof runId !== 'string' || !UUID.test(runId))) return null;
  return { purpose: 'entry_plan_authority', runId, requestBudget: Number(budget) };
}

async function calendarFor(client: SupabaseClient, exchange: Exchange, cutoff: string) {
  const rows: Row[] = [];
  for (let offset = 0; offset < 3000; offset += 500) {
    const result = await client.from('tw_trading_sessions_v3')
      .select('session_authority_id,session_id,market,status,provider,source_timestamp,collected_at,recorded_at,close_at')
      .eq('market', exchange).lte('session_id', cutoff.slice(0, 10))
      .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).range(offset, offset + 499);
    if (result.error || !Array.isArray(result.data)) fail('entry_plan_calendar_read_failed');
    rows.push(...result.data as Row[]);
    if (result.data.length < 500) break;
  }
  const heads = new Map<string, Row>();
  for (const row of rows) if (day(row.session_id) && !heads.has(String(row.session_id))) heads.set(String(row.session_id), row);
  const selected = [...heads.values()].filter((row) => row.status === 'completed' && row.provider === exchange.toLowerCase()
    && Date.parse(String(row.close_at)) <= Date.parse(cutoff)).slice(0, 240).reverse();
  if (selected.length !== 240) fail(`entry_plan_calendar_240_missing:${exchange}`);
  return selected.map((row): FrozenSession => ({ session: String(row.session_id),
    sessionAuthorityId: String(row.session_authority_id), market: exchange, status: 'completed' }));
}

export function planAuthorityJobs(run: Pick<RunRow, 'run_id' | 'roster' | 'calendar'>) {
  const jobs: Row[] = [];
  for (const stock of run.roster) {
    const exchange: Exchange = stock.exchange === 'TPEx' ? 'TPEX' : stock.exchange;
    const months = [...new Set(run.calendar[exchange].map((row) => row.session.slice(0, 7)))];
    for (const month of months) jobs.push({ run_id: run.run_id, job_key: `P:${exchange}:${stock.symbol}:${month}`,
      kind: 'price_month', exchange, symbol: stock.symbol, month,
      sessions: run.calendar[exchange].filter((row) => row.session.startsWith(month)).map((row) => row.session), status: 'pending' });
  }
  for (const exchange of ['TWSE', 'TPEX'] as const) {
    if (!run.roster.some((row) => (row.exchange === 'TPEx' ? 'TPEX' : row.exchange) === exchange)) continue;
    const sessions = run.calendar[exchange].slice(1);
    for (let offset = 0; offset < sessions.length; offset += 20) jobs.push({ run_id: run.run_id,
      job_key: `A:${exchange}:${String(offset).padStart(3, '0')}`, kind: 'action_range', exchange,
      symbol: null, month: null, sessions: sessions.slice(offset, offset + 20).map((row) => row.session), status: 'pending' });
  }
  return jobs.sort((a, b) => String(a.job_key).localeCompare(String(b.job_key)));
}

async function ensureRun(client: SupabaseClient, request: AuthorityBackfillRequest): Promise<RunRow> {
  if (request.runId) {
    const found = await client.from('entry_plan_authority_runs_v1').select('*').eq('run_id', request.runId).single();
    if (found.error || !found.data) fail('entry_plan_run_missing');
    return found.data as RunRow;
  }
  const existing = await client.from('entry_plan_authority_runs_v1').select('*')
    .in('status', ['initializing', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existing.error) fail('entry_plan_run_read_failed');
  if (existing.data) return existing.data as RunRow;
  const sourceCutoff = new Date().toISOString();
  const [twse, tpex] = await Promise.all([calendarFor(client, 'TWSE', sourceCutoff), calendarFor(client, 'TPEX', sourceCutoff)]);
  const latest = twse.at(-1)!.session;
  const [{ readCandidateResearchRosterAt }, { candidateResearchSeedRoster }] = await Promise.all([
    import('./candidate-research.ts'), import('./domain.ts'),
  ]);
  const resolved = await readCandidateResearchRosterAt(client, sourceCutoff, latest,
    { seedSymbols: candidateResearchSeedRoster() });
  const roster = resolved.roster.map((row) => ({ ...row, exchange: row.exchange === 'TPEx' ? 'TPEX' : row.exchange }));
  if (!roster.length || roster.length > 5000 || roster.some((row) => !UUID.test(row.stockId) || !/^\d{4}$/u.test(row.symbol)))
    fail('entry_plan_roster_invalid');
  const calendar = { TWSE: twse, TPEX: tpex };
  const value = { run_id: randomUUID(), source_cutoff: sourceCutoff, latest_session: latest,
    roster, roster_hash: hash(roster), excluded_symbols: resolved.excludedScreenedSymbols,
    calendar, calendar_hash: hash(calendar), status: 'initializing' };
  const inserted = await client.from('entry_plan_authority_runs_v1').insert(value).select('*').single();
  if (inserted.error || !inserted.data) fail('entry_plan_run_create_failed');
  return inserted.data as RunRow;
}

async function ensureJobs(client: SupabaseClient, run: RunRow) {
  if (hash(run.roster) !== run.roster_hash || hash(run.calendar) !== run.calendar_hash) fail('entry_plan_run_frozen_hash_mismatch');
  if (run.status !== 'initializing') return;
  const jobs = planAuthorityJobs(run);
  for (let offset = 0; offset < jobs.length; offset += 150) {
    const result = await client.from('entry_plan_authority_jobs_v1').upsert(jobs.slice(offset, offset + 150), { onConflict: 'run_id,job_key', ignoreDuplicates: true });
    if (result.error) fail('entry_plan_jobs_initialize_failed');
  }
  const updated = await client.from('entry_plan_authority_runs_v1').update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('run_id', run.run_id).eq('status', 'initializing');
  if (updated.error) fail('entry_plan_run_start_failed');
  run.status = 'running';
}

async function appendAuthority(client: SupabaseClient, input: Row, principal: string) {
  if (!validateIngestionValuesV3('append_price_authority_v3', input)) fail('entry_plan_official_row_invalid');
  const payload = input as { kind: string; rawPrice: Row | null; corporateActionSnapshot: Row | null; exchangeReportedPe: null };
  const snake = (value: string) => value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);
  const fields = (value: Row | null): Row | null => value && Object.fromEntries(Object.entries(value).map(([key, item]) => [snake(key),
    Array.isArray(item) ? item.map((member) => member && typeof member === 'object' ? fields(member as Row) : member) : item]));
  const result = await client.rpc('append_price_authority_v3', { input: {
    kind: payload.kind, raw_price: fields(payload.rawPrice), corporate_action_snapshot: fields(payload.corporateActionSnapshot),
    exchange_reported_pe: null }, caller_principal: principal });
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1)
    fail(`entry_plan_authority_append_failed:${result.error?.code || 'invalid_result'}`);
}

async function executeJob(client: SupabaseClient, run: RunRow, job: JobRow, principal: string) {
  const sessionIds = new Set(job.sessions);
  const calendar = new Map(run.calendar[job.exchange].map((row) => [row.session, row]));
  if (job.kind === 'price_month') {
    const stock = run.roster.find((row) => row.symbol === job.symbol && (row.exchange === 'TPEx' ? 'TPEX' : row.exchange) === job.exchange);
    if (!stock || !job.symbol || !job.month) fail('entry_plan_job_roster_conflict');
    const result = await loadOfficialPriceHistoryMonth({ exchange: job.exchange, symbol: job.symbol,
      month: job.month });
    if (result.rows.some((row: Row) => !String(row.session).startsWith(job.month!)))
      fail('entry_plan_price_month_conflict');
    const rows = result.rows.filter((row: Row) => sessionIds.has(String(row.session)));
    const unique = new Map<string, Row>();
    for (const row of rows) {
      const session = String(row.session);
      if (unique.has(session) && hash(unique.get(session)) !== hash(row)) fail('entry_plan_price_source_conflict');
      unique.set(session, row);
    }
    for (const row of unique.values()) {
      const authority = calendar.get(String(row.session));
      if (!authority) fail('entry_plan_job_calendar_conflict');
      await appendAuthority(client, { kind: 'raw_price', rawPrice: { stockId: stock.stockId,
        exchange: job.exchange, sessionId: row.session, sessionAuthorityId: authority.sessionAuthorityId,
        rawOpen: row.open, rawHigh: row.high, rawLow: row.low, rawClose: row.close,
        volume: row.volume, turnoverTwd: row.turnoverTwd, provider: row.provider,
        sourceTimestamp: row.sourceTimestamp, collectedAt: row.collectedAt, sourceRef: row.sourceRef },
        corporateActionSnapshot: null, exchangeReportedPe: null }, principal);
    }
    return { collectedAt: result.collectedAt, acceptedRows: unique.size, missingRows: job.sessions.length - unique.size,
      sourceUrls: [result.url], evidenceHash: result.responseSha256 };
  }
  const snapshots = await loadCorporateActionSnapshotsRange({ calendarSessions: job.sessions.map((session) => ({
    market: job.exchange, session, status: 'completed' })), collectedAt: undefined, fetchImpl: globalThis.fetch });
  if (snapshots.length !== job.sessions.length) fail('entry_plan_action_range_incomplete');
  for (const snapshot of snapshots) {
    const authority = calendar.get(snapshot.session);
    if (!authority) fail('entry_plan_job_calendar_conflict');
    await appendAuthority(client, { kind: 'corporate_action_snapshot', rawPrice: null, corporateActionSnapshot: {
      exchange: job.exchange, sessionId: snapshot.session, sessionAuthorityId: authority.sessionAuthorityId,
      corporateActionVersion: snapshot.corporateActionVersion, provider: snapshot.provider,
      collectedAt: snapshot.collectedAt, feedEvidence: snapshot.feedEvidence,
      declaredEventCount: snapshot.declaredEventCount, events: snapshot.events }, exchangeReportedPe: null }, principal);
  }
  const sourceUrls = CORPORATE_ACTION_FEEDS[job.exchange].map((feed: { identity: string }) =>
    corporateActionRangeUrl(job.exchange, job.sessions[0], job.sessions.at(-1), feed));
  return { collectedAt: snapshots[0].collectedAt, acceptedRows: snapshots.length, missingRows: 0, sourceUrls,
    evidenceHash: hash(snapshots.map((snapshot) => [snapshot.session, snapshot.feedEvidence.map((feed) => feed.responseSha256),
      snapshot.events.map((event) => event.sourceRowRef)])) };
}

export async function runEntryPlanAuthorityBackfill(client: SupabaseClient, request: AuthorityBackfillRequest) {
  const principal = fixedRunnerPrincipal();
  if (!principal) fail('entry_plan_runner_principal_missing');
  const run = await ensureRun(client, request);
  await ensureJobs(client, run);
  if (run.status === 'failed') fail('entry_plan_run_failed');
  // A stopped HTTP batch may leave one leased job. Its official append calls
  // are idempotent; a later batch can safely retry after the bounded lease.
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const recovered = await client.from('entry_plan_authority_jobs_v1').update({ status: 'retry', last_error: 'stale_claim_recovered' })
    .eq('run_id', run.run_id).eq('status', 'running').lt('claimed_at', stale);
  if (recovered.error) fail('entry_plan_stale_claim_recovery_failed');
  const deadline = Date.now() + 220_000;
  const processed: Array<{ jobKey: string; status: string; error?: string }> = [];
  for (let i = 0; i < request.requestBudget && Date.now() < deadline; i++) {
    const next = await client.from('entry_plan_authority_jobs_v1').select('*').eq('run_id', run.run_id)
      .in('status', ['pending', 'retry']).order('job_key').limit(1).maybeSingle();
    if (next.error) fail('entry_plan_job_read_failed');
    if (!next.data) break;
    const job = next.data as JobRow;
    const claimedAt = new Date().toISOString();
    const claim = await client.from('entry_plan_authority_jobs_v1')
      .update({ status: 'running', attempt_count: job.attempt_count + 1, claimed_at: claimedAt })
      .eq('run_id', run.run_id).eq('job_key', job.job_key).eq('status', job.status)
      .eq('attempt_count', job.attempt_count).select('*').maybeSingle();
    if (claim.error) fail('entry_plan_job_claim_failed');
    if (!claim.data) continue;
    try {
      const evidence = await executeJob(client, run, claim.data as JobRow, principal);
      if (!HASH.test(evidence.evidenceHash)) fail('entry_plan_evidence_hash_invalid');
      const saved = await client.from('entry_plan_authority_jobs_v1').update({
        status: 'complete', collected_at: evidence.collectedAt, completed_at: new Date().toISOString(),
        evidence_hash: evidence.evidenceHash, source_url: evidence.sourceUrls[0], source_urls: evidence.sourceUrls,
        accepted_rows: evidence.acceptedRows, missing_rows: evidence.missingRows, last_error: null,
      }).eq('run_id', run.run_id).eq('job_key', job.job_key).eq('status', 'running').select('job_key').single();
      if (saved.error || !saved.data) fail('entry_plan_job_complete_failed');
      processed.push({ jobKey: job.job_key, status: 'complete' });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 200) : 'entry_plan_job_unknown_failure';
      const status = Number((claim.data as JobRow).attempt_count) >= 5 ? 'failed' : 'retry';
      const saved = await client.from('entry_plan_authority_jobs_v1').update({ status, last_error: message })
        .eq('run_id', run.run_id).eq('job_key', job.job_key).eq('status', 'running').select('job_key').single();
      if (saved.error || !saved.data) fail('entry_plan_job_retry_state_failed');
      processed.push({ jobKey: job.job_key, status, error: message });
    }
  }
  const summary = await client.from('entry_plan_authority_jobs_v1').select('status,accepted_rows,missing_rows')
    .eq('run_id', run.run_id);
  if (summary.error || !summary.data) fail('entry_plan_jobs_summary_failed');
  const counts = Object.fromEntries(['pending', 'running', 'retry', 'complete', 'failed'].map((status) =>
    [status, summary.data.filter((row) => row.status === status).length]));
  let authorityCutoff = typeof run.authority_cutoff === 'string' ? run.authority_cutoff : null;
  if (run.status === 'running' && counts.pending + counts.running + counts.retry === 0) {
    const status = counts.failed ? 'failed' : 'complete';
    const end = new Date().toISOString();
    const updated = await client.from('entry_plan_authority_runs_v1').update({ status, updated_at: end,
      authority_cutoff: status === 'complete' ? end : null, completed_at: end }).eq('run_id', run.run_id);
    if (updated.error) fail('entry_plan_run_finalize_failed');
    authorityCutoff = status === 'complete' ? end : null;
  }
  return { schema: 'entry-plan-authority-backfill-v1', runId: run.run_id,
    sourceCutoff: run.source_cutoff, authorityCutoff, latestSession: run.latest_session,
    rosterCount: run.roster.length, excludedSymbols: run.excluded_symbols,
    rosterHash: run.roster_hash, calendarHash: run.calendar_hash,
    counts, acceptedRows: summary.data.reduce((total, row) => total + Number(row.accepted_rows || 0), 0),
    missingRows: summary.data.reduce((total, row) => total + Number(row.missing_rows || 0), 0),
    processed };
}
