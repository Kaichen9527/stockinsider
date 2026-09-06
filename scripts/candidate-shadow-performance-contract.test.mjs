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
const v2Migration = readFileSync(new URL('../migrations/20260901_source_research_shadow_v2.sql', import.meta.url), 'utf8');

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

test('candidate research reads the durable official calendar and refreshes the latest official window every cycle', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  const market = readFileSync(new URL('../web/src/lib/tw-market.ts', import.meta.url), 'utf8');
  const marketEvidence = readFileSync(new URL('../web/src/lib/market-evidence.ts', import.meta.url), 'utf8');
  assert.match(calendarMigration, /CREATE OR REPLACE FUNCTION public\.candidate_research_official_sessions/u);
  assert.match(calendarMigration, /authority\.market = 'TWSE'::public\.tw_market_v3/u);
  assert.match(calendarMigration, /authority\.recorded_at <= p_cutoff/u);
  assert.match(calendarMigration, /resolved\.semantic_heads = 1/u);
  assert.match(calendarMigration, /GRANT EXECUTE[\s\S]*TO service_role/u);
  assert.doesNotMatch(calendarMigration, /DROP TABLE|TRUNCATE/u);
  assert.match(research, /supabase\.rpc\('candidate_research_official_sessions'/u);
  assert.match(research, /fetchTwMarketTradingSessions\(marketSessions\.length < 1320 \? 1320 : 90\)/u);
  assert.match(research, /buildMarketEvidenceSnapshot\(latestMarketSession, evaluatedAt, marketSessions\)/u);
  assert.match(market, /OFFICIAL_HOST_CIRCUIT_BREAKER_MS = 5 \* 60 \* 1000/u);
  assert.match(market, /officialHostUnavailableUntil\.set\(circuitKey/u);
  assert.match(marketEvidence, /\.eq\('market', 'TWSE'\)[\s\S]*\.range\(offset, offset \+ 999\)/u);
  assert.match(marketEvidence, /offset < 6_000 && unique\.size < 520/u);
  assert.match(marketEvidence, /loadOfficialMarketHistory\(sessionDate, evaluatedAt\)/u);
  assert.match(marketEvidence, /official_market_evidence_history'[\s\S]{0,500}\.range\(offset, offset \+ pageSize - 1\)/u);
  assert.doesNotMatch(marketEvidence, /official_market_evidence_history'[\s\S]{0,500}\.limit\(1400\)/u);
});

test('official roster normalization happens before a missing price history can fail closed', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  const normalizeAt = research.indexOf("const officialName = stockMaster.get(stock.symbol)?.name");
  const priceGateAt = research.indexOf("if (!bars || bars.length === 0) throw new Error('official_price_history_missing')");
  assert.ok(normalizeAt >= 0);
  assert.ok(priceGateAt >= 0);
  assert.ok(normalizeAt < priceGateAt);
  assert.match(research, /name: official\.name, storedName/u);
  assert.match(research, /officialName && officialName !== stock\.storedName/u);
  assert.match(research, /stock\.storedName = officialName/u);
  assert.match(research, /const official = stockMaster\.get\(symbol\);[\s\S]{0,80}if \(!official\) continue/u);
});

test('candidate technical features and the core scheduler remain bound to official completed sessions', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /cachedBars,[\s\S]{0,180}fetchedBars[\s\S]{0,180}bar\.time <= latestMarketSession/u);
  assert.match(research, /p_limit: 1320/u);
  assert.doesNotMatch(research, /if \(priceCoverageTerminal\) throw/u);
  assert.match(research, /technical_status: priceCoverageTerminal \? 'insufficient_history' : 'success'/u);
  assert.match(research, /staleOrFallback: Boolean\(priceCoverageTerminal\)/u);
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

test('scheduled core pipeline is candidate-first, isolates unavailable official history, and leaves legacy seed ingestion to manual full recovery', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(domain, /const shouldRunIngestion = mode === 'full' && !skipIngestion/u);
  assert.match(domain, /'revenue_ingestion',[\s\S]{0,180}mode !== 'full'/u);
  assert.match(domain, /const candidateResearch = await executeStep\(\s*'candidate_research'/u);
  assert.match(domain, /candidate_research_prerequisite_failed/u);
  assert.match(research, /isCandidateHistoricalPriceAccessEnabled\(\)/u);
  assert.match(research, /official_historical_price_access_unavailable/u);
  assert.match(research, /status: 'failed'/u);
  assert.match(installer, /CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED=true\|false/u);
});

test('candidate research records prerequisite failures on the canonical run before rethrowing', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  const startAt = research.indexOf("status: 'running'");
  const executeAt = research.indexOf('return await executeCandidateResearchCycle(options, { runId, evaluatedAt })');
  const failAt = research.indexOf("status: 'failed'", executeAt);
  assert.ok(startAt >= 0 && executeAt > startAt && failAt > executeAt);
  assert.match(research, /prerequisite_failure: true/u);
  assert.match(research, /candidate_research_run_failure_write_failed/u);
});

test('Threads joins the VPS scheduler only after official policy activation and the 20:00 monitor owns missing-run/publication alerts', () => {
  assert.match(sourcePolicy, /return activeSourceConnectorKeys\(\)/u);
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

test('shadow v2 freezes a source manifest and records publication-bound attempts', () => {
  const research = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
  assert.match(v2Migration, /CREATE TABLE IF NOT EXISTS public\.candidate_shadow_manifests/u);
  assert.match(v2Migration, /CREATE TABLE IF NOT EXISTS public\.candidate_shadow_attempts/u);
  assert.match(v2Migration, /shadow_policy_version TEXT NOT NULL DEFAULT 'shadow-policy-v1'/u);
  assert.match(v2Migration, /ALTER COLUMN shadow_policy_version SET DEFAULT 'shadow-policy-v2'/u);
  assert.match(research, /SHADOW_POLICY_VERSION = 'shadow-policy-v2'/u);
  assert.match(research, /Operational completeness counts a correctly terminal partial\/fail-closed/u);
  assert.match(research, /manifestSymbols\.filter\(\(symbol\) => terminalBySymbol\.has\(symbol\) && stageBySymbol\.has\(symbol\)\)/u);
  assert.match(research, /publicationId/u);
  const publishAt = domain.indexOf("executeStep('radar_publication'");
  const shadowAt = domain.indexOf("executeStep('shadow_observation'");
  assert.ok(publishAt >= 0 && shadowAt > publishAt, 'publication must precede the shadow observation');
});

test('production source writes require the active VPS release and production lease', () => {
  const serverClient = readFileSync(new URL('../web/src/lib/supabase-server.ts', import.meta.url), 'utf8');
  const activation = readFileSync(new URL('../web/src/app/api/internal/writer-release-activate/route.ts', import.meta.url), 'utf8');
  const deployActivation = readFileSync(new URL('../deployment/vps/activate-writer-release.sh', import.meta.url), 'utf8');
  assert.match(v2Migration, /x-stockinsider-writer-release/u);
  assert.match(v2Migration, /production_writer_release_rejected/u);
  assert.match(v2Migration, /production_writer_lease_required/u);
  assert.match(serverClient, /STOCKINSIDER_WRITER_RELEASE_ID/u);
  assert.match(activation, /requireInternalAuth\(request\)/u);
  assert.match(activation, /releaseId !== expectedReleaseId/u);
  assert.match(activation, /register_production_writer_release/u);
  assert.match(activation, /previousReleaseId !== releaseId/u);
  assert.match(activation, /release_production_write_lease/u);
  assert.ok(activation.indexOf('release_production_write_lease') < activation.indexOf('register_production_writer_release'), 'orphaned stopped-release lease must clear before activating the successor');
  assert.match(deployActivation, /for _attempt in \$\(seq 1 30\)/u);
  assert.match(deployActivation, /curl --fail --silent --show-error --max-time 2 http:\/\/127\.0\.0\.1:3100\//u);
  assert.ok(deployActivation.indexOf('curl --fail') < deployActivation.indexOf('/api/internal/writer-release-activate'), 'readiness must precede writer registration');
});
