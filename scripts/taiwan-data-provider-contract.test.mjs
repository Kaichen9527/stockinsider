import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260906_taiwan_data_provider_v5.sql', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../web/src/lib/taiwan-data-provider.ts', import.meta.url), 'utf8');
const refreshRoute = readFileSync(new URL('../web/src/app/api/internal/taiwan-data-refresh/route.ts', import.meta.url), 'utf8');
const drainRoute = readFileSync(new URL('../web/src/app/api/internal/taiwan-data-queue-drain/route.ts', import.meta.url), 'utf8');
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
  assert.match(refreshRoute, /requireExactInternalBearer/u);
  assert.match(refreshRoute, /requireActiveVpsWriter/u);
  assert.match(refreshRoute, /enqueue_taiwan_data_refresh_v5/u);
  assert.match(drainRoute, /claim_taiwan_data_refresh_jobs_v5/u);
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
});

test('candidate-universe schedules include typed valuation, revenue and financial datasets', () => {
  for (const dataset of ['daily_valuation', 'monthly_revenue', 'financial_statement']) {
    assert.match(provider, new RegExp(`'${dataset}'`, 'u'));
    assert.match(migration, new RegExp(`'${dataset}'`, 'u'));
  }
  assert.match(refreshRoute, /read_taiwan_data_candidate_universe_v5/u);
  assert.match(refreshRoute, /DAILY_CLOSE_CANDIDATE_CAP = 280/u);
  assert.match(refreshRoute, /taiwan_candidate_universe_exceeds_daily_close_capacity/u);
  assert.match(migration, /read_taiwan_data_candidate_universe_v5/u);
  const closeService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-close-preliminary.service', import.meta.url), 'utf8');
  assert.match(closeService, /daily_valuation/u);
  assert.match(closeService, /monthly_revenue/u);
  assert.doesNotMatch(closeService, /financial_statement/u);
  assert.match(closeService, /"limit":100/u);
  assert.match(drainRoute, /MAX_DRAIN_LIMIT = 100/u);
  assert.match(drainRoute, /DRAIN_CONCURRENCY = 4/u);
  assert.match(closeService, /"limit":100/u);
  assert.match(drainRoute, /job\.symbol === null/u);
  assert.match(migration, /Aggregate valuation\/revenue responses are fetched once per exchange/u);
  assert.match(migration, /official_price_history[\s\S]*T13:30:00\+08:00/u);
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
  assert.doesNotMatch(installer, /FINMIND_API_TOKEN/u);
  assert.match(installer, /stockinsider-taiwan-data-master-calendar\.timer/u);
  assert.match(installer, /call_internal_api_sequence\.mjs/u);
  const preliminaryService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-taiwan-data-preliminary.service', import.meta.url), 'utf8');
  assert.match(preliminaryService, /\/api\/internal\/radar-preliminary-publish/u);
  assert.match(preliminaryService, /"limit":100/u);
  assert.match(preliminaryRoute, /phase: 'preliminary'/u);
  assert.match(preliminaryRoute, /shadowObservationWritten: false/u);
  assert.match(preliminaryRoute, /resolveLatestCompletedTaiwanSession/u);
  assert.match(runtime, /from\('official_price_history'\)/u);
});
