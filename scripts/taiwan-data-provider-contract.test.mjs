import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260906_taiwan_data_provider_v5.sql', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../web/src/lib/taiwan-data-provider.ts', import.meta.url), 'utf8');
const refreshRoute = readFileSync(new URL('../web/src/app/api/internal/taiwan-data-refresh/route.ts', import.meta.url), 'utf8');
const drainRoute = readFileSync(new URL('../web/src/app/api/internal/taiwan-data-queue-drain/route.ts', import.meta.url), 'utf8');
const candidateRefresh = readFileSync(new URL('../web/src/lib/taiwan-candidate-refresh.ts', import.meta.url), 'utf8');
const candidateQueueMigration = readFileSync(new URL('../migrations/20260911_04_taiwan_candidate_refresh_queue.sql', import.meta.url), 'utf8');
const finmindVault = readFileSync(new URL('../web/src/lib/finmind-vault.ts', import.meta.url), 'utf8');
const financialDrainRoute = readFileSync(new URL('../web/src/app/api/internal/candidate-financial-queue-drain/route.ts', import.meta.url), 'utf8');
const preliminaryRoute = readFileSync(new URL('../web/src/app/api/internal/radar-preliminary-publish/route.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../web/src/lib/taiwan-data-runtime.ts', import.meta.url), 'utf8');
const masterCalendar = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-master-calendar.timer', import.meta.url), 'utf8');
const closePreliminary = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-close-preliminary.timer', import.meta.url), 'utf8');
const preliminary = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-preliminary.timer', import.meta.url), 'utf8');
const finalFreeze = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-final-freeze.timer', import.meta.url), 'utf8');
const finalReconcile = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-final-reconcile.timer', import.meta.url), 'utf8');
const drain = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-queue-drain.timer', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../deployment/vps/install-systemd-schedules.sh', import.meta.url), 'utf8');

test('FinMind is persistently labelled as a fallback mirror, never an official source', () => {
  assert.match(provider, /authorityTier: 'finmind_fallback'/u);
  assert.match(migration, /provider = 'finmind' AND authority_tier = 'finmind_fallback'/u);
  assert.match(migration, /provider IN \('twse','tpex'\) AND authority_tier = 'official_primary'/u);
  assert.doesNotMatch(migration, /provider = 'finmind' AND authority_tier = 'official_primary'/u);
  assert.doesNotMatch(provider, /process\.env\.FINMIND_API_TOKEN/u);
  assert.match(drainRoute, /readFinMindVaultToken/u);
  assert.match(finmindVault, /read_stockinsider_finmind_api_token_v6/u);
});

test('terminal outcome contract distinguishes API usage, timeout, schema and empty results', () => {
  for (const outcome of ['empty', 'timeout', 'usage_limited', 'schema_invalid']) {
    assert.match(provider, new RegExp(`'${outcome}'`, 'u'));
    assert.match(migration, new RegExp(`'${outcome}'`, 'u'));
  }
  assert.match(provider, /official\.terminal === 'complete' \|\| official\.terminal === 'empty'/u);
  assert.match(provider, /if \(response\.status === 429\)/u);
  assert.match(migration, /NULLIF\(v_attempt->'apiUsage','null'::jsonb\)/u);
  assert.match(migration, /NULLIF\(v_attempt->'normalizedPayload','null'::jsonb\)/u);
});

