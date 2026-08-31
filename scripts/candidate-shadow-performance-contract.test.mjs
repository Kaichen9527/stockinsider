import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260831_candidate_shadow_performance.sql', import.meta.url), 'utf8');
const sourceWorkflow = readFileSync(new URL('../.github/workflows/source-refresh.yml', import.meta.url), 'utf8');
const researchWorkflow = readFileSync(new URL('../.github/workflows/night-shift.yml', import.meta.url), 'utf8');
const sourceTimer = readFileSync(new URL('../deployment/vps/systemd/stockinsider-source-refresh.timer', import.meta.url), 'utf8');
const researchTimer = readFileSync(new URL('../deployment/vps/systemd/stockinsider-research-cycle.timer', import.meta.url), 'utf8');
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
});

test('GitHub write workflows are manual-only and VPS timers own the approved cadence', () => {
  assert.doesNotMatch(sourceWorkflow, /^\s*schedule:/mu);
  assert.doesNotMatch(researchWorkflow, /^\s*schedule:/mu);
  assert.match(sourceTimer, /06,12,18,23:30:00 Asia\/Taipei/u);
  assert.match(researchTimer, /19:00:00 Asia\/Taipei/u);
  const sourceService = readFileSync(new URL('../deployment/vps/systemd/stockinsider-source-refresh.service', import.meta.url), 'utf8');
  assert.match(sourceService, /'\{"connector":"all","dryRun":false\}'/u);
  assert.match(installer, /TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED=true/u);
  assert.match(installer, /root-owned with mode 600 or 640/u);
  const workflowDir = new URL('../.github/workflows/', import.meta.url);
  for (const name of readdirSync(workflowDir).filter((item) => /\.ya?ml$/u.test(item))) {
    assert.doesNotMatch(readFileSync(new URL(name, workflowDir), 'utf8'), /^\s*schedule:/mu, `${name} must remain manual-only`);
  }
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
