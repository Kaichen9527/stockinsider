import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260831_candidate_shadow_performance.sql', import.meta.url), 'utf8');
const calendarMigration = readFileSync(new URL('../migrations/20260831_candidate_research_official_calendar.sql', import.meta.url), 'utf8');
const sourceWorkflow = readFileSync(new URL('../.github/workflows/source-refresh.yml', import.meta.url), 'utf8');
const researchWorkflow = readFileSync(new URL('../.github/workflows/night-shift.yml', import.meta.url), 'utf8');
const sourceTimer = readFileSync(new URL('../deployment/vps/systemd/stockinsider-source-refresh.timer', import.meta.url), 'utf8');
const researchTimer = readFileSync(new URL('../deployment/vps/systemd/stockinsider-research-cycle.timer', import.meta.url), 'utf8');
const researchService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-research-cycle.service', import.meta.url), 'utf8');
const installer = readFileSync(new URL('../deployment/vps/install-systemd-schedules.sh', import.meta.url), 'utf8');
const sourcePolicy = readFileSync(new URL('../web/src/lib/source-policy.ts', import.meta.url), 'utf8');
const domain = readFileSync(new URL('../web/src/lib/domain.ts', import.meta.url), 'utf8');
const snapshotPublisher = readFileSync(new URL('../web/src/lib/radar-public-snapshot.ts', import.meta.url), 'utf8');

test('migration is additive and installs research, shadow and last-good publication planes', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.candidate_research_runs/u);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.candidate_shadow_session_observations/u);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.radar_public_snapshots/u);
  assert.match(migration, /UNIQUE \(session_date, ruleset_version, model_version\)/u);
  assert.match(migration, /ON public\.valuation_snapshots \(stock_id, session_date, model_version\)/u);
  assert.doesNotMatch(migration, /GENERATED ALWAYS[\s\S]*session_date::text/u);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE/u);
});

test('valuation writes use the same official-session composite idempotency key as the migration', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /onConflict: 'stock_id,session_date,model_version'/u);
  assert.doesNotMatch(research, /onConflict: 'session_model_key'/u);
  assert.match(research, /new Map\(\s*\(officialValuationHistory\.get\(stock\.symbol\) \|\| \[\]\)\.map\(\(point\) => \[point\.date, point\]\)/u);
});

test('candidate research reads the durable official calendar and fails fast on an unavailable official host', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../web/src/lib/tw-market.ts', import.meta.url), 'utf8');
  assert.match(calendarMigration, /CREATE OR REPLACE FUNCTION public\.candidate_research_official_sessions/u);
  assert.match(calendarMigration, /authority\.market = 'TWSE'::public\.tw_market_v3/u);
  assert.match(calendarMigration, /authority\.recorded_at <= p_cutoff/u);
  assert.match(calendarMigration, /resolved\.semantic_heads = 1/u);
  assert.match(calendarMigration, /GRANT EXECUTE[\s\S]*TO service_role/u);
  assert.doesNotMatch(calendarMigration, /DROP TABLE|TRUNCATE/u);
  assert.match(research, /supabase\.rpc\('candidate_research_official_sessions'/u);
  assert.match(research, /if \(marketSessions\.length < 2\) marketSessions = await fetchTwMarketTradingSessions/u);
  assert.match(market, /OFFICIAL_HOST_CIRCUIT_BREAKER_MS = 5 \* 60 \* 1000/u);
  assert.match(market, /officialHostUnavailableUntil\.set\(host/u);
});

test('official roster normalization happens before a missing price history can fail closed', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  const normalizeAt = research.indexOf("const officialName = stockMaster.get(stock.symbol)?.name");
  const priceGateAt = research.indexOf("if (!bars || bars.length === 0) throw new Error('official_price_history_missing')");
  assert.ok(normalizeAt >= 0);
  assert.ok(priceGateAt >= 0);
  assert.ok(normalizeAt < priceGateAt);
  assert.match(research, /name: official\?\.name \|\| storedName, storedName/u);
  assert.match(research, /officialName && officialName !== stock\.storedName/u);
  assert.match(research, /stock\.storedName = officialName/u);
});