test('VPS-only authenticated routes queue and drain the durable provider plane', () => {
  for (const route of [refreshRoute, drainRoute]) {
    assert.match(route, /requireExactInternalBearer\(request\)/u);
    assert.match(route, /await requireActiveVpsWriter\(\)/u);
    assert.match(route, /if \(!writer\.ok\) return NextResponse\.json/u);
    assert.ok(route.indexOf('requireExactInternalBearer(request)') < route.indexOf('await requireActiveVpsWriter()'));
  }
  // Approved v6 queue repair delegates bounded work without moving the writer
  // boundary. The batch RPC still enqueues through the durable v5 provider plane.
  assert.match(refreshRoute, /await enqueueTaiwanRefreshScope\(writer\.supabase/u);
  assert.match(candidateRefresh, /register_taiwan_data_refresh_scope_v6/u);
  assert.match(candidateRefresh, /enqueue_taiwan_data_refresh_batch_v6/u);
  assert.ok(candidateRefresh.indexOf("client.rpc('register_taiwan_data_refresh_scope_v6'")
    < candidateRefresh.indexOf("client.rpc('enqueue_taiwan_data_refresh_batch_v6'"));
  assert.match(candidateQueueMigration, /v_id:=public\.enqueue_taiwan_data_refresh_v5/u);
  assert.match(drainRoute, /claim_taiwan_data_refresh_jobs_v6/u);
  assert.match(drainRoute, /p_session_date: sessionDate, p_phase: input\.phase/u);
  assert.match(candidateQueueMigration, /p_limit NOT BETWEEN 1 AND 100/u);
  assert.match(drainRoute, /complete_taiwan_data_refresh_job_v5/u);
  assert.match(drainRoute, /persist_taiwan_data_canonical_result_v5/u);
  assert.match(migration, /taiwan_data_canonical_results_v5/u);
  assert.match(migration, /taiwan_data_canonical_persistence_required/u);
  assert.match(migration, /INSERT INTO public\.official_price_history/u);
  assert.match(migration, /INSERT INTO public\.official_multiple_history/u);
  assert.match(migration, /INSERT INTO public\.revenue_signals/u);
  assert.match(migration, /taiwan_canonical_source_url_invalid/u);
  assert.match(migration, /jsonb_array_elements_text\(v_row->'fields'\) WITH ORDINALITY/u);
  assert.match(migration, /v_row->>'股票代號'/u);
  assert.match(migration, /成交張數'[\s\S]{0,80}v_volume:=v_volume\*1000/u);
  assert.match(drainRoute, /job\.dataset === 'financial_statement'/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(migration, /RETURN 'retry_scheduled'/u);
  assert.match(migration, /taiwan_data_result_identity_mismatch/u);
  assert.match(drainRoute, /disposition === 'retry_scheduled'/u);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE/u);
  assert.match(financialDrainRoute, /requireExactInternalBearer/u);
  assert.match(financialDrainRoute, /requireActiveVpsWriter/u);
  assert.match(financialDrainRoute, /refreshCandidateOfficialFinancials/u);
  assert.match(financialDrainRoute, /MAX_DRAIN_LIMIT = 20/u);
  assert.match(financialDrainRoute, /neq\('endpoint_key', 'issuer_ir_document'\)/u);
});

test('issuer IR acquisition jobs remain visible to the Browser-assisted receipt worker', () => {
  const pendingRoute = readFileSync(new URL('../web/src/app/api/internal/candidate-financial-documents/pending/route.ts', import.meta.url), 'utf8');
  assert.match(pendingRoute, /candidate_financial_acquisition_jobs_v4/u);
  assert.match(pendingRoute, /eq\('endpoint_key', 'issuer_ir_document'\)[.]eq\('status', 'queued'\)/u);
  assert.match(pendingRoute, /acquisitionJobId: row[.]job_id/u);
  assert.match(pendingRoute, /officialFilingUrl: row[.]source_url/u);
});

test('candidate-universe schedules include typed valuation, revenue and financial datasets', () => {
  for (const dataset of ['daily_valuation', 'monthly_revenue', 'financial_statement']) {
    assert.match(provider, new RegExp(`'${dataset}'`, 'u'));
    assert.match(migration, new RegExp(`'${dataset}'`, 'u'));
  }
  // Approved v6 paginated deep acquisition replaces the old 280-stock ceiling;
  // bounded pages and enqueue batches remain mandatory, not a truncated universe.
  assert.match(refreshRoute, /await readTaiwanCandidateUniverse\(writer\.supabase, queuedAt\)/u);
  assert.match(candidateRefresh, /read_taiwan_data_candidate_universe_v6/u);
  assert.match(candidateRefresh, /p_cutoff: cutoff, p_after_symbol: after, p_limit: TAIWAN_UNIVERSE_PAGE_SIZE/u);
  assert.match(candidateRefresh, /TAIWAN_UNIVERSE_PAGE_SIZE = 200/u);
  assert.match(candidateRefresh, /TAIWAN_ENQUEUE_BATCH_SIZE = 100/u);
  assert.match(candidateRefresh, /if \(result\.data\.length === 0\) break/u);
  assert.match(candidateRefresh, /taiwan_candidate_universe_invalid_order_or_identity/u);
  assert.match(candidateRefresh, /taiwan_candidate_universe_safety_bound_exceeded/u);
  assert.doesNotMatch(refreshRoute, /DAILY_CLOSE_CANDIDATE_CAP|taiwan_candidate_universe_exceeds_daily_close_capacity/u);
  assert.match(migration, /read_taiwan_data_candidate_universe_v5/u);
  assert.match(candidateQueueMigration, /CREATE OR REPLACE FUNCTION public\.read_taiwan_data_candidate_universe_v5/u);
  assert.match(candidateQueueMigration, /public\.read_taiwan_data_candidate_universe_v6\(v_cutoff,v_after/u);
  const closeService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-close-preliminary.service', import.meta.url), 'utf8');
  assert.match(closeService, /daily_valuation/u);
  assert.match(closeService, /monthly_revenue/u);
  assert.doesNotMatch(closeService, /financial_statement/u);
  assert.match(closeService, /"limit":100/u);
  assert.match(drainRoute, /parseTaiwanDrainOptions\(body\)/u);
  assert.match(candidateRefresh, /Number\(row\.limit\) > 100/u);
  assert.match(drainRoute, /DRAIN_CONCURRENCY = 4/u);
  assert.match(closeService, /"limit":100/u);
  assert.match(drainRoute, /job\.symbol === null/u);
  assert.match(migration, /Aggregate valuation\/revenue responses are fetched once per exchange/u);
  assert.match(migration, /official_price_history[\s\S]*T13:30:00\+08:00/u);
});

test('candidate queue completeness retains missing work and cannot certify a single drained batch', () => {
  // v6 persistent queue acceptance: expected scope is frozen before enqueue;
  // a missing job, retry or absent canonical result remains incomplete.
  assert.match(candidateQueueMigration, /taiwan_refresh_scope_required/u);
  assert.match(candidateQueueMigration, /taiwan_refresh_batch_scope_mismatch/u);
  assert.match(candidateQueueMigration, /FROM expected LEFT JOIN public\.taiwan_data_refresh_queue_v5/u);
  assert.match(candidateQueueMigration, /count\(\*\) FILTER\(WHERE job_id IS NULL\) AS missing/u);
  assert.match(candidateQueueMigration, /terminal_status='complete' AND persisted/u);
  assert.match(candidateQueueMigration, /'ready',expected>0 AND completed=expected/u);
  assert.match(candidateQueueMigration, /FROM PUBLIC,anon,authenticated/u);
  assert.match(candidateQueueMigration, /TO service_role/u);
  assert.match(refreshRoute, /result\.enqueueComplete \? 200 : 503/u);
  assert.match(drainRoute, /read_taiwan_data_refresh_progress_v6/u);
  assert.match(drainRoute, /isTaiwanRefreshComplete\(progressRead\.data\)/u);
  assert.match(drainRoute, /dataComplete: scopeComplete/u);
  assert.match(drainRoute, /status: ok \? 200 : errors\.length \? 500 : 503/u);
  assert.match(candidateRefresh, /\['failed', 'queued', 'running', 'missing', 'retrying'\]\.every\(\(key\) => row\[key\] === 0\)/u);
});

test('terminal individual-price gaps permit isolated research but never claim complete data', () => {
  // Approved candidate research acceptance: failures are isolated per stock.
  // Only a settled per-stock price failure is noncritical; pending/missing work
  // or any aggregate failure still blocks the next research step.
  assert.match(candidateQueueMigration, /dataset='daily_price' AND symbol IS NOT NULL\) AS "failedCandidate"/u);
  assert.match(candidateQueueMigration, /\(dataset<>'daily_price' OR symbol IS NULL\)\) AS "failedCritical"/u);
  assert.match(candidateQueueMigration, /'settled',expected>0 AND completed\+failed=expected/u);
  assert.match(candidateQueueMigration, /'researchReady',expected>0 AND completed\+failed=expected AND "failedCritical"=0/u);
  assert.match(candidateRefresh, /row\.expected === Number\(row\.completed\) \+ Number\(row\.failed\)/u);
  assert.match(candidateRefresh, /row\.failed === row\.failedCandidate && row\.failedCritical === 0/u);
  assert.match(candidateRefresh, /row\.settled === true && row\.researchReady === true/u);
  assert.match(candidateRefresh, /\['queued', 'running', 'missing', 'retrying'\]\.every\(\(key\) => row\[key\] === 0\)/u);
  assert.match(drainRoute, /isTaiwanRefreshResearchReady\(progressRead\.data\)/u);
  assert.match(drainRoute, /errors\.length === 0 && \(!input\.requireComplete \|\| researchReady\)/u);
  assert.match(drainRoute, /status: scopeComplete \? 'complete' : researchReady \? 'partial_candidate_data' : 'incomplete'/u);
  assert.match(drainRoute, /scopeComplete, dataComplete: scopeComplete, researchReady/u);
});

test('VPS timers separate the approved preliminary, final, pipeline and hourly drain cadences', () => {
  assert.match(masterCalendar, /06:00:00 Asia\/Taipei/u);
  assert.match(closePreliminary, /18:15:00 Asia\/Taipei/u);
  assert.match(preliminary, /19:00:00 Asia\/Taipei/u);
  assert.match(finalFreeze, /20:15:00 Asia\/Taipei/u);
  assert.match(finalReconcile, /20:40:00 Asia\/Taipei/u);
  assert.match(readFileSync(new URL('../deployment/vps/systemd/stockinsider-research-cycle.timer', import.meta.url), 'utf8'), /21:00:00 Asia\/Taipei/u);
  assert.match(readFileSync(new URL('../deployment/vps/systemd/stockinsider-health-check.timer', import.meta.url), 'utf8'), /21:45:00 Asia\/Taipei/u);
  assert.match(drain, /00\.\.17,22\.\.23:10:00 Asia\/Taipei/u);
  const drainService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-queue-drain.service', import.meta.url), 'utf8');
  assert.match(drainService, /\/api\/internal\/taiwan-data-queue-drain/u);
  assert.match(drainService, /\/api\/internal\/candidate-financial-queue-drain/u);
  assert.match(drainService, /\/api\/internal\/candidate-financial-documents\/worker/u);
  assert.match(drainService, /"limit":20/u);
  assert.doesNotMatch(installer, /FINMIND_API_TOKEN/u);
  assert.match(installer, /stockinsider-taiwan-data-master-calendar\.timer/u);
  assert.match(installer, /call_internal_api_sequence\.mjs/u);
  const preliminaryService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-preliminary.service', import.meta.url), 'utf8');
  assert.match(preliminaryService, /\/api\/internal\/pipeline-run/u);
  assert.match(preliminaryService, /"limit":100/u);
  const domain = readFileSync(new URL('../web/src/lib/domain.ts', import.meta.url), 'utf8');
  assert.match(domain, /phase: finalSemantics[.]phase/u);
  assert.doesNotMatch(domain, /executeStep\('shadow_observation'/u);
  assert.match(preliminaryRoute, /phase: 'preliminary'/u);
  assert.match(preliminaryRoute, /shadowObservationWritten: false/u);
  assert.match(preliminaryRoute, /resolveLatestCompletedTaiwanSession/u);
  assert.match(runtime, /from\('official_price_history'\)/u);
});