test('candidate technical features and the core scheduler remain bound to official completed sessions', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /const bars = \(fetchedBars \|\| \[\]\)\.filter\(\(bar\) => bar\.time <= latestMarketSession\)/u);
  assert.match(domain, /executeNonCriticalStep\('recommendation',[\s\S]{0,320}mode !== 'full'/u);
});

test('GitHub write workflows are manual-only and VPS timers own the approved cadence', () => {
  assert.doesNotMatch(sourceWorkflow, /^\s*schedule:/mu);
  assert.doesNotMatch(researchWorkflow, /^\s*schedule:/mu);
  assert.match(sourceTimer, /06,12,18,23:30:00 Asia\/Taipei/u);
  assert.match(researchTimer, /19:00:00 Asia\/Taipei/u);
  assert.match(researchService, /"recoverOrphanedLease":true/u);
  const sourceService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-source-refresh.service', import.meta.url), 'utf8');
  assert.match(sourceService, /'\{"connector":"all","dryRun":false\}'/u);
  assert.match(installer, /TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED=true/u);
  assert.match(installer, /root-owned with mode 600 or 640/u);
  const workflowDir = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(workflowDir).filter((item) => /\.ya?ml$/u.test(item))) {
    assert.doesNotMatch(readFileSync(new URL(name, workflowDir), 'utf8'), /^\s*schedule:/mu, `${name} must remain manual-only`);
  }
});

test('orphaned production lease recovery remains authenticated, owner-bound and older than the caller deadline', () => {
  const route = readFileSync(new URL('../web/src/app/api/internal/pipeline-run/route.ts', import.meta.url), 'utf8');
  const lease = readFileSync(new URL('../web/src/lib/production-write-lease.ts', import.meta.url), 'utf8');
  assert.match(route, /requireInternalAuth\(req\)/u);
  assert.match(route, /recoverOrphanedLease === true/u);
  assert.match(route, /Math\.max\(PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS, leaseTtlSeconds\)/u);
  assert.match(lease, /PRODUCTION_WRITE_LEASE_STALE_AFTER_SECONDS = 3_900/u);
  assert.match(lease, /p_owner_id: ownerId/u);
  assert.match(lease, /Date\.now\(\) - acquiredAt < minimumAgeSeconds \* 1000/u);
  assert.doesNotMatch(lease, /\.delete\(\)/u);
});

test('scheduled core pipeline is candidate-first and leaves legacy seed ingestion to manual full recovery', () => {
  assert.match(domain, /const shouldRunIngestion = mode === 'full' && !skipIngestion/u);
  assert.match(domain, /'revenue_ingestion',[\s\S]{0,180}mode !== 'full'/u);
  assert.match(domain, /const candidateResearch = await executeStep\('candidate_research'/u);
});

test('Threads stays outside the VPS scheduler and the 20:00 monitor owns missing-run/publication alerts', () => {
  assert.match(sourcePolicy, /activeSourceConnectorKeys\(\)\.filter\(\(connector\) => connector !== 'threads'\)/u);
  assert.match(domain, /candidate_research_run_missing/u);
  assert.match(domain, /radar_publication_failed/u);
  assert.match(domain, /shadow_session_missing/u);
});

test('public snapshot publication is atomic and failed refreshes retain last-good fail-closed state', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.publish_radar_public_snapshots/u);
  assert.match(snapshotPublisher, /mark_radar_publication_failed/u);
  assert.match(snapshotPublisher, /failClosedStalePayload/u);
  assert.match(snapshotPublisher, /etagForPayload\(payload\)/u);
});

test('shadow observations are canonical per official session and preserve conflicts', () => {
  assert.match(migration, /ON CONFLICT \(session_date, ruleset_version, model_version\) DO NOTHING/u);
  assert.match(migration, /reproducibility_status = 'conflict'/u);
  assert.match(migration, /same_session_replay_conflict/u);
});
