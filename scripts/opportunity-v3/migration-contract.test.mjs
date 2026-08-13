import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256Canonical } from '../../web/src/lib/opportunity-v3/canonical.ts';
import { executeWorkerPayload } from '../../web/src/lib/opportunity-v3/worker-executors.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const runtime = (name) => require(path.join(root, 'scripts/runtime', name));
const migrationPath = path.join(root, 'migrations/20260724_source_led_opportunity_engine_v3.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const productValueMigrationPath = path.join(root, 'migrations/20260809_product_value_recovery_v3_12.sql');
const productValueSql = fs.readFileSync(productValueMigrationPath, 'utf8');
const decisionIntegrityMigrationPath = path.join(root, 'migrations/20260809_decision_integrity_v3_13.sql');
const decisionIntegritySql = fs.readFileSync(decisionIntegrityMigrationPath, 'utf8');
const actionabilityRecoveryMigrationPath = path.join(root, 'migrations/20260811_actionability_recovery_v3_14.sql');
const actionabilityRecoverySql = fs.readFileSync(actionabilityRecoveryMigrationPath, 'utf8');
const opportunityRecoveryMigrationPath = path.join(root, 'migrations/20260813_opportunity_recovery_v3_15.sql');
const opportunityRecoverySql = fs.readFileSync(opportunityRecoveryMigrationPath, 'utf8');
const legacyRuntimeConfigHex = fs.readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')).toString('hex');
const staticIdentityMembers = JSON.parse(
  sql.match(/v_static_identity_members jsonb := \$identity\$(\[[\s\S]*?\])\$identity\$::jsonb;/u)?.[1]
    ?? 'null',
);
const staticIdentityMemberDeclarations = [...sql.matchAll(
  /v_static_identity_members jsonb := \$identity\$(\[[\s\S]*?\])\$identity\$::jsonb;/gu,
)].map((match) => JSON.parse(match[1]));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const v313CorporateActionSourceRef = sha256Canonical([
  'corporate-action-source-row-v3.1','TWSE','2026-07-24','2330','ex_right_dividend',100,95,
  'twse:twt49u:v1',
]);
const lifecycleSourceFields = ['2330 營收維持成長', '', ''];
const lifecycleSourceContentHash = sha256Canonical([
  ['title', lifecycleSourceFields[0]],
  ['summary', lifecycleSourceFields[1]],
  ['body', lifecycleSourceFields[2]],
]);
const lifecycleSourceParseOutput = executeWorkerPayload('source_parse_batch', [
  '123e4567-e89b-42d3-a456-426614173003', 0, 'threads',
  '123e4567-e89b-42d3-a456-426614173001', 'lifecycle-post',
  'https://example.com/lifecycle-post', '2026-07-22T06:00:00Z',
  '2026-07-22T06:01:00Z', lifecycleSourceFields,
  [...lifecycleSourceFields.join('')].length, 'source-adapter-v3.3',
  'complete', lifecycleSourceContentHash, 'community', 'threads:lifecycle',
  [[
    '123e4567-e89b-42d3-a456-426614173330', '2330', 'TWSE',
    'common_stock', 'active', '台灣積體電路製造股份有限公司', [],
    'semiconductor',
  ]],
  [],
]);
const lifecycleNewerSourceFields = ['2330 營收維持成長', '', ''];
const lifecycleNewerSourceContentHash = sha256Canonical([
  ['title', lifecycleNewerSourceFields[0]],
  ['summary', lifecycleNewerSourceFields[1]],
  ['body', lifecycleNewerSourceFields[2]],
]);
const lifecycleNewerSourceParseOutput = executeWorkerPayload('source_parse_batch', [
  '123e4567-e89b-42d3-a456-426614173004', 1, 'threads',
  '123e4567-e89b-42d3-a456-426614173001', 'lifecycle-post-newer',
  'https://example.com/lifecycle-post-newer', '2026-07-22T07:00:00Z',
  '2026-07-22T07:01:00Z', lifecycleNewerSourceFields,
  [...lifecycleNewerSourceFields.join('')].length, 'source-adapter-v3.3',
  'complete', lifecycleNewerSourceContentHash, 'community', 'threads:lifecycle',
  [[
    '123e4567-e89b-42d3-a456-426614173330', '2330', 'TWSE',
    'common_stock', 'active', '台灣積體電路製造股份有限公司', [],
    'semiconductor',
  ]],
  [],
]);
const appendBoundarySourceFields = ['2330 測試, 保留逗號空格', '', ''];
const appendBoundaryRawHash = sha256Canonical({
  version: 'raw-field-payload-v3.0',
  adapterVersion: 'source-adapter-v3.3',
  fields: appendBoundarySourceFields,
});
const appendBoundaryCanonicalHash = sha256Canonical([
  ['title', appendBoundarySourceFields[0]],
  ['summary', appendBoundarySourceFields[1]],
  ['body', appendBoundarySourceFields[2]],
]);

test('every legacy mutating RPC and terminal failure requires live run/job lease authority', () => {
  const names = ['append_legacy_candidate_discovery_v3_11','append_legacy_analysis_revision_v3_11',
    'append_legacy_analysis_evaluation_v3_11','append_legacy_radar_projection_v3_11'];
  for (const [index, name] of names.entries()) {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
    const end = index + 1 < names.length ? sql.indexOf(`CREATE OR REPLACE FUNCTION ${names[index + 1]}`, start) : sql.indexOf('DO $legacy_correctness_security$', start);
    const body = sql.slice(start, end);
    assert.match(body, /legacy_producer_runs_v3_11[\s\S]*owner_token_hash=v_token_hash AND lease_expires_at>=v_now FOR SHARE/u,
      `${name} locked live run lease`);
    assert.match(body, /legacy_producer_jobs_v3_11[\s\S]*owner_token_hash=v_token_hash AND lease_expires_at>=v_now FOR SHARE/u,
      `${name} locked live job lease`);
  }
  const heartbeat = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION heartbeat_legacy_producer_job_v3_11'),
    sql.indexOf('CREATE OR REPLACE FUNCTION complete_legacy_producer_job_v3_11'));
  assert.ok(heartbeat.indexOf('UPDATE public.legacy_producer_runs_v3_11') <
    heartbeat.indexOf('UPDATE public.legacy_producer_jobs_v3_11'), 'heartbeat renews run authority before job');
  const manifestFailure = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION fail_opportunity_manifest_v3'),
    sql.indexOf('CREATE OR REPLACE FUNCTION complete_opportunity_job_v3'));
  assert.match(manifestFailure, /lease_expires_at >= v_now/u);
});

function executable(name) {
  const candidates = [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    ...fs.existsSync('/usr/lib/postgresql')
      ? fs.readdirSync('/usr/lib/postgresql')
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .map((version) => `/usr/lib/postgresql/${version}/bin/${name}`)
      : [],
  ];
  const resolved = spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'postgres-tool', name], {
    encoding: 'utf8',
  }).stdout.trim();
  if (resolved) candidates.push(resolved);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

const pg = {
  initdb: executable('initdb'),
  pgCtl: executable('pg_ctl'),
  psql: executable('psql'),
};
let cluster;

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    ...options,
  });
  if (result.status !== 0) {
    throw new Error([
      `${path.basename(binary)} failed with ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

function psql(input, extraArgs = []) {
  return command(pg.psql, [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port),
    '-U', cluster.user, '-d', 'postgres', ...extraArgs,
  ], { input });
}

function rejectedSql(input) {
  const result = spawnSync(pg.psql, [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port),
    '-U', cluster.user, '-d', 'postgres',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    input: `\\set VERBOSITY verbose\n${input}`,
  });
  assert.notEqual(result.status, 0, `SQL unexpectedly succeeded:\n${input}`);
  return result.stderr;
}

function psqlAsync(input) {
  return new Promise((resolve) => {
    const child = spawn(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port),
      '-U', cluster.user, '-d', 'postgres',
    ], {
      cwd: root,
      env: { ...process.env, LC_ALL: 'C' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('close', (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
    child.stdin.end(input);
  });
}

before(() => {
  for (const [name, filename] of Object.entries(pg)) {
    if (!filename) throw new Error(`PostgreSQL executable unavailable: ${name}`);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'opportunity-v3-pg-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  const log = path.join(directory, 'postgres.log');
  fs.mkdirSync(socket);
  const port = 54000 + (process.pid % 8000);
  const user = os.userInfo().username;
  command(pg.initdb, ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
  command(pg.pgCtl, [
    '-D', data, '-l', log, '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start',
  ]);
  cluster = { directory, data, socket, port, user };
  psql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE stockinsider_managed_migrator LOGIN NOSUPERUSER CREATEROLE BYPASSRLS;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE public.source_entities(id uuid PRIMARY KEY,source_key text,display_name text);
    CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text);
    CREATE TABLE public.stock_signals(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      stock_id uuid NOT NULL REFERENCES public.stocks(id),
      as_of timestamptz NOT NULL,
      source text NOT NULL,
      price numeric NOT NULL,
      volume bigint,
      ma_short numeric,
      ma_mid numeric,
      ma_long numeric,
      rsi numeric,
      macd numeric,
      macd_signal numeric,
      chip_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
      technical_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
      freshness_status text NOT NULL,
      source_timestamp timestamptz NOT NULL,
      ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.revenue_signals(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      stock_id uuid NOT NULL REFERENCES public.stocks(id),
      as_of_date date NOT NULL,
      monthly_revenue numeric NOT NULL,
      yoy_growth numeric,
      mom_growth numeric,
      source_url text,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.market_snapshots(
      id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
      market text NOT NULL,
      as_of timestamptz NOT NULL,
      source text NOT NULL,
      source_key text,
      sector_flows jsonb NOT NULL DEFAULT '{}'::jsonb,
      index_state jsonb NOT NULL DEFAULT '{}'::jsonb,
      freshness_status text NOT NULL,
      source_timestamp timestamptz NOT NULL,
      ingested_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    ALTER DATABASE postgres OWNER TO stockinsider_managed_migrator;
    ALTER SCHEMA public OWNER TO stockinsider_managed_migrator;
    GRANT USAGE ON SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON TABLE public.source_entities,public.stocks,public.stock_signals,
      public.revenue_signals,public.market_snapshots
      TO stockinsider_managed_migrator WITH GRANT OPTION;
  `);
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', migrationPath,
    ]);
  }
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', productValueMigrationPath,
    ]);
  }
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', decisionIntegrityMigrationPath,
    ]);
  }
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', actionabilityRecoveryMigrationPath,
    ]);
  }
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', opportunityRecoveryMigrationPath,
    ]);
  }
});

after(() => {
  if (!cluster) return;
  spawnSync(pg.pgCtl, ['-D', cluster.data, '-m', 'fast', '-w', 'stop'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  fs.rmSync(cluster.directory, { recursive: true, force: true });
});

const functions = [
  'consume_internal_nonce_v3', 'purge_internal_nonces_v3', 'append_source_document_revision_v3',
  'append_instrument_roster_authority_v3', 'append_stock_sector_assignment_v3', 'append_trading_session_v3',
  'append_price_authority_v3', 'append_market_observation_v3',
  'append_stock_flow_observation_v3', 'append_financial_fact_v3',
  'append_source_identity_authority_v3', 'append_publisher_verification_authority_v3',
  'append_manual_stock_alias_authority_v3', 'append_peer_reviewer_authority_v3',
  'append_peer_relationship_authority_v3', 'append_valuation_verification_v3',
  'append_assistive_artifact_registration_v3', 'get_link_audit_assignment_v3',
  'submit_link_audit_label_v3', 'begin_opportunity_run_v3', 'seal_opportunity_run_inputs_v3',
  'claim_opportunity_job_v3', 'heartbeat_opportunity_job_v3', 'stage_opportunity_job_output_v3',
  'create_opportunity_manifest_v3', 'append_opportunity_manifest_page_v3',
  'complete_opportunity_manifest_v3', 'fail_opportunity_manifest_v3', 'complete_opportunity_job_v3',
  'fail_opportunity_job_v3', 'reap_opportunity_jobs_v3', 'finalize_opportunity_run_v3',
  'select_opportunity_public_projection_v3',
];

const tables = [
  'internal_principal_role_bindings_v3', 'internal_principal_nonces_v3', 'opportunity_rpc_audit_v3',
  'source_identity_authorities_v3', 'publisher_verification_authorities_v3',
  'source_revision_family_registry_v3', 'opportunity_authority_stream_registry_v3',
  'source_document_revisions_v3', 'stock_instruments_v3', 'stock_aliases_v3',
  'stock_sector_assignments_v3', 'stock_peer_relationship_reviewers_v3',
  'stock_peer_relationships_v3', 'valuation_verifications_v3', 'tw_trading_sessions_v3',
  'opportunity_price_observations_v3', 'opportunity_exchange_reported_pe_v3', 'opportunity_stock_flow_observations_v3',
  'opportunity_corporate_action_snapshots_v3',
  'opportunity_corporate_action_feed_evidence_v3', 'opportunity_corporate_action_events_v3',
  'opportunity_market_observations_v3', 'opportunity_financial_facts_v3',
  'opportunity_manifests_v3', 'opportunity_manifest_pages_v3', 'opportunity_manifest_rows_v3',
  'source_publication_verifications_v3', 'opportunity_mover_audits_v3',
  'opportunity_mover_audit_symbols_v3', 'opportunity_runs', 'opportunity_run_inputs',
  'opportunity_run_manifest_inputs', 'opportunity_run_jobs_v3', 'opportunity_job_payloads_v3',
  'opportunity_job_results_v3', 'opportunity_job_staging_v3', 'opportunity_run_warning_facts_v3',
  'opportunity_source_connector_accounting', 'opportunity_source_document_outcomes',
  'opportunity_source_claims', 'opportunity_source_mentions', 'opportunity_candidate_snapshots',
  'opportunity_market_context_snapshots', 'opportunity_sector_cycle_snapshots',
  'opportunity_score_snapshots', 'opportunity_shallow_candidate_results_v3',
  'opportunity_deep_candidate_results_v3', 'opportunity_portfolio_allocations_v3',
  'opportunity_evaluation_results_v3', 'opportunity_outcomes', 'opportunity_link_audit_samples',
  'opportunity_link_audit_labels', 'opportunity_public_projections_v3',
  'opportunity_detail_projections_v3', 'opportunity_assistive_artifact_registrations_v3',
];

const composites = [
  'source_identity_authority_input_v3', 'publisher_authority_input_v3',
  'manual_alias_authority_input_v3', 'peer_reviewer_authority_input_v3',
  'peer_relationship_authority_input_v3', 'valuation_verification_input_v3',
  'assistive_artifact_registration_input_v3', 'instrument_authority_input_v3',
  'sector_assignment_input_v3', 'source_document_revision_input_v3', 'trading_session_input_v3',
  'price_observation_input_v3', 'corporate_action_feed_evidence_input_v3',
  'corporate_action_event_input_v3', 'corporate_action_snapshot_input_v3',
  'exchange_reported_pe_input_v3', 'price_authority_input_v3', 'market_observation_input_v3',
  'stock_flow_observation_input_v3', 'financial_fact_input_v3',
  'opportunity_manifest_row_input_v3', 'opportunity_job_counts_v3',
];

test('migration declares the complete closed V3 catalog', () => {
  const missingFunctions = functions.filter((name) => !new RegExp(`CREATE OR REPLACE FUNCTION\\s+${name}\\s*\\(`, 'u').test(sql));
  const missingTables = tables.filter((name) => !new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${name}\\s*\\(`, 'u').test(sql));
  const missingComposites = composites.filter((name) => !new RegExp(`CREATE TYPE\\s+${name}\\s+AS\\s*\\(`, 'u').test(sql));
  assert.deepEqual({ missingFunctions, missingTables, missingComposites }, {
    missingFunctions: [],
    missingTables: [],
    missingComposites: [],
  });
  assert.doesNotMatch(sql, /(?<!\.)\bgen_random_bytes\s*\(/u, 'security-definer paths must schema-qualify pgcrypto');
  assert.doesNotMatch(sql, /\boutput_counts\s+jsonb\b/u, 'job counts must use the named composite');
});

test('migration includes the exact three view security modes', () => {
  assert.match(sql, /opportunity_effective_taiwan_sessions_v3\s+WITH \(security_invoker = true, security_barrier = true\)/u);
  assert.match(sql, /opportunity_run_status_read_v3\s+WITH \(security_invoker = true, security_barrier = true\)/u);
  assert.match(sql, /opportunity_worker_read_units_v3\s+WITH \(security_invoker = false, security_barrier = true\)/u);
  const readUnitsStart = sql.indexOf('CREATE OR REPLACE VIEW opportunity_worker_read_units_v3');
  const readUnitsEnd = sql.indexOf('\nCREATE OR REPLACE FUNCTION ', readUnitsStart);
  const readUnits = sql.slice(readUnitsStart, readUnitsEnd);
  const globalOwner = /FROM \(\s*SELECT candidate[.]run_id\s*FROM public[.]opportunity_runs candidate\s*WHERE candidate[.]mode='enrich_rank'[\s\S]*?ORDER BY candidate[.]source_cutoff DESC,candidate[.]terminal_at DESC,candidate[.]run_id\s*LIMIT 1\s*\) prior_owner\s*LEFT JOIN public[.]opportunity_detail_projections_v3/u;
  assert.equal((readUnits.match(new RegExp(globalOwner.source, 'gu')) ?? []).length, 2,
    'detail and change reads must choose the prior run before joining the symbol');
  assert.doesNotMatch(readUnits,
    /FROM public[.]opportunity_runs prior_owner\s+JOIN public[.]opportunity_detail_projections_v3/u,
    'a symbol match cannot skip the immediately preceding run and fall back to older history');
  assert.match(readUnits,
    /p[.]payload_kind NOT IN \('deep_candidate_batch','portfolio_allocation_batch','projection_bundle'\)[\s\S]*?count\(\*\) OVER \(\s*PARTITION BY prior[.]source_cutoff,prior[.]terminal_at\s*\) AS tie_count[\s\S]*?WHERE immediately_preceding[.]tie_count>1/u,
    'a tied greatest cutoff and terminal timestamp must make every comparable read unavailable');
});

test('candidate financial selection bounds analyst and broker families independently', () => {
  const body = sql.match(
    /CREATE OR REPLACE FUNCTION opportunity_manifest_native_rows_v3_internal\([\s\S]*?\n\$fn\$;/u,
  )?.[0] ?? '';
  assert.match(body, /fact_key IN \(\s*'quarterly_diluted_eps','quarterly_ebitda','quarterly_revenue',\s*'book_value_per_share'\s*\)\s*AND candidate[.]estimate_kind='analyst_estimate'[\s\S]*?LIMIT 101/u);
  assert.match(body, /fact_key='broker_target_price'\s*AND candidate[.]estimate_kind='broker_consensus'[\s\S]*?LIMIT 101/u);
  assert.match(body, /fact_key IN \(\s*'quarterly_diluted_eps','quarterly_ebitda','quarterly_revenue',\s*'book_value_per_share'\s*\)\s*AND observation[.]estimate_kind='analyst_estimate'[\s\S]*?LIMIT 101/u);
  assert.match(body, /fact_key='broker_target_price'\s*AND observation[.]estimate_kind='broker_consensus'[\s\S]*?LIMIT 101/u);
});

test('allocation and projection persist only hash-valid authoritative decision geometry', () => {
  const readUnitsStart = sql.indexOf('CREATE OR REPLACE VIEW opportunity_worker_read_units_v3');
  const readUnitsEnd = sql.indexOf('\nCREATE OR REPLACE FUNCTION ', readUnitsStart);
  const readUnits = sql.slice(readUnitsStart, readUnitsEnd);
  assert.match(readUnits,
    /WHEN 'portfolio_allocation_batch' THEN[\s\S]*?JOIN public[.]opportunity_market_context_snapshots market[\s\S]*?market[.]payload_hash=encode\(extensions[.]digest\(market[.]payload_canonical,'sha256'\),'hex'\)[\s\S]*?score[.]value->>0=deep[.]payload_json->8->>'primaryHorizon'/u,
  );
  assert.doesNotMatch(readUnits,
    /coalesce\(\(market[.]payload_json->>'newPositionBudgetPct'\)::double precision,15\)/u,
  );
  assert.match(readUnits,
    /WHEN 'projection_bundle' THEN[\s\S]*?allocation[.]payload_json->>'primaryHorizon'[\s\S]*?score[.]value->>0=allocation[.]payload_json->>'primaryHorizon'/u,
  );

  const stage = sql.match(
    /CREATE OR REPLACE FUNCTION stage_opportunity_job_output_v3\([\s\S]*?\n\$fn\$;/u,
  )?.[0] ?? '';
  assert.match(stage,
    /candidate[.]value->8->'initialPositionPct'<>candidate[.]value->9[\s\S]*?candidate[.]value->8->'maximumPositionPct'<>candidate[.]value->10/u,
  );
  assert.match(stage,
    /ARRAY\['blockReasons','confidence','decisionAuthority','entryTrigger','existingPositionAction',[\s\S]*?'publicationEligible'\]::text\[\]/u,
  );
  assert.match(stage,
    /v_reason_index:=array_position\(ARRAY\[[\s\S]*?'data_integrity'[\s\S]*?'method_divergence'\]::text\[\],v_reason\)/u,
  );
  assert.match(stage, /v_action IN \('starter_now','event_starter'\)[\s\S]*?price_stop_or_evidence_expiry/u);
  assert.match(stage, /v_action='wait_trigger'[\s\S]*?\["entry_unconfirmed"\][\s\S]*?evidence_expiry_only/u);

  const complete = sql.match(
    /CREATE OR REPLACE FUNCTION complete_opportunity_job_v3\([\s\S]*?\n\$fn\$;/u,
  )?.[0] ?? '';
  const deepBranch = complete.slice(
    complete.indexOf("ELSIF v_stage.output_kind='deep_candidate_batch'"),
    complete.indexOf("ELSIF v_stage.output_kind='portfolio_allocation_batch'"),
  );
  const projectionBranch = complete.slice(
    complete.indexOf("ELSIF v_stage.output_kind='projection_bundle'"),
    complete.indexOf("ELSIF v_stage.output_kind='outcome_batch'"),
  );
  assert.match(complete,
    /v_stage[.]output_kind IN \('deep_candidate_batch','portfolio_allocation_batch'\)[\s\S]*?v_reason_index:=array_position\(ARRAY\[[\s\S]*?'method_divergence'/u,
  );
  for (const authority of [stage, complete]) {
    assert.match(authority,
      /primaryHorizon'='null'::jsonb[\s\S]*?v_action='avoid'[\s\S]*?\["data_integrity"\][\s\S]*?v_action='event_starter'[\s\S]*?momentum_5_20d/u,
    );
    assert.match(authority,
      /v_action='avoid'[\s\S]*?jsonb_array_length\(v_decision->'blockReasons'\)<>1[\s\S]*?quality_insufficient/u,
    );
    assert.match(authority,
      /v_action='valuation_review'[\s\S]*?blockReasons' \? 'valuation_unavailable'[\s\S]*?jsonb_array_length\(v_decision->'blockReasons'\)<>1/u,
    );
  }
  assert.doesNotMatch(deepBranch, /INSERT INTO public[.]opportunity_score_snapshots/u);
  assert.match(deepBranch, /score_snapshot_count<>0/u);
  assert.match(projectionBranch,
    /row_number\(\) OVER\([\s\S]*?PARTITION BY horizon ORDER BY score_value DESC,confidence_value DESC,symbol ASC/u,
  );
  assert.match(projectionBranch, /INSERT INTO public[.]opportunity_score_snapshots/u);
  assert.match(projectionBranch, /score_snapshot_count[\s\S]*?3\*jsonb_array_length/u);
});

test('migration applies twice and exposes the exact granted/private function boundary', () => {
  assert.match(opportunityRecoverySql,/claim_legacy_producer_job_rest_v3_15/u);
  assert.match(opportunityRecoverySql,/append_legacy_runtime_health_rest_v3_15/u);
  assert.match(opportunityRecoverySql,/LIMIT 3000/u);
  assert.match(actionabilityRecoverySql,/legacy-product-value-bridge-v3[.]14/u);
  const v314Completion=actionabilityRecoverySql.match(
    /CREATE OR REPLACE FUNCTION public[.]complete_legacy_producer_job_v3_14[\s\S]*?END \$complete\$;/u,
  )?.[0]??'';
  assert.equal((v314Completion.match(/RETURN NEXT/gu)??[]).length,1,
    'V3.14 completion returns exactly one RPC row');
  assert.match(decisionIntegritySql,/'reportedPeRows',v_reported_pe/u);
  assert.match(decisionIntegritySql,/'projectionFreshnessSchedule',v_freshness_schedule/u);
  assert.match(decisionIntegritySql,/legacy_source_document_persistence_v3_13/u);
  assert.match(decisionIntegritySql,/analysis_disposition[\s\S]*?eligible_for_claim_extraction[\s\S]*?no_claim/u);
  assert.doesNotMatch(decisionIntegritySql,/'pending'/u,
    'V3.13 acquisition accounting must not persist a permanently pending claim or entity outcome');
  assert.match(productValueSql,/row_number\(\) OVER \(PARTITION BY instrument[.]stock_id ORDER BY[\s\S]*?instrument[.]source_timestamp DESC,instrument[.]recorded_at DESC/u);
  assert.match(productValueSql,/'sectorValuationUniverse',v_sector_universe/u);
  assert.match(sql, /GRANT opportunity_v3_rpc_owner TO CURRENT_USER;/u);
  assert.match(sql, /GRANT legacy_correctness_rpc_owner TO CURRENT_USER;/u);
  assert.match(sql, /GRANT USAGE, CREATE ON SCHEMA public TO opportunity_v3_rpc_owner;/u);
  assert.match(sql, /GRANT CREATE ON SCHEMA public TO legacy_correctness_rpc_owner;/u);
  assert.match(sql, /REVOKE CREATE ON SCHEMA public FROM legacy_correctness_rpc_owner,opportunity_v3_rpc_owner;/u);
  assert.doesNotMatch(sql, /REVOKE (?:legacy_correctness_rpc_owner|opportunity_v3_rpc_owner) FROM CURRENT_USER/u);
  const retainedOwnerMemberships = JSON.parse(psql(`
    SELECT json_agg(json_build_object(
      'role', requested.role_name,
      'member', pg_has_role('stockinsider_managed_migrator', requested.role_name, 'MEMBER')
    ) ORDER BY requested.role_name)
    FROM (VALUES ('legacy_correctness_rpc_owner'),('opportunity_v3_rpc_owner')) requested(role_name);
  `, ['-t', '-A']));
  assert.deepEqual(retainedOwnerMemberships, [
    { role: 'legacy_correctness_rpc_owner', member: true },
    { role: 'opportunity_v3_rpc_owner', member: true },
  ]);
  const bridgeShape=JSON.parse(psql(`
    SET ROLE legacy_correctness_rpc_owner;
    SELECT jsonb_build_object(
      'bridgeSchema',result->>'bridgeSchema',
      'candidateAuthorityType',jsonb_typeof(result->'candidateAuthorityRows'),
      'sectorUniverseType',jsonb_typeof(result->'sectorValuationUniverse'),
      'dislocationType',jsonb_typeof(result->'dislocationCandidates')
    )::text
    FROM public.read_legacy_candidate_fact_plane_v3_11(
      '2026-08-01T00:00:00Z'::timestamptz,'{"candidates":[]}'::jsonb
    ) result;
    RESET ROLE;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(bridgeShape,{ bridgeSchema:'legacy-product-value-bridge-v3.14',candidateAuthorityType:'array',
    sectorUniverseType:'array',dislocationType:'array' });
  const appliedV314ReadPlane=psql(`
    SELECT pg_get_functiondef('public.read_legacy_candidate_fact_plane_v3_11(timestamptz,jsonb)'::regprocedure);
  `,['-At']);
  assert.match(appliedV314ReadPlane,
    /candidate_instrument AS MATERIALIZED[\s\S]*resolve_legacy_instrument_authority_v3_13_internal/u);
  assert.match(appliedV314ReadPlane,
    /candidate_sector AS MATERIALIZED[\s\S]*resolve_legacy_sector_authority_v3_13_internal/u);
  const sourceItemColumns=JSON.parse(psql(`
    SELECT jsonb_agg(column_name ORDER BY ordinal_position)::text
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='legacy_source_item_outcomes_v3_13';
  `,['-At']).trim());
  assert.deepEqual(sourceItemColumns,['source_run_id','profile_id','source_key','stable_item_id','source_url',
    'published_at','acquisition_disposition','analysis_disposition','recorded_at']);
  const applied = psql(`
    WITH expected(name) AS (
      SELECT unnest(ARRAY[${functions.map((name) => `'${name}'`).join(',')}])
    ), granted AS (
      SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN (SELECT name FROM expected)
        AND has_function_privilege('service_role',p.oid,'EXECUTE')
    ), private_helpers AS (
      SELECT p.proname,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
        has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
        has_function_privilege('legacy_correctness_rpc_owner',p.oid,'EXECUTE') AS legacy_execute,
        EXISTS (
          SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))
          WHERE grantee=0 AND privilege_type='EXECUTE'
        ) AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'enqueue_next_opportunity_job_v3_internal',
        'derive_manifest_page_descriptor_v3_internal',
        'internal_principal_role_is_exact_v3_internal',
        'resolve_legacy_scheduled_occurrence_v3_11',
        'read_legacy_discovery_authority_v3_11',
        'read_legacy_frozen_revision_v3_11',
        'read_legacy_candidate_fact_plane_v3_11'
      )
    )
    SELECT jsonb_build_object(
      'missing',coalesce((SELECT jsonb_agg(name ORDER BY name) FROM expected
        WHERE name NOT IN (SELECT proname FROM granted)),'[]'::jsonb),
      'grantedCount',(SELECT count(*) FROM granted),
      'helpers',(SELECT jsonb_agg(to_jsonb(private_helpers) ORDER BY proname) FROM private_helpers)
    )::text;
  `, ['-At']).trim();
  assert.deepEqual(JSON.parse(applied), {
    missing: [],
    grantedCount: 33,
    helpers: [
      {
        proname: 'derive_manifest_page_descriptor_v3_internal',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: false,
        public_execute: false,
      },
      {
        proname: 'enqueue_next_opportunity_job_v3_internal',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: false,
        public_execute: false,
      },
      {
        proname: 'internal_principal_role_is_exact_v3_internal',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: false,
        public_execute: false,
      },
      {
        proname: 'read_legacy_candidate_fact_plane_v3_11',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: true,
        public_execute: false,
      },
      {
        proname: 'read_legacy_discovery_authority_v3_11',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: true,
        public_execute: false,
      },
      {
        proname: 'read_legacy_frozen_revision_v3_11',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: true,
        public_execute: false,
      },
      {
        proname: 'resolve_legacy_scheduled_occurrence_v3_11',
        service_execute: false,
        anon_execute: false,
        authenticated_execute: false,
        legacy_execute: true,
        public_execute: false,
      },
    ],
  });
});

test('V3.14 official chunks persist under the exact lease, replay idempotently, and complete before DB reread', () => {
  const runId='71400000-0000-4000-8000-000000000001';
  const jobId='71400000-0000-4000-8000-000000000002';
  const ownerToken='71400000-0000-4000-8000-000000000003';
  const producerSha='a'.repeat(40);
  const sourceCutoff='2026-08-11T00:00:00Z';
  const session={market:'TWSE',session:'2026-08-07',status:'completed',
    openAt:'2026-08-07T01:00:00.000Z',scheduledCloseAt:'2026-08-07T05:30:00.000Z',provider:'twse',
    sourceTimestamp:'2026-08-07T05:30:00.000Z',collectedAt:'2026-08-07T06:00:00.000Z',
    sourceRef:'twse-annual-calendar:2026:2026-08-07'};
  const sessionItems=[session];
  const chunkHash=sha256Canonical(['official-ingestion-chunk-v3.14','trading_sessions',0,sessionItems]);
  const counts={trading_sessions:1,financial_facts:0,price_observations:0,
    corporate_action_snapshots:0,reported_valuations:0};
  const chunks=[{kind:'trading_sessions',ordinal:0,itemCount:1,chunkHash}];
  const terminalRoot=sha256Canonical(['official-ingestion-terminal-v3.14',sourceCutoff,counts,chunks]);
  const terminalItems=[{sourceCutoff,counts,chunks,terminalRoot}];
  const officialIngestion={schema:'legacy-official-ingestion-v3.14',sourceCutoff,counts,chunks,terminalRoot};
  const completionPayload={schema:'legacy-facts-refresh-result-v3.11',decisions:[],shallowObservations:[],
    sourceCandidates:[],dislocationCandidates:[],officialIngestion};
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,'active',repeat('7',64),clock_timestamp())
    ON CONFLICT DO NOTHING;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('${runId}','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('${ownerToken}','utf8'),'sha256'),'hex'),'${producerSha}',repeat('9',64),
      decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols')
        WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','v314-official-chunk-owner',
      '${sourceCutoff}','2026-08-11',NULL,convert_to('{}','utf8'),'{}'::jsonb,
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('a',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at)
    VALUES('${jobId}','${runId}','facts_refresh','stage_barrier',3,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),
      'leased',1,5,encode(extensions.digest(convert_to('${ownerToken}','utf8'),'sha256'),'hex'),clock_timestamp(),
      clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL,clock_timestamp());
    SET ROLE service_role;
    SELECT public.append_legacy_official_ingestion_chunk_v3_14('${runId}','${jobId}','${ownerToken}',
      'trading_sessions',0,${sqlLiteral(JSON.stringify(sessionItems))}::jsonb,'${chunkHash}','${producerSha}','${sourceCutoff}');
    SELECT public.append_legacy_official_ingestion_chunk_v3_14('${runId}','${jobId}','${ownerToken}',
      'trading_sessions',0,${sqlLiteral(JSON.stringify(sessionItems))}::jsonb,'${chunkHash}','${producerSha}','${sourceCutoff}');
    SELECT public.append_legacy_official_ingestion_chunk_v3_14('${runId}','${jobId}','${ownerToken}',
      'terminal',0,${sqlLiteral(JSON.stringify(terminalItems))}::jsonb,'${terminalRoot}','${producerSha}','${sourceCutoff}');
    RESET ROLE;
    CREATE TEMP TABLE v314_pre_completion AS SELECT count(*)::integer session_rows
      FROM public.tw_trading_sessions_v3 WHERE session_id='2026-08-07' AND market='TWSE';
    WITH output(value) AS(VALUES(${sqlLiteral(JSON.stringify(completionPayload))}::jsonb))
      SELECT completion.status FROM output CROSS JOIN LATERAL public.complete_legacy_producer_job_v3_14(
        '${runId}','${jobId}','${ownerToken}',convert_to(output.value::text,'utf8'),output.value,
        encode(extensions.digest(convert_to(output.value::text,'utf8'),'sha256'),'hex')) completion;
    SELECT jsonb_build_object(
      'chunkRows',(SELECT count(*) FROM public.legacy_official_ingestion_chunks_v3_14 WHERE job_id='${jobId}'),
      'preCompletionRows',(SELECT session_rows FROM v314_pre_completion),
      'sessionRows',(SELECT count(*) FROM public.tw_trading_sessions_v3 WHERE session_id='2026-08-07' AND market='TWSE'),
      'nextCutoffRows',(SELECT count(*) FROM public.resolve_legacy_trading_session_authority_v3_13(
        '2026-08-07','TWSE',(SELECT max(recorded_at)+interval '1 microsecond'
          FROM public.tw_trading_sessions_v3 WHERE session_id='2026-08-07' AND market='TWSE'))),
      'jobStatus',(SELECT status FROM public.legacy_producer_jobs_v3_11 WHERE job_id='${jobId}'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{chunkRows:2,preCompletionRows:0,sessionRows:1,nextCutoffRows:1,jobStatus:'succeeded'});
});

test('V3.14 completion persists a non-empty exact decision revision and heartbeat',()=>{
  const codec=runtime('codec.js');
  const projectionCodec=runtime('compact-radar-projection.js');
  const {deriveDecisionEnvelopeV314}=runtime('decision-envelope-v314.js');
  const ownerToken='71400000-0000-4000-8000-000000000113';
  const runId='71400000-0000-4000-8000-000000000111';
  const jobId='71400000-0000-4000-8000-000000000112';
  const sourceCutoff='2026-08-11T06:30:00Z';
  const citation={ref:'twse-openapi:statement:1101:2026-06-30',sourceKey:'twse',sourceName:'臺灣證券交易所',
    sourceUrl:'https://openapi.twse.com.tw/',kolIdentity:null,publishedAt:'2026-08-10T05:00:00Z',
    collectedAt:'2026-08-10T06:00:00Z',evaluatedAt:sourceCutoff};
  const envelope=deriveDecisionEnvelopeV314({valuation:{status:'normal',valuationRange:{bear:90,base:132,bull:165},
    method:{method:'pe'},asOf:'2026-08-10',evidence:{sourceRefs:[citation.ref]}},currentPrice:100,
    qualityActionEligible:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    marketAllowsAction:true,technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},lastEvaluatedAt:sourceCutoff});
  assert.equal(envelope.userAction,'buy');
  const draft={symbol:'1101',decisionEnvelope:envelope,sourceProvenance:citation,citations:[citation],decisionBrief:{
    thesis:['官方營運證據完整','估值安全邊際通過','技術突破確認'],risks:['需求反轉','利潤率下滑','突破失敗'],evidence:[
      {point:'thesis:0',refs:[citation.ref]},{point:'thesis:1',refs:[citation.ref]},
      {point:'thesis:2',refs:[citation.ref]},{point:'risk:0',refs:[citation.ref]},
      {point:'risk:1',refs:[citation.ref]},{point:'risk:2',refs:[citation.ref]}]}};
  const identityBundle=projectionCodec.decisionRevisionIdentityBundle(draft);
  const revisionId=`decision-v3.14:${identityBundle.hash}`;
  const card={...draft,decisionRevisionId:revisionId,decisionEnvelope:{...envelope,decisionRevisionId:revisionId}};
  const revisionBundle=codec.immutableBundle('legacy_decision_revision_v3_14',
    projectionCodec.immutableDecisionRevisionCard(card));
  const correctness={schema:'legacy-radar-v3.14.0',window:'home',asOf:sourceCutoff,contentAsOf:sourceCutoff,
    evaluatedAt:sourceCutoff,publishedAt:sourceCutoff,nextExpectedAt:'2026-08-12T06:30:00Z',freshnessSchedule:[],
    contentHash:'d'.repeat(64),producerIdentity:{commitSha:'a'.repeat(40)}};
  const projections=['daily','home','three_day','weekly'].map((storageWindow)=>{
    const payload={sourceSignals:storageWindow==='home'?[card]:[],sourceLedCorrectness:{...correctness,
      window:storageWindow==='three_day'?'hot':storageWindow}};
    const canonical=codec.canonicalJson(payload);const payloadChecksum=codec.sha256(canonical);
    return {projectionKey:`legacy-radar-v3.11:${storageWindow}:${sourceCutoff}:${payloadChecksum}`,
      storageWindow,payload,payloadChecksum,bundle:{canonical}};
  });
  const completion={schema:'legacy-compact-projection-result-v3.11',projections,decisionRevisions:[{
    symbol:'1101',decisionRevisionId:revisionId,bundle:revisionBundle,identityBundle,sourceLedCorrectness:correctness}]};
  const canonical=codec.canonicalJson(completion);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('${runId}','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('${ownerToken}','utf8'),'sha256'),'hex'),repeat('a',40),repeat('b',64),
      decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols')
        WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','v314-decision-persistence',
      '${sourceCutoff}',NULL,NULL,convert_to('{}','utf8'),'{}',
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',
      date_trunc('second',clock_timestamp())-interval '1 second',clock_timestamp(),clock_timestamp()+interval '120 seconds',
      NULL,NULL,repeat('8',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES('${jobId}','${runId}','compact_radar_projection','stage_barrier',5,NULL,0,NULL,NULL,repeat('3',64),repeat('3',64),
      'leased',1,5,encode(extensions.digest(convert_to('${ownerToken}','utf8'),'sha256'),'hex'),clock_timestamp(),
      clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    SET ROLE service_role;
    SELECT status FROM public.complete_legacy_producer_job_v3_14('${runId}','${jobId}','${ownerToken}',
      decode('${Buffer.from(canonical).toString('hex')}','hex'),${sqlLiteral(canonical)}::jsonb,'${codec.sha256(canonical)}');
    RESET ROLE;
    SELECT jsonb_build_object(
      'revision',(SELECT count(*) FROM public.legacy_decision_revisions_v3_13 WHERE decision_revision_id='${revisionId}'),
      'evaluation',(SELECT count(*) FROM public.legacy_decision_revision_evaluations_v3_13 WHERE decision_revision_id='${revisionId}'),
      'schema',(SELECT source_led_correctness->>'schema' FROM public.legacy_decision_revision_evaluations_v3_13
        WHERE decision_revision_id='${revisionId}' LIMIT 1),
      'jobStatus',(SELECT status FROM public.legacy_producer_jobs_v3_11 WHERE job_id='${jobId}'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{revision:1,evaluation:1,schema:'legacy-radar-v3.14.0',jobStatus:'succeeded'});
});

test('V3.14 SQL envelope validator preserves diagnostics for unavailable cards',()=>{
  const {deriveDecisionEnvelopeV314}=runtime('decision-envelope-v314.js');
  const envelope=deriveDecisionEnvelopeV314({valuation:{status:'normal',valuationRange:{bear:80,base:105,bull:125},
    method:{method:'pe'},asOf:'2026-08-10',evidence:{sourceRefs:['official']}},currentPrice:100,
    qualityActionEligible:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    marketAllowsAction:true,technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},
    lastEvaluatedAt:'2026-08-11T06:30:00Z'});
  assert.equal(envelope.userAction,'unavailable');
  assert.ok(envelope.thresholdAuthority);
  const malformed={...envelope,thresholdAuthority:{...envelope.thresholdAuthority,evidenceRoot:'not-a-hash'}};
  const wrongRegimeThreshold={...envelope,thresholdAuthority:{...envelope.thresholdAuthority,
    marketRegime:'selective_or_defensive'}};
  const missingThreshold=structuredClone(envelope);delete missingThreshold.thresholdAuthority;
  const missingThresholdSubfield=structuredClone(envelope);delete missingThresholdSubfield.thresholdAuthority.actualRewardRisk;
  const extraThresholdSubfield={...envelope,thresholdAuthority:{...envelope.thresholdAuthority,unexpected:'not-closed'}};
  const actionable={...envelope,userAction:'buy',reason:'v314_breakout_confirmed',blockers:[],
    valuationSummary:{...envelope.valuationSummary,blockers:[]},thresholdAuthority:null};
  const selectiveWait=deriveDecisionEnvelopeV314({valuation:{status:'normal',valuationRange:{bear:80,base:116,bull:140},
    method:{method:'pe'},asOf:'2026-08-10',evidence:{sourceRefs:['official']}},currentPrice:100,
    qualityActionEligible:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'selective_or_defensive',
    marketAllowsAction:true,technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:95,trigger:null},
    lastEvaluatedAt:'2026-08-11T06:30:00Z'});
  assert.equal(selectiveWait.userAction,'wait_value');
  const forgedSelectiveBuy={...selectiveWait,userAction:'buy',reason:'v314_breakout_confirmed',whyNow:'forged',
    blockers:[],valuationSummary:{...selectiveWait.valuationSummary,blockers:[]},nextUnlock:null};
  const exactMarginWait=deriveDecisionEnvelopeV314({valuation:{status:'normal',valuationRange:{bear:80,base:115,bull:140},
    method:{method:'pe'},asOf:'2026-08-10',evidence:{sourceRefs:['official']}},currentPrice:100,
    qualityActionEligible:true,qualityReadiness:'available',marketReadiness:'available',marketRegime:'risk_on',
    marketAllowsAction:true,technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},
    lastEvaluatedAt:'2026-08-11T06:30:00Z'});
  assert.equal(exactMarginWait.userAction,'wait_value');
  const result=JSON.parse(psql(`SELECT jsonb_build_object(
    'valid',public.legacy_valid_decision_envelope_v3_14(${sqlLiteral(JSON.stringify(envelope))}::jsonb),
    'malformed',public.legacy_valid_decision_envelope_v3_14(${sqlLiteral(JSON.stringify(malformed))}::jsonb),
    'wrongRegimeThreshold',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(wrongRegimeThreshold))}::jsonb),
    'missingThreshold',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(missingThreshold))}::jsonb),
    'missingThresholdSubfield',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(missingThresholdSubfield))}::jsonb),
    'extraThresholdSubfield',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(extraThresholdSubfield))}::jsonb),
    'actionableWithoutThreshold',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(actionable))}::jsonb),
    'forgedSelectiveBuy',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(forgedSelectiveBuy))}::jsonb),
    'exactMarginWait',public.legacy_valid_decision_envelope_v3_14(
      ${sqlLiteral(JSON.stringify(exactMarginWait))}::jsonb))::text;`,
  ['-At']).trim());
  assert.deepEqual(result,{valid:true,malformed:false,wrongRegimeThreshold:false,missingThreshold:false,
    missingThresholdSubfield:false,extraThresholdSubfield:false,actionableWithoutThreshold:false,
    forgedSelectiveBuy:false,exactMarginWait:true});
});

test('V3.13 source acquisition persists seventeen terminals, citation, and typed claim/entity conservation', async () => {
  const roster=structuredClone(JSON.parse(fs.readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8')));
  roster.profiles[0].podcastFeed='https://creator.example/feed.xml';
  roster.profiles[1].podcastFeed='https://creator.example/feed.xml';
  const rss='<rss><channel><item><guid>episode-applied</guid><title>產業更新</title><pubDate>Fri, 07 Aug 2026 08:00:00 GMT</pubDate><link>https://creator.example/e/applied</link><podcast:transcript url="https://creator.example/e/applied.txt" type="text/plain" /></item><item><guid>episode-no-claim</guid><title>總經回顧</title><pubDate>Fri, 07 Aug 2026 07:00:00 GMT</pubDate><link>https://creator.example/e/no-claim</link><podcast:transcript url="https://creator.example/e/no-claim.txt" type="text/plain" /></item><item><guid>episode-rejected</guid><title>無效逐字稿</title><pubDate>Fri, 07 Aug 2026 06:00:00 GMT</pubDate><link>https://creator.example/e/rejected</link><podcast:transcript url="https://creator.example/e/rejected.bin" type="application/octet-stream" /></item></channel></rss>';
  const acquisition=await runtime('official-source-acquisition.js').acquireApprovedSources({roster,credentials:{},
    fetchImpl:async(url)=>String(url).endsWith('feed.xml')?new Response(rss,{status:200,headers:{'content-type':'application/rss+xml'}})
      :String(url).endsWith('applied.txt')?new Response('2026 年產業回顧：台積電 2330 股價與先進製程需求更新。',{status:200,headers:{'content-type':'text/plain'}})
        :String(url).endsWith('no-claim.txt')?new Response('2019 年與 2026 年的總體經濟回顧。',{status:200,headers:{'content-type':'text/plain'}})
        :String(url).endsWith('rejected.bin')?new Response('not-authorized-transcript',{status:200,headers:{'content-type':'application/octet-stream'}})
        :new Response('{}',{status:404}),now:new Date('2026-08-09T10:20:00Z')});
  const acquisitionProfiles=[...new Set(acquisition.documents.map((document)=>document.profileId))];
  const secondaryProfile=acquisitionProfiles[1];
  const mixedFailureProfile=acquisitionProfiles[0];
  const mixedFailureAttempt=acquisition.connectorAttempts.find((attempt)=>
    attempt.profileId===mixedFailureProfile && attempt.sourceKey!=='podcast');
  assert.ok(mixedFailureAttempt);
  Object.assign(mixedFailureAttempt,{status:'provider_failed',reasonCode:'provider_transport_failed',
    responseEvidence:{kind:'transport_error',statusCode:null,responseBytes:0,itemCount:0,documentCount:0}});
  assert.equal(acquisition.outcomes.length,17);assert.equal(acquisition.documents.length,6);
  assert.equal(acquisition.documents.filter((document)=>document.terminalDisposition==='rejected').length,2);
  const authorityPages=[
    ['roster',0,'a'.repeat(64),[['123e4567-e89b-42d3-a456-426614173330','2330','TWSE','common_stock','active','台灣積體電路製造股份有限公司','台積電']]],
    ['taxonomy',0,'b'.repeat(64),[['123e4567-e89b-42d3-a456-426614173330','2330','TWSE','semiconductor']]],
  ];
  const parsed=runtime('auth-source-worker-cli.js').extractRevisionCandidates({frozenRevision:{
    revisionId:'71300000-0000-4000-8000-000000000010',sourceKey:'podcast',sourcePublishedAt:'2026-08-07T08:00:00Z',
    sourceCollectedAt:'2026-08-09T10:20:00Z',rawFieldPayload:{text:'2026 年產業回顧：台積電 2330 股價與先進製程需求更新。'}},authorityPages});
  assert.equal(parsed.parseOutcome,'processed_with_claims');assert.equal(parsed.candidates.length,1);
  assert.deepEqual(parsed.entityOutcomes.map((row)=>row.outcome).sort(),['linked','rejected']);
  const parsedNoClaim=runtime('auth-source-worker-cli.js').extractRevisionCandidates({frozenRevision:{
    revisionId:'71300000-0000-4000-8000-000000000012',sourceKey:'podcast',sourcePublishedAt:'2026-08-07T07:00:00Z',
    sourceCollectedAt:'2026-08-09T10:20:00Z',rawFieldPayload:{text:'2019 年與 2026 年的總體經濟回顧。'}},authorityPages});
  assert.equal(parsedNoClaim.parseOutcome,'processed_no_claim');assert.equal(parsedNoClaim.candidates.length,0);
  assert.deepEqual(parsedNoClaim.entityOutcomes.map((row)=>row.outcome),['rejected','rejected']);
  const payload={schema:'legacy-source-sync-result-v3.11',sourceAcquisition:acquisition};
  const repeatAcquisition=structuredClone(acquisition);
  repeatAcquisition.connectorAttempts.filter((attempt)=>attempt.profileId===mixedFailureProfile
    &&attempt.status!=='items_found').forEach((attempt)=>Object.assign(attempt,{status:'successful_empty',
    reasonCode:`${attempt.sourceKey}_successful_empty`,responseEvidence:{kind:'http_response',statusCode:200,
      responseBytes:2,itemCount:0,documentCount:0}}));
  const deferredDocument=runtime('official-source-acquisition.js').documentRevision({sourceKey:'threads',
    profile:roster.profiles.find((profile)=>profile.id===mixedFailureProfile),stableId:'mixed-unchanged-deferred',
    title:'Threads authority unavailable',sourceUrl:'https://www.threads.net/@fixture/post/mixed-deferred',
    publishedAt:'2026-08-07T09:00:00Z',transcript:'台積電 2330 來源權限待補。',collectedAt:'2026-08-09T10:20:00Z'});
  repeatAcquisition.documents.push(deferredDocument);
  repeatAcquisition.itemOutcomes.push({sourceKey:'threads',profileId:mixedFailureProfile,
    stableId:deferredDocument.stableConnectorDocumentId,sourceUrl:deferredDocument.canonicalUrlCandidate,
    publishedAt:deferredDocument.publishedAt,acquisitionDisposition:'transcript_ready',
    analysisDisposition:'eligible_for_claim_extraction'});
  Object.assign(repeatAcquisition.connectorAttempts.find((attempt)=>attempt.profileId===mixedFailureProfile
    &&attempt.sourceKey==='threads'),{status:'items_found',reasonCode:'threads_items_observed',
    responseEvidence:{kind:'http_response',statusCode:200,responseBytes:128,itemCount:1,documentCount:1}});
  repeatAcquisition.outcomes.find((outcome)=>outcome.profileId===mixedFailureProfile).documentCount+=1;
  const repeatPayload={schema:'legacy-source-sync-result-v3.11',sourceAcquisition:repeatAcquisition};
  const applied=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,'active',repeat('7',64),clock_timestamp());
    INSERT INTO public.source_entities(id) VALUES
      ('71300000-0000-4000-8000-000000000002'),('71300000-0000-4000-8000-000000000008');
    INSERT INTO public.stocks(id,symbol) VALUES('123e4567-e89b-42d3-a456-426614173330','2330');
    INSERT INTO public.source_identity_authorities_v3(authority_id,source_identity_id,source_key,source_class,
      distribution_identity,valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000003','71300000-0000-4000-8000-000000000002','podcast','community',
      'podcast:${acquisition.documents[0].profileId}','2026-01-01',NULL,'active','2026-08-01',
      'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','2026-08-01T00:00:00Z');
    WITH canonical(value) AS(SELECT convert_to(regexp_replace(jsonb_build_array(
      'discovery_identity','71300000-0000-4000-8000-000000000002'::uuid)::text,', ', ',', 'g'),'utf8'))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical)
    SELECT 'discovery_identity',encode(extensions.digest(value,'sha256'),'hex'),value FROM canonical;
    CREATE TEMP TABLE v313_run AS SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
      'com.stockinsider.auth-source-worker',repeat('7',40),repeat('8',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      '71300000-0000-4000-8000-000000000004',120);
    CREATE TEMP TABLE v313_claim AS SELECT * FROM public.claim_legacy_producer_job_v3_11(
      (SELECT run_id FROM v313_run),(SELECT job_id FROM v313_run),'71300000-0000-4000-8000-000000000004',120);
    CREATE TEMP TABLE v313_payload AS SELECT ${sqlLiteral(JSON.stringify(payload))}::jsonb payload;
    CREATE TEMP TABLE v313_complete AS SELECT completion.* FROM v313_payload source CROSS JOIN LATERAL
      public.complete_legacy_producer_job_v3_11((SELECT run_id FROM v313_run),(SELECT job_id FROM v313_run),
        '71300000-0000-4000-8000-000000000004',convert_to(source.payload::text,'utf8'),source.payload,
        encode(extensions.digest(convert_to(source.payload::text,'utf8'),'sha256'),'hex')) completion;
    WITH revisions AS(SELECT source.*,row_number() OVER(ORDER BY source.stable_connector_document_id)-1 selection_ordinal
      FROM public.source_document_revisions_v3 source
      JOIN public.legacy_source_document_persistence_v3_13 persisted ON persisted.revision_id=source.revision_id
      WHERE persisted.source_run_id=(SELECT run_id FROM v313_run)),selected AS(
      SELECT selection_ordinal,jsonb_build_array(source_key,revision_id,revision_family_key,approved_source_identity_id,
        stable_connector_document_id,published_at,collected_at,raw_field_payload_algorithm_version,
        ingestion_content_revision_sha256,canonical_content_algorithm_version,ingestion_canonical_content_hash_v3) value
      FROM revisions)
    INSERT INTO public.legacy_frozen_source_revisions_v3_11(run_id,selection_ordinal,source_key,revision_id,
      selected_revision_row_canonical,selected_revision_row_json,selected_revision_row_hash,
      raw_field_payload_algorithm_version,ingestion_content_revision_sha256,canonical_content_algorithm_version,
      canonical_content_sha256,recorded_at)
    SELECT (SELECT run_id FROM v313_run),selection_ordinal,(value->>0)::public.source_key_v3,(value->>1)::uuid,
      convert_to(value::text,'utf8'),value,encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),
      value->>7,value->>8,value->>9,value->>10,clock_timestamp() FROM selected;
    WITH selected AS(SELECT revision_id FROM public.legacy_frozen_source_revisions_v3_11
      WHERE run_id=(SELECT run_id FROM v313_run) AND selected_revision_row_json->>4='episode-applied'),payload AS(
      SELECT jsonb_build_array('v313-followup','mention_claim_extraction','revision_shard',0,revision_id) value FROM selected)
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at)
    SELECT '71300000-0000-4000-8000-000000000011',(SELECT run_id FROM v313_run),'mention_claim_extraction',
      'revision_shard',1,0,2,revision_id,(SELECT job_id FROM v313_run),
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),'queued',0,5,NULL,NULL,NULL,NULL,NULL,NULL,
      clock_timestamp() FROM selected,payload;
    WITH payload(value) AS(SELECT jsonb_build_array('v313-followup','mention_claim_extraction','revision_shard',0,
      (SELECT revision_id FROM public.legacy_frozen_source_revisions_v3_11 WHERE run_id=(SELECT run_id FROM v313_run)
        AND selected_revision_row_json->>4='episode-applied')))
    INSERT INTO public.legacy_producer_job_payloads_v3_11(job_id,payload_canonical,payload_json,payload_hash,recorded_at)
    SELECT '71300000-0000-4000-8000-000000000011',convert_to(value::text,'utf8'),value,
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),clock_timestamp() FROM payload;
    CREATE TEMP TABLE v313_mention_claim AS SELECT * FROM public.claim_legacy_producer_job_v3_11(
      (SELECT run_id FROM v313_run),'71300000-0000-4000-8000-000000000011',
      '71300000-0000-4000-8000-000000000004',120);
    CREATE TEMP TABLE v313_analysis_payload AS SELECT jsonb_set(
      ${sqlLiteral(JSON.stringify(parsed))}::jsonb,'{revisionId}',to_jsonb((SELECT revision_id::text
        FROM public.legacy_source_document_persistence_v3_13 WHERE source_run_id=(SELECT run_id FROM v313_run)
          AND stable_connector_document_id='episode-applied' AND revision_id IS NOT NULL))) payload;
    CREATE TEMP TABLE v313_analysis_complete AS SELECT completion.* FROM v313_analysis_payload analysis CROSS JOIN LATERAL
      public.complete_legacy_producer_job_v3_11((SELECT run_id FROM v313_run),(SELECT job_id FROM v313_mention_claim),
        '71300000-0000-4000-8000-000000000004',convert_to(analysis.payload::text,'utf8'),analysis.payload,
        encode(extensions.digest(convert_to(analysis.payload::text,'utf8'),'sha256'),'hex')) completion;
    WITH selected AS(SELECT revision_id FROM public.legacy_frozen_source_revisions_v3_11
      WHERE run_id=(SELECT run_id FROM v313_run) AND selected_revision_row_json->>4='episode-no-claim'),payload AS(
      SELECT jsonb_build_array('v313-no-claim','mention_claim_extraction','revision_shard',1,revision_id) value FROM selected)
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at)
    SELECT '71300000-0000-4000-8000-000000000013',(SELECT run_id FROM v313_run),'mention_claim_extraction',
      'revision_shard',1,1,(SELECT max(execution_ordinal)+1 FROM public.legacy_producer_jobs_v3_11
        WHERE run_id=(SELECT run_id FROM v313_run)),revision_id,(SELECT job_id FROM v313_run),
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),'queued',0,5,NULL,NULL,NULL,NULL,NULL,NULL,
      clock_timestamp() FROM selected,payload;
    WITH payload(value) AS(SELECT jsonb_build_array('v313-no-claim','mention_claim_extraction','revision_shard',1,
      (SELECT revision_id FROM public.legacy_frozen_source_revisions_v3_11 WHERE run_id=(SELECT run_id FROM v313_run)
        AND selected_revision_row_json->>4='episode-no-claim')))
    INSERT INTO public.legacy_producer_job_payloads_v3_11(job_id,payload_canonical,payload_json,payload_hash,recorded_at)
    SELECT '71300000-0000-4000-8000-000000000013',convert_to(value::text,'utf8'),value,
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'),clock_timestamp() FROM payload;
    CREATE TEMP TABLE v313_no_claim_job AS SELECT * FROM public.claim_legacy_producer_job_v3_11(
      (SELECT run_id FROM v313_run),'71300000-0000-4000-8000-000000000013',
      '71300000-0000-4000-8000-000000000004',120);
    CREATE TEMP TABLE v313_no_claim_payload AS SELECT jsonb_set(
      ${sqlLiteral(JSON.stringify(parsedNoClaim))}::jsonb,'{revisionId}',to_jsonb((SELECT revision_id::text
        FROM public.legacy_source_document_persistence_v3_13 WHERE source_run_id=(SELECT run_id FROM v313_run)
          AND stable_connector_document_id='episode-no-claim' AND revision_id IS NOT NULL))) payload;
    CREATE TEMP TABLE v313_no_claim_complete AS SELECT completion.* FROM v313_no_claim_payload analysis CROSS JOIN LATERAL
      public.complete_legacy_producer_job_v3_11((SELECT run_id FROM v313_run),(SELECT job_id FROM v313_no_claim_job),
        '71300000-0000-4000-8000-000000000004',convert_to(analysis.payload::text,'utf8'),analysis.payload,
        encode(extensions.digest(convert_to(analysis.payload::text,'utf8'),'sha256'),'hex')) completion;
    UPDATE public.legacy_producer_runs_v3_11 SET status='success',terminal_at=clock_timestamp()
      WHERE run_id=(SELECT run_id FROM v313_run);
    INSERT INTO public.source_identity_authorities_v3(authority_id,source_identity_id,source_key,source_class,
      distribution_identity,valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000005','71300000-0000-4000-8000-000000000002','youtube','community',
      'youtube:${acquisition.documents[0].profileId}','2026-01-01',NULL,'inactive','2026-08-09T10:21:00Z',
      'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','2026-08-09T10:21:00Z');
    DO $stale_source_append$ DECLARE d public.source_document_revisions_v3%ROWTYPE;BEGIN
      SELECT * INTO STRICT d FROM public.source_document_revisions_v3 ORDER BY recorded_at,revision_id LIMIT 1;
      BEGIN
        PERFORM * FROM public.append_source_document_revision_v3(ROW(
          '71300000-0000-4000-8000-000000000003','stale-authority-probe',d.canonical_url_candidate,
          d.published_at,d.collected_at,d.adapter_version,d.acquisition_status,d.raw_field_payload,d.raw_code_point_count,
          d.raw_field_payload_algorithm_version,d.ingestion_content_revision_sha256,d.canonical_content_algorithm_version,
          d.ingestion_canonical_content_hash_v3,NULL)::public.source_document_revision_input_v3,
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
        RAISE EXCEPTION 'expected_stale_source_authority_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'authority_reference_unavailable' THEN RAISE;END IF;
      END;
    END $stale_source_append$;
    DO $consumed_source_context$ DECLARE d public.source_document_revisions_v3%ROWTYPE;BEGIN
      SELECT * INTO STRICT d FROM public.source_document_revisions_v3
        WHERE stable_connector_document_id='episode-applied' ORDER BY recorded_at,revision_id LIMIT 1;
      BEGIN
        PERFORM * FROM public.append_source_document_revision_v3(ROW(
          '71300000-0000-4000-8000-000000000003','episode-applied',d.canonical_url_candidate,
          d.published_at,d.collected_at,d.adapter_version,d.acquisition_status,d.raw_field_payload,d.raw_code_point_count,
          d.raw_field_payload_algorithm_version,d.ingestion_content_revision_sha256,d.canonical_content_algorithm_version,
          d.ingestion_canonical_content_hash_v3,NULL)::public.source_document_revision_input_v3,
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
        RAISE EXCEPTION 'expected_consumed_source_context_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'authority_reference_unavailable' THEN RAISE;END IF;
      END;
    END $consumed_source_context$;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('71300000-0000-4000-8000-000000000020','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000021','utf8'),'sha256'),'hex'),
      repeat('7',40),repeat('8',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
      ) WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','v313-source-repeat',
      '2026-08-09T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}'::jsonb,
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('2',64),1);
    INSERT INTO public.source_identity_authorities_v3(authority_id,source_identity_id,source_key,source_class,
      distribution_identity,valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000009','71300000-0000-4000-8000-000000000008','podcast','community',
      'podcast:${secondaryProfile}','2026-01-01',NULL,'active','2026-08-09T10:21:00Z',
      'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','2026-08-09T10:21:00Z');
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000022','71300000-0000-4000-8000-000000000020','source_sync',
      'stage_barrier',0,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),'leased',1,5,
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000021','utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL,clock_timestamp());
    CREATE TEMP TABLE v313_repeat_payload AS SELECT ${sqlLiteral(JSON.stringify(repeatPayload))}::jsonb payload;
    CREATE TEMP TABLE v313_repeat_complete AS SELECT completion.* FROM v313_repeat_payload source CROSS JOIN LATERAL
      public.complete_legacy_producer_job_v3_11('71300000-0000-4000-8000-000000000020',
        '71300000-0000-4000-8000-000000000022','71300000-0000-4000-8000-000000000021',
        convert_to(source.payload::text,'utf8'),source.payload,
        encode(extensions.digest(convert_to(source.payload::text,'utf8'),'sha256'),'hex')) completion;
    INSERT INTO public.source_identity_authorities_v3(authority_id,source_identity_id,source_key,source_class,
      distribution_identity,valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at)
    SELECT '71300000-0000-4000-8000-000000000006',source_identity_id,'threads',source_class,
      'threads:${acquisition.documents[0].profileId}',valid_from,valid_to,'active',approved_at,
      approving_principal_id,recorded_at FROM public.source_identity_authorities_v3
      WHERE authority_id='71300000-0000-4000-8000-000000000005';
    DO $source_tie_conflict$ BEGIN
      BEGIN
        PERFORM public.opportunity_authority_selected_stream_count_v3_internal('discovery_identity',clock_timestamp());
        RAISE EXCEPTION 'expected_source_tie_conflict_missing';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'authority_revision_conflict' THEN RAISE;END IF;
      END;
    END $source_tie_conflict$;
    SELECT jsonb_build_object(
      'profileCount',(SELECT count(*) FROM public.legacy_source_acquisition_outcomes_v3_13 WHERE source_run_id=(SELECT run_id FROM v313_run)),
      'terminalCount',(SELECT count(*) FROM public.legacy_source_acquisition_outcomes_v3_13 WHERE source_run_id=(SELECT run_id FROM v313_run)
        AND status IN('fresh','unchanged','missing_endpoint','auth_failed','provider_failed')),
      'newDocuments',(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND disposition='new_revision'),
      'citation',(SELECT revision.canonical_url_candidate FROM public.legacy_source_document_persistence_v3_13 persisted
        JOIN public.source_document_revisions_v3 revision ON revision.revision_id=persisted.revision_id
        WHERE persisted.source_run_id=(SELECT run_id FROM v313_run) AND persisted.stable_connector_document_id='episode-applied'),
      'transcriptReadyItems',(SELECT count(*) FROM public.legacy_source_item_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND acquisition_disposition='transcript_ready'
          AND analysis_disposition='eligible_for_claim_extraction'),
      'metadataClaims',(SELECT count(*) FROM public.legacy_source_item_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND acquisition_disposition='metadata_only'
          AND analysis_disposition<>'no_claim'),
      'processingDocuments',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='document'),
      'processedNoClaim',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='document' AND outcome='processed_no_claim'),
      'processingClaims',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='claim'),
      'processingEntities',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='entity'),
      'linkedEntities',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='entity' AND outcome='linked'),
      'rejectedEntities',(SELECT count(*) FROM public.legacy_source_processing_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND scope='entity' AND outcome='rejected'),
      'repeatUnchanged',(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020' AND disposition='unchanged'),
      'repeatDeferred',(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020' AND disposition='deferred'),
      'repeatRejected',(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020' AND disposition='rejected'),
      'repeatMixedTerminal',(SELECT status FROM public.legacy_source_acquisition_outcomes_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020' AND profile_id='${mixedFailureProfile}'),
      'repeatFrozenAuthorities',(SELECT count(*) FROM public.legacy_frozen_source_authorities_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020'),
      'postCutoffGrantDeferred',(SELECT count(*) FROM public.legacy_source_document_persistence_v3_13
        WHERE source_run_id='71300000-0000-4000-8000-000000000020' AND profile_id='${secondaryProfile}'
          AND disposition='deferred'),
      'mixedFailureTerminal',(SELECT status FROM public.legacy_source_acquisition_outcomes_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run) AND profile_id='${mixedFailureProfile}'),
      'runBoundAppendContexts',(SELECT count(*) FROM public.legacy_source_append_context_v3_13
        WHERE source_run_id=(SELECT run_id FROM v313_run)),
      'staleAppendRows',(SELECT count(*) FROM public.source_document_revisions_v3
        WHERE stable_connector_document_id='stale-authority-probe'),
      'staleAppendAudits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE function_name='append_source_document_revision_v3' AND subject_id IS NULL))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(applied,{profileCount:17,terminalCount:17,newDocuments:2,
    citation:'https://creator.example/e/applied',transcriptReadyItems:4,metadataClaims:0,
    processingDocuments:2,processedNoClaim:1,processingClaims:4,processingEntities:4,linkedEntities:1,rejectedEntities:3,
    repeatUnchanged:2,repeatDeferred:3,repeatRejected:2,repeatMixedTerminal:'provider_failed',repeatFrozenAuthorities:1,
    postCutoffGrantDeferred:2,mixedFailureTerminal:'provider_failed',runBoundAppendContexts:2,
    staleAppendRows:0,staleAppendAudits:0});
  assert.equal(parsed.candidates[0].link.disposition,'linked');assert.equal(parsed.candidates[0].symbol,'2330');
});

test('V3.13 source completion rejects unsupported empty terminals and unconserved item multisets atomically',()=>{
  const roster=JSON.parse(fs.readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  const acquisition={schema:'official-source-acquisition-v3.13',collectedAt:'2026-08-09T10:20:00Z',documents:[],
    itemOutcomes:[],connectorAttempts:roster.profiles.flatMap((profile)=>['threads','podcast','youtube'].map((sourceKey)=>({
      profileId:profile.id,sourceKey,status:'successful_empty',reasonCode:`${sourceKey}_successful_empty`,
      responseEvidence:{kind:'http_response',statusCode:200,responseBytes:2,itemCount:0,documentCount:0}}))),
    outcomes:roster.profiles.map((profile)=>({profileId:profile.id,profileName:profile.name,documentCount:0}))};
  const variants=[
    ['missing-extension',undefined],
    ['null-extension',null],
    ['scalar-extension','not-an-object'],
    ['empty-extension',{}],
    ['wrong-schema-extension',{schema:'official-source-acquisition-v3.12'}],
    ['caller-status',(()=>{const value=structuredClone(acquisition);value.outcomes[0].status='no_new_items';return value;})()],
    ['caller-reason',(()=>{const value=structuredClone(acquisition);value.outcomes[0].reason='caller_selected';return value;})()],
    ['missing-profile',(()=>{const value=structuredClone(acquisition);value.outcomes.pop();return value;})()],
    ['missing-attempt',(()=>{const value=structuredClone(acquisition);value.connectorAttempts.pop();return value;})()],
    ['tampered-attempt-reason',(()=>{const value=structuredClone(acquisition);
      value.connectorAttempts[0].reasonCode='provider_transport_failed';return value;})()],
    ['forged-empty-auth',(()=>{const value=structuredClone(acquisition);
      value.connectorAttempts[0].status='auth_failed';value.connectorAttempts[0].reasonCode='provider_auth_rejected';return value;})()],
    ['forged-metadata-configuration',(()=>{const value=structuredClone(acquisition);Object.assign(value.connectorAttempts[0],
      {status:'metadata_only',reasonCode:'threads_metadata_only',responseEvidence:{kind:'configuration',statusCode:null,
        responseBytes:0,itemCount:1,documentCount:0}});return value;})()],
    ['forged-missing-http-success',(()=>{const value=structuredClone(acquisition);Object.assign(value.connectorAttempts[0],
      {status:'missing_endpoint',reasonCode:'threads_endpoint_missing',responseEvidence:{kind:'http_response',statusCode:200,
        responseBytes:2,itemCount:0,documentCount:0}});return value;})()],
    ['forged-provider-http-success',(()=>{const value=structuredClone(acquisition);Object.assign(value.connectorAttempts[0],
      {status:'provider_failed',reasonCode:'provider_transport_failed',responseEvidence:{kind:'http_response',statusCode:200,
        responseBytes:2,itemCount:0,documentCount:0}});return value;})()],
    ['out-of-bound-attempt-count',(()=>{const value=structuredClone(acquisition);
      value.connectorAttempts[0].responseEvidence.itemCount=21;return value;})()],
    ['unpaired-item',(()=>{const value=structuredClone(acquisition);value.itemOutcomes.push({sourceKey:'podcast',
      profileId:value.outcomes[0].profileId,stableId:'orphan',sourceUrl:'https://creator.example/orphan',publishedAt:null,
      acquisitionDisposition:'rejected',analysisDisposition:'rejected'});return value;})()],
    ['credential-item-url',(()=>{const value=structuredClone(acquisition);value.itemOutcomes.push({sourceKey:'podcast',
      profileId:value.outcomes[0].profileId,stableId:'credential',sourceUrl:'https://user:secret@creator.example/orphan',
      publishedAt:null,acquisitionDisposition:'rejected',analysisDisposition:'rejected'});return value;})()],
    ['timezone-free-item',(()=>{const value=structuredClone(acquisition);value.itemOutcomes.push({sourceKey:'podcast',
      profileId:value.outcomes[0].profileId,stableId:'timezone-free',sourceUrl:'https://creator.example/orphan',
      publishedAt:'2026-08-07T08:00:00',acquisitionDisposition:'rejected',analysisDisposition:'rejected'});return value;})()],
  ];
  const attempts=variants.map(([label,sourceAcquisition],index)=>{
    const suffix=String(index+40).padStart(12,'0');
    const runId=`71300000-0000-4000-8000-${suffix}`;
    const jobId=`71400000-0000-4000-8000-${suffix}`;
    const payload=JSON.stringify(sourceAcquisition===undefined?{schema:'legacy-source-sync-result-v3.11'}:
      {schema:'legacy-source-sync-result-v3.11',sourceAcquisition});
    return `
      INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
        scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
        source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
        started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
      VALUES('${runId}','com.stockinsider.auth-source-worker',encode(extensions.digest(convert_to(
        '71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),repeat('a',40),repeat('b',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(convert_from(
          decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols') WITH ORDINALITY seed(value,ordinal)),
        'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','${label}',
        '2026-08-09T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
        encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '120 seconds',NULL,NULL,'${createHash('sha256').update(label).digest('hex')}',1);
      INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
        execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
        owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
      VALUES('${jobId}','${runId}','source_sync','stage_barrier',0,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),
        'leased',1,5,encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
        clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
      DO $negative_${index}$ DECLARE value jsonb:=${sqlLiteral(payload)}::jsonb;BEGIN
        BEGIN
          PERFORM * FROM public.complete_legacy_producer_job_v3_11('${runId}','${jobId}',
            '71300000-0000-4000-8000-000000000099',convert_to(value::text,'utf8'),value,
            encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'));
          RAISE EXCEPTION 'expected_source_conservation_failure_missing';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM NOT LIKE 'data_integrity_failure/%' AND SQLERRM<>'v313_source_acquisition_required' THEN RAISE;END IF;
        END;
      END $negative_${index}$;
      UPDATE public.legacy_producer_jobs_v3_11 SET status='failed',terminal_at=clock_timestamp(),
        owner_token_hash=NULL,leased_at=NULL,heartbeat_at=NULL,lease_expires_at=NULL WHERE job_id='${jobId}';
      UPDATE public.legacy_producer_runs_v3_11 SET status='failed',terminal_at=clock_timestamp(),
        heartbeat_at=clock_timestamp(),lease_expires_at=clock_timestamp() WHERE run_id='${runId}';`;
  }).join('\n');
  const factsAttempt=`
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('71600000-0000-4000-8000-000000000001','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('71600000-0000-4000-8000-000000000003','utf8'),'sha256'),'hex'),repeat('a',40),repeat('b',64),
      decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(convert_from(
        decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols') WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','missing-facts-extension',
      '2026-08-09T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('f',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES('71600000-0000-4000-8000-000000000002','71600000-0000-4000-8000-000000000001','facts_refresh',
      'stage_barrier',3,NULL,0,NULL,NULL,repeat('2',64),repeat('2',64),'leased',1,5,
      encode(extensions.digest(convert_to('71600000-0000-4000-8000-000000000003','utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    DO $missing_facts$ DECLARE value jsonb:='{"schema":"legacy-facts-refresh-result-v3.11"}'::jsonb;BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11('71600000-0000-4000-8000-000000000001',
          '71600000-0000-4000-8000-000000000002','71600000-0000-4000-8000-000000000003',
          convert_to(value::text,'utf8'),value,encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'));
        RAISE EXCEPTION 'expected_v313_official_ingestion_required';
      EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'v313_official_ingestion_required' THEN RAISE;END IF;END;
    END $missing_facts$;`;
  const result=JSON.parse(psql(`BEGIN;${attempts}${factsAttempt}
    SELECT jsonb_build_object('failed',(SELECT count(*) FROM public.legacy_producer_jobs_v3_11
      WHERE job_id::text LIKE '71400000-%' AND status='failed'),'results',(SELECT count(*)
      FROM public.legacy_producer_job_results_v3_11 result JOIN public.legacy_producer_jobs_v3_11 job USING(job_id)
      WHERE job.run_id::text LIKE '71300000-%'),
      'factsResult',(SELECT count(*) FROM public.legacy_producer_job_results_v3_11
        WHERE job_id='71600000-0000-4000-8000-000000000002'),
      'factsJobStatus',(SELECT status::text FROM public.legacy_producer_jobs_v3_11
        WHERE job_id='71600000-0000-4000-8000-000000000002'),
      'outcomes',(SELECT count(*)
      FROM public.legacy_source_acquisition_outcomes_v3_13 WHERE source_run_id::text LIKE '71300000-%'))::text;
    ROLLBACK;`,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{failed:18,results:0,factsResult:0,factsJobStatus:'leased',outcomes:0});
});

test('V3.13 database derives successful-empty, missing, auth and provider terminals from 51 connector attempts',()=>{
  const roster=JSON.parse(fs.readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  const base={schema:'official-source-acquisition-v3.13',collectedAt:'2026-08-09T10:20:00Z',documents:[],itemOutcomes:[],
    connectorAttempts:roster.profiles.flatMap((profile)=>['threads','podcast','youtube'].map((sourceKey)=>({
      profileId:profile.id,sourceKey,status:'successful_empty',reasonCode:`${sourceKey}_successful_empty`,
      responseEvidence:{kind:'http_response',statusCode:200,responseBytes:2,itemCount:0,documentCount:0}}))),
    outcomes:roster.profiles.map((profile)=>({profileId:profile.id,profileName:profile.name,documentCount:0}))};
  const cases=['no_new_items','missing_endpoint','auth_failed','provider_failed'].map((expected,index)=>{
    const acquisition=structuredClone(base);const profileId=roster.profiles[0].id;
    const selected=acquisition.connectorAttempts.filter((attempt)=>attempt.profileId===profileId);
    if(expected==='missing_endpoint')selected.forEach((attempt)=>Object.assign(attempt,{status:'missing_endpoint',
      reasonCode:`${attempt.sourceKey}_endpoint_missing`,responseEvidence:{kind:'configuration',statusCode:null,responseBytes:0,itemCount:0,documentCount:0}}));
    if(expected==='auth_failed')Object.assign(selected[0],{status:'auth_failed',reasonCode:'threads_oauth_missing',
      responseEvidence:{kind:'configuration',statusCode:null,responseBytes:0,itemCount:0,documentCount:0}});
    if(expected==='provider_failed')Object.assign(selected[0],{status:'provider_failed',reasonCode:'provider_transport_failed',
      responseEvidence:{kind:'transport_error',statusCode:null,responseBytes:0,itemCount:0,documentCount:0}});
    const suffix=String(index+70).padStart(12,'0');const runId=`71300000-0000-4000-8000-${suffix}`;
    const jobId=`71400000-0000-4000-8000-${suffix}`;const token=`71500000-0000-4000-8000-${suffix}`;
    const payload=JSON.stringify({schema:'legacy-source-sync-result-v3.11',sourceAcquisition:acquisition});
    return `
      INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
        scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
        source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
        started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
      VALUES('${runId}','com.stockinsider.auth-source-worker',encode(extensions.digest(convert_to('${token}','utf8'),'sha256'),'hex'),
        repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
        '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(convert_from(
          decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols') WITH ORDINALITY seed(value,ordinal)),
        'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','terminal-${expected}',
        '2026-08-09T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
        encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('${index+1}',64),1);
      INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
        execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
        owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
      VALUES('${jobId}','${runId}','source_sync','stage_barrier',0,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),
        'leased',1,5,encode(extensions.digest(convert_to('${token}','utf8'),'sha256'),'hex'),clock_timestamp(),
        clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
      DO $terminal_${index}$ DECLARE value jsonb:=${sqlLiteral(payload)}::jsonb;BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11('${runId}','${jobId}',
          '${token}',convert_to(value::text,'utf8'),value,
          encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex'));
      END $terminal_${index}$;
      UPDATE public.legacy_producer_runs_v3_11 SET status='success',terminal_at=clock_timestamp()
        WHERE run_id='${runId}';`;
  }).join('\n');
  const result=JSON.parse(psql(`BEGIN;${cases}
    SELECT jsonb_object_agg(replace(run.scheduled_occurrence_id,'terminal-',''),outcome.status)::text
    FROM public.legacy_producer_runs_v3_11 run JOIN public.legacy_source_acquisition_outcomes_v3_13 outcome
      ON outcome.source_run_id=run.run_id AND outcome.profile_id=${sqlLiteral(roster.profiles[0].id)}
    WHERE run.scheduled_occurrence_id LIKE 'terminal-%';ROLLBACK;`,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{auth_failed:'auth_failed',missing_endpoint:'missing_endpoint',
    no_new_items:'no_new_items',provider_failed:'provider_failed'});
});

test('every principal-bound RPC rejects conflicting active role bindings', () => {
  const helperBody = sql.match(
    /CREATE OR REPLACE FUNCTION internal_principal_role_is_exact_v3_internal[\s\S]*?\n\$fn\$;/u,
  )?.[0] ?? '';
  assert.match(helperBody, /LIMIT 2/u);
  assert.match(helperBody, /\)\s*=\s*1/u);
  assert.doesNotMatch(
    sql.replace(helperBody, ''),
    /FROM public[.]internal_principal_role_bindings_v3/u,
    'all role-bound RPCs must delegate to the exact-cardinality helper',
  );
  assert.match(rejectedSql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES
      ('42000000-0000-4000-8000-000000000001','source_reviewer','2026-01-01T00:00:00Z',NULL,'active',repeat('a',64),'2026-02-01T00:00:00Z'),
      ('42000000-0000-4000-8000-000000000001','source_reviewer','2026-01-01T00:00:00Z',NULL,'active',repeat('b',64),'2026-02-01T00:00:00Z');
    SELECT * FROM public.consume_internal_nonce_v3(
      '42000000-0000-4000-8000-000000000001','source_reviewer','0123456789abcdef',clock_timestamp()
    );
  `), /PT403.*principal_role_unavailable/su);
  assert.equal(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES
      ('42000000-0000-4000-8000-000000000002','source_reviewer','2026-01-01T00:00:00Z',NULL,'active',repeat('c',64),'2026-02-01T00:00:00Z'),
      ('42000000-0000-4000-8000-000000000002','source_reviewer','2026-01-01T00:00:00Z',NULL,'active',repeat('c',64),'2026-02-01T00:00:00Z');
    SELECT public.internal_principal_role_is_exact_v3_internal(
      '42000000-0000-4000-8000-000000000002','source_reviewer',clock_timestamp()
    );
    ROLLBACK;
  `, ['-At']).trim().split('\n').find((line) => line === 't'), 't', 'byte-identical greatest-recorded ties collapse');
});

test('legacy producer resolves one scheduled occurrence and resumes the same deterministic SQL graph', () => {
  const roster=JSON.parse(fs.readFileSync(path.join(root,'config/runtime/approved-source-roster-v3.13.json'),'utf8'));
  const emptyAcquisition={schema:'official-source-acquisition-v3.13',collectedAt:'2026-08-09T10:20:00Z',documents:[],
    itemOutcomes:[],connectorAttempts:roster.profiles.flatMap((profile)=>['threads','podcast','youtube'].map((sourceKey)=>({
      profileId:profile.id,sourceKey,status:'successful_empty',reasonCode:`${sourceKey}_successful_empty`,
      responseEvidence:{kind:'http_response',statusCode:200,responseBytes:2,itemCount:0,documentCount:0}}))),
    outcomes:roster.profiles.map((profile)=>({profileId:profile.id,profileName:profile.name,documentCount:0}))};
  const sourceResult={schema:'legacy-source-sync-result-v3.11',sourceAcquisition:emptyAcquisition};
  const result = JSON.parse(psql(`
    BEGIN;
    CREATE TEMP TABLE legacy_lease_capture AS
      SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
        'com.stockinsider.auth-source-worker',repeat('a',40),repeat('b',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        '50000000-0000-4000-8000-000000000001',120
      );
    CREATE TEMP TABLE legacy_busy_capture AS
      SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
        'com.stockinsider.auth-source-worker',repeat('a',40),repeat('b',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        '50000000-0000-4000-8000-000000000002',120
      );
    UPDATE public.legacy_producer_runs_v3_11 SET lease_expires_at=clock_timestamp()-interval '1 second';
    CREATE TEMP TABLE legacy_resume_capture AS
      SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
        'com.stockinsider.auth-source-worker',repeat('a',40),repeat('b',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        '50000000-0000-4000-8000-000000000003',120
      );
    CREATE TEMP TABLE legacy_claim_capture AS
      SELECT * FROM public.claim_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_resume_capture),(SELECT job_id FROM legacy_resume_capture),
        '50000000-0000-4000-8000-000000000003',120
      );
    CREATE TEMP TABLE legacy_source_result AS
      SELECT ${sqlLiteral(JSON.stringify(sourceResult))}::jsonb payload;
    CREATE TEMP TABLE legacy_complete_capture AS
      SELECT completion.*
      FROM legacy_source_result source
      CROSS JOIN LATERAL public.complete_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_resume_capture),(SELECT job_id FROM legacy_resume_capture),
        '50000000-0000-4000-8000-000000000003',convert_to(source.payload::text,'utf8'),source.payload,
        encode(extensions.digest(convert_to(source.payload::text,'utf8'),'sha256'),'hex')
      ) completion;
    CREATE TEMP TABLE legacy_next_claim_capture AS
      SELECT * FROM public.claim_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_resume_capture),(SELECT (next_job->>'jobId')::uuid FROM legacy_complete_capture),
        '50000000-0000-4000-8000-000000000003',120
      );
    CREATE TEMP TABLE legacy_fail_capture AS
      SELECT * FROM public.fail_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_resume_capture),(SELECT job_id FROM legacy_next_claim_capture),
        '50000000-0000-4000-8000-000000000003','provider_unavailable'
      );
    UPDATE public.legacy_producer_runs_v3_11 SET lease_expires_at=clock_timestamp()-interval '1 second'
      WHERE run_id=(SELECT run_id FROM legacy_resume_capture);
    CREATE TEMP TABLE legacy_supersede_capture AS
      SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
        'com.stockinsider.auth-source-worker',repeat('c',40),repeat('d',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        '50000000-0000-4000-8000-000000000004',120
      );
    CREATE TEMP TABLE legacy_terminal_claim_capture AS
      SELECT * FROM public.claim_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_supersede_capture),(SELECT job_id FROM legacy_supersede_capture),
        '50000000-0000-4000-8000-000000000004',120
      );
    CREATE TEMP TABLE legacy_terminal_fail_capture AS
      SELECT * FROM public.fail_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_supersede_capture),(SELECT job_id FROM legacy_terminal_claim_capture),
        '50000000-0000-4000-8000-000000000004','cancelled'
      );
    CREATE TEMP TABLE legacy_reap_lease_capture AS
      SELECT * FROM public.acquire_legacy_producer_lease_v3_11(
        'com.stockinsider.auth-source-worker',repeat('e',40),repeat('f',64),
        decode('${legacyRuntimeConfigHex}','hex'),'1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
        '50000000-0000-4000-8000-000000000005',120
      );
    CREATE TEMP TABLE legacy_reap_claim_capture AS
      SELECT * FROM public.claim_legacy_producer_job_v3_11(
        (SELECT run_id FROM legacy_reap_lease_capture),(SELECT job_id FROM legacy_reap_lease_capture),
        '50000000-0000-4000-8000-000000000005',120
      );
    UPDATE public.legacy_producer_jobs_v3_11 SET lease_expires_at=clock_timestamp()-interval '1 second'
      WHERE job_id=(SELECT job_id FROM legacy_reap_claim_capture);
    CREATE TEMP TABLE legacy_reap_capture AS SELECT public.reap_legacy_producer_jobs_v3_11(1) reaped;
    SELECT jsonb_build_object(
      'created',(SELECT disposition FROM legacy_lease_capture),
      'busy',(SELECT disposition FROM legacy_busy_capture),
      'resumed',(SELECT disposition FROM legacy_resume_capture),
      'sameRun',(SELECT run_id FROM legacy_lease_capture)=(SELECT run_id FROM legacy_resume_capture),
      'sameJob',(SELECT job_id FROM legacy_lease_capture)=(SELECT job_id FROM legacy_resume_capture),
      'completed',(SELECT status FROM legacy_complete_capture),
      'failed',(SELECT status FROM legacy_fail_capture),
      'superseded',(SELECT disposition FROM legacy_supersede_capture),
      'oldRunTerminal',(SELECT status FROM public.legacy_producer_runs_v3_11 WHERE run_id=(SELECT run_id FROM legacy_resume_capture)),
      'newRun',(SELECT run_id FROM legacy_supersede_capture)<>(SELECT run_id FROM legacy_resume_capture),
      'terminalFail',(SELECT status FROM legacy_terminal_fail_capture),
      'terminalJob',(SELECT status::text FROM public.legacy_producer_jobs_v3_11 WHERE job_id=(SELECT job_id FROM legacy_terminal_claim_capture)),
      'reaped',(SELECT reaped FROM legacy_reap_capture),
      'reapedJob',(SELECT status::text FROM public.legacy_producer_jobs_v3_11 WHERE job_id=(SELECT job_id FROM legacy_reap_claim_capture)),
      'jobDeterministic',(SELECT job_id FROM legacy_lease_capture)=(SELECT (
        substr(h,1,8)||'-'||substr(h,9,4)||'-'||substr(h,13,4)||'-'||substr(h,17,4)||'-'||substr(h,21,12)
      )::uuid FROM (SELECT encode(extensions.digest(convert_to(
        'legacy-job:'||(SELECT run_id FROM legacy_lease_capture)::text||':0','utf8'),'sha256'),'hex') h) expected),
      'scheduledHour',(SELECT extract(hour FROM source_cutoff AT TIME ZONE 'Asia/Taipei') FROM legacy_lease_capture),
      'scheduledMinute',(SELECT extract(minute FROM source_cutoff AT TIME ZONE 'Asia/Taipei') FROM legacy_lease_capture),
      'weekday',(SELECT extract(isodow FROM source_cutoff AT TIME ZONE 'Asia/Taipei') FROM legacy_lease_capture)
    )::text;
    ROLLBACK;
  `, ['-At']).split('\n').find((line) => line.startsWith('{')));
  assert.deepEqual({ created: result.created, busy: result.busy, resumed: result.resumed,
    sameRun: result.sameRun, sameJob: result.sameJob, completed: result.completed, failed: result.failed,
    superseded: result.superseded, oldRunTerminal: result.oldRunTerminal, newRun: result.newRun,
    terminalFail: result.terminalFail, terminalJob: result.terminalJob,
    reaped: result.reaped, reapedJob: result.reapedJob,
    jobDeterministic: result.jobDeterministic }, {
    created: 'created', busy: 'owner_already_leased', resumed: 'resumed', sameRun: true, sameJob: true,
    completed: 'running', failed: 'running', superseded: 'created', oldRunTerminal: 'cancelled',
    newRun: true, terminalFail: 'cancelled', terminalJob: 'cancelled', reaped: 1,
    reapedJob: 'retryable', jobDeterministic: true,
  });
  assert.equal(Number(result.scheduledHour), 18); assert.equal(Number(result.scheduledMinute), 20);
  assert.ok(Number(result.weekday) >= 1 && Number(result.weekday) <= 5);
});

test('legacy analysis completion persists a typed material-revision evaluation', () => {
  const decision={symbol:'2330',materialChangeHash:'a'.repeat(64),researchMaturity:'source_signal',
    valuation:{status:'valuation_review'},action:'valuation_review',fundamental:{},technical:null,
    claimId:'51000000-0000-4000-8000-000000000099',analysisGeneratedAt:'2026-08-08T12:00:00Z'};
  const decisionBundle=runtime('codec.js').immutableBundle('legacy_analysis_fact_payload_v3_13',decision);
  const analysisOutput={schema:'legacy-analysis-revision-result-v3.11',decisions:[decision],
    decisionPayloads:[{symbol:'2330',materialChangeHash:'a'.repeat(64),bundle:decisionBundle}],
    sourceCandidates:[],discoveryDelta:{added:[],exited:[],continued:[],unchangedReasons:[]}};
  const result = JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.legacy_producer_runs_v3_11(
      run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,
      legacy_seed_set_hash,scheduled_occurrence_id,source_cutoff,trading_date,
      trading_session_authority_hash,authority_canonical,authority_json,authority_hash,
      status,started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,
      logical_run_key,attempt
    ) VALUES(
      '51000000-0000-4000-8000-000000000001','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('51000000-0000-4000-8000-000000000010','utf8'),'sha256'),'hex'),
      repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
      ) WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
      'analysis-enum-fixture','2026-08-08T12:00:00Z',NULL,NULL,
      convert_to('{}','utf8'),'{}'::jsonb,
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),
      'running','2026-08-08T12:00:00Z',clock_timestamp(),clock_timestamp()+interval '120 seconds',
      NULL,NULL,repeat('9',64),1
    );
    INSERT INTO public.legacy_producer_jobs_v3_11(
      job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,execution_ordinal,
      revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code
    ) VALUES
      ('51000000-0000-4000-8000-000000000011','51000000-0000-4000-8000-000000000001',
       'facts_refresh','stage_barrier',3,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),
       'succeeded',1,5,NULL,NULL,NULL,NULL,clock_timestamp(),NULL),
      ('51000000-0000-4000-8000-000000000012','51000000-0000-4000-8000-000000000001',
       'analysis_revision','stage_barrier',4,NULL,1,NULL,
       '51000000-0000-4000-8000-000000000011',repeat('2',64),repeat('2',64),
       'leased',1,5,
       encode(extensions.digest(convert_to('51000000-0000-4000-8000-000000000010','utf8'),'sha256'),'hex'),
       clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    WITH facts(value) AS (VALUES(jsonb_build_object(
      'schema','legacy-facts-refresh-result-v3.11','decisions',jsonb_build_array(
        jsonb_build_object('symbol','2330','materialChangeHash',repeat('a',64))
      ),'sourceCandidates','[]'::jsonb,'discoveryDelta',jsonb_build_object(
        'added','[]'::jsonb,'exited','[]'::jsonb,'continued','[]'::jsonb,
        'unchangedReasons','[]'::jsonb
      )
    )))
    INSERT INTO public.legacy_producer_job_results_v3_11(
      job_id,result_canonical,result_json,result_hash
    ) SELECT '51000000-0000-4000-8000-000000000011',convert_to(value::text,'utf8'),value,
      encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex') FROM facts;
    CREATE TEMP TABLE legacy_analysis_complete_capture AS
      WITH output(value) AS (VALUES(${sqlLiteral(JSON.stringify(analysisOutput))}::jsonb))
      SELECT completion.* FROM output CROSS JOIN LATERAL public.complete_legacy_producer_job_v3_11(
        '51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000012',
        '51000000-0000-4000-8000-000000000010',convert_to(output.value::text,'utf8'),output.value,
        encode(extensions.digest(convert_to(output.value::text,'utf8'),'sha256'),'hex')
      ) completion;
    SELECT jsonb_build_object(
      'completion',(SELECT status FROM legacy_analysis_complete_capture),
      'jobStatus',(SELECT status::text FROM public.legacy_producer_jobs_v3_11
        WHERE job_id='51000000-0000-4000-8000-000000000012'),
      'nextStage',(SELECT next_job->>'stage' FROM legacy_analysis_complete_capture),
      'revisionCount',(SELECT count(*) FROM public.legacy_analysis_revisions_v3_11
        WHERE symbol='2330' AND material_change_hash=repeat('a',64)),
      'evaluationDisposition',(SELECT disposition::text FROM public.legacy_analysis_evaluations_v3_11
        WHERE producer_run_id='51000000-0000-4000-8000-000000000001' AND symbol='2330')
    )::text;
    ROLLBACK;
  `, ['-At']).split('\n').find((line) => line.startsWith('{')));
  assert.deepEqual(result, {
    completion: 'running',
    evaluationDisposition: 'material_revision_created',
    jobStatus: 'succeeded',
    nextStage: 'compact_radar_projection',
    revisionCount: 1,
  });
});

test('V3.13 invalid completion is zero-write and analysis claims replay the exact immutable fact payload',()=>{
  const codec=runtime('codec.js');
  const priorFact={symbol:'9196',materialChangeHash:'e'.repeat(64),
    decisionBrief:{action:'wait_reclaim',thesis:['a','b','c'],risks:['d','e','f']},
    analysisGeneratedAt:'2026-08-07T10:20:00Z'};
  const priorBundle=codec.immutableBundle('legacy_analysis_fact_payload_v3_13',priorFact);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.legacy_analysis_revisions_v3_11(revision_id,symbol,source_cutoff,material_change_hash,
      prior_revision_id,research_maturity,formal_research_status,new_position_action,fundamental_snapshot_hash,
      technical_decision_hash,valuation_input_hash,locked_claims,narrative_template_version,sentence_claim_refs,
      narrative,narrative_hash,analysis_generated_at,producer_commit_sha,recorded_at)
    VALUES('51960000-0000-4000-8000-000000000001','9196','2026-08-07T10:20:00Z',repeat('e',64),NULL,
      'source_signal','valuation_review','valuation_review',repeat('1',64),NULL,NULL,'[]','fixture','[]','fixture',
      repeat('2',64),'2026-08-07T10:20:00Z',repeat('a',40),'2026-08-07T10:20:00Z');
    INSERT INTO public.legacy_analysis_revision_payloads_v3_13(revision_id,symbol,material_change_hash,
      payload_canonical,payload_json,payload_sha256,recorded_at)
    VALUES('51960000-0000-4000-8000-000000000001','9196',repeat('e',64),
      decode('${Buffer.from(priorBundle.canonical).toString('hex')}','hex'),${sqlLiteral(priorBundle.canonical)}::jsonb,
      '${priorBundle.hash}','2026-08-07T10:20:00Z');
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,
      worker_sha256,scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,
      scheduled_occurrence_id,source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,
      authority_json,authority_hash,status,started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,
      logical_run_key,attempt)
    VALUES('51960000-0000-4000-8000-000000000010','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('51960000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
      repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols')
        WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','v313-replay',
      '2026-08-08T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),
      clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('3',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES
      ('51960000-0000-4000-8000-000000000011','51960000-0000-4000-8000-000000000010','facts_refresh',
       'stage_barrier',3,NULL,0,NULL,NULL,repeat('4',64),repeat('4',64),'succeeded',1,5,
       NULL,NULL,NULL,NULL,clock_timestamp(),NULL),
      ('51960000-0000-4000-8000-000000000012','51960000-0000-4000-8000-000000000010','analysis_revision',
       'stage_barrier',4,NULL,1,NULL,'51960000-0000-4000-8000-000000000011',repeat('5',64),repeat('5',64),
       'queued',0,5,NULL,NULL,NULL,NULL,NULL,NULL);
    WITH value AS(SELECT jsonb_build_object('schema','legacy-facts-refresh-result-v3.11','decisions',
      jsonb_build_array(jsonb_build_object('symbol','9196','materialChangeHash',repeat('e',64)))) payload)
    INSERT INTO public.legacy_producer_job_results_v3_11(job_id,result_canonical,result_json,result_hash)
    SELECT '51960000-0000-4000-8000-000000000011',convert_to(payload::text,'utf8'),payload,
      encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex') FROM value;
    WITH value AS(SELECT '{}'::jsonb payload)
    INSERT INTO public.legacy_producer_job_payloads_v3_11(job_id,payload_canonical,payload_json,payload_hash)
    SELECT '51960000-0000-4000-8000-000000000012',convert_to(payload::text,'utf8'),payload,
      encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex') FROM value;
    CREATE TEMP TABLE exact_claim AS SELECT * FROM public.claim_legacy_producer_job_v3_11(
      '51960000-0000-4000-8000-000000000010','51960000-0000-4000-8000-000000000012',
      '51960000-0000-4000-8000-000000000099',120);
    CREATE TEMP TABLE invalid_complete AS SELECT * FROM public.complete_legacy_producer_job_v3_11(
      '51960000-0000-4000-8000-000000000010','51960000-0000-4000-8000-000000000012',
      '51960000-0000-4000-8000-000000000098',convert_to('{}','utf8'),'{}'::jsonb,
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'));
    SELECT jsonb_build_object(
      'brief',(SELECT read_json#>>'{priorRevisions,0,facts,decisionBrief,action}' FROM exact_claim),
      'hashValid',(SELECT read_hash=encode(extensions.digest(read_canonical,'sha256'),'hex') FROM exact_claim),
      'invalidRows',(SELECT count(*) FROM invalid_complete),
      'jobStatus',(SELECT status::text FROM public.legacy_producer_jobs_v3_11
        WHERE job_id='51960000-0000-4000-8000-000000000012'),
      'newPayloadRows',(SELECT count(*) FROM public.legacy_analysis_revision_payloads_v3_13
        WHERE revision_id<>'51960000-0000-4000-8000-000000000001'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{brief:'wait_reclaim',hashValid:true,invalidRows:0,jobStatus:'leased',newPayloadRows:0});
});

test('legacy producer advances exactly once for newly recorded material authority outside the scheduled cutoff', () => {
  const result = JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol)
    VALUES('59000000-0000-4000-8000-000000000001','9998');
    INSERT INTO public.stock_instruments_v3(
      instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,
      official_legal_name,official_short_name,provider,source_timestamp,valid_from,
      valid_to,roster_version,recorded_at
    ) VALUES(
      '59000000-0000-4000-8000-000000000002',
      '59000000-0000-4000-8000-000000000001','9998','TWSE','common_stock','active',
      'Material Refresh Fixture','MRF','twse',date_trunc('second',clock_timestamp())-interval '2 seconds',
      '2020-01-01T00:00:00Z',NULL,'tw-instrument-roster-v3.0',
      date_trunc('second',clock_timestamp())-interval '2 seconds'
    );
    WITH first AS MATERIALIZED (
      SELECT * FROM public.resolve_legacy_scheduled_occurrence_v3_11(
        'com.stockinsider.auth-source-worker','1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2'
      )
    ), second AS MATERIALIZED (
      SELECT * FROM public.resolve_legacy_scheduled_occurrence_v3_11(
        'com.stockinsider.auth-source-worker','1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2'
      )
    ) SELECT jsonb_build_object(
      'sameOccurrence',first.scheduled_occurrence_id=second.scheduled_occurrence_id,
      'sameCutoff',first.source_cutoff=second.source_cutoff,
      'includesMaterial',first.source_cutoff>(SELECT recorded_at FROM public.stock_instruments_v3 WHERE symbol='9998'),
      'wholeSecond',date_trunc('second',first.source_cutoff)=first.source_cutoff
    )::text FROM first CROSS JOIN second;
    ROLLBACK;
  `, ['-At']).split('\n').find((line) => line.startsWith('{')));
  assert.deepEqual(result, {
    sameOccurrence: true,
    sameCutoff: true,
    includesMaterial: true,
    wholeSecond: true,
  });
});

test('legacy fact-plane benchmark reads the market observation timestamp contract', () => {
  const benchmarkRows = psql(`
    SELECT (public.read_legacy_candidate_fact_plane_v3_11(
      '2026-07-24T08:00:00Z','{"candidates":[]}'::jsonb
    )->'benchmarkRows')::text;
  `, ['-At']).trim();
  assert.equal(benchmarkRows, '[]');
  const body = sql.match(
    /CREATE OR REPLACE FUNCTION read_legacy_candidate_fact_plane_v3_11[\s\S]*?\nEND \$\$;/u,
  )?.[0] ?? '';
  assert.match(body,
    /row_number\(\) OVER \(PARTITION BY observation[.]session_id ORDER BY observation[.]observed_at DESC,[\s\S]*?FROM public[.]opportunity_market_observations_v3 observation/u,
  );
  assert.doesNotMatch(body,
    /row_number\(\) OVER \(PARTITION BY observation[.]session_id ORDER BY observation[.]source_timestamp DESC,[\s\S]*?FROM public[.]opportunity_market_observations_v3 observation/u,
  );
});

test('legacy producer claim plane carries prior discovery and analysis lineage across successful runs', () => {
  const acquireBody = sql.match(/CREATE OR REPLACE FUNCTION acquire_legacy_producer_lease_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const claimBody = sql.match(/CREATE OR REPLACE FUNCTION claim_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const completionBody = sql.match(/CREATE OR REPLACE FUNCTION complete_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const heartbeatBody = sql.match(/CREATE OR REPLACE FUNCTION heartbeat_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const failBody = sql.match(/CREATE OR REPLACE FUNCTION fail_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const primaryFailBody = sql.match(/CREATE OR REPLACE FUNCTION fail_opportunity_job_v3[\s\S]*?\n\$fn\$;/u)?.[0] ?? '';
  assert.match(claimBody, /'priorLedger'[\s\S]*prior_run[.]status='success'[\s\S]*legacy_candidate_discovery_ledger_v3_11/u);
  assert.match(acquireBody, /producer_commit_sha<>p_commit OR worker_sha256<>p_worker OR scheduler_config_sha256<>p_config_hash[\s\S]*status='cancelled'/u);
  assert.match(claimBody, /UPDATE public[.]legacy_producer_runs_v3_11 SET heartbeat_at=v_now,lease_expires_at=v_now\+interval '120 seconds'/u);
  assert.match(claimBody, /current_setting\('stockinsider[.]legacy_authority_hash',true\) IS DISTINCT FROM v_run[.]authority_hash/u);
  assert.match(claimBody, /jsonb_array_length\(selected_revision_row_json\)=11[\s\S]*?ELSE \(selected_revision_row_json->>5\)::timestamptz/u,
    'claim decoder preserves resumability for pre-migration ten-member frozen rows');
  assert.match(claimBody, /ORDER BY prior_run[.]source_cutoff DESC,prior_run[.]terminal_at DESC,prior_run[.]run_id LIMIT 1/u);
  assert.match(claimBody, /'priorRevisions'[\s\S]*legacy_analysis_revisions_v3_11[\s\S]*revision[.]source_cutoff<v_run[.]source_cutoff/u);
  assert.match(completionBody,
    /WHEN v_revision_created THEN 'material_revision_created'::public[.]opportunity_analysis_evaluation_disposition_v3_11[\s\S]*?ELSE 'no_material_change'::public[.]opportunity_analysis_evaluation_disposition_v3_11/u);
  assert.match(completionBody, /ORDER BY source_cutoff DESC,recorded_at DESC,revision_id LIMIT 1/u);
  assert.doesNotMatch(completionBody, /'material_revision_created',v_run[.]source_cutoff/u);
  assert.match(heartbeatBody, /UPDATE public[.]legacy_producer_runs_v3_11 SET heartbeat_at=/u);
  assert.match(failBody, /lease_expires_at>=v_now/u);
  assert.match(primaryFailBody, /lease_expires_at>=clock_timestamp\(\)/u);
});

test('applied blinded assignment preserves reviewer isolation and audits every success', () => {
  const result = JSON.parse(psql(`
    CREATE TEMP TABLE assignment_test_results(label text PRIMARY KEY,payload jsonb);
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES
      ('30000000-0000-4000-8000-000000000001','link_reviewer','2026-01-01',NULL,'active',repeat('1',64),clock_timestamp()),
      ('30000000-0000-4000-8000-000000000002','link_reviewer','2026-01-01',NULL,'active',repeat('2',64),clock_timestamp()),
      ('30000000-0000-4000-8000-000000000003','link_reviewer','2026-01-01',NULL,'active',repeat('3',64),clock_timestamp()),
      ('30000000-0000-4000-8000-000000000004','link_adjudicator','2026-01-01',NULL,'active',repeat('4',64),clock_timestamp());
    SET session_replication_role=replica;
    INSERT INTO public.opportunity_link_audit_samples(
      sample_manifest_id,sample_id,run_id,claim_id,mention_id,connector,link_mode,
      outcome_family,mention_ordinal,selection_ordinal,selection_hash,evidence_ref,
      review_context,review_mention_start_offset,review_mention_end_offset,
      normalized_token,engine_outcome,engine_reason,engine_canonical_symbol,
      review_evidence_hash,recorded_at
    ) VALUES(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      '31000000-0000-4000-8000-000000000002',
      '31000000-0000-4000-8000-000000000003',
      '31000000-0000-4000-8000-000000000004',
      'threads','ticker','linked',0,0,repeat('b',64),'evidence-1',
      '2330 股票',0,4,'2330','linked_new','explicit_ticker_context','2330',
      encode(extensions.digest(convert_to(jsonb_build_array(
        'link-audit-review-evidence-v3.0',
        '31000000-0000-4000-8000-000000000002'::uuid,
        '31000000-0000-4000-8000-000000000003'::uuid,0,
        jsonb_build_array(
          'threads','evidence-1','2330 股票',0,4,'2330','ticker',
          'linked_new','explicit_ticker_context','2330'
        )
      )::text,'utf8'),'sha256'),'hex'),
      clock_timestamp()
    );
    SET session_replication_role=origin;
    INSERT INTO public.opportunity_link_audit_labels(
      sample_manifest_id,sample_id,label_role,canonical_symbol,no_link,
      reviewer_principal_id,submitted_at,label_hash,recorded_at
    ) VALUES(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      'reviewer_1','2330',false,'30000000-0000-4000-8000-000000000001',
      clock_timestamp(),repeat('c',64),clock_timestamp()
    );
    INSERT INTO assignment_test_results
    SELECT 'reviewer_open',to_jsonb(assignment)
    FROM public.get_link_audit_assignment_v3(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      'link_reviewer','30000000-0000-4000-8000-000000000002',
      '0000000000000001',clock_timestamp()
    ) assignment;
    INSERT INTO public.opportunity_link_audit_labels(
      sample_manifest_id,sample_id,label_role,canonical_symbol,no_link,
      reviewer_principal_id,submitted_at,label_hash,recorded_at
    ) VALUES(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      'reviewer_2',NULL,true,'30000000-0000-4000-8000-000000000002',
      clock_timestamp(),repeat('d',64),clock_timestamp()
    );
    INSERT INTO assignment_test_results
    SELECT 'reviewer_full',to_jsonb(assignment)
    FROM public.get_link_audit_assignment_v3(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      'link_reviewer','30000000-0000-4000-8000-000000000003',
      '0000000000000002',clock_timestamp()
    ) assignment;
    INSERT INTO assignment_test_results
    SELECT 'adjudicator_open',to_jsonb(assignment)
    FROM public.get_link_audit_assignment_v3(
      '31000000-0000-4000-8000-000000000001',repeat('a',64),
      'link_adjudicator','30000000-0000-4000-8000-000000000004',
      '0000000000000003',clock_timestamp()
    ) assignment;
    SELECT jsonb_build_object(
      'reviewerOpen',(SELECT payload FROM assignment_test_results WHERE label='reviewer_open'),
      'reviewerFull',(SELECT payload FROM assignment_test_results WHERE label='reviewer_full'),
      'adjudicatorOpen',(SELECT payload FROM assignment_test_results WHERE label='adjudicator_open'),
      'auditCount',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE function_name='get_link_audit_assignment_v3'
          AND subject_id='31000000-0000-4000-8000-000000000001'),
      'auditDispositions',(SELECT jsonb_agg(disposition ORDER BY recorded_at,audit_id)
        FROM public.opportunity_rpc_audit_v3
        WHERE function_name='get_link_audit_assignment_v3'
          AND subject_id='31000000-0000-4000-8000-000000000001')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.equal(result.reviewerOpen.disposition, 'reviewer_open_slot');
  assert.equal(result.reviewerOpen.assigned_label_role, 'reviewer_2');
  assert.deepEqual([
    result.reviewerOpen.own_canonical_symbol,
    result.reviewerOpen.own_no_link,
    result.reviewerOpen.reviewer_one_canonical_symbol,
    result.reviewerOpen.reviewer_one_no_link,
    result.reviewerOpen.reviewer_two_canonical_symbol,
    result.reviewerOpen.reviewer_two_no_link,
  ], [null, null, null, null, null, null]);
  assert.equal(result.reviewerFull.disposition, 'reviewer_slots_full');
  assert.deepEqual([
    result.reviewerFull.assigned_label_role,
    result.reviewerFull.own_canonical_symbol,
    result.reviewerFull.own_no_link,
    result.reviewerFull.reviewer_one_canonical_symbol,
    result.reviewerFull.reviewer_one_no_link,
    result.reviewerFull.reviewer_two_canonical_symbol,
    result.reviewerFull.reviewer_two_no_link,
  ], [null, null, null, null, null, null, null]);
  assert.equal(result.adjudicatorOpen.disposition, 'adjudicator_open');
  assert.deepEqual([
    result.adjudicatorOpen.assigned_label_role,
    result.adjudicatorOpen.own_canonical_symbol,
    result.adjudicatorOpen.own_no_link,
    result.adjudicatorOpen.reviewer_one_canonical_symbol,
    result.adjudicatorOpen.reviewer_one_no_link,
    result.adjudicatorOpen.reviewer_two_canonical_symbol,
    result.adjudicatorOpen.reviewer_two_no_link,
  ], ['adjudicator', null, null, '2330', false, null, true]);
  assert.equal(result.auditCount, 3);
  assert.deepEqual(result.auditDispositions, [
    'reviewer_open_slot','reviewer_slots_full','adjudicator_open',
  ]);
});

test('applied blinded assignment executes all eight dispositions without cross-principal leakage', () => {
  const result = JSON.parse(psql(`
    CREATE TEMP TABLE assignment_state_results(label text PRIMARY KEY,payload jsonb);
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES
      ('32000000-0000-4000-8000-000000000101','link_reviewer','2026-01-01',NULL,'active',repeat('1',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000102','link_reviewer','2026-01-01',NULL,'active',repeat('2',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000103','link_reviewer','2026-01-01',NULL,'active',repeat('3',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000104','link_adjudicator','2026-01-01',NULL,'active',repeat('4',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000105','link_adjudicator','2026-01-01',NULL,'active',repeat('5',64),clock_timestamp());
    SET session_replication_role=replica;
    INSERT INTO public.opportunity_link_audit_samples(
      sample_manifest_id,sample_id,run_id,claim_id,mention_id,connector,link_mode,
      outcome_family,mention_ordinal,selection_ordinal,selection_hash,evidence_ref,
      review_context,review_mention_start_offset,review_mention_end_offset,
      normalized_token,engine_outcome,engine_reason,engine_canonical_symbol,
      review_evidence_hash,recorded_at
    )
    SELECT
      ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      repeat(to_hex(n),64),
      ('32000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
      ('32000000-0000-4000-8002-'||lpad(n::text,12,'0'))::uuid,
      ('32000000-0000-4000-8003-'||lpad(n::text,12,'0'))::uuid,
      'threads','ticker','linked',0,n,repeat('a',64),'evidence-'||n,
      '2330 股票',0,4,'2330','linked_new','explicit_ticker_context','2330',
      encode(extensions.digest(convert_to(jsonb_build_array(
        'link-audit-review-evidence-v3.0',
        ('32000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,
        ('32000000-0000-4000-8002-'||lpad(n::text,12,'0'))::uuid,0,
        jsonb_build_array(
          'threads','evidence-'||n,'2330 股票',0,4,'2330','ticker',
          'linked_new','explicit_ticker_context','2330'
        )
      )::text,'utf8'),'sha256'),'hex'),
      clock_timestamp()
    FROM generate_series(1,8) n;
    SET session_replication_role=origin;
    INSERT INTO public.opportunity_link_audit_labels(
      sample_manifest_id,sample_id,label_role,canonical_symbol,no_link,
      reviewer_principal_id,submitted_at,label_hash,recorded_at
    ) VALUES
      ('32000000-0000-4000-8000-000000000002',repeat('2',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('1',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000003',repeat('3',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('2',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000003',repeat('3',64),'reviewer_2',NULL,true,'32000000-0000-4000-8000-000000000102',clock_timestamp(),repeat('3',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000004',repeat('4',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('4',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000005',repeat('5',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('5',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000005',repeat('5',64),'reviewer_2','2330',false,'32000000-0000-4000-8000-000000000102',clock_timestamp(),repeat('6',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000006',repeat('6',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('7',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000006',repeat('6',64),'reviewer_2',NULL,true,'32000000-0000-4000-8000-000000000102',clock_timestamp(),repeat('8',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000007',repeat('7',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('9',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000007',repeat('7',64),'reviewer_2',NULL,true,'32000000-0000-4000-8000-000000000102',clock_timestamp(),repeat('a',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000007',repeat('7',64),'adjudicator','2330',false,'32000000-0000-4000-8000-000000000104',clock_timestamp(),repeat('b',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000008',repeat('8',64),'reviewer_1','2330',false,'32000000-0000-4000-8000-000000000101',clock_timestamp(),repeat('c',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000008',repeat('8',64),'reviewer_2',NULL,true,'32000000-0000-4000-8000-000000000102',clock_timestamp(),repeat('d',64),clock_timestamp()),
      ('32000000-0000-4000-8000-000000000008',repeat('8',64),'adjudicator','2330',false,'32000000-0000-4000-8000-000000000104',clock_timestamp(),repeat('e',64),clock_timestamp());
    INSERT INTO assignment_state_results
    SELECT requested.label,to_jsonb(assignment)
    FROM (VALUES
      ('reviewer_open',1,'link_reviewer'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000101'::uuid),
      ('reviewer_existing',2,'link_reviewer'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000101'::uuid),
      ('reviewer_full',3,'link_reviewer'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000103'::uuid),
      ('adjudication_pending',4,'link_adjudicator'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000104'::uuid),
      ('adjudication_not_required',5,'link_adjudicator'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000104'::uuid),
      ('adjudicator_open',6,'link_adjudicator'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000104'::uuid),
      ('adjudicator_existing',7,'link_adjudicator'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000104'::uuid),
      ('adjudication_completed',8,'link_adjudicator'::public.internal_principal_role_v3,'32000000-0000-4000-8000-000000000105'::uuid)
    ) requested(label,n,role,principal)
    CROSS JOIN LATERAL public.get_link_audit_assignment_v3(
      ('32000000-0000-4000-8000-'||lpad(requested.n::text,12,'0'))::uuid,
      repeat(to_hex(requested.n),64),requested.role,requested.principal,
      lpad(requested.n::text,16,'0'),clock_timestamp()
    ) assignment;
    SELECT jsonb_build_object(
      'dispositions',(SELECT jsonb_object_agg(label,payload->>'disposition')
        FROM assignment_state_results),
      'reviewerExisting',(SELECT payload FROM assignment_state_results
        WHERE label='reviewer_existing'),
      'adjudicatorExisting',(SELECT payload FROM assignment_state_results
        WHERE label='adjudicator_existing'),
      'completed',(SELECT payload FROM assignment_state_results
        WHERE label='adjudication_completed'),
      'nullOnlyCount',(SELECT count(*) FROM assignment_state_results
        WHERE label IN (
          'reviewer_full','adjudication_pending','adjudication_not_required',
          'adjudication_completed'
        )
        AND payload->'assigned_label_role'='null'::jsonb
        AND payload->'own_canonical_symbol'='null'::jsonb
        AND payload->'own_no_link'='null'::jsonb
        AND payload->'reviewer_one_canonical_symbol'='null'::jsonb
        AND payload->'reviewer_one_no_link'='null'::jsonb
        AND payload->'reviewer_two_canonical_symbol'='null'::jsonb
        AND payload->'reviewer_two_no_link'='null'::jsonb),
      'auditDispositions',(SELECT jsonb_agg(disposition ORDER BY recorded_at,audit_id)
        FROM public.opportunity_rpc_audit_v3
        WHERE caller_principal_id::text LIKE '32000000-0000-4000-8000-00000000010%')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.deepEqual(result.dispositions, {
    reviewer_open: 'reviewer_open_slot',
    reviewer_existing: 'reviewer_existing_label',
    reviewer_full: 'reviewer_slots_full',
    adjudication_pending: 'adjudication_pending',
    adjudication_not_required: 'adjudication_not_required',
    adjudicator_open: 'adjudicator_open',
    adjudicator_existing: 'adjudicator_existing_label',
    adjudication_completed: 'adjudication_completed',
  });
  assert.equal(result.reviewerExisting.own_canonical_symbol, '2330');
  assert.equal(result.reviewerExisting.reviewer_one_canonical_symbol, null);
  assert.deepEqual([
    result.adjudicatorExisting.assigned_label_role,
    result.adjudicatorExisting.own_canonical_symbol,
    result.adjudicatorExisting.reviewer_one_canonical_symbol,
    result.adjudicatorExisting.reviewer_two_no_link,
  ], ['adjudicator','2330','2330',true]);
  assert.equal(result.nullOnlyCount, 4);
  assert.deepEqual([
    result.completed.assigned_label_role,
    result.completed.own_canonical_symbol,
    result.completed.reviewer_one_canonical_symbol,
    result.completed.reviewer_two_no_link,
  ], [null,null,null,null]);
  assert.equal(result.auditDispositions.length, 8);
});

test('applied catalog has the closed section enum, RLS and security-barrier view options', () => {
  const catalog = psql(`
    SELECT jsonb_build_object(
      'sections',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
        FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
        WHERE t.typname='opportunity_manifest_section_key_v3'),
      'rlsDisabled',(SELECT coalesce(jsonb_agg(c.relname ORDER BY c.relname),'[]'::jsonb)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r'
          AND (c.relname LIKE 'opportunity_%_v3' OR c.relname IN (
            'opportunity_runs','opportunity_run_inputs','opportunity_run_manifest_inputs',
            'opportunity_source_connector_accounting','opportunity_source_document_outcomes',
            'opportunity_source_claims','opportunity_source_mentions','opportunity_candidate_snapshots',
            'opportunity_market_context_snapshots','opportunity_sector_cycle_snapshots',
            'opportunity_score_snapshots','opportunity_outcomes','opportunity_link_audit_samples',
            'opportunity_link_audit_labels'
          )) AND NOT c.relrowsecurity),
      'workerOptions',(SELECT to_jsonb(c.reloptions)
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='opportunity_worker_read_units_v3')
    )::text;
  `, ['-At']).trim();
  const decoded = JSON.parse(catalog);
  assert.deepEqual(decoded.sections.slice(-3), ['samples', 'resolved_rows', 'unresolved_rows']);
  assert.deepEqual(decoded.rlsDisabled, []);
  assert.deepEqual(decoded.workerOptions.sort(), ['security_barrier=true', 'security_invoker=false']);
});

test('applied catalog exposes exact composite arities, named indexes and primary-key coverage', () => {
  const sourceCatalogFixtureBytes=fs.readFileSync(path.join(root,'scripts/opportunity-v3/fixtures/v313-source-plane-catalog-v1.json'));
  assert.equal(createHash('sha256').update(sourceCatalogFixtureBytes).digest('hex'),
    '43a951d6f087eebc8aed8a8a02bccbdef886577dd0c22c50bb4ca07fac221569');
  const { schema:sourceCatalogSchema,...expectedSourceCatalog }=JSON.parse(sourceCatalogFixtureBytes);
  assert.equal(sourceCatalogSchema,'v313-source-plane-catalog-oracle-v1');
  const sourceTables=Object.keys(expectedSourceCatalog.columns);
  const expectedCompositeArities = Object.fromEntries([
    ['source_identity_authority_input_v3', 7],
    ['publisher_authority_input_v3', 8],
    ['manual_alias_authority_input_v3', 6],
    ['peer_reviewer_authority_input_v3', 4],
    ['peer_relationship_authority_input_v3', 7],
    ['valuation_verification_input_v3', 7],
    ['assistive_artifact_registration_input_v3', 13],
    ['instrument_authority_input_v3', 12],
    ['sector_assignment_input_v3', 10],
    ['source_document_revision_input_v3', 14],
    ['trading_session_input_v3', 9],
    ['price_observation_input_v3', 14],
    ['corporate_action_feed_evidence_input_v3', 4],
    ['corporate_action_event_input_v3', 6],
    ['corporate_action_snapshot_input_v3', 9],
    ['exchange_reported_pe_input_v3', 9],
    ['price_authority_input_v3', 4],
    ['market_observation_input_v3', 17],
    ['stock_flow_observation_input_v3', 12],
    ['financial_fact_input_v3', 16],
    ['opportunity_manifest_row_input_v3', 6],
    ['opportunity_job_counts_v3', 16],
  ]);
  const expectedIndexes = [
    'internal_principal_role_bindings_v3_lookup', 'internal_principal_nonces_v3_expiry',
    'opportunity_rpc_audit_v3_function_time', 'source_identity_authorities_v3_stream',
    'opportunity_authority_stream_registry_v3_lookup', 'source_document_revisions_v3_stream',
    'stock_instruments_v3_stream', 'stock_sector_assignments_v3_stream',
    'opportunity_financial_facts_v3_point_in_time',
    'publisher_verification_authorities_v3_stream', 'stock_aliases_v3_lookup',
    'stock_aliases_v3_stream',
    'stock_peer_relationship_reviewers_v3_stream', 'stock_peer_relationships_v3_stream',
    'valuation_verifications_v3_selection', 'tw_trading_sessions_v3_stream',
    'tw_trading_sessions_v3_recorded', 'tw_trading_sessions_v3_completed',
    'opportunity_exchange_reported_pe_v3_stock_session','opportunity_exchange_reported_pe_v3_session_roster',
    'opportunity_stock_flow_observations_v3_stream',
    'opportunity_corporate_action_snapshots_v3_stream',
    'opportunity_corporate_action_snapshots_v3_cutoff',
    'opportunity_corporate_action_events_v3_symbol', 'opportunity_runs_one_active_preparation_v3',
    'opportunity_runs_projection_v3', 'opportunity_run_jobs_v3_queue',
  ];
  const expectedIndexShapes = {
    opportunity_authority_stream_registry_v3_lookup: [
      ['family', 'asc'], ['stream_key_hash', 'asc'], ['stream_key_canonical', 'asc'],
    ],
    source_identity_authorities_v3_stream: [
      ['source_identity_id', 'asc'], ['recorded_at', 'desc'], ['authority_id', 'asc'],
    ],
    publisher_verification_authorities_v3_stream: [
      ['publisher_identity_id', 'asc'], ['recorded_at', 'desc'], ['authority_id', 'asc'],
    ],
    stock_instruments_v3_stream: [
      ['stock_id', 'asc'], ['recorded_at', 'desc'], ['instrument_authority_id', 'asc'],
    ],
    stock_aliases_v3_stream: [
      ['stock_id', 'asc'], ['normalized_alias', 'asc'], ['source', 'asc'],
      ['recorded_at', 'desc'], ['alias_authority_id', 'asc'],
    ],
    stock_sector_assignments_v3_stream: [
      ['stock_id', 'asc'], ['market', 'asc'], ['recorded_at', 'desc'],
      ['assignment_authority_id', 'asc'],
    ],
    stock_peer_relationship_reviewers_v3_stream: [
      ['reviewer_principal_id', 'asc'], ['recorded_at', 'desc'],
      ['reviewer_authority_id', 'asc'],
    ],
    stock_peer_relationships_v3_stream: [
      ['supplier_stock_id', 'asc'], ['customer_stock_id', 'asc'],
      ['relationship_kind', 'asc'], ['recorded_at', 'desc'],
      ['relationship_authority_id', 'asc'],
    ],
    tw_trading_sessions_v3_stream: [
      ['market', 'asc'], ['session_id', 'asc'], ['recorded_at', 'desc'],
      ['session_authority_id', 'asc'],
    ],
    tw_trading_sessions_v3_recorded: [
      ['recorded_at', 'asc'], ['market', 'asc'], ['session_id', 'asc'],
    ],
    tw_trading_sessions_v3_completed: [
      ['status', 'asc'], ['close_at', 'desc'], ['recorded_at', 'asc'],
    ],
  };
  const catalog = JSON.parse(psql(`
    WITH composite_counts AS (
      SELECT t.typname,count(a.attnum)::integer AS arity
      FROM pg_type t
      JOIN pg_namespace n ON n.oid=t.typnamespace
      JOIN pg_class c ON c.oid=t.typrelid
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      WHERE n.nspname='public' AND t.typname IN (${Object.keys(expectedCompositeArities).map((name) => `'${name}'`).join(',')})
      GROUP BY t.typname
    ), index_shapes AS (
      SELECT index_class.relname AS index_name,
        jsonb_agg(jsonb_build_array(
          attribute.attname,
          CASE WHEN (index_row.indoption[key.ordinality-1] & 1)=1
            THEN 'desc' ELSE 'asc' END
        ) ORDER BY key.ordinality) AS shape
      FROM pg_index index_row
      JOIN pg_class index_class ON index_class.oid=index_row.indexrelid
      JOIN pg_namespace index_namespace ON index_namespace.oid=index_class.relnamespace
      CROSS JOIN LATERAL unnest(index_row.indkey) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute attribute
        ON attribute.attrelid=index_row.indrelid AND attribute.attnum=key.attnum
      WHERE index_namespace.nspname='public'
        AND index_class.relname IN (${Object.keys(expectedIndexShapes).map((name) => `'${name}'`).join(',')})
      GROUP BY index_class.relname
    ), calendar_support AS (
      SELECT index_class.relname
      FROM pg_index index_row
      JOIN pg_class index_class ON index_class.oid=index_row.indexrelid
      JOIN pg_class table_class ON table_class.oid=index_row.indrelid
      JOIN pg_namespace table_namespace ON table_namespace.oid=table_class.relnamespace
      WHERE table_namespace.nspname='public'
        AND table_class.relname='tw_trading_sessions_v3'
        AND NOT index_row.indisprimary
        AND NOT EXISTS (
          SELECT 1 FROM pg_constraint constraint_row
          WHERE constraint_row.conindid=index_row.indexrelid
        )
    )
    SELECT jsonb_build_object(
      'composites',(SELECT jsonb_object_agg(typname,arity) FROM composite_counts),
      'indexShapes',(SELECT jsonb_object_agg(index_name,shape) FROM index_shapes),
      'calendarSupport',(SELECT jsonb_agg(relname ORDER BY relname) FROM calendar_support),
      'missingIndexes',(SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb)
        FROM unnest(ARRAY[${expectedIndexes.map((name) => `'${name}'`).join(',')}]) name
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='i' AND c.relname=name
        )),
      'missingPrimaryKeys',(SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb)
        FROM unnest(ARRAY[${tables.map((name) => `'${name}'`).join(',')}]) name
        WHERE NOT EXISTS (
          SELECT 1 FROM pg_constraint k
          JOIN pg_class c ON c.oid=k.conrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=name AND k.contype='p'
        ))
    )::text;
  `, ['-At']).trim());
  assert.deepEqual(catalog.composites, expectedCompositeArities);
  assert.deepEqual(catalog.indexShapes, expectedIndexShapes);
  assert.deepEqual(catalog.calendarSupport, [
    'tw_trading_sessions_v3_completed',
    'tw_trading_sessions_v3_recorded',
    'tw_trading_sessions_v3_stream',
  ]);
  assert.deepEqual(catalog.missingIndexes, []);
  assert.deepEqual(catalog.missingPrimaryKeys, []);
    const sourceCatalog=JSON.parse(psql(`
    WITH requested(table_name) AS (SELECT unnest(ARRAY[${sourceTables.map((name)=>`'${name}'`).join(',')}])::text),
    source_shapes AS (
      SELECT class.relname,
        count(DISTINCT constraint_row.oid) FILTER(WHERE constraint_row.contype='p') primary_count,
        count(DISTINCT constraint_row.oid) FILTER(WHERE constraint_row.contype='f') foreign_count,
        count(DISTINCT constraint_row.oid) FILTER(WHERE constraint_row.contype='c') check_count,
        count(DISTINCT trigger.oid) FILTER(WHERE trigger.tgname LIKE '%_immutable') immutable_count
      FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN requested ON requested.table_name=class.relname
      LEFT JOIN pg_constraint constraint_row ON constraint_row.conrelid=class.oid
      LEFT JOIN pg_trigger trigger ON trigger.tgrelid=class.oid AND NOT trigger.tgisinternal
      WHERE namespace.nspname='public' GROUP BY class.relname
    ), source_constraints AS (
      SELECT class.relname,jsonb_agg(jsonb_build_array(constraint_row.contype,
        pg_get_constraintdef(constraint_row.oid,true))
        ORDER BY constraint_row.contype,pg_get_constraintdef(constraint_row.oid,true)) definitions
      FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN requested ON requested.table_name=class.relname
      JOIN pg_constraint constraint_row ON constraint_row.conrelid=class.oid
      WHERE namespace.nspname='public' GROUP BY class.relname
    ), source_triggers AS (
      SELECT class.relname,jsonb_agg(jsonb_build_array(trigger.tgname,trigger.tgtype,
        function_namespace.nspname||'.'||function.proname,encode(trigger.tgargs,'hex'),trigger.tgenabled,
        pg_get_triggerdef(trigger.oid,true),coalesce(pg_get_expr(trigger.tgqual,trigger.tgrelid),''))
        ORDER BY trigger.tgname) definitions
      FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN requested ON requested.table_name=class.relname
      JOIN pg_trigger trigger ON trigger.tgrelid=class.oid AND NOT trigger.tgisinternal
      JOIN pg_proc function ON function.oid=trigger.tgfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid=function.pronamespace
      WHERE namespace.nspname='public' GROUP BY class.relname
    ), source_acl AS (
      SELECT class.relname,coalesce(jsonb_agg(jsonb_build_array(coalesce(grantee.rolname,'PUBLIC'),
        privilege.privilege_type,privilege.is_grantable)
        ORDER BY coalesce(grantee.rolname,'PUBLIC'),privilege.privilege_type)
        FILTER(WHERE privilege.grantee IS DISTINCT FROM class.relowner),'[]'::jsonb) grants
      FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN requested ON requested.table_name=class.relname
      LEFT JOIN LATERAL aclexplode(class.relacl) privilege ON true
      LEFT JOIN pg_roles grantee ON grantee.oid=privilege.grantee
      WHERE namespace.nspname='public' GROUP BY class.relname
    )
    SELECT jsonb_build_object(
      'columns',(SELECT jsonb_object_agg(table_name,columns ORDER BY table_name) FROM (
        SELECT column_row.table_name,jsonb_agg(jsonb_build_array(column_row.column_name,column_row.udt_name,
          column_row.is_nullable,column_row.column_default) ORDER BY column_row.ordinal_position) columns
        FROM information_schema.columns column_row JOIN requested USING(table_name)
        WHERE column_row.table_schema='public' GROUP BY column_row.table_name
      ) shaped),
      'security',(SELECT jsonb_object_agg(class.relname,jsonb_build_array(role.rolname,class.relrowsecurity,
        class.relforcerowsecurity,(SELECT count(*) FROM pg_policy policy WHERE policy.polrelid=class.oid),
        has_table_privilege('service_role',class.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
        has_table_privilege('anon',class.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
        has_table_privilege('authenticated',class.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) ORDER BY class.relname)
        FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
        JOIN pg_roles role ON role.oid=class.relowner JOIN requested ON requested.table_name=class.relname
        WHERE namespace.nspname='public'),
      'shape',(SELECT jsonb_object_agg(relname,jsonb_build_array(primary_count,foreign_count,
        check_count,immutable_count) ORDER BY relname) FROM source_shapes),
      'constraints',(SELECT jsonb_object_agg(relname,definitions ORDER BY relname) FROM source_constraints),
      'triggers',(SELECT coalesce(jsonb_object_agg(relname,definitions ORDER BY relname),'{}'::jsonb) FROM source_triggers),
      'acl',(SELECT jsonb_object_agg(relname,grants ORDER BY relname) FROM source_acl)
    )::text;
  `,['-At']).trim());
  assert.deepEqual(sourceCatalog,expectedSourceCatalog,
    'all eight source relations byte-match the independent columns/constraints/triggers/RLS/owner/ACL oracle');
  const sourceContractSql=decisionIntegritySql.replace(/\s+/gu,' ');
  for(const required of [
    "successful_empty' OR (response_kind='http_response' AND response_status_code BETWEEN 200 AND 299",
    "metadata_only' OR (response_kind='http_response' AND response_status_code BETWEEN 200 AND 299",
    "auth_failed' OR ((response_kind='configuration' AND response_status_code IS NULL)",
    "missing_endpoint' OR ((response_kind='configuration' AND response_status_code IS NULL)",
    "provider_failed' OR response_kind='transport_error'",
    "new_revision_count+unchanged_count+deferred_count+rejected_count=acquired_document_count",
    "distribution_identity=source_key::text||':'||profile_id",
  ]) assert.ok(sourceContractSql.includes(required),`missing normative source constraint: ${required}`);
  const sessionPlan = psql(`
    SET enable_seqscan=off;
    EXPLAIN (FORMAT JSON)
    SELECT session_authority_id
    FROM public.tw_trading_sessions_v3
    WHERE market='TWSE' AND session_id='2026-07-24'
    ORDER BY recorded_at DESC,session_authority_id
    LIMIT 1025;
  `, ['-At']);
  assert.match(sessionPlan, /tw_trading_sessions_v3_stream/u);
  assert.doesNotMatch(sessionPlan, /"Node Type": "Seq Scan"/u);
  const registryPlan = psql(`
    SET enable_seqscan=off;
    EXPLAIN (FORMAT JSON)
    SELECT stream_key_hash,stream_key_canonical
    FROM public.opportunity_authority_stream_registry_v3
    WHERE family='stock_alias'
    ORDER BY stream_key_hash,stream_key_canonical
    LIMIT 100001;
  `, ['-At']);
  assert.match(registryPlan, /opportunity_authority_stream_registry_v3_lookup/u);
  assert.doesNotMatch(registryPlan, /"Node Type": "Seq Scan"/u);
  const authorityStreamPlans = [
    [
      'source_identity_authorities_v3_stream',
      `SELECT authority_id
       FROM public.source_identity_authorities_v3
       WHERE source_identity_id='42000000-0000-4000-8000-000000000001'
       ORDER BY recorded_at DESC,authority_id
       LIMIT 65`,
    ],
    [
      'publisher_verification_authorities_v3_stream',
      `SELECT authority_id
       FROM public.publisher_verification_authorities_v3
       WHERE publisher_identity_id='42000000-0000-4000-8000-000000000001'
       ORDER BY recorded_at DESC,authority_id
       LIMIT 65`,
    ],
    [
      'stock_instruments_v3_stream',
      `SELECT instrument_authority_id
       FROM public.stock_instruments_v3
       WHERE stock_id='42000000-0000-4000-8000-000000000001'
       ORDER BY recorded_at DESC,instrument_authority_id
       LIMIT 65`,
    ],
    [
      'stock_aliases_v3_stream',
      `SELECT alias_authority_id
       FROM public.stock_aliases_v3
       WHERE stock_id='42000000-0000-4000-8000-000000000001'
         AND normalized_alias='stream boundary alias'
         AND source='manual_review'
       ORDER BY recorded_at DESC,alias_authority_id
       LIMIT 65`,
    ],
    [
      'stock_sector_assignments_v3_stream',
      `SELECT assignment_authority_id
       FROM public.stock_sector_assignments_v3
       WHERE stock_id='42000000-0000-4000-8000-000000000001'
         AND market='TWSE'
       ORDER BY recorded_at DESC,assignment_authority_id
       LIMIT 65`,
    ],
    [
      'stock_peer_relationship_reviewers_v3_stream',
      `SELECT reviewer_authority_id
       FROM public.stock_peer_relationship_reviewers_v3
       WHERE reviewer_principal_id='42000000-0000-4000-8000-000000000001'
       ORDER BY recorded_at DESC,reviewer_authority_id
       LIMIT 65`,
    ],
    [
      'stock_peer_relationships_v3_stream',
      `SELECT relationship_authority_id
       FROM public.stock_peer_relationships_v3
       WHERE supplier_stock_id='42000000-0000-4000-8000-000000000001'
         AND customer_stock_id='42000000-0000-4000-8000-000000000002'
         AND relationship_kind='supply_chain'
       ORDER BY recorded_at DESC,relationship_authority_id
       LIMIT 65`,
    ],
  ];
  for (const [indexName, query] of authorityStreamPlans) {
    const plan = psql(`
      SET enable_seqscan=off;
      SET enable_bitmapscan=off;
      SET enable_sort=off;
      EXPLAIN (FORMAT JSON)
      ${query};
    `, ['-At']);
    assert.match(plan, new RegExp(indexName, 'u'), `${indexName} must serve its bounded stream query`);
    assert.doesNotMatch(plan, /"Node Type": "Seq Scan"/u, `${indexName} query must not seq scan`);
  }
  const registryFamilies = [
    ['discovery_identity', 10001],
    ['publisher_verification', 10001],
    ['instrument_roster', 20001],
    ['stock_alias', 100001],
    ['sector_assignment', 20001],
    ['peer_reviewer', 1001],
    ['peer_relationship', 100001],
  ];
  for (const [family, limit] of registryFamilies) {
    const plan = psql(`
      SET enable_seqscan=off;
      SET enable_bitmapscan=off;
      SET enable_sort=off;
      EXPLAIN (FORMAT JSON)
      SELECT stream_key_hash,stream_key_canonical
      FROM public.opportunity_authority_stream_registry_v3
      WHERE family='${family}'
      ORDER BY stream_key_hash,stream_key_canonical
      LIMIT ${limit};
    `, ['-At']);
    assert.match(plan, /opportunity_authority_stream_registry_v3_lookup/u);
    assert.doesNotMatch(plan, /"Node Type": "Seq Scan"/u);
  }
});

test('manifest v3.14 persistence and Taiwan calendar expose their exact durable catalog', () => {
  const catalog = JSON.parse(psql(`
    WITH requested_relations(name) AS (
      VALUES
        ('opportunity_manifests_v3'),
        ('opportunity_manifest_pages_v3'),
        ('opportunity_manifest_rows_v3'),
        ('opportunity_effective_taiwan_sessions_v3')
    ), relation_columns AS (
      SELECT c.relname,
        jsonb_agg(jsonb_build_array(
          a.attname,
          pg_catalog.format_type(a.atttypid,a.atttypmod),
          a.attnotnull
        ) ORDER BY a.attnum) AS columns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a
        ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      JOIN requested_relations requested ON requested.name=c.relname
      WHERE n.nspname='public'
      GROUP BY c.relname
    ), manifest_constraints AS (
      SELECT c.relname,
        jsonb_agg(jsonb_build_array(
          constraint_row.contype,
          pg_get_constraintdef(constraint_row.oid,true),
          constraint_row.condeferrable,
          constraint_row.condeferred
        ) ORDER BY constraint_row.contype,constraint_row.conname) AS constraints
      FROM pg_constraint constraint_row
      JOIN pg_class c ON c.oid=constraint_row.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN (
        'opportunity_manifests_v3',
        'opportunity_manifest_pages_v3','opportunity_manifest_rows_v3'
      )
      GROUP BY c.relname
    )
    SELECT jsonb_build_object(
      'columns',(SELECT jsonb_object_agg(relname,columns) FROM relation_columns),
      'constraints',(SELECT jsonb_object_agg(relname,constraints) FROM manifest_constraints),
      'indexes',(SELECT jsonb_agg(index_class.relname ORDER BY index_class.relname)
        FROM pg_index index_row
        JOIN pg_class index_class ON index_class.oid=index_row.indexrelid
        JOIN pg_class table_class ON table_class.oid=index_row.indrelid
        JOIN pg_namespace namespace ON namespace.oid=table_class.relnamespace
        WHERE namespace.nspname='public'
          AND table_class.relname IN (
            'opportunity_manifests_v3',
            'opportunity_manifest_pages_v3','opportunity_manifest_rows_v3'
          )
          AND NOT index_row.indisprimary),
      'triggers',(SELECT jsonb_agg(jsonb_build_array(
          trigger_row.tgname,
          pg_get_triggerdef(trigger_row.oid,true)
        ) ORDER BY trigger_row.tgname)
        FROM pg_trigger trigger_row
        JOIN pg_class table_class ON table_class.oid=trigger_row.tgrelid
        JOIN pg_namespace namespace ON namespace.oid=table_class.relnamespace
        WHERE namespace.nspname='public' AND NOT trigger_row.tgisinternal
          AND table_class.relname IN (
            'opportunity_manifests_v3',
            'opportunity_manifest_pages_v3','opportunity_manifest_rows_v3'
          )),
      'lifecycleValidator',(SELECT pg_get_functiondef(procedure.oid)
        FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='public'
          AND procedure.proname='validate_opportunity_manifest_lifecycle_v3'),
      'validator',(SELECT pg_get_functiondef(procedure.oid)
        FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='public'
          AND procedure.proname='validate_opportunity_manifest_page_rows_v3')
    )::text;
	  `, ['-At']).trim());
  assert.deepEqual(catalog.columns.opportunity_manifests_v3, [
    ['manifest_id', 'uuid', true],
    ['manifest_kind', 'opportunity_manifest_kind_v3', true],
    ['contract_version', 'text', true],
    ['source_cutoff', 'timestamp with time zone', false],
    ['header_canonical', 'bytea', true],
    ['header_json', 'jsonb', true],
    ['status', 'opportunity_manifest_status_v3', true],
    ['row_count', 'bigint', false],
    ['root_canonical', 'bytea', false],
    ['root_json', 'jsonb', false],
    ['manifest_hash', 'text', false],
    ['failure_code', 'opportunity_manifest_failure_code_v3', false],
    ['created_at', 'timestamp with time zone', true],
    ['terminal_at', 'timestamp with time zone', false],
    ['recorded_at', 'timestamp with time zone', true],
  ]);
  assert.deepEqual(catalog.columns.opportunity_manifest_pages_v3, [
    ['page_id', 'uuid', true],
    ['manifest_id', 'uuid', true],
    ['section_key', 'opportunity_manifest_section_key_v3', true],
    ['page_ordinal', 'integer', true],
    ['first_row_ordinal', 'bigint', true],
    ['row_count', 'integer', true],
    ['first_identity', 'text', true],
    ['last_identity', 'text', true],
    ['page_canonical', 'bytea', true],
    ['page_json', 'jsonb', true],
    ['page_hash', 'text', true],
    ['recorded_at', 'timestamp with time zone', true],
  ]);
  assert.deepEqual(catalog.columns.opportunity_manifest_rows_v3, [
    ['manifest_id', 'uuid', true],
    ['page_id', 'uuid', true],
    ['section_key', 'opportunity_manifest_section_key_v3', true],
    ['row_ordinal', 'bigint', true],
    ['identity_key', 'text', true],
    ['terminal_code', 'text', false],
    ['lookup_symbol', 'text', false],
    ['lookup_session', 'date', false],
    ['payload_json', 'jsonb', true],
    ['payload_canonical', 'bytea', true],
    ['payload_hash', 'text', true],
    ['recorded_at', 'timestamp with time zone', true],
  ]);
  assert.deepEqual(catalog.columns.opportunity_effective_taiwan_sessions_v3, [
    ['session_id', 'date', false],
    ['open_at', 'timestamp with time zone', false],
    ['close_at', 'timestamp with time zone', false],
    ['taiwan_session_authority_hash', 'text', false],
    ['canonical_cutoff', 'timestamp with time zone', false],
  ]);
  assert.deepEqual(catalog.indexes, [
    'opportunity_manifest_pages_v3_lookup',
    'opportunity_manifest_pages_v3_manifest_id_page_id_section_k_key',
    'opportunity_manifest_pages_v3_manifest_id_section_key_first_key',
    'opportunity_manifest_pages_v3_manifest_id_section_key_page__key',
    'opportunity_manifest_rows_v3_manifest_id_section_key_identi_key',
    'opportunity_manifest_rows_v3_page_id_row_ordinal_key',
    'opportunity_manifest_rows_v3_session',
    'opportunity_manifest_rows_v3_symbol_session',
    'opportunity_manifests_v3_complete_manifest_hash',
  ]);
  assert.equal(
    catalog.constraints.opportunity_manifest_rows_v3.filter(
      ([type, definition, deferrable, deferred]) => type === 'f'
        && definition.includes('(manifest_id, page_id, section_key)')
        && definition.includes('opportunity_manifest_pages_v3')
        && deferrable && deferred,
    ).length,
    1,
  );
  assert.deepEqual(catalog.triggers.map(([name]) => name), [
    'opportunity_manifest_page_rows_v3_page_check',
    'opportunity_manifest_page_rows_v3_row_check',
    'opportunity_manifest_pages_v3_immutable',
    'opportunity_manifest_rows_v3_immutable',
    'opportunity_manifests_v3_lifecycle',
  ]);
  assert.equal(
    catalog.triggers.filter(([, definition]) => /DEFERRABLE INITIALLY DEFERRED/u.test(definition)).length,
    2,
  );
  assert.equal(
    catalog.triggers.filter(([, definition]) => /validate_opportunity_manifest_lifecycle_v3/u.test(definition)).length,
    3,
  );
  assert.equal(
    catalog.triggers.filter(([, definition]) => /validate_opportunity_manifest_page_rows_v3/u.test(definition)).length,
    2,
  );
  assert.match(catalog.lifecycleValidator, /OLD\.status<>'building'/u);
  assert.match(catalog.lifecycleValidator, /NEW\.manifest_kind<>OLD\.manifest_kind/u);
  assert.match(catalog.lifecycleValidator, /NEW\.created_at<>OLD\.created_at/u);
  assert.match(catalog.lifecycleValidator, /extensions\.digest\(NEW\.root_canonical,'sha256'\)/u);
  assert.match(catalog.validator, /terminal_code IS DISTINCT FROM v_expected_terminal/u);
  assert.match(catalog.validator, /lookup_symbol IS DISTINCT FROM v_expected_symbol/u);
  assert.match(catalog.validator, /lookup_session IS DISTINCT FROM v_expected_session/u);
  assert.match(catalog.validator, /octet_length\(v_page\.page_canonical\)/u);
});

test('Taiwan calendar v3.4 resolves two completed equal schedules and begin re-resolves the exact cutoff', () => {
  const output = psql(`
    BEGIN;
    SET LOCAL TIME ZONE 'Asia/Taipei';
    CREATE TEMP TABLE calendar_assertions(
      cancelled_absent boolean,
      mismatch_rejected boolean,
      bad_hash_rejected boolean,
      noncanonical_cutoff_rejected boolean,
      tie_rejected boolean
    );
    CREATE TEMP TABLE calendar_session_capture(session_json jsonb);
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES(
      '44000000-0000-4000-8000-000000000001','opportunity_runner',
      '2026-01-01',NULL,'active',repeat('d',64),'2026-07-20T07:59:59Z'
    );
    INSERT INTO public.tw_trading_sessions_v3(
      session_authority_id,session_id,market,open_at,close_at,status,provider,
      source_timestamp,collected_at,source_ref,recorded_at
    ) VALUES
      ('44000000-0000-4000-8000-000000000010','2026-07-20','TWSE',
        '2026-07-20T01:00:00Z','2026-07-20T05:30:00Z','completed','twse',
        '2026-07-20T05:31:00Z','2026-07-20T05:32:00Z','twse:2026-07-20',
        '2026-07-20T05:33:00Z'),
      ('44000000-0000-4000-8000-000000000011','2026-07-20','TPEX',
        '2026-07-20T01:00:00Z','2026-07-20T05:30:00Z','completed','tpex',
        '2026-07-20T05:31:10Z','2026-07-20T05:32:10Z','tpex:2026-07-20',
        '2026-07-20T05:33:10Z'),
      ('44000000-0000-4000-8000-000000000020','2026-07-21','TWSE',
        '2026-07-21T01:00:00Z','2026-07-21T05:30:00Z','completed','twse',
        '2026-07-21T05:31:00Z','2026-07-21T05:32:00Z','twse:2026-07-21',
        '2026-07-21T05:33:00Z'),
      ('44000000-0000-4000-8000-000000000021','2026-07-21','TPEX',
        '2026-07-21T01:00:00Z','2026-07-21T05:30:00Z','cancelled','tpex',
        '2026-07-21T05:31:10Z','2026-07-21T05:32:10Z','tpex:2026-07-21',
        '2026-07-21T05:33:10Z'),
      ('44000000-0000-4000-8000-000000000030','2026-07-22','TWSE',
        '2026-07-22T01:00:00Z','2026-07-22T05:30:00Z','completed','twse',
        '2026-07-22T05:31:00Z','2026-07-22T05:32:00Z','twse:2026-07-22',
        '2026-07-22T05:33:00Z'),
      ('44000000-0000-4000-8000-000000000031','2026-07-22','TPEX',
        '2026-07-22T01:05:00Z','2026-07-22T05:30:00Z','completed','tpex',
        '2026-07-22T05:31:10Z','2026-07-22T05:32:10Z','tpex:2026-07-22',
        '2026-07-22T05:33:10Z');
    DO $calendar$
    DECLARE
      v_hash text;
      v_bad_hash_rejected boolean := false;
      v_noncanonical_rejected boolean := false;
      v_mismatch_rejected boolean := false;
      v_tie_rejected boolean := false;
    BEGIN
      SELECT taiwan_session_authority_hash INTO STRICT v_hash
      FROM public.opportunity_effective_taiwan_sessions_v3
      WHERE session_id='2026-07-20';
      INSERT INTO calendar_session_capture
      SELECT to_jsonb(session)
      FROM public.opportunity_effective_taiwan_sessions_v3 session
      WHERE session_id='2026-07-20';
      PERFORM * FROM public.begin_opportunity_run_v3(
        'source_scan','ad_hoc_shadow','2026-07-20T08:00:00Z',v_hash,
        '44000000-0000-4000-8000-000000000001'
      );
      BEGIN
        PERFORM * FROM public.begin_opportunity_run_v3(
          'source_scan','ad_hoc_shadow','2026-07-20T08:00:00Z',repeat('0',64),
          '44000000-0000-4000-8000-000000000001'
        );
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
        IF SQLERRM='calendar_authority_mismatch' THEN v_bad_hash_rejected:=true; ELSE RAISE; END IF;
      END;
      BEGIN
        PERFORM * FROM public.begin_opportunity_run_v3(
          'source_scan','ad_hoc_shadow','2026-07-20T07:59:59Z',v_hash,
          '44000000-0000-4000-8000-000000000001'
        );
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
        IF SQLERRM='calendar_authority_mismatch' THEN
          v_noncanonical_rejected:=true;
        ELSE RAISE; END IF;
      END;
      BEGIN
        PERFORM * FROM public.opportunity_effective_taiwan_sessions_v3
        WHERE session_id='2026-07-22';
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
        IF SQLERRM='authority_revision_conflict' THEN v_mismatch_rejected:=true; ELSE RAISE; END IF;
      END;
      BEGIN
        INSERT INTO public.tw_trading_sessions_v3(
          session_authority_id,session_id,market,open_at,close_at,status,provider,
          source_timestamp,collected_at,source_ref,recorded_at
        ) VALUES
          ('44000000-0000-4000-8000-000000000040','2026-07-23','TWSE',
            '2026-07-23T01:00:00Z','2026-07-23T05:30:00Z','completed','twse',
            '2026-07-23T05:31:00Z','2026-07-23T05:32:00Z','twse:tie-a',
            '2026-07-23T05:33:00Z'),
          ('44000000-0000-4000-8000-000000000041','2026-07-23','TWSE',
            '2026-07-23T01:00:00Z','2026-07-23T05:31:00Z','completed','twse',
            '2026-07-23T05:31:00Z','2026-07-23T05:32:00Z','twse:tie-b',
            '2026-07-23T05:33:00Z'),
          ('44000000-0000-4000-8000-000000000042','2026-07-23','TPEX',
            '2026-07-23T01:00:00Z','2026-07-23T05:30:00Z','completed','tpex',
            '2026-07-23T05:31:00Z','2026-07-23T05:32:00Z','tpex:tie',
            '2026-07-23T05:33:00Z');
        PERFORM * FROM public.opportunity_effective_taiwan_sessions_v3
        WHERE session_id='2026-07-23';
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
        IF SQLERRM='authority_revision_conflict' THEN v_tie_rejected:=true; ELSE RAISE; END IF;
      END;
      INSERT INTO calendar_assertions VALUES(
        NOT EXISTS (
          SELECT 1 FROM public.opportunity_effective_taiwan_sessions_v3
          WHERE session_id='2026-07-21'
        ),
        v_mismatch_rejected,
        v_bad_hash_rejected,v_noncanonical_rejected,v_tie_rejected
      );
    END
    $calendar$;
    SELECT jsonb_build_object(
      'session',(SELECT session_json FROM calendar_session_capture),
      'expectedHash',(SELECT encode(extensions.digest(convert_to(regexp_replace(
        jsonb_build_array(
          'tw-trading-session-v3.0',
          jsonb_build_array(
            '2026-07-20'::date,
            '2026-07-20T01:00:00Z'::timestamptz,
            '2026-07-20T05:30:00Z'::timestamptz,
            jsonb_build_array(
              '44000000-0000-4000-8000-000000000010'::uuid,
              '2026-07-20T05:31:00Z'::timestamptz,
              '2026-07-20T05:32:00Z'::timestamptz,
              'twse:2026-07-20','2026-07-20T05:33:00Z'::timestamptz
            ),
            jsonb_build_array(
              '44000000-0000-4000-8000-000000000011'::uuid,
              '2026-07-20T05:31:10Z'::timestamptz,
              '2026-07-20T05:32:10Z'::timestamptz,
              'tpex:2026-07-20','2026-07-20T05:33:10Z'::timestamptz
            )
          )
        )::text,', ', ',', 'g'),'utf8'),'sha256'),'hex')),
      'assertions',(SELECT to_jsonb(calendar_assertions) FROM calendar_assertions)
    )::text;
    ROLLBACK;
  `, ['-At']);
  const decoded = JSON.parse(output.split('\n').find((line) => line.startsWith('{')));
  assert.equal(decoded.session.session_id, '2026-07-20');
  assert.equal(decoded.session.open_at, '2026-07-20T09:00:00+08:00');
  assert.equal(decoded.session.close_at, '2026-07-20T13:30:00+08:00');
  assert.equal(decoded.session.canonical_cutoff, '2026-07-20T16:00:00+08:00');
  assert.equal(decoded.session.taiwan_session_authority_hash, decoded.expectedHash);
  assert.deepEqual(decoded.assertions, {
    cancelled_absent: true,
    mismatch_rejected: true,
    bad_hash_rejected: true,
    noncanonical_cutoff_rejected: true,
    tie_rejected: true,
  });
});

test('authority append RPCs recompute source hashes and converge roster sector calendar and market streams', () => {
  const result = JSON.parse(psql(`
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES(
      '41000000-0000-4000-8000-000000000001','opportunity_runner',
      '2026-01-01',NULL,'active',repeat('a',64),clock_timestamp()
    );
    INSERT INTO public.source_entities(id)
    VALUES('41000000-0000-4000-8000-000000000002');
    INSERT INTO public.source_identity_authorities_v3(
      authority_id,source_identity_id,source_key,source_class,distribution_identity,
      valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at
    ) VALUES(
      '41000000-0000-4000-8000-000000000003',
      '41000000-0000-4000-8000-000000000002',
      'threads','community','threads:append-boundary',
      '2026-01-01',NULL,'active','2026-07-24T00:00:00Z',
      '41000000-0000-4000-8000-000000000001',clock_timestamp()
    );
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'discovery_identity',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,clock_timestamp()
    FROM (SELECT convert_to(regexp_replace(jsonb_build_array(
      'discovery_identity','41000000-0000-4000-8000-000000000002'::uuid
    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    INSERT INTO public.stocks(id,symbol)
    VALUES('41000000-0000-4000-8000-000000000004','2330');
    SELECT * FROM public.append_source_document_revision_v3(
      ROW(
        '41000000-0000-4000-8000-000000000003','append-doc',NULL,
        '2026-07-24T01:00:00Z','2026-07-24T01:01:00Z',
        'source-adapter-v3.3','complete',
        ${sqlLiteral(JSON.stringify(appendBoundarySourceFields))}::jsonb,
        ${[...appendBoundarySourceFields.join('')].length},
        'raw-field-payload-v3.0',${sqlLiteral(appendBoundaryRawHash)},
        'canonical-content-v3.0',${sqlLiteral(appendBoundaryCanonicalHash)},NULL
      )::public.source_document_revision_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_source_document_revision_v3(
      ROW(
        '41000000-0000-4000-8000-000000000003','append-doc',NULL,
        '2026-07-24T01:00:00Z','2026-07-24T01:01:00Z',
        'source-adapter-v3.3','complete',
        ${sqlLiteral(JSON.stringify(appendBoundarySourceFields))}::jsonb,
        ${[...appendBoundarySourceFields.join('')].length},
        'raw-field-payload-v3.0',${sqlLiteral(appendBoundaryRawHash)},
        'canonical-content-v3.0',${sqlLiteral(appendBoundaryCanonicalHash)},NULL
      )::public.source_document_revision_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_instrument_roster_authority_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','2330','TWSE',
        'common_stock','active','台灣積體電路製造股份有限公司','台積電','twse',
        '2026-07-24T01:00:00Z','2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_instrument_roster_authority_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','2330','TWSE',
        'common_stock','active','台灣積體電路製造股份有限公司二','新台積電','twse',
        '2026-07-24T02:00:00Z','2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_instrument_roster_authority_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','2330','TWSE',
        'common_stock','active','台灣積體電路製造股份有限公司二','新台積電','twse',
        '2026-07-24T02:00:00Z','2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_instrument_roster_authority_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','2330','TWSE',
        'common_stock','active','台灣積體電路製造股份有限公司','台積電','twse',
        '2026-07-24T01:00:00Z','2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_stock_sector_assignment_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','TWSE','24','semiconductor',
        'twse','2026-07-24T01:00:00Z','2026-01-01',NULL,
        'tw-sector-taxonomy-v3.0','active'
      )::public.sector_assignment_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_stock_sector_assignment_v3(
      ROW(
        '41000000-0000-4000-8000-000000000004','TWSE','24','semiconductor',
        'twse','2026-07-24T01:00:00Z','2026-01-01',NULL,
        'tw-sector-taxonomy-v3.0','active'
      )::public.sector_assignment_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_trading_session_v3(
      ROW(
        '2026-07-24','TWSE','2026-07-24T01:00:00Z','2026-07-24T05:30:00Z',
        'completed','twse','2026-07-24T05:31:00Z','2026-07-24T05:32:00Z',
        'twse:append-boundary'
      )::public.trading_session_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_price_authority_v3(
      ROW('raw_price',ROW(
        '41000000-0000-4000-8000-000000000004','TWSE','2026-07-24',
        (SELECT session_authority_id FROM public.tw_trading_sessions_v3
          WHERE market='TWSE' AND session_id='2026-07-24' LIMIT 1),
        99,101,98,100,1000000,100000000,'twse','2026-07-24T06:30:00Z','2026-07-24T06:31:00Z',
        'twse-rwd:STOCK_DAY:2026-07-24:2330'
      )::public.price_observation_input_v3,NULL,NULL)::public.price_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_price_authority_v3(
      ROW('corporate_action_snapshot',NULL,ROW(
        'TWSE','2026-07-24',
        (SELECT session_authority_id FROM public.tw_trading_sessions_v3
          WHERE market='TWSE' AND session_id='2026-07-24' LIMIT 1),
        'tw-corporate-action-v3.1','twse','2026-07-24T06:31:00Z',
        ARRAY[
          ROW('twse:twt49u:v1',100,repeat('a',64),1)::public.corporate_action_feed_evidence_input_v3,
          ROW('twse:twtauu:v1',100,repeat('b',64),0)::public.corporate_action_feed_evidence_input_v3,
          ROW('twse:twtb8u:v1',100,repeat('c',64),0)::public.corporate_action_feed_evidence_input_v3
        ],1,ARRAY[
          ROW('2330','ex_right_dividend',100,95,'twse:twt49u:v1',${sqlLiteral(v313CorporateActionSourceRef)})::public.corporate_action_event_input_v3
        ]
      )::public.corporate_action_snapshot_input_v3,NULL)::public.price_authority_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_trading_session_v3(
      ROW(
        '2026-07-24','TPEX','2026-07-24T01:00:00Z','2026-07-24T05:30:00Z',
        'completed','tpex','2026-07-24T05:31:00Z','2026-07-24T05:32:00Z',
        'tpex:append-boundary'
      )::public.trading_session_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_trading_session_v3(
      ROW(
        '2026-07-24','TWSE','2026-07-24T01:00:00Z','2026-07-24T05:30:00Z',
        'completed','twse','2026-07-24T05:31:00Z','2026-07-24T05:32:00Z',
        'twse:append-boundary'
      )::public.trading_session_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_market_observation_v3(
      ROW(
        'taiex_close','TAIEX','2026-07-24',
        (SELECT session_authority_id FROM public.tw_trading_sessions_v3
          WHERE market='TWSE' AND session_id='2026-07-24' LIMIT 1),
        23000,'index_points','twse',NULL,NULL,NULL,NULL,NULL,NULL,
        '2026-07-24T05:30:00Z','2026-07-24T05:31:00Z',
        'twse:taiex:20260724','v1'
      )::public.market_observation_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT jsonb_build_object(
      'sourceRows',(SELECT count(*) FROM public.source_document_revisions_v3
        WHERE stable_connector_document_id='append-doc'),
      'instrumentRows',(SELECT count(*) FROM public.stock_instruments_v3
        WHERE stock_id='41000000-0000-4000-8000-000000000004'),
      'aliasStates',(SELECT jsonb_object_agg(normalized_alias,status)
        FROM (
          SELECT DISTINCT ON (normalized_alias) normalized_alias,status
          FROM public.stock_aliases_v3
          WHERE stock_id='41000000-0000-4000-8000-000000000004'
            AND source='official_roster_seed'
          ORDER BY normalized_alias,recorded_at DESC,alias_authority_id
        ) latest_alias),
      'sectorRows',(SELECT count(*) FROM public.stock_sector_assignments_v3
        WHERE stock_id='41000000-0000-4000-8000-000000000004'),
      'sessionRows',(SELECT count(*) FROM public.tw_trading_sessions_v3
        WHERE market='TWSE' AND session_id='2026-07-24'),
      'rawPriceRows',(SELECT count(*) FROM public.opportunity_price_observations_v3
        WHERE stock_id='41000000-0000-4000-8000-000000000004' AND session_id='2026-07-24'),
      'actionSnapshotRows',(SELECT count(*) FROM public.opportunity_corporate_action_snapshots_v3
        WHERE exchange='TWSE' AND session_id='2026-07-24'),
      'actionEventRows',(SELECT count(*) FROM public.opportunity_corporate_action_events_v3
        WHERE symbol='2330'),
      'marketRows',(SELECT count(*) FROM public.opportunity_market_observations_v3
        WHERE fact_key='taiex_close' AND authority_date='2026-07-24')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.deepEqual(result, {
    sourceRows: 1,
    instrumentRows: 2,
    aliasStates: {
      台灣積體電路製造: 'inactive',
      '台灣積體電路製造股份有限公司二': 'active',
      台積電: 'inactive',
      新台積電: 'active',
    },
    sectorRows: 1,
    sessionRows: 1,
    rawPriceRows: 1,
    actionSnapshotRows: 1,
    actionEventRows: 1,
    marketRows: 1,
  });
  assert.match(rejectedSql(`
    SELECT * FROM public.append_source_document_revision_v3(
      ROW(
        '41000000-0000-4000-8000-000000000003','bad-hash-doc',NULL,
        '2026-07-24T02:00:00Z','2026-07-24T02:01:00Z',
        'source-adapter-v3.3','complete',
        ${sqlLiteral(JSON.stringify(appendBoundarySourceFields))}::jsonb,
        ${[...appendBoundarySourceFields.join('')].length},
        'raw-field-payload-v3.0',repeat('0',64),
        'canonical-content-v3.0',${sqlLiteral(appendBoundaryCanonicalHash)},NULL
      )::public.source_document_revision_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
  `), /PT422.*invalid_authority_request/su);
  assert.match(rejectedSql(`
    BEGIN;
    SELECT * FROM public.append_trading_session_v3(
      ROW(
        '2026-07-24','TWSE','2026-07-24T01:00:00Z','2026-07-24T05:30:00Z',
        'cancelled','twse','2026-07-24T05:33:00Z','2026-07-24T05:34:00Z',
        'twse:append-boundary:cancelled'
      )::public.trading_session_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
    SELECT * FROM public.append_market_observation_v3(
      ROW(
        'taiex_close','TAIEX','2026-07-24',
        (SELECT session_authority_id FROM public.tw_trading_sessions_v3
          WHERE market='TWSE' AND session_id='2026-07-24' AND status='completed'
          ORDER BY recorded_at LIMIT 1),
        23001,'index_points','twse',NULL,NULL,NULL,NULL,NULL,NULL,
        '2026-07-24T05:30:00Z','2026-07-24T05:35:00Z',
        'twse:taiex:superseded','v2'
      )::public.market_observation_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
  `), /PT409.*calendar_authority_mismatch/su);
  assert.match(rejectedSql(`
    SELECT * FROM public.append_source_document_revision_v3(
      ROW(
        '41000000-0000-4000-8000-000000000003','nfkc-expansion-doc',NULL,
        '2026-07-24T02:00:00Z','2026-07-24T02:01:00Z',
        'source-adapter-v3.3','complete',
        jsonb_build_array(repeat(U&'\\337F',100000),'',''),
        100000,'raw-field-payload-v3.0',repeat('0',64),
        'canonical-content-v3.0',repeat('0',64),NULL
      )::public.source_document_revision_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
  `), /PT422.*invalid_authority_request/su);
  assert.match(rejectedSql(`
    SELECT * FROM public.append_market_observation_v3(
      ROW(
        'taiex_close','TAIEX',NULL,NULL,23000,'index_points','twse',
        NULL,NULL,NULL,NULL,NULL,NULL,'2026-07-24T05:30:00Z',
        '2026-07-24T05:31:00Z','twse:taiex:invalid','v1'
      )::public.market_observation_input_v3,
      '41000000-0000-4000-8000-000000000001'
    );
  `), /PT422.*invalid_authority_request/su);
});

test('authority registries enforce exact 64/65 family bounds and serialized boundary races', async () => {
  psql(`
    CREATE TABLE public.opportunity_authority_stream_registry_v3_test_backup
    AS TABLE public.opportunity_authority_stream_registry_v3;
  `);
  const functionDefinitions = JSON.parse(psql(`
    SELECT jsonb_object_agg(p.proname,pg_get_functiondef(p.oid))::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'append_source_identity_authority_v3',
      'append_publisher_verification_authority_v3',
      'append_instrument_roster_authority_v3',
      'append_manual_stock_alias_authority_v3',
	      'append_stock_sector_assignment_v3',
	      'append_peer_reviewer_authority_v3',
	      'append_peer_relationship_authority_v3',
	      'append_trading_session_v3',
	      'enqueue_next_opportunity_job_v3_internal',
	      'opportunity_authority_selected_stream_count_v3_internal',
	      'opportunity_peer_authority_header_counts_v3_internal',
        'resolve_legacy_instrument_authority_v3_13',
        'resolve_legacy_instrument_authority_v3_13_internal',
        'resolve_legacy_instrument_symbol_authority_v3_13_internal',
        'resolve_legacy_sector_authority_v3_13',
        'resolve_legacy_sector_authority_v3_13_internal',
        'resolve_legacy_trading_session_authority_v3_13',
        'resolve_legacy_trading_session_window_v3_13'
	    );
	  `, ['-At']).trim());
  const familyBounds = {
    append_source_identity_authority_v3: ['discovery_identity', 10001],
    append_publisher_verification_authority_v3: ['publisher_verification', 10001],
    append_instrument_roster_authority_v3: ['instrument_roster', 20001],
    append_manual_stock_alias_authority_v3: ['stock_alias', 100001],
    append_stock_sector_assignment_v3: ['sector_assignment', 20001],
    append_peer_reviewer_authority_v3: ['peer_reviewer', 1001],
    append_peer_relationship_authority_v3: ['peer_relationship', 100001],
  };
  for (const [functionName, [family, globalSentinel]] of Object.entries(familyBounds)) {
    const definition = functionDefinitions[functionName];
    assert.match(definition, new RegExp(`authority-registry\\|${family}`, 'u'));
    assert.match(definition, new RegExp(`LIMIT ${globalSentinel}(?:\\s|\\n)`, 'u'));
    assert.match(definition, /LIMIT 65(?:\s|\n)/u);
    assert.match(definition, /pg_advisory_xact_lock/u);
	  }
	  assert.match(functionDefinitions.append_trading_session_v3, /LIMIT 1025(?:\s|\n)/u);
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='discovery_identity'[\s\S]*?LIMIT 10001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='publisher_verification'[\s\S]*?LIMIT 10001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='instrument_roster'[\s\S]*?LIMIT 20001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='stock_alias'[\s\S]*?LIMIT 100001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='sector_assignment'[\s\S]*?LIMIT 20001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='peer_reviewer'[\s\S]*?LIMIT 1001/u,
  );
  assert.match(
    functionDefinitions.opportunity_authority_selected_stream_count_v3_internal,
    /requested_family='peer_relationship'[\s\S]*?LIMIT 100001/u,
  );
  assert.match(functionDefinitions.opportunity_authority_selected_stream_count_v3_internal, /LIMIT 65/u);
  assert.match(functionDefinitions.opportunity_authority_selected_stream_count_v3_internal, /authority_revision_conflict/u);
  assert.match(functionDefinitions.resolve_legacy_instrument_authority_v3_13,
    /opportunity_authority_selected_stream_count_v3_internal\('instrument_roster'/u);
  assert.match(functionDefinitions.resolve_legacy_instrument_authority_v3_13_internal,/LIMIT 65/u);
  assert.match(functionDefinitions.resolve_legacy_instrument_symbol_authority_v3_13_internal,/LIMIT 20001/u);
  assert.doesNotMatch(functionDefinitions.resolve_legacy_instrument_symbol_authority_v3_13_internal,
    /FROM public[.]stock_instruments_v3 candidate/u);
  assert.match(functionDefinitions.resolve_legacy_sector_authority_v3_13,
    /opportunity_authority_selected_stream_count_v3_internal\('sector_assignment'/u);
  assert.match(functionDefinitions.resolve_legacy_sector_authority_v3_13_internal,/LIMIT 65/u);
  assert.match(functionDefinitions.resolve_legacy_trading_session_authority_v3_13,/LIMIT 1025/u);
  assert.match(functionDefinitions.resolve_legacy_trading_session_authority_v3_13,/v_retained>1024/u);
  assert.match(functionDefinitions.resolve_legacy_trading_session_window_v3_13,/LIMIT 513/u);
  assert.match(functionDefinitions.resolve_legacy_trading_session_window_v3_13,/v_stream_count>512/u);
  assert.match(functionDefinitions.enqueue_next_opportunity_job_v3_internal, /opportunity_authority_selected_stream_count_v3_internal/u);
  assert.match(functionDefinitions.enqueue_next_opportunity_job_v3_internal, /opportunity_peer_authority_header_counts_v3_internal/u);
  assert.doesNotMatch(functionDefinitions.enqueue_next_opportunity_job_v3_internal, /exclusionReasonCounts','\{\}'::jsonb/u);
  assert.match(functionDefinitions.opportunity_peer_authority_header_counts_v3_internal, /bounded_registry AS MATERIALIZED/u);
  assert.match(functionDefinitions.opportunity_peer_authority_header_counts_v3_internal, /source_after_approval/u);
  assert.match(functionDefinitions.opportunity_peer_authority_header_counts_v3_internal, /unverified_evidence/u);

	  psql(`
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    ) VALUES
      ('42000000-0000-4000-8000-000000000001','opportunity_runner',
        '2026-01-01',NULL,'active',repeat('b',64),clock_timestamp()),
      ('42000000-0000-4000-8000-000000000002','peer_reviewer_admin',
        '2026-01-01',NULL,'active',repeat('c',64),clock_timestamp()),
      ('42000000-0000-4000-8000-000000000010','source_reviewer',
        '2026-01-01',NULL,'active',repeat('d',64),clock_timestamp()),
      ('42000000-0000-4000-8000-000000000011','publisher_reviewer',
        '2026-01-01',NULL,'active',repeat('e',64),clock_timestamp()),
      ('42000000-0000-4000-8000-000000000012','identity_reviewer',
        '2026-01-01',NULL,'active',repeat('f',64),clock_timestamp()),
      ('42000000-0000-4000-8000-000000000013','peer_reviewer',
        '2026-01-01',NULL,'active',repeat('1',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol)
    VALUES
      ('42000000-0000-4000-8000-000000000003','2317'),
      ('49000000-0000-4000-8000-000000000021','9021'),
      ('49000000-0000-4000-8000-000000000022','9022'),
      ('49000000-0000-4000-8000-000000000031','9031'),
      ('49000000-0000-4000-8000-000000000032','9032'),
      ('49000000-0000-4000-8000-000000000033','9033'),
      ('49000000-0000-4000-8000-000000000034','9034'),
      ('49000000-0000-4000-8000-000000000103','9103'),
      ('49000000-0000-4000-8000-000000000131','9131'),
      ('49000000-0000-4000-8000-000000000132','9132');
    INSERT INTO public.source_entities(id) VALUES
      ('49000000-0000-4000-8000-000000000001'),
      ('49000000-0000-4000-8000-000000000002'),
      ('49000000-0000-4000-8000-000000000011'),
      ('49000000-0000-4000-8000-000000000012'),
      ('49000000-0000-4000-8000-000000000101'),
      ('49000000-0000-4000-8000-000000000102');
    INSERT INTO public.stock_instruments_v3(
      instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,
      official_legal_name,official_short_name,provider,source_timestamp,valid_from,
      valid_to,roster_version,recorded_at
    ) VALUES
      ('49000000-0000-4000-8000-000000000041',
        '49000000-0000-4000-8000-000000000031','9031','TWSE','common_stock',
        'active','Race Supplier A','RSA','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20'),
      ('49000000-0000-4000-8000-000000000042',
        '49000000-0000-4000-8000-000000000032','9032','TWSE','common_stock',
        'active','Race Customer A','RCA','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20'),
      ('49000000-0000-4000-8000-000000000043',
        '49000000-0000-4000-8000-000000000033','9033','TWSE','common_stock',
        'active','Race Supplier B','RSB','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20'),
      ('49000000-0000-4000-8000-000000000044',
        '49000000-0000-4000-8000-000000000034','9034','TWSE','common_stock',
        'active','Race Customer B','RCB','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20'),
      ('49000000-0000-4000-8000-000000000141',
        '49000000-0000-4000-8000-000000000131','9131','TWSE','common_stock',
        'active','Stream Supplier','SS','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20'),
      ('49000000-0000-4000-8000-000000000142',
        '49000000-0000-4000-8000-000000000132','9132','TWSE','common_stock',
        'active','Stream Customer','SC','twse','2026-07-20','2026-01-01',
        NULL,'tw-instrument-roster-v3.0','2026-07-20');
    SELECT appended.instrument_authority_id
    FROM generate_series(1,64) revision
    CROSS JOIN LATERAL public.append_instrument_roster_authority_v3(
      ROW(
        '42000000-0000-4000-8000-000000000003','2317','TWSE',
        'common_stock','active','鴻海精密工業股份有限公司','鴻海','twse',
        '2026-07-20T00:00:00Z'::timestamptz + revision*interval '1 second',
        '2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '42000000-0000-4000-8000-000000000001'
    ) appended;
  `);
  assert.match(rejectedSql(`
    SELECT * FROM public.append_instrument_roster_authority_v3(
      ROW(
        '42000000-0000-4000-8000-000000000003','2317','TWSE',
        'common_stock','active','鴻海精密工業股份有限公司','鴻海','twse',
        '2026-07-20T00:01:05Z','2026-01-01',NULL,'tw-instrument-roster-v3.0'
      )::public.instrument_authority_input_v3,
      '42000000-0000-4000-8000-000000000001'
    );
  `), /PT409.*bound_violation/su);
  const streamBoundary = JSON.parse(psql(`
    SELECT jsonb_build_object(
      'events',(SELECT count(*) FROM public.stock_instruments_v3
        WHERE stock_id='42000000-0000-4000-8000-000000000003'),
      'audits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE function_name='append_instrument_roster_authority_v3'
          AND caller_principal_id='42000000-0000-4000-8000-000000000001')
    )::text;
  `, ['-At']).trim());
  assert.deepEqual(streamBoundary, { events: 64, audits: 64 });

  psql(`
    SELECT appended.session_authority_id
    FROM generate_series(1,1024) revision
    CROSS JOIN LATERAL public.append_trading_session_v3(
      ROW(
        '2026-07-23','TPEX','2026-07-23T01:00:00Z','2026-07-23T05:30:00Z',
        CASE WHEN revision%2=0 THEN 'completed'::public.trading_session_status_v3
          ELSE 'cancelled'::public.trading_session_status_v3 END,
        'tpex',
        '2026-07-23T05:31:00Z'::timestamptz + revision*interval '1 millisecond',
        '2026-07-23T05:32:00Z'::timestamptz + revision*interval '1 millisecond',
        'tpex:calendar-boundary:'||revision
      )::public.trading_session_input_v3,
      '42000000-0000-4000-8000-000000000001'
    ) appended;
  `);
  assert.match(rejectedSql(`
    SELECT * FROM public.append_trading_session_v3(
      ROW(
        '2026-07-23','TPEX','2026-07-23T01:00:00Z','2026-07-23T05:30:00Z',
        'completed','tpex','2026-07-23T05:31:02Z','2026-07-23T05:32:02Z',
        'tpex:calendar-boundary:1025'
      )::public.trading_session_input_v3,
      '42000000-0000-4000-8000-000000000001'
    );
  `), /PT409.*bound_violation/su);
  const calendarBoundary = JSON.parse(psql(`
    SELECT jsonb_build_object(
      'events',(SELECT count(*) FROM public.tw_trading_sessions_v3
        WHERE market='TPEX' AND session_id='2026-07-23'),
      'audits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE function_name='append_trading_session_v3'
          AND caller_principal_id='42000000-0000-4000-8000-000000000001'
          AND subject_id IN (
            SELECT session_authority_id FROM public.tw_trading_sessions_v3
            WHERE market='TPEX' AND session_id='2026-07-23'
          ))
    )::text;
  `, ['-At']).trim());
  assert.deepEqual(calendarBoundary, { events: 1024, audits: 1024 });

  const assertStreamBoundary = ({
    family,
    appendSql,
    rejectedAppendSql,
    eventCountSql,
    auditCountSql,
  }) => {
    psql(appendSql);
    assert.match(
      rejectedSql(rejectedAppendSql),
      /PT409.*bound_violation/su,
      `${family} 65th stream revision must fail closed`,
    );
    const snapshot = JSON.parse(psql(`
      SELECT jsonb_build_object(
        'events',(${eventCountSql}),
        'audits',(${auditCountSql})
      )::text;
    `, ['-At']).trim());
    assert.deepEqual(
      snapshot,
      { events: 64, audits: 64 },
      `${family} rejected stream revision must leave zero event and audit writes`,
    );
  };

  assertStreamBoundary({
    family: 'discovery_identity',
    appendSql: `
      SELECT appended.authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_source_identity_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000101','threads','community',
          'threads:stream-boundary:'||revision,'2026-01-01',NULL,'active'
        )::public.source_identity_authority_input_v3,
        '42000000-0000-4000-8000-000000000010'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_source_identity_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000101','threads','community',
          'threads:stream-boundary:65','2026-01-01',NULL,'active'
        )::public.source_identity_authority_input_v3,
        '42000000-0000-4000-8000-000000000010'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.source_identity_authorities_v3
      WHERE source_identity_id='49000000-0000-4000-8000-000000000101'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_source_identity_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.authority_id
          FROM public.source_identity_authorities_v3 authority
          WHERE authority.source_identity_id='49000000-0000-4000-8000-000000000101'
        )`,
  });

  assertStreamBoundary({
    family: 'publisher_verification',
    appendSql: `
      SELECT appended.authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_publisher_verification_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000102','public_research',
          ARRAY['stream-boundary.example'],
          'stream-boundary-feed-'||revision,
          'stream-boundary-institution-'||revision,
          '2026-01-01',NULL,'active'
        )::public.publisher_authority_input_v3,
        '42000000-0000-4000-8000-000000000011'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_publisher_verification_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000102','public_research',
          ARRAY['stream-boundary.example'],
          'stream-boundary-feed-65','stream-boundary-institution-65',
          '2026-01-01',NULL,'active'
        )::public.publisher_authority_input_v3,
        '42000000-0000-4000-8000-000000000011'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.publisher_verification_authorities_v3
      WHERE publisher_identity_id='49000000-0000-4000-8000-000000000102'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_publisher_verification_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.authority_id
          FROM public.publisher_verification_authorities_v3 authority
          WHERE authority.publisher_identity_id='49000000-0000-4000-8000-000000000102'
        )`,
  });

  assertStreamBoundary({
    family: 'stock_alias',
    appendSql: `
      SELECT appended.alias_authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_manual_stock_alias_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000103','Stream Boundary Alias',
          '2026-07-20T00:00:00Z'::timestamptz + revision*interval '1 second',
          '2026-01-01',NULL,'active'
        )::public.manual_alias_authority_input_v3,
        '42000000-0000-4000-8000-000000000012'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_manual_stock_alias_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000103','Stream Boundary Alias',
          '2026-07-20T00:01:05Z','2026-01-01',NULL,'active'
        )::public.manual_alias_authority_input_v3,
        '42000000-0000-4000-8000-000000000012'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.stock_aliases_v3
      WHERE stock_id='49000000-0000-4000-8000-000000000103'
        AND normalized_alias='stream boundary alias'
        AND source='manual_review'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_manual_stock_alias_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.alias_authority_id
          FROM public.stock_aliases_v3 authority
          WHERE authority.stock_id='49000000-0000-4000-8000-000000000103'
            AND authority.normalized_alias='stream boundary alias'
            AND authority.source='manual_review'
        )`,
  });

  assertStreamBoundary({
    family: 'sector_assignment',
    appendSql: `
      SELECT appended.assignment_authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_stock_sector_assignment_v3(
        ROW(
          '49000000-0000-4000-8000-000000000103','TWSE','24','semiconductor',
          'twse','2026-07-20T00:00:00Z'::timestamptz + revision*interval '1 second',
          '2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active'
        )::public.sector_assignment_input_v3,
        '42000000-0000-4000-8000-000000000001'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_stock_sector_assignment_v3(
        ROW(
          '49000000-0000-4000-8000-000000000103','TWSE','24','semiconductor',
          'twse','2026-07-20T00:01:05Z',
          '2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active'
        )::public.sector_assignment_input_v3,
        '42000000-0000-4000-8000-000000000001'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.stock_sector_assignments_v3
      WHERE stock_id='49000000-0000-4000-8000-000000000103' AND market='TWSE'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_stock_sector_assignment_v3'
        AND audit.subject_id IN (
          SELECT authority.assignment_authority_id
          FROM public.stock_sector_assignments_v3 authority
          WHERE authority.stock_id='49000000-0000-4000-8000-000000000103'
            AND authority.market='TWSE'
        )`,
  });

  assertStreamBoundary({
    family: 'peer_reviewer',
    appendSql: `
      SELECT appended.reviewer_authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_peer_reviewer_authority_v3(
        ROW(
          '42000000-0000-4000-8000-000000000013',
          '2026-01-01T00:00:00Z'::timestamptz + revision*interval '1 second',
          NULL,'active'
        )::public.peer_reviewer_authority_input_v3,
        '42000000-0000-4000-8000-000000000002'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_peer_reviewer_authority_v3(
        ROW(
          '42000000-0000-4000-8000-000000000013',
          '2026-01-01T00:01:05Z',NULL,'active'
        )::public.peer_reviewer_authority_input_v3,
        '42000000-0000-4000-8000-000000000002'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.stock_peer_relationship_reviewers_v3
      WHERE reviewer_principal_id='42000000-0000-4000-8000-000000000013'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_peer_reviewer_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.reviewer_authority_id
          FROM public.stock_peer_relationship_reviewers_v3 authority
          WHERE authority.reviewer_principal_id='42000000-0000-4000-8000-000000000013'
        )`,
  });

  assertStreamBoundary({
    family: 'peer_relationship',
    appendSql: `
      SELECT appended.relationship_authority_id
      FROM generate_series(1,64) revision
      CROSS JOIN LATERAL public.append_peer_relationship_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000141',
          '49000000-0000-4000-8000-000000000142',
          '2026-07-20T00:00:00Z'::timestamptz + revision*interval '1 second',
          '2026-01-01',NULL,'active','stream:evidence:'||revision
        )::public.peer_relationship_authority_input_v3,
        '42000000-0000-4000-8000-000000000013'
      ) appended;
    `,
    rejectedAppendSql: `
      SELECT * FROM public.append_peer_relationship_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000141',
          '49000000-0000-4000-8000-000000000142',
          '2026-07-20T00:01:05Z',
          '2026-01-01',NULL,'active','stream:evidence:65'
        )::public.peer_relationship_authority_input_v3,
        '42000000-0000-4000-8000-000000000013'
      );
    `,
    eventCountSql: `SELECT count(*) FROM public.stock_peer_relationships_v3
      WHERE supplier_stock_id='49000000-0000-4000-8000-000000000131'
        AND customer_stock_id='49000000-0000-4000-8000-000000000132'
        AND relationship_kind='supply_chain'`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_peer_relationship_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.relationship_authority_id
          FROM public.stock_peer_relationships_v3 authority
          WHERE authority.supplier_stock_id='49000000-0000-4000-8000-000000000131'
            AND authority.customer_stock_id='49000000-0000-4000-8000-000000000132'
            AND authority.relationship_kind='supply_chain'
        )`,
  });

  const futureOnlyOutput = psql(`
    BEGIN;
    INSERT INTO public.source_identity_authorities_v3(
      authority_id,source_identity_id,source_key,source_class,distribution_identity,
      valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000201',
      '49000000-0000-4000-8000-000000000101',
      'threads','community','threads:future-only',
      '2026-01-01',NULL,'active','2030-01-01','42000000-0000-4000-8000-000000000010',
      '2030-01-01'
    );
    INSERT INTO public.publisher_verification_authorities_v3(
      authority_id,publisher_identity_id,source_class,domains,feed_identity,
      institution_identity,valid_from,valid_to,approved_at,approving_principal_id,
      status,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000202',
      '49000000-0000-4000-8000-000000000102','public_research',
      ARRAY['future-only.example'],'future-only-feed','future-only-institution',
      '2026-01-01',NULL,'2030-01-01','42000000-0000-4000-8000-000000000011',
      'active','2030-01-01'
    );
    INSERT INTO public.stock_instruments_v3(
      instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,
      official_legal_name,official_short_name,provider,source_timestamp,valid_from,
      valid_to,roster_version,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000203',
      '49000000-0000-4000-8000-000000000103','9103','TWSE','common_stock',
      'active','Future Only Instrument','FOI','twse',
      '2030-01-01','2026-01-01',NULL,'tw-instrument-roster-v3.0','2030-01-01'
    );
    INSERT INTO public.stock_aliases_v3(
      alias_authority_id,stock_id,normalized_alias,source,source_timestamp,
      approved_by_principal_id,approved_at,valid_from,valid_to,status,
      normalization_version,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000204',
      '49000000-0000-4000-8000-000000000103','future only alias',
      'manual_review','2030-01-01','42000000-0000-4000-8000-000000000012',
      '2030-01-01','2026-01-01',NULL,'active','entity-link-v3.1','2030-01-01'
    );
    INSERT INTO public.stock_sector_assignments_v3(
      assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,
      taxonomy_version,status,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000205',
      '49000000-0000-4000-8000-000000000103','TWSE','24','semiconductor',
      'twse','2030-01-01','2026-01-01',NULL,'tw-sector-taxonomy-v3.0',
      'active','2030-01-01'
    );
    INSERT INTO public.stock_peer_relationship_reviewers_v3(
      reviewer_authority_id,reviewer_principal_id,approving_principal_id,
      approved_at,valid_from,valid_to,status,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000206',
      '42000000-0000-4000-8000-000000000013',
      '42000000-0000-4000-8000-000000000002',
      '2030-01-01','2026-01-01',NULL,'active','2030-01-01'
    );
    INSERT INTO public.stock_peer_relationships_v3(
      relationship_authority_id,supplier_instrument_authority_id,supplier_stock_id,
      customer_instrument_authority_id,customer_stock_id,relationship_kind,
      source_timestamp,approved_at,valid_from,valid_to,status,evidence_ref,
      reviewer_principal_id,recorded_at
    ) VALUES(
      '49000000-0000-4000-8000-000000000207',
      '49000000-0000-4000-8000-000000000141',
      '49000000-0000-4000-8000-000000000131',
      '49000000-0000-4000-8000-000000000142',
      '49000000-0000-4000-8000-000000000132','supply_chain',
      '2030-01-01','2030-01-01','2026-01-01',NULL,'active',
      'future-only:evidence','42000000-0000-4000-8000-000000000013',
      '2030-01-01'
    );
    SELECT jsonb_build_object(
      'discovery_identity',(SELECT count(*) FROM public.source_identity_authorities_v3
        WHERE source_identity_id='49000000-0000-4000-8000-000000000101'
          AND recorded_at<='2026-07-20'),
      'publisher_verification',(SELECT count(*) FROM public.publisher_verification_authorities_v3
        WHERE publisher_identity_id='49000000-0000-4000-8000-000000000102'
          AND recorded_at<='2026-07-20'),
      'instrument_roster',(SELECT count(*) FROM public.stock_instruments_v3
        WHERE stock_id='49000000-0000-4000-8000-000000000103'
          AND recorded_at<='2026-07-20'),
      'stock_alias',(SELECT count(*) FROM public.stock_aliases_v3
        WHERE stock_id='49000000-0000-4000-8000-000000000103'
          AND normalized_alias='future only alias'
          AND source='manual_review'
          AND recorded_at<='2026-07-20'),
      'sector_assignment',(SELECT count(*) FROM public.stock_sector_assignments_v3
        WHERE stock_id='49000000-0000-4000-8000-000000000103'
          AND market='TWSE'
          AND recorded_at<='2026-07-20'),
      'peer_reviewer',(SELECT count(*) FROM public.stock_peer_relationship_reviewers_v3
        WHERE reviewer_principal_id='42000000-0000-4000-8000-000000000013'
          AND recorded_at<='2026-07-20'),
      'peer_relationship',(SELECT count(*) FROM public.stock_peer_relationships_v3
        WHERE supplier_stock_id='49000000-0000-4000-8000-000000000131'
          AND customer_stock_id='49000000-0000-4000-8000-000000000132'
          AND relationship_kind='supply_chain'
          AND recorded_at<='2026-07-20')
    )::text;
    ROLLBACK;
  `, ['-At']).trim().split('\n');
  const futureOnly = JSON.parse(
    futureOnlyOutput.find((line) => line.startsWith('{')) ?? 'null',
  );
  assert.deepEqual(futureOnly, {
    discovery_identity: 0,
    publisher_verification: 0,
    instrument_roster: 0,
    stock_alias: 0,
    sector_assignment: 0,
    peer_reviewer: 0,
    peer_relationship: 0,
  });

  const assertGlobalFamilyBoundaryRace = async ({
    family,
    bound,
    canonicalExpression,
    calls,
    eventCountSql,
    auditCountSql,
  }) => {
    psql(`
      WITH missing AS (
        SELECT greatest(0,${bound - 1}-count(*))::integer AS remaining
        FROM public.opportunity_authority_stream_registry_v3
        WHERE family='${family}'
      ), canonical AS (
        SELECT convert_to(regexp_replace(
          ${canonicalExpression}::text,', ', ',', 'g'
        ),'utf8') AS bytes
        FROM missing
        CROSS JOIN LATERAL generate_series(1,missing.remaining) series
      )
      INSERT INTO public.opportunity_authority_stream_registry_v3(
        family,stream_key_hash,stream_key_canonical,registered_at
      )
      SELECT '${family}',encode(extensions.digest(bytes,'sha256'),'hex'),
        bytes,'2030-01-01T00:00:00Z'
      FROM canonical;
    `);
    const raceResults = await Promise.all(calls.map((call) => psqlAsync(`
      \\set VERBOSITY verbose
      ${call}
    `)));
    assert.deepEqual(
      raceResults.map((result) => result.code).sort(),
      [0, 3],
      `${family} must serialize the bound-1 race:\n${
        raceResults.map((result) => result.stderr).join('\n')
      }`,
    );
    assert.equal(
      raceResults.filter((result) => /PT409.*bound_violation/su.test(result.stderr)).length,
      1,
      `${family} must reject exactly one boundary writer`,
    );
    const snapshot = JSON.parse(psql(`
      SELECT jsonb_build_object(
        'registry',(SELECT count(*)
          FROM public.opportunity_authority_stream_registry_v3
          WHERE family='${family}'),
        'events',(${eventCountSql}),
        'audits',(${auditCountSql})
      )::text;
    `, ['-At']).trim());
    assert.deepEqual(
      snapshot,
      { registry: bound, events: 1, audits: 1 },
      `${family} rejected writer must leave zero event and audit writes`,
    );
  };

  await assertGlobalFamilyBoundaryRace({
    family: 'discovery_identity',
    bound: 10000,
    canonicalExpression: `jsonb_build_array(
      'discovery_identity',
      ('45000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid
    )`,
    calls: [
      `SELECT * FROM public.append_source_identity_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000001','threads','community',
          'threads:global-race-a','2026-01-01',NULL,'active'
        )::public.source_identity_authority_input_v3,
        '42000000-0000-4000-8000-000000000010'
      );`,
      `SELECT * FROM public.append_source_identity_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000002','threads','community',
          'threads:global-race-b','2026-01-01',NULL,'active'
        )::public.source_identity_authority_input_v3,
        '42000000-0000-4000-8000-000000000010'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.source_identity_authorities_v3
      WHERE source_identity_id IN (
        '49000000-0000-4000-8000-000000000001',
        '49000000-0000-4000-8000-000000000002'
      )`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_source_identity_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.authority_id
          FROM public.source_identity_authorities_v3 authority
          WHERE authority.source_identity_id IN (
            '49000000-0000-4000-8000-000000000001',
            '49000000-0000-4000-8000-000000000002'
          )
        )`,
  });

  await assertGlobalFamilyBoundaryRace({
    family: 'publisher_verification',
    bound: 10000,
    canonicalExpression: `jsonb_build_array(
      'publisher_verification',
      ('45100000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid
    )`,
    calls: [
      `SELECT * FROM public.append_publisher_verification_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000011','public_research',
          ARRAY['race-a.example'],'race-feed-a','race-institution-a',
          '2026-01-01',NULL,'active'
        )::public.publisher_authority_input_v3,
        '42000000-0000-4000-8000-000000000011'
      );`,
      `SELECT * FROM public.append_publisher_verification_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000012','public_research',
          ARRAY['race-b.example'],'race-feed-b','race-institution-b',
          '2026-01-01',NULL,'active'
        )::public.publisher_authority_input_v3,
        '42000000-0000-4000-8000-000000000011'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.publisher_verification_authorities_v3
      WHERE publisher_identity_id IN (
        '49000000-0000-4000-8000-000000000011',
        '49000000-0000-4000-8000-000000000012'
      )`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_publisher_verification_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.authority_id
          FROM public.publisher_verification_authorities_v3 authority
          WHERE authority.publisher_identity_id IN (
            '49000000-0000-4000-8000-000000000011',
            '49000000-0000-4000-8000-000000000012'
          )
        )`,
  });

  await assertGlobalFamilyBoundaryRace({
    family: 'instrument_roster',
    bound: 20000,
    canonicalExpression: `jsonb_build_array(
      'instrument_roster',
      ('45200000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid
    )`,
    calls: [
      `SELECT * FROM public.append_instrument_roster_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000021','9021','TWSE',
          'common_stock','active','Global Race Instrument A','GRIA','twse',
          '2026-07-20','2026-01-01',NULL,'tw-instrument-roster-v3.0'
        )::public.instrument_authority_input_v3,
        '42000000-0000-4000-8000-000000000001'
      );`,
      `SELECT * FROM public.append_instrument_roster_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000022','9022','TWSE',
          'common_stock','active','Global Race Instrument B','GRIB','twse',
          '2026-07-20','2026-01-01',NULL,'tw-instrument-roster-v3.0'
        )::public.instrument_authority_input_v3,
        '42000000-0000-4000-8000-000000000001'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.stock_instruments_v3
      WHERE stock_id IN (
        '49000000-0000-4000-8000-000000000021',
        '49000000-0000-4000-8000-000000000022'
      )`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_instrument_roster_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.instrument_authority_id
          FROM public.stock_instruments_v3 authority
          WHERE authority.stock_id IN (
            '49000000-0000-4000-8000-000000000021',
            '49000000-0000-4000-8000-000000000022'
          )
        )`,
  });

  await assertGlobalFamilyBoundaryRace({
    family: 'sector_assignment',
    bound: 20000,
    canonicalExpression: `jsonb_build_array(
      'sector_assignment',
      ('45300000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,
      'TWSE'
    )`,
    calls: [
      `SELECT * FROM public.append_stock_sector_assignment_v3(
        ROW(
          '49000000-0000-4000-8000-000000000021','TWSE','24','semiconductor',
          'twse','2026-07-20','2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active'
        )::public.sector_assignment_input_v3,
        '42000000-0000-4000-8000-000000000001'
      );`,
      `SELECT * FROM public.append_stock_sector_assignment_v3(
        ROW(
          '49000000-0000-4000-8000-000000000022','TWSE','24','semiconductor',
          'twse','2026-07-20','2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active'
        )::public.sector_assignment_input_v3,
        '42000000-0000-4000-8000-000000000001'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.stock_sector_assignments_v3
      WHERE stock_id IN (
        '49000000-0000-4000-8000-000000000021',
        '49000000-0000-4000-8000-000000000022'
      )`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_stock_sector_assignment_v3'
        AND audit.subject_id IN (
          SELECT authority.assignment_authority_id
          FROM public.stock_sector_assignments_v3 authority
          WHERE authority.stock_id IN (
            '49000000-0000-4000-8000-000000000021',
            '49000000-0000-4000-8000-000000000022'
          )
        )`,
  });

  await assertGlobalFamilyBoundaryRace({
    family: 'stock_alias',
    bound: 100000,
    canonicalExpression: `jsonb_build_array(
      'stock_alias',
      ('45400000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid,
      'global-race-alias-'||series,
      'manual_review'
    )`,
    calls: [
      `SELECT * FROM public.append_manual_stock_alias_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000021','Global Race Alias A',
          '2026-07-20','2026-01-01',NULL,'active'
        )::public.manual_alias_authority_input_v3,
        '42000000-0000-4000-8000-000000000012'
      );`,
      `SELECT * FROM public.append_manual_stock_alias_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000021','Global Race Alias B',
          '2026-07-20','2026-01-01',NULL,'active'
        )::public.manual_alias_authority_input_v3,
        '42000000-0000-4000-8000-000000000012'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.stock_aliases_v3
      WHERE stock_id='49000000-0000-4000-8000-000000000021'
        AND source='manual_review'
        AND normalized_alias IN ('global race alias a','global race alias b')`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_manual_stock_alias_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.alias_authority_id
          FROM public.stock_aliases_v3 authority
          WHERE authority.stock_id='49000000-0000-4000-8000-000000000021'
            AND authority.source='manual_review'
            AND authority.normalized_alias IN (
              'global race alias a','global race alias b'
            )
        )`,
  });

  await assertGlobalFamilyBoundaryRace({
    family: 'peer_relationship',
    bound: 100000,
    canonicalExpression: `jsonb_build_array(
      'peer_relationship',
      ('45500000-0000-4000-8000-'||lpad((series*2-1)::text,12,'0'))::uuid,
      ('45500000-0000-4000-8000-'||lpad((series*2)::text,12,'0'))::uuid,
      'supply_chain'
    )`,
    calls: [
      `SELECT * FROM public.append_peer_relationship_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000041',
          '49000000-0000-4000-8000-000000000042',
          '2026-07-20','2026-01-01',NULL,'active','race:evidence:a'
        )::public.peer_relationship_authority_input_v3,
        '42000000-0000-4000-8000-000000000013'
      );`,
      `SELECT * FROM public.append_peer_relationship_authority_v3(
        ROW(
          '49000000-0000-4000-8000-000000000043',
          '49000000-0000-4000-8000-000000000044',
          '2026-07-20','2026-01-01',NULL,'active','race:evidence:b'
        )::public.peer_relationship_authority_input_v3,
        '42000000-0000-4000-8000-000000000013'
      );`,
    ],
    eventCountSql: `SELECT count(*) FROM public.stock_peer_relationships_v3
      WHERE supplier_stock_id IN (
        '49000000-0000-4000-8000-000000000031',
        '49000000-0000-4000-8000-000000000033'
      )`,
    auditCountSql: `SELECT count(*) FROM public.opportunity_rpc_audit_v3 audit
      WHERE audit.function_name='append_peer_relationship_authority_v3'
        AND audit.subject_id IN (
          SELECT authority.relationship_authority_id
          FROM public.stock_peer_relationships_v3 authority
          WHERE authority.supplier_stock_id IN (
            '49000000-0000-4000-8000-000000000031',
            '49000000-0000-4000-8000-000000000033'
          )
        )`,
  });

  psql(`
    WITH missing AS (
      SELECT 999-count(*)::integer AS remaining
      FROM public.opportunity_authority_stream_registry_v3
      WHERE family='peer_reviewer'
    ), canonical AS (
      SELECT convert_to(regexp_replace(jsonb_build_array(
        'peer_reviewer',
        ('43000000-0000-4000-8000-'||lpad(series::text,12,'0'))::uuid
      )::text,', ', ',', 'g'),'utf8') AS bytes
      FROM missing
      CROSS JOIN LATERAL generate_series(1,missing.remaining) series
    )
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'peer_reviewer',encode(extensions.digest(bytes,'sha256'),'hex'),bytes,clock_timestamp()
    FROM canonical;
  `);
  const race = await Promise.all([
    '42000000-0000-4000-8000-000000000004',
    '42000000-0000-4000-8000-000000000005',
  ].map((reviewerId) => psqlAsync(`
    \\set VERBOSITY verbose
    SELECT * FROM public.append_peer_reviewer_authority_v3(
      ROW(
        '${reviewerId}','2026-01-01',NULL,'active'
      )::public.peer_reviewer_authority_input_v3,
      '42000000-0000-4000-8000-000000000002'
    );
  `)));
  assert.deepEqual(race.map((result) => result.code).sort(), [0, 3]);
  assert.equal(race.filter((result) => /PT409.*bound_violation/su.test(result.stderr)).length, 1);
  const familyBoundary = JSON.parse(psql(`
    SELECT jsonb_build_object(
      'registry',(SELECT count(*) FROM public.opportunity_authority_stream_registry_v3
        WHERE family='peer_reviewer'),
      'events',(SELECT count(*) FROM public.stock_peer_relationship_reviewers_v3
        WHERE reviewer_principal_id IN (
          '42000000-0000-4000-8000-000000000004',
          '42000000-0000-4000-8000-000000000005'
        )),
      'audits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE function_name='append_peer_reviewer_authority_v3'
          AND subject_id IN (
            SELECT reviewer_authority_id
            FROM public.stock_peer_relationship_reviewers_v3
            WHERE reviewer_principal_id IN (
              '42000000-0000-4000-8000-000000000004',
              '42000000-0000-4000-8000-000000000005'
            )
          ))
    )::text;
  `, ['-At']).trim());
  assert.deepEqual(familyBoundary, { registry: 1000, events: 1, audits: 1 });
  psql(`
    TRUNCATE public.opportunity_authority_stream_registry_v3;
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT family,stream_key_hash,stream_key_canonical,registered_at
    FROM public.opportunity_authority_stream_registry_v3_test_backup;
    DROP TABLE public.opportunity_authority_stream_registry_v3_test_backup;
  `);
});

test('applied checks, privileges, RLS boundary and immutable relations reject negative writes', () => {
  assert.match(rejectedSql(`
    INSERT INTO public.opportunity_runs(
      preparation_key,attempt,mode,run_purpose,source_cutoff,comparison_contract_key,status
    ) VALUES('bad',1,'source_scan','ad_hoc_shadow',clock_timestamp(),repeat('a',64),'preparing');
  `), /23514/u);
  assert.match(rejectedSql(`
    SET ROLE anon;
    SELECT * FROM public.opportunity_runs LIMIT 1;
  `), /42501/u);
  assert.match(rejectedSql(`
    SET ROLE authenticated;
    INSERT INTO public.opportunity_runs(
      preparation_key,attempt,mode,run_purpose,source_cutoff,comparison_contract_key,status
    ) VALUES(repeat('a',64),1,'source_scan','ad_hoc_shadow',clock_timestamp(),repeat('b',64),'preparing');
  `), /42501/u);
  assert.match(rejectedSql(`
    SET ROLE service_role;
    UPDATE public.opportunity_job_payloads_v3 SET payload_hash=repeat('f',64);
  `), /42501/u);
  assert.match(rejectedSql(`
    INSERT INTO public.opportunity_job_payloads_v3(
      job_id,run_id,payload_kind,payload_canonical,payload_json,payload_hash
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614179999',
      '123e4567-e89b-42d3-a456-426614179998',
      'finalize',convert_to('[]','utf8'),'[]'::jsonb,
      encode(extensions.digest(convert_to('[]','utf8'),'sha256'),'hex')
    );
  `), /23503/u);
});

test('applied begin creates one deterministic canonical v3.3 bootstrap job and payload', () => {
  const result = psql(`
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,status,configuration_hash
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614174000','opportunity_runner',
      '2026-01-01T00:00:00Z','active',repeat('a',64)
    ),(
      '123e4567-e89b-42d3-a456-426614174099','opportunity_runner',
      '2026-01-01T00:00:00Z','active',repeat('b',64)
    );
    INSERT INTO public.source_entities(id)
    VALUES('123e4567-e89b-42d3-a456-426614173001');
    INSERT INTO public.source_identity_authorities_v3(
      authority_id,source_identity_id,source_key,source_class,distribution_identity,
      valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614173002',
      '123e4567-e89b-42d3-a456-426614173001',
      'threads','community','threads:lifecycle',
      '2026-01-01T00:00:00Z',NULL,'active',
      '2026-07-20T00:00:00Z','123e4567-e89b-42d3-a456-426614174000',
      '2026-07-20T00:00:00Z'
    );
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'discovery_identity',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,'2026-07-20T00:00:00Z'
    FROM (SELECT convert_to(regexp_replace(jsonb_build_array(
      'discovery_identity','123e4567-e89b-42d3-a456-426614173001'::uuid
    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    INSERT INTO public.source_revision_family_registry_v3(
      source_key,revision_family_key,approved_source_identity_id,stable_connector_document_id,
      registered_at
    ) VALUES
    (
      'threads',repeat('3',64),'123e4567-e89b-42d3-a456-426614173001',
      'lifecycle-post','2026-07-20T00:00:00Z'
    ),(
      'threads',repeat('5',64),'123e4567-e89b-42d3-a456-426614173001',
      'lifecycle-post-newer','2026-07-20T00:00:00Z'
    );
    INSERT INTO public.stocks(id,symbol)
    VALUES('123e4567-e89b-42d3-a456-426614173330','2330');
    INSERT INTO public.stock_instruments_v3(
      instrument_authority_id,stock_id,symbol,exchange,instrument_type,listing_status,
      official_legal_name,official_short_name,provider,source_timestamp,valid_from,
      valid_to,roster_version,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614173331',
      '123e4567-e89b-42d3-a456-426614173330','2330','TWSE','common_stock','active',
      '台灣積體電路製造股份有限公司','台積電','twse','2026-07-20T00:00:00Z',
      '2026-01-01T00:00:00Z',NULL,'tw-instrument-roster-v3.0','2026-07-20T00:00:00Z'
    );
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'instrument_roster',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,'2026-07-20T00:00:00Z'
    FROM (SELECT convert_to(regexp_replace(jsonb_build_array(
      'instrument_roster','123e4567-e89b-42d3-a456-426614173330'::uuid
    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    INSERT INTO public.stock_sector_assignments_v3(
      assignment_authority_id,stock_id,market,official_industry_code,canonical_sector_key,
      provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614173332',
      '123e4567-e89b-42d3-a456-426614173330','TWSE','24','semiconductor',
      'twse','2026-07-20T00:00:00Z','2026-01-01T00:00:00Z',NULL,
      'tw-sector-taxonomy-v3.0','active','2026-07-20T00:00:00Z'
    );
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'sector_assignment',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,'2026-07-20T00:00:00Z'
    FROM (SELECT convert_to(regexp_replace(jsonb_build_array(
      'sector_assignment','123e4567-e89b-42d3-a456-426614173330'::uuid,'TWSE'
    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    INSERT INTO public.source_document_revisions_v3(
      revision_id,revision_family_key,source_key,source_identity_authority_id,
      approved_source_identity_id,stable_connector_document_id,canonical_url_candidate,
      published_at,collected_at,recorded_at,adapter_version,acquisition_status,
      raw_field_payload,raw_code_point_count,raw_field_payload_algorithm_version,
      ingestion_content_revision_sha256,canonical_content_algorithm_version,
      ingestion_canonical_content_hash_v3,supersedes_revision_id
    ) VALUES
    (
      '123e4567-e89b-42d3-a456-426614173003',repeat('3',64),'threads',
      '123e4567-e89b-42d3-a456-426614173002',
      '123e4567-e89b-42d3-a456-426614173001','lifecycle-post',
      'https://example.com/lifecycle-post','2026-07-22T06:00:00Z',
      '2026-07-22T06:01:00Z','2026-07-22T06:02:00Z',
      'source-adapter-v3.3','complete','["2330 營收維持成長","",""]'::jsonb,11,
      'raw-field-payload-v3.0',repeat('4',64),'canonical-content-v3.0',
      ${sqlLiteral(lifecycleSourceContentHash)},NULL
    ),(
      '123e4567-e89b-42d3-a456-426614173004',repeat('5',64),'threads',
      '123e4567-e89b-42d3-a456-426614173002',
      '123e4567-e89b-42d3-a456-426614173001','lifecycle-post-newer',
      'https://example.com/lifecycle-post-newer','2026-07-22T07:00:00Z',
      '2026-07-22T07:01:00Z','2026-07-22T07:02:00Z',
      'source-adapter-v3.3','complete','["2330 營收維持成長","",""]'::jsonb,11,
      'raw-field-payload-v3.0',repeat('6',64),'canonical-content-v3.0',
      ${sqlLiteral(lifecycleNewerSourceContentHash)},NULL
    );
    SELECT * FROM public.begin_opportunity_run_v3(
      'source_scan','ad_hoc_shadow','2026-07-23T08:00:00Z',NULL,
      '123e4567-e89b-42d3-a456-426614174000'
    );
    SELECT jsonb_build_object(
      'jobCount',(SELECT count(*) FROM public.opportunity_run_jobs_v3),
      'payloadCount',(SELECT count(*) FROM public.opportunity_job_payloads_v3),
      'jobId',j.job_id,
      'stage',j.stage,
      'shardKey',j.shard_key,
      'inputHash',j.input_hash,
      'preparationKey',r.preparation_key,
      'comparisonContractKey',r.comparison_contract_key,
      'evaluationDatasetLockHash',r.evaluation_dataset_lock_hash,
      'payload',p.payload_json,
      'payloadHash',p.payload_hash,
      'canonicalHash',encode(extensions.digest(p.payload_canonical,'sha256'),'hex')
    )::text
    FROM public.opportunity_run_jobs_v3 j
    JOIN public.opportunity_job_payloads_v3 p USING(job_id,run_id)
    JOIN public.opportunity_runs r USING(run_id);
  `, ['-At']).trim().split('\n').at(-1);
  const decoded = JSON.parse(result);
  assert.equal(decoded.jobCount, 1);
  assert.equal(decoded.payloadCount, 1);
  assert.equal(decoded.stage, 'authority_manifest');
  assert.equal(decoded.shardKey, 'source_identity_allowlist:0:header');
  assert.match(decoded.jobId, /^[0-9a-f-]{36}$/u);
  assert.match(decoded.inputHash, /^[0-9a-f]{64}$/u);
  assert.equal(staticIdentityMembers.length, 41);
  assert.ok(staticIdentityMemberDeclarations.length >= 2);
  for (const declaration of staticIdentityMemberDeclarations) {
    assert.deepEqual(declaration, staticIdentityMembers,
      'begin and final seal must use the same current static identity tuple');
  }
  assert.equal(
    decoded.comparisonContractKey,
    digest(['opportunity-comparison-contract-v3.0', ['staticIdentityMembers', staticIdentityMembers]]),
  );
  assert.equal(decoded.comparisonContractKey, 'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729');
  assert.equal(decoded.evaluationDatasetLockHash, null);
  assert.equal(decoded.preparationKey, digest([
    'opportunity-preparation-v3.0',
    ['mode', 'source_scan'],
    ['runPurpose', 'ad_hoc_shadow'],
    ['sourceCutoff', '2026-07-23T08:00:00Z'],
    ['inputRunIds', []],
    ['comparisonContractKey', decoded.comparisonContractKey],
    ['evaluationDatasetLockHash', null],
    ['staticIdentityMembers', staticIdentityMembers],
  ]));
  assert.equal(decoded.payload[0], 'opportunity-job-payload-v3.3');
  assert.equal(decoded.payload[1], 'manifest_header');
  assert.equal(decoded.payload[5][2], 'source_identity_allowlist');
  assert.equal(decoded.payloadHash, decoded.canonicalHash);
});

test('applied empty-run lifecycle commits each predecessor and deterministic successor atomically', () => {
  const result = psql(`
    \\set VERBOSITY verbose
    DO $lifecycle$
    DECLARE
      v_run uuid := (SELECT run_id FROM public.opportunity_runs ORDER BY created_at,run_id LIMIT 1);
      v_claim record;
      v_read jsonb;
      v_output jsonb;
      v_text text;
      v_hash text;
      v_native jsonb;
      v_rows public.opportunity_manifest_row_input_v3[];
      v_row public.opportunity_manifest_row_input_v3;
      v_page_rows jsonb;
      v_page jsonb;
      v_root jsonb;
      v_row_count bigint;
      v_payload_hash text;
      v_identity text;
      v_row_ordinal bigint;
      v_taken integer;
      v_steps integer := 0;
    BEGIN
      LOOP
        v_steps := v_steps + 1;
        IF v_steps > 64 THEN RAISE EXCEPTION 'lifecycle did not converge'; END IF;
        SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
          v_run,'123e4567-e89b-42d3-a456-426614174099'
        );
        CASE v_claim.payload_kind
          WHEN 'manifest_header' THEN
            PERFORM public.create_opportunity_manifest_v3(
              v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
              (v_claim.payload_json->5->>2)::public.opportunity_manifest_kind_v3,
              v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
              convert_to(regexp_replace((v_claim.payload_json->5->5)::text, ', ', ',', 'g'), 'utf8'),
              v_claim.payload_json->5->5
            );
          WHEN 'manifest_root' THEN
            SELECT read_json->5 INTO STRICT v_read
            FROM public.opportunity_worker_read_units_v3
            WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
            SELECT coalesce(sum((value->>1)::bigint),0) INTO v_row_count
            FROM jsonb_array_elements(v_read->1);
            v_root:=jsonb_build_array(
              'opportunity-manifest-root-v3.3',v_claim.payload_json->5->>2,
              v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
              v_read->0,v_read->1
            );
            v_text:=regexp_replace(v_root::text, ', ', ',', 'g');
            v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
            PERFORM public.complete_opportunity_manifest_v3(
              v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,v_row_count,
              convert_to(v_text,'utf8'),v_root,v_hash
            );
          WHEN 'manifest_page' THEN
            SELECT read_json->5 INTO STRICT v_read
            FROM public.opportunity_worker_read_units_v3
            WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
            v_rows:='{}'::public.opportunity_manifest_row_input_v3[];
            v_page_rows:='[]'::jsonb;
            v_taken:=0;
            FOR v_native IN
              SELECT value FROM jsonb_array_elements(v_read->1) WITH ORDINALITY rows(value,ordinality)
              WHERE ordinality<=2000 ORDER BY ordinality
            LOOP
              v_row_ordinal:=(v_claim.payload_json->5->>7)::bigint+v_taken;
              v_text:=regexp_replace(v_native::text, ', ', ',', 'g');
              v_payload_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
              v_identity:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
                'opportunity-manifest-row-identity-v3.3',v_claim.payload_json->5->>2,
                v_claim.payload_json->5->>5,v_row_ordinal,v_payload_hash
              )::text, ', ', ',', 'g'),'utf8'),'sha256'),'hex');
              v_row:=ROW(
                v_row_ordinal,v_identity,
                CASE
                  WHEN v_native @> '["active"]'::jsonb THEN 'effective_active'
                  WHEN v_native @> '["inactive"]'::jsonb
                    OR v_native @> '["delisted"]'::jsonb
                  THEN 'revoked_or_expired'
                  ELSE NULL
                END,
                convert_to(v_text,'utf8'),v_native,v_payload_hash
              )::public.opportunity_manifest_row_input_v3;
              v_rows:=array_append(v_rows,v_row);
              v_page_rows:=v_page_rows||jsonb_build_array(jsonb_build_array(
                v_row_ordinal,v_identity,
                CASE
                  WHEN v_native @> '["active"]'::jsonb THEN 'effective_active'
                  WHEN v_native @> '["inactive"]'::jsonb
                    OR v_native @> '["delisted"]'::jsonb
                  THEN 'revoked_or_expired'
                  ELSE NULL
                END,
                v_native
              ));
              v_taken:=v_taken+1;
            END LOOP;
            v_page:=jsonb_build_array(
              'opportunity-manifest-page-v3.3',v_claim.payload_json->5->>2,
              v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
              v_claim.payload_json->5->>5,(v_claim.payload_json->5->>6)::integer,
              (v_claim.payload_json->5->>7)::bigint,v_page_rows
            );
            v_text:=regexp_replace(v_page::text, ', ', ',', 'g');
            v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
            PERFORM public.append_opportunity_manifest_page_v3(
              v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
              (v_claim.payload_json->5->>5)::public.opportunity_manifest_section_key_v3,
              (v_claim.payload_json->5->>6)::integer,(v_claim.payload_json->5->>7)::bigint,
              convert_to(v_text,'utf8'),v_page,v_hash,v_rows
            );
          WHEN 'seal' THEN
            PERFORM public.seal_opportunity_run_inputs_v3(v_run,v_claim.owner_token);
          WHEN 'source_parse_batch','source_connector_summary' THEN
            SELECT read_json->5 INTO STRICT v_read
            FROM public.opportunity_worker_read_units_v3
            WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
            IF v_claim.payload_kind='source_parse_batch' THEN
              IF v_read->>0='123e4567-e89b-42d3-a456-426614173003' THEN
                IF (v_read->>1)::integer<>0
                  OR v_read->>2<>'threads'
                  OR v_read->8<>${sqlLiteral(JSON.stringify(lifecycleSourceFields))}::jsonb
                  OR v_read->>12<>${sqlLiteral(lifecycleSourceContentHash)}
                  OR jsonb_array_length(v_read->15)<>1
                  OR jsonb_array_length(v_read->16)<>0
                THEN RAISE EXCEPTION 'older source worker read does not match executable fixture'; END IF;
                v_read:=${sqlLiteral(JSON.stringify(lifecycleSourceParseOutput))}::jsonb;
              ELSIF v_read->>0='123e4567-e89b-42d3-a456-426614173004' THEN
                IF (v_read->>1)::integer<>1
                  OR v_read->>2<>'threads'
                  OR v_read->8<>${sqlLiteral(JSON.stringify(lifecycleNewerSourceFields))}::jsonb
                  OR v_read->>12<>${sqlLiteral(lifecycleNewerSourceContentHash)}
                  OR jsonb_array_length(v_read->15)<>1
                  OR jsonb_array_length(v_read->16)<>1
                THEN RAISE EXCEPTION 'newer source worker read does not match executable fixture'; END IF;
                v_read:=${sqlLiteral(JSON.stringify(lifecycleNewerSourceParseOutput))}::jsonb;
              ELSE
                RAISE EXCEPTION 'unexpected source worker fixture %',v_read->>0;
              END IF;
            END IF;
            v_output := jsonb_build_array(
              'opportunity-job-output-v3.3',v_claim.payload_kind,v_run,
              v_claim.job_id,v_claim.input_hash,v_read,'[]'::jsonb
            );
            v_text := regexp_replace(v_output::text, ', ', ',', 'g');
            v_hash := encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
            PERFORM public.stage_opportunity_job_output_v3(
              v_claim.job_id,v_claim.owner_token,
              v_claim.payload_kind::text::public.opportunity_job_output_kind_v3,
              convert_to(v_text,'utf8'),v_output,v_hash,
              CASE WHEN v_claim.payload_kind='source_connector_summary'
                THEN ROW(0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
                ELSE ROW(0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
              END
            );
            PERFORM public.complete_opportunity_job_v3(
              v_claim.job_id,v_claim.owner_token,v_hash,
              CASE WHEN v_claim.payload_kind='source_connector_summary'
                THEN ROW(0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
                ELSE ROW(0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
              END
            );
          WHEN 'finalize' THEN
            PERFORM public.finalize_opportunity_run_v3(v_claim.job_id,v_claim.owner_token);
            EXIT;
          ELSE
            RAISE EXCEPTION 'unexpected payload kind %',v_claim.payload_kind;
        END CASE;
      END LOOP;
    END
    $lifecycle$;

    SELECT jsonb_build_object(
      'runStatus',(SELECT status FROM public.opportunity_runs ORDER BY created_at,run_id LIMIT 1),
      'jobStatuses',(SELECT jsonb_agg(status ORDER BY created_at,job_id)
        FROM public.opportunity_run_jobs_v3),
      'payloadKinds',(SELECT jsonb_agg(payload_kind ORDER BY j.created_at,j.job_id)
        FROM public.opportunity_job_payloads_v3 p
        JOIN public.opportunity_run_jobs_v3 j USING(job_id,run_id)),
      'orphanJobs',(SELECT count(*) FROM public.opportunity_run_jobs_v3 j
        LEFT JOIN public.opportunity_job_payloads_v3 p USING(job_id,run_id)
        WHERE p.job_id IS NULL),
      'documentCount',(SELECT count(*) FROM public.opportunity_source_document_outcomes
        WHERE revision_id IN (
          '123e4567-e89b-42d3-a456-426614173003',
          '123e4567-e89b-42d3-a456-426614173004'
        )),
      'claimCount',(SELECT count(*) FROM public.opportunity_source_claims
        WHERE revision_id IN (
          '123e4567-e89b-42d3-a456-426614173003',
          '123e4567-e89b-42d3-a456-426614173004'
        )),
      'claimTruth',(SELECT jsonb_agg(jsonb_build_object(
          'revisionId',claim.revision_id,
          'effectiveAt',claim.effective_at,
          'outcome',claim.outcome,
          'priorRevisionId',prior.revision_id
        ) ORDER BY claim.effective_at,claim.revision_id)
        FROM public.opportunity_source_claims claim
        LEFT JOIN public.opportunity_source_claims prior
          ON prior.claim_id=claim.canonical_prior_claim_id
        WHERE claim.revision_id IN (
          '123e4567-e89b-42d3-a456-426614173003',
          '123e4567-e89b-42d3-a456-426614173004'
        )),
      'selectedRevisionOrder',(SELECT jsonb_agg(payload_json->>16 ORDER BY row_ordinal)
        FROM public.opportunity_manifest_rows_v3 rows
        JOIN public.opportunity_manifests_v3 manifest USING(manifest_id)
        WHERE manifest.manifest_kind='source_dataset'
          AND rows.section_key='selected_revision_rows'),
      'stageResultMismatch',(SELECT count(*)
        FROM public.opportunity_job_staging_v3 staging
        JOIN public.opportunity_job_results_v3 result USING(job_id)
        WHERE result.output_kind='source_parse_batch'
          AND (
            staging.output_json IS DISTINCT FROM result.output_json
            OR staging.output_hash IS DISTINCT FROM result.output_hash
            OR staging.output_canonical IS DISTINCT FROM result.output_canonical
          )),
      'sourceDatasetRows',(SELECT row_count FROM public.opportunity_manifests_v3
        WHERE manifest_kind='source_dataset' ORDER BY terminal_at LIMIT 1)
    )::text;
  `, ['-At']).trim().split('\n').at(-1);
  const decoded = JSON.parse(result);
  assert.equal(decoded.runStatus, 'success');
  assert.deepEqual(decoded.jobStatuses, Array(56).fill('succeeded'));
  assert.deepEqual(decoded.payloadKinds, [
    'manifest_header', 'manifest_page', 'manifest_root',
    'manifest_header', 'manifest_root',
    'manifest_header', 'manifest_page', 'manifest_root',
    'manifest_header', 'manifest_root',
    'manifest_header', 'manifest_page', 'manifest_root',
    ...Array.from({ length: 9 }, () => ['manifest_header', 'manifest_root']).flat(),
    'manifest_header', 'manifest_page', 'manifest_root',
    'manifest_header', 'manifest_root',
    'manifest_header', 'manifest_page', 'manifest_page', 'manifest_page', 'manifest_root',
    'seal',
    ...Array(9).fill('source_connector_summary'),
    'source_parse_batch',
    'source_parse_batch',
    'source_connector_summary',
    'source_connector_summary',
    'finalize',
  ]);
  assert.equal(decoded.orphanJobs, 0);
  assert.equal(decoded.documentCount, 2);
  assert.equal(decoded.claimCount, 2);
  assert.deepEqual(decoded.claimTruth.map((row) => ({
    revisionId: row.revisionId,
    outcome: row.outcome,
    priorRevisionId: row.priorRevisionId,
  })), [
    {
      revisionId: '123e4567-e89b-42d3-a456-426614173003',
      outcome: 'unique_claim',
      priorRevisionId: null,
    },
    {
      revisionId: '123e4567-e89b-42d3-a456-426614173004',
      outcome: 'duplicate_claim',
      priorRevisionId: '123e4567-e89b-42d3-a456-426614173003',
    },
  ]);
  assert.deepEqual(decoded.selectedRevisionOrder, [
    '123e4567-e89b-42d3-a456-426614173003',
    '123e4567-e89b-42d3-a456-426614173004',
  ]);
  assert.equal(decoded.stageResultMismatch, 0);
  assert.equal(decoded.sourceDatasetRows, 24);
});

test('nonempty source-identity manifest executes header, bounded page, root and durable row', () => {
  const result = JSON.parse(psql(`
    INSERT INTO public.source_entities(id)
    VALUES
      ('123e4567-e89b-42d3-a456-426614170001'),
      ('123e4567-e89b-42d3-a456-426614170003');
    INSERT INTO public.internal_principal_role_bindings_v3(
      principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at
    )
    SELECT '123e4567-e89b-42d3-a456-426614174000'::uuid,
      'opportunity_runner'::public.internal_principal_role_v3,
      '2026-01-01'::timestamptz,NULL::timestamptz,
      'active'::public.authority_status_v3,
      repeat('e',64),'2026-07-18T00:00:00Z'::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM public.internal_principal_role_bindings_v3
      WHERE principal_id='123e4567-e89b-42d3-a456-426614174000'
        AND role='opportunity_runner'
    )
    UNION ALL
    SELECT '123e4567-e89b-42d3-a456-426614174099'::uuid,
      'opportunity_runner'::public.internal_principal_role_v3,
      '2026-01-01'::timestamptz,NULL::timestamptz,
      'active'::public.authority_status_v3,
      repeat('f',64),'2026-07-18T00:00:00Z'::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM public.internal_principal_role_bindings_v3
      WHERE principal_id='123e4567-e89b-42d3-a456-426614174099'
        AND role='opportunity_runner'
    );
    INSERT INTO public.source_identity_authorities_v3(
      authority_id,source_identity_id,source_key,source_class,distribution_identity,
      valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614170002',
      '123e4567-e89b-42d3-a456-426614170001',
      'threads','community','threads:test',
      '2026-01-01T00:00:00Z',NULL,'active',
      '2026-07-18T00:00:00Z','123e4567-e89b-42d3-a456-426614174000',
      '2026-07-18T00:00:00Z'
    ),(
      '123e4567-e89b-42d3-a456-426614170004',
      '123e4567-e89b-42d3-a456-426614170003',
      'threads','community','threads:future-approved',
      '2026-01-01T00:00:00Z',NULL,'active',
      '2030-01-01T00:00:00Z','123e4567-e89b-42d3-a456-426614174000',
      '2026-07-18T00:00:00Z'
    );
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'discovery_identity',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,'2026-07-18T00:00:00Z'
	    FROM (SELECT convert_to(regexp_replace(jsonb_build_array(
	      'discovery_identity','123e4567-e89b-42d3-a456-426614170001'::uuid
	    )::text,', ', ',', 'g'),'utf8') canonical
	    UNION ALL
	    SELECT convert_to(regexp_replace(jsonb_build_array(
	      'discovery_identity','123e4567-e89b-42d3-a456-426614170003'::uuid
	    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    DO $nonempty$
    DECLARE
      v_run uuid;
      v_claim record;
      v_read jsonb;
      v_native jsonb;
      v_payload_text text;
      v_payload_hash text;
      v_identity text;
      v_page jsonb;
      v_page_text text;
      v_page_hash text;
      v_root jsonb;
      v_root_text text;
      v_manifest_hash text;
      v_row public.opportunity_manifest_row_input_v3;
    BEGIN
      SELECT run_id INTO STRICT v_run FROM public.begin_opportunity_run_v3(
        'source_scan','ad_hoc_shadow','2026-07-19T07:59:59Z',NULL,
        '123e4567-e89b-42d3-a456-426614174000'
      ) WHERE disposition='created';
      SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
        v_run,'123e4567-e89b-42d3-a456-426614174099'
      );
      IF v_claim.payload_kind<>'manifest_header'
        OR v_claim.payload_json->5->5->0<>jsonb_build_array('rowCount',1)
      THEN RAISE EXCEPTION 'invalid nonempty header'; END IF;
      PERFORM public.create_opportunity_manifest_v3(
        v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
        (v_claim.payload_json->5->>2)::public.opportunity_manifest_kind_v3,
        v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
        convert_to(regexp_replace((v_claim.payload_json->5->5)::text, ', ', ',', 'g'),'utf8'),
        v_claim.payload_json->5->5
      );
      SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
        v_run,'123e4567-e89b-42d3-a456-426614174099'
      );
      IF v_claim.payload_kind<>'manifest_page' THEN
        RAISE EXCEPTION 'missing manifest page';
      END IF;
      SELECT read_json->5 INTO STRICT v_read
      FROM public.opportunity_worker_read_units_v3
      WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
      IF jsonb_array_length(v_read)<>2 OR v_read->0<>'null'::jsonb
        OR jsonb_array_length(v_read->1)<>1
      THEN RAISE EXCEPTION 'invalid manifest page read'; END IF;
      v_native:=v_read->1->0;
      v_payload_text:=regexp_replace(v_native::text, ', ', ',', 'g');
      v_payload_hash:=encode(extensions.digest(convert_to(v_payload_text,'utf8'),'sha256'),'hex');
      v_identity:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
        'opportunity-manifest-row-identity-v3.3','source_identity_allowlist','rows',0,v_payload_hash
      )::text, ', ', ',', 'g'),'utf8'),'sha256'),'hex');
      v_row:=ROW(
        0,v_identity,'effective_active',convert_to(v_payload_text,'utf8'),v_native,v_payload_hash
      )::public.opportunity_manifest_row_input_v3;
      v_page:=jsonb_build_array(
        'opportunity-manifest-page-v3.3','source_identity_allowlist',
        'source-identity-allowlist-v3.1','2026-07-19T07:59:59Z'::timestamptz,
        'rows',0,0,jsonb_build_array(jsonb_build_array(
          0,v_identity,'effective_active',v_native
        ))
      );
      v_page_text:=regexp_replace(v_page::text, ', ', ',', 'g');
      v_page_hash:=encode(extensions.digest(convert_to(v_page_text,'utf8'),'sha256'),'hex');
      PERFORM public.append_opportunity_manifest_page_v3(
        v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
        'rows',0,0,convert_to(v_page_text,'utf8'),v_page,v_page_hash,ARRAY[v_row]
      );
      SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
        v_run,'123e4567-e89b-42d3-a456-426614174099'
      );
      IF v_claim.payload_kind<>'manifest_root' THEN
        RAISE EXCEPTION 'missing manifest root';
      END IF;
      SELECT read_json->5 INTO STRICT v_read
      FROM public.opportunity_worker_read_units_v3
      WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
      IF jsonb_array_length(v_read)<>2
        OR v_read->1->0->>0<>'rows'
        OR (v_read->1->0->>1)::integer<>1
        OR jsonb_array_length(v_read->1->0->2)<>1
      THEN RAISE EXCEPTION 'invalid manifest root read'; END IF;
      v_root:=jsonb_build_array(
        'opportunity-manifest-root-v3.3','source_identity_allowlist',
        'source-identity-allowlist-v3.1','2026-07-19T07:59:59Z'::timestamptz,
        v_read->0,v_read->1
      );
      v_root_text:=regexp_replace(v_root::text, ', ', ',', 'g');
      v_manifest_hash:=encode(extensions.digest(convert_to(v_root_text,'utf8'),'sha256'),'hex');
      PERFORM public.complete_opportunity_manifest_v3(
        v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,1,
        convert_to(v_root_text,'utf8'),v_root,v_manifest_hash
      );
    END
    $nonempty$;
    SELECT jsonb_build_object(
      'completeManifests',(SELECT count(*) FROM public.opportunity_manifests_v3
        WHERE manifest_kind='source_identity_allowlist' AND source_cutoff='2026-07-19T07:59:59Z'
          AND row_count=1 AND status='complete'),
      'pageCount',(SELECT count(*) FROM public.opportunity_manifest_pages_v3 p
        JOIN public.opportunity_manifests_v3 m USING(manifest_id)
        WHERE m.manifest_kind='source_identity_allowlist'
          AND m.source_cutoff='2026-07-19T07:59:59Z' AND p.row_count=1),
      'rowCount',(SELECT count(*) FROM public.opportunity_manifest_rows_v3 r
        JOIN public.opportunity_manifests_v3 m USING(manifest_id)
        WHERE m.manifest_kind='source_identity_allowlist'
          AND m.source_cutoff='2026-07-19T07:59:59Z' AND r.section_key='rows'),
      'successJobs',(SELECT count(*) FROM public.opportunity_run_jobs_v3 j
        JOIN public.opportunity_manifests_v3 m ON m.manifest_id=j.output_manifest_id
        WHERE m.manifest_kind='source_identity_allowlist'
          AND m.source_cutoff='2026-07-19T07:59:59Z'
          AND m.row_count=1 AND j.status='succeeded')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.deepEqual(result, {
    completeManifests: 1,
    pageCount: 1,
    rowCount: 1,
    successJobs: 3,
  });
});

test('source-identity manifest advances a hash-bound 2,001-row sentinel into two cursor pages', () => {
  const result = JSON.parse(psql(`
    INSERT INTO public.source_entities(id)
    SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid
    FROM generate_series(1,2001) i;
    INSERT INTO public.source_identity_authorities_v3(
      authority_id,source_identity_id,source_key,source_class,distribution_identity,
      valid_from,valid_to,status,approved_at,approving_principal_id,recorded_at
    )
    SELECT
      ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      'threads','community','threads:bulk:'||i,
      '2026-01-01T00:00:00Z',NULL,'active',
      '2026-07-20T00:00:00Z','123e4567-e89b-42d3-a456-426614174000',
      '2026-07-20T00:00:00Z'
    FROM generate_series(1,2001) i;
    INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at
    )
    SELECT 'discovery_identity',encode(extensions.digest(canonical,'sha256'),'hex'),
      canonical,'2026-07-20T00:00:00Z'
    FROM generate_series(1,2001) i
    CROSS JOIN LATERAL (SELECT convert_to(regexp_replace(jsonb_build_array(
      'discovery_identity',
      ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid
    )::text,', ', ',', 'g'),'utf8') canonical) fixture;
    DO $multipage$
    DECLARE
      v_run uuid; v_manifest uuid; v_claim record; v_read jsonb; v_native jsonb;
      v_rows public.opportunity_manifest_row_input_v3[]; v_row public.opportunity_manifest_row_input_v3;
      v_page_rows jsonb; v_page jsonb; v_root jsonb;
      v_text text; v_hash text; v_payload_hash text; v_identity text;
      v_row_ordinal bigint; v_taken integer; v_page_count integer:=0;
    BEGIN
      SELECT run_id INTO STRICT v_run FROM public.begin_opportunity_run_v3(
        'source_scan','ad_hoc_shadow','2026-07-23T07:59:58Z',NULL,
        '123e4567-e89b-42d3-a456-426614174000'
      ) WHERE disposition='created';
      SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
        v_run,'123e4567-e89b-42d3-a456-426614174099'
      );
      v_manifest:=(v_claim.payload_json->5->>1)::uuid;
      IF (v_claim.payload_json->5->5->0->>1)::integer<>2003 THEN
        RAISE EXCEPTION 'unexpected multipage row count';
      END IF;
      PERFORM public.create_opportunity_manifest_v3(
        v_claim.job_id,v_claim.owner_token,v_manifest,
        (v_claim.payload_json->5->>2)::public.opportunity_manifest_kind_v3,
        v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
        convert_to(regexp_replace((v_claim.payload_json->5->5)::text, ', ', ',', 'g'),'utf8'),
        v_claim.payload_json->5->5
      );
      LOOP
        SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
          v_run,'123e4567-e89b-42d3-a456-426614174099'
        );
        EXIT WHEN v_claim.payload_kind='manifest_root';
        IF v_claim.payload_kind<>'manifest_page' THEN
          RAISE EXCEPTION 'unexpected multipage payload %',v_claim.payload_kind;
        END IF;
        SELECT read_json->5 INTO STRICT v_read
        FROM public.opportunity_worker_read_units_v3
        WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
        v_rows:='{}'::public.opportunity_manifest_row_input_v3[];
        v_page_rows:='[]'::jsonb;
        v_taken:=0;
        FOR v_native IN
          SELECT value FROM jsonb_array_elements(v_read->1) WITH ORDINALITY rows(value,ordinality)
          WHERE ordinality<=2000 ORDER BY ordinality
        LOOP
          v_row_ordinal:=(v_claim.payload_json->5->>7)::bigint+v_taken;
          v_text:=regexp_replace(v_native::text, ', ', ',', 'g');
          v_payload_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
          v_identity:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
            'opportunity-manifest-row-identity-v3.3','source_identity_allowlist','rows',
            v_row_ordinal,v_payload_hash
          )::text, ', ', ',', 'g'),'utf8'),'sha256'),'hex');
          v_row:=ROW(
            v_row_ordinal,v_identity,'effective_active',convert_to(v_text,'utf8'),v_native,v_payload_hash
          )::public.opportunity_manifest_row_input_v3;
          v_rows:=array_append(v_rows,v_row);
          v_page_rows:=v_page_rows||jsonb_build_array(jsonb_build_array(
            v_row_ordinal,v_identity,'effective_active',v_native
          ));
          v_taken:=v_taken+1;
        END LOOP;
        v_page:=jsonb_build_array(
          'opportunity-manifest-page-v3.3','source_identity_allowlist',
          'source-identity-allowlist-v3.1','2026-07-23T07:59:58Z'::timestamptz,
          'rows',(v_claim.payload_json->5->>6)::integer,
          (v_claim.payload_json->5->>7)::bigint,v_page_rows
        );
        v_text:=regexp_replace(v_page::text, ', ', ',', 'g');
        v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
        PERFORM public.append_opportunity_manifest_page_v3(
          v_claim.job_id,v_claim.owner_token,v_manifest,'rows',
          (v_claim.payload_json->5->>6)::integer,(v_claim.payload_json->5->>7)::bigint,
          convert_to(v_text,'utf8'),v_page,v_hash,v_rows
        );
        v_page_count:=v_page_count+1;
      END LOOP;
      SELECT read_json->5 INTO STRICT v_read
      FROM public.opportunity_worker_read_units_v3
      WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
      v_root:=jsonb_build_array(
        'opportunity-manifest-root-v3.3','source_identity_allowlist',
        'source-identity-allowlist-v3.1','2026-07-23T07:59:58Z'::timestamptz,
        v_read->0,v_read->1
      );
      v_text:=regexp_replace(v_root::text, ', ', ',', 'g');
      v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
      PERFORM public.complete_opportunity_manifest_v3(
        v_claim.job_id,v_claim.owner_token,v_manifest,2003,
        convert_to(v_text,'utf8'),v_root,v_hash
      );
      IF v_page_count<>2 THEN RAISE EXCEPTION 'expected two pages'; END IF;
    END
    $multipage$;
    SELECT jsonb_build_object(
      'rows',(SELECT row_count FROM public.opportunity_manifests_v3
        WHERE manifest_kind='source_identity_allowlist' AND source_cutoff='2026-07-23T07:59:58Z'),
      'pages',(SELECT count(*) FROM public.opportunity_manifest_pages_v3 p
        JOIN public.opportunity_manifests_v3 m USING(manifest_id)
        WHERE m.manifest_kind='source_identity_allowlist' AND m.source_cutoff='2026-07-23T07:59:58Z'),
      'pageCounts',(SELECT jsonb_agg(p.row_count ORDER BY p.page_ordinal)
        FROM public.opportunity_manifest_pages_v3 p
        JOIN public.opportunity_manifests_v3 m USING(manifest_id)
        WHERE m.manifest_kind='source_identity_allowlist' AND m.source_cutoff='2026-07-23T07:59:58Z')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.deepEqual(result, { rows: 2003, pages: 2, pageCounts: [2000, 3] });
});

test('all four mode graphs use closed reads; enrich executes nonempty normalized stages and converges', () => {
  psql(`
    INSERT INTO public.tw_trading_sessions_v3(
      session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at
    )
    SELECT session_id,market,
      session_id::timestamp AT TIME ZONE 'UTC' + interval '1 hour',
      session_id::timestamp AT TIME ZONE 'UTC' + interval '8 hours',
      'completed',
      CASE market WHEN 'TWSE'::public.tw_market_v3 THEN 'twse'::public.official_roster_provider_v3
        ELSE 'tpex'::public.official_roster_provider_v3 END,
      session_id::timestamp AT TIME ZONE 'UTC' + interval '6 hours',
      session_id::timestamp AT TIME ZONE 'UTC' + interval '7 hours',
      lower(market::text)||':'||session_id::text,
      session_id::timestamp AT TIME ZONE 'UTC' + interval '7 hours'
    FROM generate_series(0,252) offset_days
    CROSS JOIN LATERAL (
      SELECT '2026-07-23'::date-offset_days::integer AS session_id
    ) sessions
    CROSS JOIN unnest(ARRAY['TWSE','TPEX']::public.tw_market_v3[]) market;

    INSERT INTO public.opportunity_runs(
      run_id,preparation_key,logical_key,attempt,mode,run_purpose,trading_date,
      source_cutoff,comparison_contract_key,evaluation_dataset_lock_hash,status,
      created_at,sealed_at,terminal_at,recorded_at
    ) VALUES
      (
        '123e4567-e89b-42d3-a456-426614177901',repeat('7',64),repeat('7',64),1,
        'enrich_rank','backtest_daily_primary','2026-04-01',
        '2026-04-01T08:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        encode(extensions.digest(convert_to('source-led-eval-v3.7','utf8'),'sha256'),'hex'),
        'success','2026-04-01T08:00:01Z','2026-04-01T08:00:02Z',
        '2026-04-01T08:00:03Z','2026-04-01T08:00:01Z'
      ),
      (
        '123e4567-e89b-42d3-a456-426614177902',repeat('8',64),repeat('8',64),1,
        'label_outcomes','outcome_label_daily','2026-07-20',
        '2026-07-20T09:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        encode(extensions.digest(convert_to('source-led-eval-v3.7','utf8'),'sha256'),'hex'),
        'success','2026-07-20T09:00:01Z','2026-07-20T09:00:02Z',
        '2026-07-20T09:00:03Z','2026-07-20T09:00:01Z'
      );
    INSERT INTO public.opportunity_score_snapshots(
      score_snapshot_id,run_id,stock_id,symbol,horizon,rank,score,score_confidence,
      available_weight,payload_canonical,payload_json,payload_hash,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614177903',
      '123e4567-e89b-42d3-a456-426614177901',
      '123e4567-e89b-42d3-a456-426614173330',
      '2330','swing_20_60d',1,80,0.8,100,
      convert_to('{"fixture":"label"}','utf8'),'{"fixture":"label"}',
      encode(extensions.digest(convert_to('{"fixture":"label"}','utf8'),'sha256'),'hex'),
      '2026-04-01T08:00:03Z'
    );
  `);
  const expected = {
    enrich_rank: [
      ...Array.from({ length: 2 }, () => ['manifest_header', 'manifest_root']).flat(),
      'manifest_header', 'manifest_page', 'manifest_page', 'manifest_root',
      'manifest_header', 'manifest_page', 'manifest_root',
      'manifest_header', 'manifest_page', 'manifest_page', 'manifest_root',
      'manifest_header',
      ...Array.from({ length: 5 }, () => 'manifest_page'),
      'manifest_root',
      ...Array.from({ length: 5 }, () => [
        'manifest_header', 'manifest_page', 'manifest_page', 'manifest_root',
      ]).flat(),
      ...Array.from({ length: 3 }, () => [
        'manifest_header', 'manifest_page', 'manifest_page', 'manifest_root',
      ]).flat(),
      'manifest_header', 'manifest_page', 'manifest_page', 'manifest_page', 'manifest_root',
      'seal', 'market_context_snapshot', 'shallow_candidate_batch', 'sector_cycle_batch',
      'deep_candidate_batch', 'portfolio_allocation_batch', 'projection_bundle', 'finalize',
    ],
    label_outcomes: [
      'manifest_header', 'manifest_page', 'manifest_root',
      'manifest_header', 'manifest_page', 'manifest_page', 'manifest_root',
      'seal', 'finalize',
    ],
    shadow_evaluate: [
      'manifest_header', 'manifest_page', 'manifest_root',
      ...Array.from({ length: 2 }, () => ['manifest_header', 'manifest_root']).flat(),
      'seal', 'evaluation_bundle', 'finalize',
    ],
  };
  for (const [mode, expectedKinds] of Object.entries(expected)) {
    const purpose = mode === 'label_outcomes'
      ? 'outcome_label_daily'
      : mode === 'shadow_evaluate'
        ? 'shadow_evaluation_daily'
        : 'ad_hoc_shadow';
    const cutoff = mode === 'enrich_rank'
      ? '2026-07-23T08:00:00Z'
      : '2026-07-23T07:00:00Z';
    const result = psql(`
      DO $mode_lifecycle$
      DECLARE
        v_run uuid;
        v_claim record;
        v_envelope jsonb;
        v_canonical bytea;
        v_read_hash text;
        v_output jsonb;
        v_native jsonb;
        v_page_rows jsonb;
        v_text text;
        v_hash text;
        v_payload_hash text;
        v_identity text;
        v_row_ordinal bigint;
        v_taken integer;
        v_rows public.opportunity_manifest_row_input_v3[];
        v_input_row public.opportunity_manifest_row_input_v3;
        v_counts public.opportunity_job_counts_v3;
        v_steps integer := 0;
      BEGIN
        SELECT run_id INTO STRICT v_run FROM public.begin_opportunity_run_v3(
          '${mode}'::public.opportunity_mode_v3,'${purpose}'::public.opportunity_run_purpose_v3,
          '${cutoff}',NULL,'123e4567-e89b-42d3-a456-426614174000'
        ) WHERE disposition='created';
        LOOP
          v_steps := v_steps + 1;
          IF v_steps > 96 THEN RAISE EXCEPTION 'mode lifecycle did not converge'; END IF;
          SELECT * INTO STRICT v_claim FROM public.claim_opportunity_job_v3(
            v_run,'123e4567-e89b-42d3-a456-426614174099'
          );
          CASE v_claim.payload_kind
            WHEN 'manifest_header' THEN
              PERFORM public.create_opportunity_manifest_v3(
                v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
                (v_claim.payload_json->5->>2)::public.opportunity_manifest_kind_v3,
                v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
                convert_to(regexp_replace((v_claim.payload_json->5->5)::text, ', ', ',', 'g'),'utf8'),
                v_claim.payload_json->5->5
              );
            WHEN 'manifest_root' THEN
              SELECT read_json INTO STRICT v_envelope
              FROM public.opportunity_worker_read_units_v3
              WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
              v_output:=jsonb_build_array(
                'opportunity-manifest-root-v3.3',v_claim.payload_json->5->>2,
                v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
                v_envelope->5->0,v_envelope->5->1
              );
              v_text:=regexp_replace(v_output::text, ', ', ',', 'g');
              v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
              PERFORM public.complete_opportunity_manifest_v3(
                v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
                (SELECT count(*) FROM public.opportunity_manifest_rows_v3
                  WHERE manifest_id=(v_claim.payload_json->5->>1)::uuid),
                convert_to(v_text,'utf8'),v_output,v_hash
              );
            WHEN 'manifest_page' THEN
              SELECT read_json INTO STRICT v_envelope
              FROM public.opportunity_worker_read_units_v3
              WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
              v_rows:='{}'::public.opportunity_manifest_row_input_v3[];
              v_page_rows:='[]'::jsonb;
              v_taken:=0;
              FOR v_native IN
                SELECT value
                FROM jsonb_array_elements(v_envelope->5->1) WITH ORDINALITY rows(value,ordinality)
                WHERE ordinality<=2000
                ORDER BY ordinality
              LOOP
                v_row_ordinal:=(v_claim.payload_json->5->>7)::bigint+v_taken;
                v_text:=regexp_replace(v_native::text, ', ', ',', 'g');
                v_payload_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
                v_identity:=encode(extensions.digest(convert_to(regexp_replace(jsonb_build_array(
                  'opportunity-manifest-row-identity-v3.3',
                  v_claim.payload_json->5->>2,v_claim.payload_json->5->>5,
                  v_row_ordinal,v_payload_hash
                )::text, ', ', ',', 'g'),'utf8'),'sha256'),'hex');
                v_input_row:=ROW(
                  v_row_ordinal,v_identity,
                  CASE
                    WHEN v_native @> '["active"]'::jsonb THEN 'effective_active'
                    WHEN v_native @> '["inactive"]'::jsonb
                      OR v_native @> '["delisted"]'::jsonb
                    THEN 'revoked_or_expired'
                    ELSE NULL
                  END,
                  convert_to(v_text,'utf8'),v_native,v_payload_hash
                )::public.opportunity_manifest_row_input_v3;
                v_rows:=array_append(v_rows,v_input_row);
                v_page_rows:=v_page_rows||jsonb_build_array(jsonb_build_array(
                  v_row_ordinal,v_identity,
                  CASE
                    WHEN v_native @> '["active"]'::jsonb THEN 'effective_active'
                    WHEN v_native @> '["inactive"]'::jsonb
                      OR v_native @> '["delisted"]'::jsonb
                    THEN 'revoked_or_expired'
                    ELSE NULL
                  END,
                  v_native
                ));
                v_taken:=v_taken+1;
              END LOOP;
              v_output:=jsonb_build_array(
                'opportunity-manifest-page-v3.3',v_claim.payload_json->5->>2,
                v_claim.payload_json->5->>3,(v_claim.payload_json->5->>4)::timestamptz,
                v_claim.payload_json->5->>5,(v_claim.payload_json->5->>6)::integer,
                (v_claim.payload_json->5->>7)::bigint,v_page_rows
              );
              v_text:=regexp_replace(v_output::text, ', ', ',', 'g');
              v_hash:=encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
              PERFORM public.append_opportunity_manifest_page_v3(
                v_claim.job_id,v_claim.owner_token,(v_claim.payload_json->5->>1)::uuid,
                (v_claim.payload_json->5->>5)::public.opportunity_manifest_section_key_v3,
                (v_claim.payload_json->5->>6)::integer,(v_claim.payload_json->5->>7)::bigint,
                convert_to(v_text,'utf8'),v_output,v_hash,v_rows
              );
            WHEN 'seal' THEN
              PERFORM public.seal_opportunity_run_inputs_v3(v_run,v_claim.owner_token);
            WHEN 'finalize' THEN
              PERFORM public.finalize_opportunity_run_v3(v_claim.job_id,v_claim.owner_token);
              EXIT;
            ELSE
              SELECT read_json,read_canonical,read_hash
              INTO STRICT v_envelope,v_canonical,v_read_hash
              FROM public.opportunity_worker_read_units_v3
              WHERE job_id=v_claim.job_id AND input_hash=v_claim.input_hash;
              IF jsonb_array_length(v_envelope)<>6
                OR v_envelope->>0<>'opportunity-worker-read-v3.4'
                OR v_envelope->>2<>v_run::text
                OR v_envelope->>3<>v_claim.job_id::text
                OR v_envelope->>4<>v_claim.input_hash
                OR convert_to(regexp_replace(v_envelope::text, ', ', ',', 'g'),'utf8')<>v_canonical
                OR encode(extensions.digest(v_canonical,'sha256'),'hex')<>v_read_hash
              THEN RAISE EXCEPTION 'invalid worker read envelope'; END IF;
              v_output := jsonb_build_array(
                'opportunity-job-output-v3.3',v_claim.payload_kind,v_run,
                v_claim.job_id,v_claim.input_hash,
                CASE WHEN v_claim.payload_kind='evaluation_bundle' THEN
                  jsonb_build_object('strategyRows',jsonb_build_array(
                    jsonb_build_object('strategy','official_only'),
                    jsonb_build_object('strategy','source_led'),
                    jsonb_build_object('strategy','hybrid')
                  ),'status','fail')
                WHEN v_claim.payload_kind='market_context_snapshot' THEN
                  jsonb_build_object(
                    'contractVersion','market-context-v3.6',
                    'regime','unknown','completeness','insufficient',
                    'composite',NULL,'newPositionBudgetPct',15,
                    'groups',jsonb_build_object(
                      'trend',jsonb_build_object('status','missing','score',NULL),
                      'breadth',jsonb_build_object('status','missing','score',NULL),
                      'flow',jsonb_build_object('status','missing','score',NULL),
                      'derivatives',jsonb_build_object('status','missing','score',NULL),
                      'global',jsonb_build_object('status','missing','score',NULL)
                    ),
                    'missingGroups',jsonb_build_array(
                      'trend','breadth','flow','derivatives','global'
                    ),
                    'overrideReason',NULL,
                    'asOf','${cutoff}'::timestamptz
                  )
                WHEN v_claim.payload_kind='shallow_candidate_batch' THEN
                  coalesce((
                    SELECT jsonb_agg(jsonb_build_array(
                      input->1,input->2,true,'direct_candidate',input->5,
                      input->8,0,0,0,input->7,'succeeded',NULL,input->9
                    ) ORDER BY input->>2)
                    FROM jsonb_array_elements(v_envelope->5->0) input
                  ),'[]'::jsonb)
                WHEN v_claim.payload_kind='deep_candidate_batch' THEN
                  coalesce((
                    SELECT jsonb_agg(jsonb_build_array(
                      input->1,input->2,true,'direct_candidate',
                      input->5,input->6,
                      NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'data_integrity_failure'
                    ) ORDER BY input->>2)
                    FROM jsonb_array_elements(v_envelope->5->0) input
                  ),'[]'::jsonb)
                WHEN v_claim.payload_kind='projection_bundle' THEN
                  jsonb_build_array(v_envelope->5->0,'{}'::jsonb,'[]'::jsonb)
                ELSE v_envelope->5 END,
                '[]'::jsonb
              );
              v_text := regexp_replace(v_output::text, ', ', ',', 'g');
              v_hash := encode(extensions.digest(convert_to(v_text,'utf8'),'sha256'),'hex');
              v_counts := CASE v_claim.payload_kind
                WHEN 'market_context_snapshot' THEN
                  ROW(0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
                WHEN 'shallow_candidate_batch' THEN
                  ROW(0,0,0,0,0,jsonb_array_length(v_output->5),0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
                WHEN 'sector_cycle_batch' THEN
                  ROW(0,0,0,0,0,0,0,0,0,jsonb_array_length(v_envelope->5),0,0,0,0,0,0)::public.opportunity_job_counts_v3
                WHEN 'deep_candidate_batch' THEN
                  ROW(
                    0,0,0,0,0,jsonb_array_length(v_output->5),
                    (SELECT count(*) FROM jsonb_array_elements(v_output->5) item(value)
                      WHERE item.value->14='null'::jsonb),
                    (SELECT count(*) FROM jsonb_array_elements(v_output->5) item(value)
                      WHERE item.value->14<>'null'::jsonb),
                    0,0,
                    3*(SELECT count(*) FROM jsonb_array_elements(v_output->5) item(value)
                      WHERE item.value->14='null'::jsonb),
                    0,0,0,0,0
                  )::public.opportunity_job_counts_v3
                WHEN 'portfolio_allocation_batch' THEN
                  ROW(0,0,0,0,0,jsonb_array_length(v_envelope->5),0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
                WHEN 'projection_bundle' THEN
                  ROW(0,0,0,0,0,jsonb_array_length(v_envelope->5->0),0,0,0,0,0,0,1,0,0,0)::public.opportunity_job_counts_v3
                WHEN 'evaluation_bundle' THEN
                  ROW(0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0)::public.opportunity_job_counts_v3
                ELSE ROW(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0)::public.opportunity_job_counts_v3
              END;
              PERFORM public.stage_opportunity_job_output_v3(
                v_claim.job_id,v_claim.owner_token,
                v_claim.payload_kind::text::public.opportunity_job_output_kind_v3,
                convert_to(v_text,'utf8'),v_output,v_hash,
                v_counts
              );
              PERFORM public.complete_opportunity_job_v3(
                v_claim.job_id,v_claim.owner_token,v_hash,v_counts
              );
          END CASE;
        END LOOP;
      END
      $mode_lifecycle$;
      SELECT jsonb_build_object(
        'runStatus',r.status,
        'payloadKinds',(SELECT jsonb_agg(p.payload_kind ORDER BY j.created_at,j.job_id)
          FROM public.opportunity_job_payloads_v3 p
          JOIN public.opportunity_run_jobs_v3 j USING(job_id,run_id)
          WHERE p.run_id=r.run_id),
        'orphanJobs',(SELECT count(*) FROM public.opportunity_run_jobs_v3 j
          LEFT JOIN public.opportunity_job_payloads_v3 p USING(job_id,run_id)
          WHERE j.run_id=r.run_id AND p.job_id IS NULL),
        'inputRoles',(SELECT coalesce(jsonb_agg(i.input_role ORDER BY i.input_role,i.input_run_id),'[]'::jsonb)
          FROM public.opportunity_run_inputs i WHERE i.run_id=r.run_id),
        'moverAuditCount',(SELECT count(*) FROM public.opportunity_mover_audits_v3 a
          WHERE a.upstream_source_run_id=r.upstream_run_id),
        'selectedMoverAuditId',r.selected_mover_audit_id,
        'shallowRows',(SELECT count(*) FROM public.opportunity_shallow_candidate_results_v3 s
          WHERE s.run_id=r.run_id),
        'deepRows',(SELECT count(*) FROM public.opportunity_deep_candidate_results_v3 d
          WHERE d.run_id=r.run_id),
        'candidateSnapshots',(SELECT count(*) FROM public.opportunity_candidate_snapshots c
          WHERE c.run_id=r.run_id),
        'portfolioRows',(SELECT count(*) FROM public.opportunity_portfolio_allocations_v3 a
          WHERE a.run_id=r.run_id),
        'evaluationRows',(SELECT count(*) FROM public.opportunity_evaluation_results_v3 e
          WHERE e.run_id=r.run_id),
        'evaluationAttemptRosterRows',(SELECT count(*)
          FROM public.opportunity_run_manifest_inputs binding
          JOIN public.opportunity_manifest_rows_v3 row
            ON row.manifest_id=binding.manifest_id
            AND row.section_key='attempt_roster'
          WHERE binding.run_id=r.run_id
            AND binding.input_role='evaluation_input')
        ,'outcomeExcludedRows',(SELECT count(*)
          FROM public.opportunity_run_manifest_inputs binding
          JOIN public.opportunity_manifest_rows_v3 row
            ON row.manifest_id=binding.manifest_id
            AND row.section_key='excluded_rows'
          WHERE binding.run_id=r.run_id
            AND binding.input_role='outcome_input')
        ,'outcomeConservationRows',(SELECT count(*)
          FROM public.opportunity_run_manifest_inputs binding
          JOIN public.opportunity_manifest_rows_v3 row
            ON row.manifest_id=binding.manifest_id
            AND row.section_key='conservation'
          WHERE binding.run_id=r.run_id
            AND binding.input_role='outcome_input')
      )::text
      FROM public.opportunity_runs r
      WHERE r.mode='${mode}' AND r.source_cutoff='${cutoff}';
    `, ['-At']).trim().split('\n').at(-1);
    assert.deepEqual(JSON.parse(result), {
      runStatus: 'success',
      payloadKinds: expectedKinds,
      orphanJobs: 0,
      inputRoles: mode === 'label_outcomes'
        ? ['outcome_enrich']
        : mode === 'shadow_evaluate'
          ? ['evaluation_enrich', 'evaluation_outcome']
          : ['upstream_source_scan'],
      moverAuditCount: mode === 'enrich_rank' ? 5 : 0,
      selectedMoverAuditId: mode === 'enrich_rank' ? JSON.parse(result).selectedMoverAuditId : null,
      shallowRows: mode === 'enrich_rank' ? 1 : 0,
      deepRows: mode === 'enrich_rank' ? 1 : 0,
      candidateSnapshots: mode === 'enrich_rank' ? 1 : 0,
        portfolioRows: 0,
      evaluationRows: mode === 'shadow_evaluate' ? 1 : 0,
      evaluationAttemptRosterRows: mode === 'shadow_evaluate' ? 252 : 0,
      outcomeExcludedRows: mode === 'label_outcomes' ? 2 : 0,
      outcomeConservationRows: mode === 'label_outcomes' ? 4 : 0,
    });
    if (mode === 'enrich_rank') {
      assert.match(JSON.parse(result).selectedMoverAuditId, /^[0-9a-f-]{36}$/u);
    }
  }
});

test('V3.13 PB authority is typed and audited while NAV history is point-in-time per distinct session', () => {
  assert.match(decisionIntegritySql,/LIMIT 1261/u);
  assert.doesNotMatch(decisionIntegritySql,/candidate_history WHERE rank<=253/u);
  assert.match(decisionIntegritySql,/PERFORM public[.]append_financial_fact_v3/u);
  assert.doesNotMatch(decisionIntegritySql,/INSERT INTO public[.]opportunity_financial_facts_v3[(]stock_id/u);
  assert.match(decisionIntegritySql,
    /INSERT INTO public[.]legacy_decision_revision_evaluations_v3_13[(]decision_revision_id,projection_id,[\s\S]*?ON CONFLICT[(]decision_revision_id,evaluated_at[)] DO NOTHING/u);
  assert.doesNotMatch(decisionIntegritySql,/first_projection_id uuid|source_led_correctness jsonb NOT NULL,[\s\S]{0,200}recorded_at timestamptz[\s\S]{0,200}UNIQUE[(]symbol,decision_payload_sha256[)]/u);
  assert.match(decisionIntegritySql,/projection_id uuid NOT NULL,\s+source_led_correctness jsonb NOT NULL/u);
  assert.doesNotMatch(decisionIntegritySql,/projection_id uuid NOT NULL REFERENCES public[.]legacy_radar_projections_v3_11/u);
  assert.match(decisionIntegritySql,/GRANT SELECT ON TABLE public[.]legacy_radar_projections_v3_11 TO opportunity_v3_rpc_owner/u);
  assert.match(decisionIntegritySql,/CREATE POLICY legacy_radar_projections_v3_11_v313_completion_read[\s\S]*FOR SELECT TO opportunity_v3_rpc_owner USING [(]true[)]/u);
  assert.match(decisionIntegritySql,/v_existing_correctness<>v_item->'sourceLedCorrectness'[\s\S]*decision_evaluation_checksum_conflict/u);
  assert.match(decisionIntegritySql,/resolve_legacy_instrument_authority_v3_13[\s\S]{0,240}selected[.]instrument_type='common_stock' AND selected[.]listing_status='active'/u);
  assert.match(decisionIntegritySql,/resolve_legacy_sector_authority_v3_13[\s\S]{0,260}selected[.]status='active'/u);
  assert.doesNotMatch(decisionIntegritySql,/CASE WHEN value->>'exchange'='TPEX'[\s\S]{0,120}ELSE 'TWSE'/u);
  assert.match(decisionIntegritySql,/selected[.]exchange=observation[.]exchange AND selected[.]instrument_type='common_stock'/u);
  const sharesResultDefinition=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf('CREATE OR REPLACE FUNCTION public.resolve_legacy_official_shares_result_v3_13'),
    decisionIntegritySql.indexOf('CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11'));
  assert.match(sharesResultDefinition,/authority_conflict/u);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,'active',repeat('7',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-000000000070','9170');
    WITH keys(family,canonical) AS(VALUES
      ('instrument_roster'::public.authority_stream_family_v3,convert_to('["instrument_roster","71300000-0000-4000-8000-000000000070"]','utf8')),
      ('sector_assignment'::public.authority_stream_family_v3,convert_to('["sector_assignment","71300000-0000-4000-8000-000000000070","TWSE"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2026-01-01' FROM keys;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000071','71300000-0000-4000-8000-000000000070','9170','TWSE',
      'common_stock','active','V313 NAV Fixture','NAV9170','twse','2026-01-01','2026-01-01',NULL,
      'tw-instrument-roster-v3.0','2026-01-01');
    INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000077','71300000-0000-4000-8000-000000000070','TWSE','20',
      'other','twse','2026-01-01','2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active','2026-01-01');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),day,'TWSE',day::timestamp+time '01:00',day::timestamp+time '05:30',
      'completed','twse',day::timestamp+time '05:30',day::timestamp+time '06:00','twse-calendar:di008:'||day,
      day::timestamp+time '06:00'
    FROM generate_series('2026-03-24'::date,'2026-07-22'::date,interval '1 day') series(day);
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES
      ('71300000-0000-4000-8000-000000000074','2026-05-12','TWSE','2026-05-12T01:00:00Z',
       '2026-05-12T05:30:00Z','completed','twse','2026-05-12T05:30:00Z',clock_timestamp()-interval '3 seconds',
       'twse-calendar:9170:completed',clock_timestamp()-interval '2 seconds'),
      ('71300000-0000-4000-8000-000000000076','2026-05-13','TWSE','2026-05-13T01:00:00Z',
       '2026-05-13T05:30:00Z','completed','twse','2026-05-13T05:30:00Z',clock_timestamp()-interval '3 seconds',
       'twse-calendar:9170:completed-0513',clock_timestamp()-interval '2 seconds');
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at)
    VALUES
      ('71300000-0000-4000-8000-000000000072','71300000-0000-4000-8000-000000000070','net_asset_value',NULL,
       '2026-04-30','instant',5000000,'TWD_thousand','twse','official_filing','reported','reported_period',
       '2026-05-01T00:00:00Z','2026-05-01T00:00:00Z','2026-05-01T01:00:00Z',NULL,'twse-openapi:nav:old','2026-05-01T01:00:00Z'),
      ('71300000-0000-4000-8000-000000000073','71300000-0000-4000-8000-000000000070','net_asset_value',NULL,
       '2026-05-13','instant',10000000,'TWD_thousand','twse','official_filing','reported','reported_period',
       '2026-05-13T00:00:00Z','2026-05-13T00:00:00Z','2026-05-13T01:00:00Z',NULL,'twse-openapi:nav:new','2026-05-13T01:00:00Z'),
      ('71300000-0000-4000-8000-000000000078','71300000-0000-4000-8000-000000000070','ev_sales_multiple',NULL,
       '2026-05-10','quarter_end',3,'dimensionless','twse','official_filing','reported','reported_period',
       '2026-05-12T05:30:00Z','2026-05-12T05:30:00Z','2026-05-12T05:30:00Z',NULL,
       'twse-openapi:ev-sales:exact-close','2026-05-12T05:30:00Z'),
      ('71300000-0000-4000-8000-000000000079','71300000-0000-4000-8000-000000000070','ev_sales_multiple',NULL,
       '2026-05-10','quarter_end',9,'dimensionless','twse','official_filing','reported','reported_period',
       '2026-05-12T05:30:01Z','2026-05-12T05:30:01Z','2026-05-12T05:31:00Z',NULL,
       'twse-openapi:ev-sales:post-close','2026-05-12T05:31:00Z');
    SELECT * FROM public.append_exchange_reported_valuation_v3_13(ROW(
      '71300000-0000-4000-8000-000000000070','TWSE','2026-05-12',100,NULL,1.2,
      '2026-05-12T06:30:00Z','2026-05-12T06:30:00Z',now(),'twse-openapi:BWIBBU_ALL:2026-05-12:9170'
    )::public.exchange_reported_valuation_input_v3_13,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
    SELECT * FROM public.append_exchange_reported_valuation_v3_13(ROW(
      '71300000-0000-4000-8000-000000000070','TWSE','2026-05-13',100,NULL,1.1,
      '2026-05-13T06:30:00Z','2026-05-13T06:30:00Z',now(),'twse-openapi:BWIBBU_ALL:2026-05-13:9170'
    )::public.exchange_reported_valuation_input_v3_13,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
    SELECT * FROM public.append_exchange_reported_valuation_v3_13(ROW(
      '71300000-0000-4000-8000-000000000070','TWSE','2026-05-13',100,NULL,1.1,
      '2026-05-13T06:30:00Z','2026-05-13T06:30:00Z',now(),'twse-openapi:BWIBBU_ALL:2026-05-13:9170'
    )::public.exchange_reported_valuation_input_v3_13,'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
    WITH plane AS(SELECT public.read_legacy_candidate_fact_plane_v3_11(clock_timestamp(),jsonb_build_object('candidates',
      jsonb_build_array(jsonb_build_object('stockId','71300000-0000-4000-8000-000000000070','symbol','9170',
        'deepSelected',true,'exchange','TWSE')))) value),rows AS(
      SELECT item.value row_value FROM plane,jsonb_array_elements(plane.value->'reportedPeRows') item(value)
      WHERE item.value->>0='9170')
    SELECT jsonb_build_object(
      'pbRows',(SELECT count(*) FROM public.opportunity_exchange_reported_pe_v3 WHERE stock_id='71300000-0000-4000-8000-000000000070'),
      'appendAudits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3 WHERE caller_principal_id='a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'
        AND function_name='append_price_authority_v3' AND subject_kind='exchange_reported_pe'),
      'seriesRows',(SELECT count(*) FROM public.opportunity_financial_fact_series_registry_v3
        WHERE stock_id='71300000-0000-4000-8000-000000000070'),
      'seriesTriggers',(SELECT count(*) FROM pg_trigger trigger JOIN pg_class relation ON relation.oid=trigger.tgrelid
        WHERE relation.relname IN('opportunity_financial_facts_v3','opportunity_financial_fact_series_registry_v3')
          AND trigger.tgname LIKE '%series%'),
      'v313Rls',(SELECT count(*) FROM pg_class relation WHERE relation.relname IN(
        'legacy_source_document_persistence_v3_13','legacy_source_acquisition_outcomes_v3_13',
        'legacy_source_item_outcomes_v3_13','legacy_source_processing_outcomes_v3_13',
        'legacy_decision_revisions_v3_13','legacy_decision_revision_evaluations_v3_13',
        'legacy_analysis_revision_payloads_v3_13',
        'opportunity_financial_fact_series_registry_v3')
        AND relation.relrowsecurity AND NOT relation.relforcerowsecurity),
      'serviceRegistrySelect',has_table_privilege('service_role',
        'public.opportunity_financial_fact_series_registry_v3','SELECT'),
      'serviceCompletionExecute',has_function_privilege('service_role',
        'public.complete_legacy_producer_job_v3_11(uuid,uuid,uuid,bytea,jsonb,text)','EXECUTE'),
      'serviceHeartbeatSelect',has_table_privilege('service_role',
        'public.legacy_decision_revision_evaluations_v3_13','SELECT'),
      'sessionCount',(SELECT count(*) FROM rows),
      'navBySession',(SELECT jsonb_object_agg(row_value->>3,(row_value->>15)::double precision ORDER BY row_value->>3) FROM rows),
      'metricRefs',(SELECT jsonb_agg(row_value->16 ORDER BY row_value->>3) FROM rows))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.equal(result.pbRows,2);assert.equal(result.appendAudits,3);
  assert.equal(result.seriesRows,2);assert.equal(result.seriesTriggers,4);
  assert.equal(result.v313Rls,8);assert.equal(result.serviceRegistrySelect,false);
  assert.equal(result.serviceCompletionExecute,true);assert.equal(result.serviceHeartbeatSelect,true);
  assert.equal(result.sessionCount,2);
  assert.deepEqual(result.navBySession,{'2026-05-12':null,'2026-05-13':null});
  assert.equal(result.metricRefs[0].find((row)=>row[0]==='net_asset_value')[1],'twse-openapi:nav:old');
  assert.equal(result.metricRefs[1].find((row)=>row[0]==='net_asset_value')[1],'twse-openapi:nav:new');
  assert.equal(result.metricRefs[0].find((row)=>row[0]==='ev_sales_multiple')[1],'twse-openapi:ev-sales:exact-close');
  assert.equal(result.metricRefs[1].find((row)=>row[0]==='ev_sales_multiple')[1],'twse-openapi:ev-sales:post-close');
});

test('V3.13 official valuation append requires elapsed same-exchange completed session authority',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,
      configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,
      'active',repeat('7',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000c0','9195');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000c1','2026-05-20','TWSE','2026-05-20T01:00:00Z',
      '2026-05-20T05:30:00Z','completed','twse','2026-05-20T05:00:00Z','2026-05-20T05:01:00Z',
      'twse-calendar:9195','2026-05-20T05:01:00Z');
    DO $probe$ BEGIN BEGIN
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(
        '71300000-0000-4000-8000-0000000000c0','TWSE','2026-05-20',40,10,1.1,
        '2026-05-20T05:00:00Z','2026-05-20T05:00:00Z','2026-05-20T05:29:59Z',
        'twse-openapi:BWIBBU_ALL:2026-05-20:9195')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      RAISE EXCEPTION 'expected_calendar_authority_mismatch';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      IF SQLERRM<>'calendar_authority_mismatch' THEN RAISE;END IF;
    END;END $probe$;
    DO $probe$ BEGIN BEGIN
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(
        '71300000-0000-4000-8000-0000000000c0','TPEX','2026-05-20',40,10,1.1,
        '2026-05-20T05:30:00Z','2026-05-20T05:30:00Z','2026-05-20T06:00:00Z',
        'tpex-openapi:peratio:2026-05-20:9195')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      RAISE EXCEPTION 'expected_calendar_authority_mismatch';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      IF SQLERRM<>'calendar_authority_mismatch' THEN RAISE;END IF;
    END;END $probe$;
    SELECT * FROM public.append_exchange_reported_valuation_v3_13(ROW(
      '71300000-0000-4000-8000-0000000000c0','TWSE','2026-05-20',40,10,1.1,
      '2026-05-20T05:30:00Z','2026-05-20T05:30:00Z','2026-05-20T06:00:00Z',
      'twse-openapi:BWIBBU_ALL:2026-05-20:9195')::public.exchange_reported_valuation_input_v3_13,
      'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
    SELECT jsonb_build_object(
      'rows',(SELECT count(*) FROM public.opportunity_exchange_reported_pe_v3
        WHERE stock_id='71300000-0000-4000-8000-0000000000c0'),
      'audits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE subject_kind='exchange_reported_pe' AND caller_principal_id=
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001' AND subject_id IN(
            SELECT reported_pe_id FROM public.opportunity_exchange_reported_pe_v3
            WHERE stock_id='71300000-0000-4000-8000-0000000000c0')))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{rows:1,audits:1});
});

test('V3.13 equal-head reported or EV authority remains a typed candidate conflict without winner lineage',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000d0','9196');
    WITH keys(family,canonical) AS(VALUES
      ('instrument_roster'::public.authority_stream_family_v3,
        convert_to('["instrument_roster","71300000-0000-4000-8000-0000000000d0"]','utf8')),
      ('sector_assignment'::public.authority_stream_family_v3,
        convert_to('["sector_assignment","71300000-0000-4000-8000-0000000000d0","TWSE"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2026-01-01' FROM keys;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000d1','71300000-0000-4000-8000-0000000000d0',
      '9196','TWSE','common_stock','active','Conflict Fixture','C9196','twse','2026-01-01','2026-01-01',
      NULL,'tw-instrument-roster-v3.0','2026-01-01');
    INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000d2','71300000-0000-4000-8000-0000000000d0',
      'TWSE','24','semiconductor','twse','2026-01-01','2026-01-01',NULL,
      'tw-sector-taxonomy-v3.0','active','2026-01-01');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000d3','2026-05-21','TWSE','2026-05-21T01:00:00Z',
      '2026-05-21T05:30:00Z','completed','twse','2026-05-21T05:00:00Z','2026-05-21T05:01:00Z',
      'twse-calendar:9196','2026-05-21T05:01:00Z');
    INSERT INTO public.opportunity_exchange_reported_pe_v3(reported_pe_id,stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-0000000000d4','71300000-0000-4000-8000-0000000000d0','TWSE',
       '2026-05-21',50,10,1.1,'2026-05-21T06:00:00Z','2026-05-21T06:00:00Z',
       '2026-05-21T06:30:00Z','twse-openapi:pe:9196:a','2026-05-21T06:31:00Z'),
      ('71300000-0000-4000-8000-0000000000d5','71300000-0000-4000-8000-0000000000d0','TWSE',
       '2026-05-21',50,10,1.1,'2026-05-21T06:00:00Z','2026-05-21T06:00:00Z',
       '2026-05-21T06:30:00Z','twse-openapi:pe:9196:b','2026-05-21T06:31:00Z');
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-0000000000d6','71300000-0000-4000-8000-0000000000d0','ev_sales_multiple',NULL,
       '2026-05-21','quarter_end',2,'dimensionless','twse','official_filing','reported','reported_period',
       '2026-05-21T06:00:00Z','2026-05-21T06:00:00Z','2026-05-21T06:30:00Z',NULL,
       'twse-openapi:ev-sales:9196:a','2026-05-21T06:31:00Z'),
      ('71300000-0000-4000-8000-0000000000d7','71300000-0000-4000-8000-0000000000d0','ev_sales_multiple',NULL,
       '2026-05-21','quarter_end',3,'dimensionless','twse','official_filing','reported','reported_period',
       '2026-05-21T06:00:00Z','2026-05-21T06:00:00Z','2026-05-21T06:30:00Z',NULL,
       'twse-openapi:ev-sales:9196:b','2026-05-21T06:31:00Z');
    WITH plane AS(SELECT public.read_legacy_candidate_fact_plane_v3_11('2026-05-21T08:00:00Z',
      jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object(
        'stockId','71300000-0000-4000-8000-0000000000d0','symbol','9196','deepSelected',true)))) value),
    conflict AS(SELECT item.value FROM plane,jsonb_array_elements(plane.value->'reportedPeRows') item(value)
      WHERE item.value->>0='9196')
    SELECT jsonb_build_object('rowCount',(SELECT count(*) FROM conflict),
      'close',(SELECT value->4 FROM conflict),'pe',(SELECT value->5 FROM conflict),
      'pb',(SELECT value->6 FROM conflict),'publishedAt',(SELECT value->7 FROM conflict),
      'sourceTimestamp',(SELECT value->8 FROM conflict),'collectedAt',(SELECT value->9 FROM conflict),
      'sourceRef',(SELECT value->10 FROM conflict),'status',(SELECT value->>18 FROM conflict))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{rowCount:1,close:null,pe:null,pb:null,publishedAt:null,
    sourceTimestamp:null,collectedAt:null,sourceRef:null,status:'authority_conflict'});
});

test('V3.13 candidate fact plane ranks complete identities before applying per-series bounds',()=>{
  const definition=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION read_legacy_candidate_fact_plane_v3_11'),
    sql.indexOf('CREATE OR REPLACE FUNCTION acquire_legacy_producer_lease_v3_11'));
  assert.doesNotMatch(definition,/LIMIT 256/u);
  assert.match(definition,/dense_rank[(][)] OVER[(]PARTITION BY selected[.]fact_key/u);
  assert.match(definition,/WHEN bounded[.]fact_key='monthly_revenue' THEN 18/u);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000c8','9194');
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),'71300000-0000-4000-8000-0000000000c8','quarterly_revenue',
      date_trunc('year',date '2022-03-31'+(ordinal-1)*interval '3 months')::date,
      (date '2022-03-31'+(ordinal-1)*interval '3 months')::date,
      'quarterly',ordinal*100,'TWD_thousand','twse','official_filing','reported','reported_period',
      '2026-01-01','2026-01-01','2026-01-01T01:00:00Z',NULL,'twse-openapi:bounded:'||ordinal,'2026-01-01T01:00:00Z'
    FROM generate_series(1,14) ordinal;
    WITH latest AS(SELECT max(period_end) period_end FROM public.opportunity_financial_facts_v3
      WHERE stock_id='71300000-0000-4000-8000-0000000000c8')
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),'71300000-0000-4000-8000-0000000000c8','quarterly_revenue',
      date_trunc('year',period_end)::date,period_end,'quarterly',9999,'TWD_thousand','twse','official_filing',
      'reported','reported_period','2026-01-01','2026-01-01','2026-01-01T01:00:00Z',NULL,
      'twse-openapi:bounded:conflict','2026-01-01T01:00:00Z' FROM latest;
    WITH plane AS(SELECT public.read_legacy_candidate_fact_plane_v3_11('2026-02-01',jsonb_build_object('candidates',
      jsonb_build_array(jsonb_build_object('stockId','71300000-0000-4000-8000-0000000000c8','symbol','9194',
        'deepSelected',true,'shallowSelected',false)))) value),rows AS(
      SELECT item.value FROM plane,jsonb_array_elements(plane.value->'financialRows') item(value))
    SELECT jsonb_build_object('periods',(SELECT count(DISTINCT value->>3) FROM rows),
      'latestRows',(SELECT count(*) FROM rows WHERE value->>3=(SELECT max(value->>3) FROM rows)),
      'arity',(SELECT min(jsonb_array_length(value)) FROM rows))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{periods:12,latestRows:2,arity:16});
});

test('V3.13 requested calendar windows fail on the 513th distinct stream instead of truncating',()=>{
  const output=psql(`
    BEGIN;
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),day,'TPEX',day::timestamp+time '01:00',day::timestamp+time '05:30',
      'completed','tpex',CASE WHEN day='2024-07-01'::date+512 THEN '2030-01-01'::timestamptz ELSE day::timestamp+time '05:30' END,
      CASE WHEN day='2024-07-01'::date+512 THEN '2030-01-01'::timestamptz ELSE day::timestamp+time '05:31' END,
      'tpex-window:'||day::text,
      CASE WHEN day='2024-07-01'::date+512 THEN '2030-01-01'::timestamptz ELSE day::timestamp+time '05:31' END
    FROM generate_series('2024-07-01'::date,'2024-07-01'::date+512,interval '1 day') series(day);
    DO $probe$ BEGIN BEGIN
      PERFORM * FROM public.resolve_legacy_trading_session_window_v3_13('TPEX','2024-07-01',
        '2024-07-01'::date+512,'2026-01-01');
      RAISE EXCEPTION 'expected_bound_violation';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      IF SQLERRM<>'bound_violation' THEN RAISE;END IF;
    END;END $probe$;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000f0','9198');
    WITH keys(family,canonical) AS(VALUES
      ('instrument_roster'::public.authority_stream_family_v3,
        convert_to('["instrument_roster","71300000-0000-4000-8000-0000000000f0"]','utf8')),
      ('sector_assignment'::public.authority_stream_family_v3,
        convert_to('["sector_assignment","71300000-0000-4000-8000-0000000000f0","TPEX"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2024-01-01' FROM keys;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000f1','71300000-0000-4000-8000-0000000000f0',
      '9198','TPEX','common_stock','active','Calendar Bound Fixture','C9198','tpex','2024-01-01',
      '2024-01-01',NULL,'tw-instrument-roster-v3.0','2024-01-01');
    INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000f2','71300000-0000-4000-8000-0000000000f0',
      'TPEX','24','semiconductor','tpex','2024-01-01','2024-01-01',NULL,
      'tw-sector-taxonomy-v3.0','active','2024-01-01');
    DO $probe$ BEGIN BEGIN
      PERFORM public.read_legacy_candidate_fact_plane_v3_11('2026-01-01',jsonb_build_object('candidates',
        jsonb_build_array(jsonb_build_object('stockId','71300000-0000-4000-8000-0000000000f0',
          'symbol','9198','deepSelected',true))));
      RAISE EXCEPTION 'expected_fact_plane_bound_violation';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      IF SQLERRM<>'bound_violation' THEN RAISE;END IF;
    END;END $probe$;
    ROLLBACK;
  `,['-At']);
  assert.match(output,/DO/u);
});

test('V3.13 valuation history binds distinct sessions before revision-heavy observation heads',()=>{
  const planeDefinition=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf('CREATE OR REPLACE FUNCTION public.read_legacy_candidate_fact_plane_v3_11'),
    decisionIntegritySql.indexOf('DO $rename_claim$'));
  assert.match(planeDefinition,/SELECT DISTINCT raw[.]session_date[\s\S]*?LIMIT 1261/u);
  assert.doesNotMatch(planeDefinition,/SELECT raw[.][*][\s\S]*?LIMIT 1261/u);
  assert.doesNotMatch(planeDefinition,/SELECT max[(]session_date[)] AS session_date/u);
  assert.match(planeDefinition,/requested_calendar_windows AS MATERIALIZED[\s\S]*?::date-730 oldest_session/u);
  assert.doesNotMatch(planeDefinition,/tw_trading_sessions_v3 raw[\s\S]{0,300}LIMIT 512/u);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000e0','9197');
    WITH keys(family,canonical) AS(VALUES
      ('instrument_roster'::public.authority_stream_family_v3,
        convert_to('["instrument_roster","71300000-0000-4000-8000-0000000000e0"]','utf8')),
      ('sector_assignment'::public.authority_stream_family_v3,
        convert_to('["sector_assignment","71300000-0000-4000-8000-0000000000e0","TWSE"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2024-01-01' FROM keys;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000e1','71300000-0000-4000-8000-0000000000e0',
      '9197','TWSE','common_stock','active','Revision Heavy Fixture','R9197','twse','2024-01-01','2024-01-01',
      NULL,'tw-instrument-roster-v3.0','2024-01-01');
    INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at)
    VALUES('71300000-0000-4000-8000-0000000000e2','71300000-0000-4000-8000-0000000000e0',
      'TWSE','24','semiconductor','twse','2024-01-01','2024-01-01',NULL,
      'tw-sector-taxonomy-v3.0','active','2024-01-01');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),day,'TWSE',day::timestamp+time '01:00',day::timestamp+time '05:30',
      'completed','twse',day::timestamp+time '05:30',day::timestamp+time '05:31',
      'twse-history:'||day::text,day::timestamp+time '05:31'
    FROM generate_series('2025-01-01'::date,'2025-01-01'::date+251,interval '1 day') series(day);
    INSERT INTO public.opportunity_exchange_reported_pe_v3(reported_pe_id,stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),'71300000-0000-4000-8000-0000000000e0','TWSE',day,50,10,1.1,
      day::timestamp+time '06:00',day::timestamp+time '06:00',day::timestamp+time '06:30',
      'twse-openapi:history:'||day::text,day::timestamp+time '06:31'
    FROM generate_series('2025-01-01'::date,'2025-01-01'::date+251,interval '1 day') series(day);
    INSERT INTO public.opportunity_exchange_reported_pe_v3(reported_pe_id,stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT extensions.gen_random_uuid(),'71300000-0000-4000-8000-0000000000e0','TWSE','2025-09-09',50,10,1.1,
      '2025-09-09T06:00:00Z','2025-09-09T06:00:00Z','2025-09-09T06:30:00Z',
      'twse-openapi:history:2025-09-09:mirror:'||ordinal,'2025-09-09T06:31:00Z'
    FROM generate_series(1,1260) ordinal;
    WITH plane AS(SELECT public.read_legacy_candidate_fact_plane_v3_11('2026-01-01T00:00:00Z',
      jsonb_build_object('candidates',jsonb_build_array(jsonb_build_object(
        'stockId','71300000-0000-4000-8000-0000000000e0','symbol','9197','deepSelected',true)))) value)
    SELECT jsonb_build_object('sessions',(SELECT count(DISTINCT item.value->>3)
      FROM plane,jsonb_array_elements(plane.value->'reportedPeRows') item(value)
      WHERE item.value->>0='9197'),'conflicts',(SELECT count(*)
      FROM plane,jsonb_array_elements(plane.value->'reportedPeRows') item(value)
      WHERE item.value->>0='9197' AND item.value->>18='authority_conflict'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{sessions:252,conflicts:0});
});

test('V3.13 conditional valuation completion binds scalars and counts to the cutoff official evidence root',()=>{
  const codec=runtime('codec.js');
  const uuidFromMd5=(value)=>{const hex=createHash('md5').update(value).digest('hex');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;};
  const historyMembers=Array.from({length:252},(_,index)=>{const date=new Date(Date.UTC(2025,0,index+1))
    .toISOString().slice(0,10);const sessionUuid=uuidFromMd5(`v313-relative:${date}`);
    return ['71300000-0000-4000-8000-000000000f00','TWSE',date,index===251?12.75:15,
      codec.sha256(sessionUuid),`twse-openapi:BWIBBU_ALL:${date}:9196`];});
  const currentMember=historyMembers.at(-1);
  const peerMembers=Array.from({length:8},(_,index)=>{const ordinal=index+1;
    const stockId=`71300000-0000-4000-8000-${(0xf00+ordinal).toString(16).padStart(12,'0')}`;
    return [stockId,'TWSE','2025-09-09',15,codec.sha256(uuidFromMd5('v313-relative:2025-09-09')),
      `twse-openapi:BWIBBU_ALL:2025-09-09:${9200+ordinal}`];});
  const expectedRoots={currentObservationRoot:codec.sha256(codec.canonicalJson(currentMember)),
    historyMembershipRoot:codec.sha256(codec.canonicalJson(historyMembers)),
    sectorMembershipRoot:codec.sha256(codec.canonicalJson(peerMembers)),
    evidenceRoot:codec.sha256(codec.canonicalJson(['official-relative-pe-evidence-v1',currentMember,
      historyMembers,peerMembers]))};
  const completionDefinition=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf('CREATE OR REPLACE FUNCTION public.complete_legacy_producer_job_v3_11'),
    decisionIntegritySql.indexOf('DO $v313_rls$'));
  assert.match(completionDefinition,/legacy_valid_relative_valuation_authority_v3_13[(]/u);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,
      configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,
      'active',repeat('7',64),clock_timestamp());
    WITH entities AS(
      SELECT ordinal,
        ('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id,
        CASE WHEN ordinal=0 THEN '9196' ELSE (9200+ordinal)::text END symbol
      FROM generate_series(0,8) ordinal
    ) INSERT INTO public.stocks(id,symbol) SELECT stock_id,symbol FROM entities;
    WITH entities AS(
      SELECT ordinal,('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id,
        CASE WHEN ordinal=0 THEN '9196' ELSE (9200+ordinal)::text END symbol FROM generate_series(0,8) ordinal
    ),keys AS(
      SELECT 'instrument_roster'::public.authority_stream_family_v3 family,
        convert_to(regexp_replace(jsonb_build_array('instrument_roster',stock_id::text)::text,', ', ',', 'g'),'utf8') canonical FROM entities
      UNION ALL SELECT 'sector_assignment'::public.authority_stream_family_v3,
        convert_to(regexp_replace(jsonb_build_array('sector_assignment',stock_id::text,'TWSE')::text,', ', ',', 'g'),'utf8') FROM entities
    ) INSERT INTO public.opportunity_authority_stream_registry_v3(
      family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2024-01-01' FROM keys;
    WITH entities AS(
      SELECT ordinal,('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id,
        CASE WHEN ordinal=0 THEN '9196' ELSE (9200+ordinal)::text END symbol FROM generate_series(0,8) ordinal
    ) INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    SELECT ('71300000-0000-4000-8001-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid,stock_id,symbol,'TWSE',
      'common_stock','active','Relative Authority '||symbol,'R'||symbol,'twse','2024-01-01','2024-01-01',NULL,
      'tw-instrument-roster-v3.0','2024-01-01' FROM entities;
    WITH entities AS(
      SELECT ordinal,('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id
      FROM generate_series(0,8) ordinal
    ) INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at)
    SELECT ('71300000-0000-4000-8002-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid,stock_id,'TWSE','24',
      'semiconductor','twse','2024-01-01','2024-01-01',NULL,'tw-sector-taxonomy-v3.0','active','2024-01-01'
    FROM entities;
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT md5('v313-relative:'||day::date::text)::uuid,day,'TWSE',day::timestamp+time '01:00',
      day::timestamp+time '05:30','completed','twse',day::timestamp+time '05:30',
      day::timestamp+time '05:31','twse-relative-calendar:'||day::date::text,day::timestamp+time '05:31'
    FROM generate_series('2025-01-01'::date,'2025-09-09'::date,interval '1 day') series(day);
    DO $probe$ BEGIN BEGIN
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(
        '71300000-0000-4000-8000-000000000f00','TWSE','2025-09-09',100,200.0000001,1.1,
        '2025-09-09T06:00:00Z','2025-09-09T06:00:00Z','2025-09-09T06:01:00Z',
        'twse-openapi:BWIBBU_ALL:2025-09-09:9196')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      RAISE EXCEPTION 'expected_reported_pe_out_of_range';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN
      IF SQLERRM<>'invalid_exchange_reported_valuation' THEN RAISE;END IF;
    END;END $probe$;
    DO $probe$ BEGIN BEGIN
      PERFORM public.append_exchange_reported_valuation_v3_13(ROW(
        '71300000-0000-4000-8000-000000000f00','TWSE','2025-09-09',100,12.75,1.1,
        '2025-09-09T06:00:00Z','2025-09-09T06:00:00Z','2025-09-09T06:01:00Z',
        'twse-arbitrary:valuation:2025-09-09:9196')::public.exchange_reported_valuation_input_v3_13,
        'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      RAISE EXCEPTION 'expected_noncanonical_source_ref';
    EXCEPTION WHEN SQLSTATE 'PT422' THEN
      IF SQLERRM<>'invalid_exchange_reported_valuation' THEN RAISE;END IF;
    END;END $probe$;
    INSERT INTO public.opportunity_exchange_reported_pe_v3(reported_pe_id,stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT md5('v313-relative-subject:'||day::text)::uuid,'71300000-0000-4000-8000-000000000f00','TWSE',day,100,
      CASE WHEN day='2025-09-09'::date THEN 12.75 ELSE 15 END,1.1,
      day::timestamp+time '06:00',day::timestamp+time '06:00',day::timestamp+time '06:01',
      'twse-openapi:BWIBBU_ALL:'||day::date::text||':9196',day::timestamp+time '06:02'
    FROM generate_series('2025-01-01'::date,'2025-09-09'::date,interval '1 day') series(day);
    WITH peers AS(SELECT ordinal,('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id,
      (9200+ordinal)::text symbol FROM generate_series(1,8) ordinal)
    INSERT INTO public.opportunity_exchange_reported_pe_v3(reported_pe_id,stock_id,exchange,session_date,close,
      reported_pe,reported_pb,published_at,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT ('71300000-0000-4000-8003-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid,stock_id,'TWSE','2025-09-09',
      100,15,1.2,'2025-09-09T06:00:00Z','2025-09-09T06:00:00Z','2025-09-09T06:01:00Z',
      'twse-openapi:BWIBBU_ALL:2025-09-09:'||symbol,'2025-09-09T06:02:00Z' FROM peers;
    WITH entities AS(SELECT ordinal,('71300000-0000-4000-8000-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid stock_id
      FROM generate_series(0,8) ordinal)
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at)
    SELECT ('71300000-0000-4000-8004-'||lpad(to_hex(3840+ordinal),12,'0'))::uuid,stock_id,
      'shares_outstanding',NULL,'2025-06-30','instant',1000,'thousand_shares','twse',
      'official_filing','reported','reported_period','2025-07-01','2025-07-01','2025-07-01T01:00:00Z',NULL,
      'twse-openapi:shares:2025-06-30:'||ordinal,'2025-07-01T01:00:00Z' FROM entities;
    WITH plane AS(
      SELECT public.read_legacy_candidate_fact_plane_v3_11('2026-01-01T00:00:00Z',jsonb_build_object(
        'candidates',jsonb_build_array(jsonb_build_object('stockId','71300000-0000-4000-8000-000000000f00',
          'symbol','9196','deepSelected',true)))) value
    ),authority AS(
      SELECT public.legacy_relative_valuation_authority_v3_13('9196','2026-01-01T00:00:00Z') value
    ),forged AS(
      SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(value,
        '{currentMultiple}','9'::jsonb),'{historySessions}','253'::jsonb),'{sectorPeers}','9'::jsonb),
        '{currentObservationRoot}',to_jsonb(repeat('a',64))),'{historyMembershipRoot}',to_jsonb(repeat('b',64))),
        '{sectorMembershipRoot}',to_jsonb(repeat('c',64))),'{evidenceRoot}',to_jsonb(repeat('d',64))) value FROM authority
    ),scalar_drift AS(
      SELECT jsonb_set(value,'{currentMultiple}','12.7500000000001'::jsonb) value FROM authority
    ),reference_drift AS(
      SELECT jsonb_set(value,'{referenceMultiple}','15.0000000000001'::jsonb) value FROM authority
    ) SELECT jsonb_build_object('historySessions',(authority.value->>'historySessions')::integer,
      'sectorPeers',(authority.value->>'sectorPeers')::integer,
      'currentMultiple',(authority.value->>'currentMultiple')::numeric,
      'referenceMultiple',(authority.value->>'referenceMultiple')::numeric,
      'rootsValid',(authority.value->>'evidenceRoot')~'^[0-9a-f]{64}$'
        AND (authority.value->>'historyMembershipRoot')~'^[0-9a-f]{64}$'
        AND (authority.value->>'sectorMembershipRoot')~'^[0-9a-f]{64}$',
      'currentObservationRoot',authority.value->>'currentObservationRoot',
      'historyMembershipRoot',authority.value->>'historyMembershipRoot',
      'sectorMembershipRoot',authority.value->>'sectorMembershipRoot',
      'evidenceRoot',authority.value->>'evidenceRoot',
      'currentMember',(SELECT jsonb_build_array(value->>11,value->>2,value->>3,(value->>5)::numeric,
        value->>12,value->>10) FROM jsonb_array_elements(plane.value->'reportedPeRows') row(value)
        WHERE value->>11='71300000-0000-4000-8000-000000000f00' ORDER BY value->>3 DESC LIMIT 1),
      'firstPeer',(SELECT jsonb_build_array(value->>11,value->>2,value->>3,(value->>5)::numeric,
        value->>12,value->>10) FROM jsonb_array_elements(plane.value->'reportedPeRows') row(value)
        WHERE value->>11<>'71300000-0000-4000-8000-000000000f00' ORDER BY value->>11,value->>10 LIMIT 1),
      'valid',public.legacy_valid_relative_valuation_authority_v3_13(
        '9196','2026-01-01T00:00:00Z',authority.value),
      'planeRows',jsonb_array_length(plane.value->'reportedPeRows'),
      'subjectRows',(SELECT count(*) FROM jsonb_array_elements(plane.value->'reportedPeRows') row(value)
        WHERE value->>11='71300000-0000-4000-8000-000000000f00'),
      'peerRows',(SELECT count(*) FROM jsonb_array_elements(plane.value->'reportedPeRows') row(value)
        WHERE value->>11<>'71300000-0000-4000-8000-000000000f00'),
      'forged',public.legacy_valid_relative_valuation_authority_v3_13(
        '9196','2026-01-01T00:00:00Z',forged.value),
      'nearBoundaryScalarDrift',public.legacy_valid_relative_valuation_authority_v3_13(
        '9196','2026-01-01T00:00:00Z',scalar_drift.value),
      'referenceScalarDrift',public.legacy_valid_relative_valuation_authority_v3_13(
        '9196','2026-01-01T00:00:00Z',reference_drift.value))::text
    FROM plane,authority,forged,scalar_drift,reference_drift;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result.currentMember,currentMember);
  assert.deepEqual(result.firstPeer,peerMembers[0]);
  delete result.currentMember;delete result.firstPeer;
  assert.deepEqual(result,{historySessions:252,sectorPeers:8,currentMultiple:12.75,referenceMultiple:15,
    rootsValid:true,...expectedRoots,valid:true,planeRows:260,subjectRows:252,peerRows:8,forged:false,
    nearBoundaryScalarDrift:false,referenceScalarDrift:false});
});

test('V3.13 latest-recorded instrument, sector and calendar heads cannot be revived by newer business timestamps',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-000000000080','9180');
    WITH keys(family,canonical) AS(VALUES
      ('instrument_roster'::public.authority_stream_family_v3,convert_to('["instrument_roster","71300000-0000-4000-8000-000000000080"]','utf8')),
      ('sector_assignment'::public.authority_stream_family_v3,convert_to('["sector_assignment","71300000-0000-4000-8000-000000000080","TWSE"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT family,encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2026-01-01' FROM keys;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at) VALUES
      ('71300000-0000-4000-8000-000000000081','71300000-0000-4000-8000-000000000080','9180','TWSE',
       'common_stock','active','Authority Fixture','A9180','twse','2026-08-09T10:00:00Z','2026-01-01',NULL,
       'tw-instrument-roster-v3.0','2026-08-09T10:00:00Z'),
      ('71300000-0000-4000-8000-000000000082','71300000-0000-4000-8000-000000000080','9180','TWSE',
       'common_stock','delisted','Authority Fixture','A9180','twse','2026-08-09T09:00:00Z','2026-01-01',NULL,
       'tw-instrument-roster-v3.0','2026-08-09T11:00:00Z');
    INSERT INTO public.stock_sector_assignments_v3(assignment_authority_id,stock_id,market,official_industry_code,
      canonical_sector_key,provider,source_timestamp,valid_from,valid_to,taxonomy_version,status,recorded_at) VALUES
      ('71300000-0000-4000-8000-000000000083','71300000-0000-4000-8000-000000000080','TWSE','24',
       'semiconductor','twse','2026-08-09T10:00:00Z','2026-01-01',NULL,'tw-sector-taxonomy-v3.0','active','2026-08-09T10:00:00Z'),
      ('71300000-0000-4000-8000-000000000084','71300000-0000-4000-8000-000000000080','TWSE','24',
       'semiconductor','twse','2026-08-09T09:00:00Z','2026-01-01',NULL,'tw-sector-taxonomy-v3.0','inactive','2026-08-09T11:00:00Z');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-000000000085','2026-08-07','TWSE','2026-08-07T01:00:00Z',
       '2026-08-07T05:30:00Z','completed','twse','2026-08-09T10:00:00Z','2026-08-09T10:00:00Z',
       'twse-calendar:9180:completed','2026-08-09T10:00:00Z'),
      ('71300000-0000-4000-8000-000000000086','2026-08-07','TWSE','2026-08-07T01:00:00Z',
       '2026-08-07T05:30:00Z','cancelled','twse','2026-08-09T09:00:00Z','2026-08-09T09:00:00Z',
       'twse-calendar:9180:cancelled','2026-08-09T11:00:00Z'),
      ('71300000-0000-4000-8000-000000000089','2026-08-11','TWSE','2026-08-11T01:00:00Z',
       '2026-08-11T05:30:00Z','completed','twse','2026-08-09T09:00:00Z','2026-08-09T09:01:00Z',
       'twse-calendar:future-completed','2026-08-09T09:02:00Z');
    WITH plane AS(SELECT public.read_legacy_candidate_fact_plane_v3_11('2026-08-10T10:00:00Z','{"candidates":[]}'::jsonb) value)
    SELECT jsonb_build_object(
      'instrument',(SELECT listing_status FROM public.resolve_legacy_instrument_authority_v3_13(
        '71300000-0000-4000-8000-000000000080','2026-08-10T10:00:00Z')),
      'sector',(SELECT status FROM public.resolve_legacy_sector_authority_v3_13(
        '71300000-0000-4000-8000-000000000080','TWSE','2026-08-10T10:00:00Z')),
      'calendar',(SELECT status FROM public.resolve_legacy_trading_session_authority_v3_13(
        '2026-08-07','TWSE','2026-08-10T10:00:00Z')),
      'schedule',(SELECT item.value->>'status' FROM plane,jsonb_array_elements(plane.value->'projectionFreshnessSchedule') item(value)
        WHERE item.value->>'session_id'='2026-08-07'),
      'beforeClose',(SELECT count(*) FROM public.resolve_legacy_trading_session_authority_v3_13(
        '2026-08-11','TWSE','2026-08-11T05:29:59Z') selected
        WHERE selected.status='completed' AND selected.close_at<='2026-08-11T05:29:59Z'),
      'atClose',(SELECT count(*) FROM public.resolve_legacy_trading_session_authority_v3_13(
        '2026-08-11','TWSE','2026-08-11T05:30:00Z') selected
        WHERE selected.status='completed' AND selected.close_at<='2026-08-11T05:30:00Z'),
      'afterClose',(SELECT count(*) FROM public.resolve_legacy_trading_session_authority_v3_13(
        '2026-08-11','TWSE','2026-08-11T05:30:01Z') selected
        WHERE selected.status='completed' AND selected.close_at<='2026-08-11T05:30:01Z'),
      'futureSchedule',(SELECT item.value->>'status' FROM plane,jsonb_array_elements(plane.value->'projectionFreshnessSchedule') item(value)
        WHERE item.value->>'session_id'='2026-08-11'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{instrument:'delisted',sector:'inactive',calendar:'cancelled',schedule:'cancelled',
    beforeClose:0,atClose:1,afterClose:1,futureSchedule:'scheduled'});
  const conflict=psql(`BEGIN;
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-000000000087','2026-08-06','TWSE','2026-08-06T01:00:00Z','2026-08-06T05:30:00Z',
       'completed','twse','2026-08-06T06:00:00Z','2026-08-06T06:01:00Z','twse-calendar:tie:a','2026-08-06T06:02:00Z'),
      ('71300000-0000-4000-8000-000000000088','2026-08-06','TWSE','2026-08-06T01:00:00Z','2026-08-06T05:30:00Z',
       'cancelled','twse','2026-08-06T06:00:00Z','2026-08-06T06:01:00Z','twse-calendar:tie:b','2026-08-06T06:02:00Z');
    DO $probe$ BEGIN BEGIN PERFORM * FROM public.resolve_legacy_trading_session_authority_v3_13(
      '2026-08-06','TWSE','2026-08-10T10:00:00Z');RAISE EXCEPTION 'expected_conflict';
      EXCEPTION WHEN SQLSTATE 'PT409' THEN RAISE NOTICE 'authority_conflict_closed';END;END $probe$;ROLLBACK;`,['-At']);
  assert.match(conflict,/DO/u);
});

test('V3.13 official shares normalizes units and propagates differing equal-head authority',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000a0','9188');
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-0000000000a1','71300000-0000-4000-8000-0000000000a0','shares_outstanding',NULL,
       '2026-06-30','instant',1000,'thousand_shares','twse','official_filing','reported','reported_period',
       '2026-07-31T00:00:00Z','2026-07-31T00:00:00Z','2026-07-31T01:00:00Z',NULL,
       'twse-openapi:shares:thousand','2026-07-31T01:01:00Z'),
      ('71300000-0000-4000-8000-0000000000a2','71300000-0000-4000-8000-0000000000a0','shares_outstanding',NULL,
       '2026-06-30','instant',1000000,'share','twse','official_filing','reported','reported_period',
       '2026-07-31T00:00:00Z','2026-07-31T00:00:00Z','2026-07-31T01:00:00Z',NULL,
       'twse-openapi:shares:individual','2026-07-31T01:01:00Z');
    SELECT jsonb_build_object('normalized',public.resolve_legacy_official_shares_v3_13(
      '71300000-0000-4000-8000-0000000000a0','2026-08-07','2026-08-07T10:20:00Z'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{normalized:1000000});
  const conflict=psql(`BEGIN;
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-0000000000b0','9189');
    INSERT INTO public.opportunity_financial_facts_v3(fact_id,stock_id,fact_key,period_start,period_end,duration_kind,
      value,unit,provider,authority_tier,estimate_kind,estimate_horizon,filing_published_at,source_timestamp,
      collected_at,filing_restatement_id,source_ref,recorded_at) VALUES
      ('71300000-0000-4000-8000-0000000000b1','71300000-0000-4000-8000-0000000000b0','shares_outstanding',NULL,
       '2026-06-30','instant',1000,'thousand_shares','twse','official_filing','reported','reported_period',
       '2026-07-31','2026-07-31','2026-07-31T01:00:00Z',NULL,'twse-openapi:shares:a','2026-07-31T01:01:00Z'),
      ('71300000-0000-4000-8000-0000000000b2','71300000-0000-4000-8000-0000000000b0','shares_outstanding',NULL,
       '2026-06-30','instant',2000000,'share','twse','official_filing','reported','reported_period',
       '2026-07-31','2026-07-31','2026-07-31T01:00:00Z',NULL,'twse-openapi:shares:b','2026-07-31T01:01:00Z');
    SELECT public.resolve_legacy_official_shares_result_v3_13(
      '71300000-0000-4000-8000-0000000000b0','2026-08-07','2026-08-07T10:20:00Z')->>'status';
    DO $probe$ BEGIN BEGIN PERFORM public.resolve_legacy_official_shares_v3_13(
      '71300000-0000-4000-8000-0000000000b0','2026-08-07','2026-08-07T10:20:00Z');
      RAISE EXCEPTION 'expected_authority_conflict';
      EXCEPTION WHEN SQLSTATE 'PT409' THEN
        IF SQLERRM<>'authority_conflict' THEN RAISE;END IF;
      END;END $probe$;ROLLBACK;`,['-At']);
  assert.match(conflict,/authority_conflict/u);assert.match(conflict,/DO/u);
});

test('V3.13 completion binds exact decision payload set and classifies only after latest authority selection',()=>{
  const completion=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf("ELSIF v_stage='analysis_revision'"),
    decisionIntegritySql.indexOf("ELSIF v_stage='facts_refresh'"),
  );
  assert.match(completion,
    /jsonb_array_elements\(coalesce\(p_json->'decisionPayloads','\[\]'::jsonb\)\)[\s\S]*?<>\(SELECT coalesce\(jsonb_agg[\s\S]*?jsonb_array_elements\(coalesce\(p_json->'decisions','\[\]'::jsonb\)\)/u,
  );
  const provenance=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf('JOIN public.source_document_revisions_v3 revision ON'),
    decisionIntegritySql.indexOf('WITH candidates AS MATERIALIZED',
      decisionIntegritySql.indexOf('JOIN public.source_document_revisions_v3 revision ON')),
  );
  assert.match(provenance,
    /ORDER BY authority[.]recorded_at DESC,authority[.]authority_id LIMIT 1\s+\) latest WHERE latest[.]status='active'[\s\S]*?latest[.]valid_from<=revision[.]collected_at/u,
  );
  assert.doesNotMatch(provenance,
    /WHERE authority[.]source_identity_id=[\s\S]*?AND authority[.]valid_from<=revision[.]collected_at[\s\S]*?ORDER BY authority[.]recorded_at/u,
  );
  const acquisition=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf("IF v_stage='source_sync'"),
    decisionIntegritySql.indexOf("ELSIF v_stage='mention_claim_extraction'"),
  );
  assert.match(acquisition,
    /FROM public[.]legacy_frozen_source_authorities_v3_13 frozen[\s\S]*?frozen[.]source_run_id=p_run[\s\S]*?frozen[.]authority_cutoff=v_cutoff/u,
  );
  assert.doesNotMatch(acquisition,
    /v_authority_cutoff|opportunity_authority_selected_stream_count_v3_internal\(\s*'discovery_identity',clock_timestamp/u,
  );
  const freeze=decisionIntegritySql.slice(decisionIntegritySql.indexOf('CREATE OR REPLACE FUNCTION public.freeze_legacy_source_authorities_v3_13'),
    decisionIntegritySql.indexOf('DROP TRIGGER IF EXISTS legacy_freeze_source_authorities_v3_13'));
  assert.match(freeze,/opportunity_authority_selected_stream_count_v3_internal\('discovery_identity',NEW[.]source_cutoff\)/u);
  assert.match(freeze,/ORDER BY authority[.]source_identity_id,authority[.]recorded_at DESC,authority[.]authority_id/u);
  const compact=decisionIntegritySql.slice(
    decisionIntegritySql.indexOf("ELSIF v_stage='compact_radar_projection'"),
    decisionIntegritySql.indexOf('DO $v313_rls$'),
  );
  assert.match(compact,/v_home_revisions<>v_submitted_revisions[\s\S]*?decision_revision_projection_mismatch/u);
  assert.match(compact,/legacy_canonical_json_v3_13\(v_identity_json\)[\s\S]*?convert_from\(v_identity_bytes,'utf8'\)<>v_expected_identity_canonical/u);
  assert.match(sql,/v_expected_projection_key:='legacy-radar-v3[.]11:'[\s\S]*?projection_key_collision/u);
});

test('V3.13 service role completes compact persistence and equal-time heartbeat disagreement fails closed',()=>{
  const codec=runtime('codec.js');
  const projectionCodec=runtime('compact-radar-projection.js');
  const envelopeCodec=runtime('decision-envelope.js');
  const citation={ref:'claim-9197',sourceKey:'mops',sourceName:'公開資訊觀測站',
    sourceUrl:'https://mops.twse.com.tw/mops/web/index',kolIdentity:null,publishedAt:'2026-08-07T08:00:00Z',
    collectedAt:'2026-08-07T09:00:00Z',evaluatedAt:'2026-08-07T10:20:00Z'};
  const draftEnvelope={...envelopeCodec.deriveDecisionEnvelope({valuation:{status:'normal',
    valuationRange:{bear:90,base:132,bull:165},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},currentPrice:100,qualityActionEligible:false,
    qualityReadiness:'missing',marketAllowsAction:true,technical:{technicalState:'at_support',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation:90,trigger:null},
    lastEvaluatedAt:'2026-08-07T10:20:00Z'})};
  assert.equal(draftEnvelope.recommendationAuthority,'formal');
  assert.equal(draftEnvelope.userAction,'unavailable');
  delete draftEnvelope.evaluatedAt;
  const formalEnvelope={...envelopeCodec.deriveDecisionEnvelope({valuation:{status:'normal',
    valuationRange:{bear:90,base:132,bull:165},method:{method:'pe'},asOf:'2026-08-07',
    evidence:{sourceRefs:['official-filing']}},currentPrice:100,qualityActionEligible:true,marketAllowsAction:true,
    technical:{technicalState:'breakout_confirmed',plane:{current:100}},geometry:{availability:'available',
      entryZone:[99,101],invalidation:90,trigger:null}})};
  delete formalEnvelope.evaluatedAt;
  const draftCard={symbol:'9197',decisionEnvelope:draftEnvelope,
    sourceProvenance:citation,citations:[citation],decisionBrief:{
      thesis:['a','b','c'],risks:['d','e','f'],evidence:[
        {point:'thesis:0',refs:['claim-9197']},{point:'thesis:1',refs:['claim-9197']},
        {point:'thesis:2',refs:['claim-9197']},{point:'risk:0',refs:['claim-9197']},
        {point:'risk:1',refs:['claim-9197']},{point:'risk:2',refs:['claim-9197']}]}};
  const identityBundle=projectionCodec.decisionRevisionIdentityBundle(draftCard);
  const revisionId=`decision-v3.13:${identityBundle.hash}`;
  const card={...draftCard,decisionRevisionId:revisionId,
    decisionEnvelope:{...draftCard.decisionEnvelope,decisionRevisionId:revisionId}};
  const revisionBundle=codec.immutableBundle('legacy_decision_revision_v3_13',card);
  const compactResult=(sourceCutoff,publishedAt,selectedCard=card,selectedIdentity=identityBundle,
    selectedRevision=revisionBundle)=>{
    const correctness={schema:'legacy-radar-v3.13.0',window:'home',asOf:sourceCutoff,
      contentAsOf:'2026-08-07T10:20:00Z',evaluatedAt:'2026-08-08T10:20:00Z',publishedAt,
      nextExpectedAt:'2026-08-10T10:20:00Z',freshnessSchedule:[],contentHash:'d'.repeat(64),
      producerIdentity:{commitSha:'a'.repeat(40)}};
    const projections=['daily','home','three_day','weekly'].map((storageWindow)=>{
      const payload={sourceSignals:storageWindow==='home'?[selectedCard]:[],sourceLedCorrectness:{...correctness,
        window:storageWindow==='three_day'?'hot':storageWindow}};
      const canonical=codec.canonicalJson(payload);const payloadChecksum=codec.sha256(canonical);
      return {projectionKey:`legacy-radar-v3.11:${storageWindow}:${sourceCutoff}:${payloadChecksum}`,
        storageWindow,payload,payloadChecksum,bundle:{canonical}};
    });
    return {schema:'legacy-compact-projection-result-v3.11',projections,decisionRevisions:[{
      symbol:'9197',decisionRevisionId:selectedCard.decisionRevisionId,bundle:selectedRevision,identityBundle:selectedIdentity,
      sourceLedCorrectness:correctness}]};
  };
  const first=compactResult('2026-08-08T10:20:00Z','2026-08-08T10:21:00Z');
  const uncitedDraft={...draftCard,decisionBrief:{thesis:['a','b','c'],risks:['d','e','f']},
    citations:[{ref:'claim-9197',sourceUrl:'https://example.com/9197'}]};
  const uncitedIdentity=projectionCodec.decisionRevisionIdentityBundle(uncitedDraft);
  const uncitedId=`decision-v3.13:${uncitedIdentity.hash}`;
  const uncitedCard={...uncitedDraft,decisionRevisionId:uncitedId,
    decisionEnvelope:{...uncitedDraft.decisionEnvelope,decisionRevisionId:uncitedId}};
  const uncitedRevision=codec.immutableBundle('legacy_decision_revision_v3_13',uncitedCard);
  const uncited=compactResult('2026-08-08T10:20:00Z','2026-08-08T10:21:00Z',uncitedCard,uncitedIdentity,uncitedRevision);
  const malformedDecisionResult=(mutate,afterBind=null)=>{
    const malformedDraft=structuredClone(draftCard);mutate(malformedDraft);
    const malformedIdentity=projectionCodec.decisionRevisionIdentityBundle(malformedDraft);
    const malformedId=`decision-v3.13:${malformedIdentity.hash}`;
    let malformedCard={...malformedDraft,decisionRevisionId:malformedId,
      decisionEnvelope:{...malformedDraft.decisionEnvelope,decisionRevisionId:malformedId}};
    if(afterBind)malformedCard=afterBind(malformedCard);
    return compactResult('2026-08-08T10:20:00Z','2026-08-08T10:21:00Z',malformedCard,malformedIdentity,
      codec.immutableBundle('legacy_decision_revision_v3_13',malformedCard));
  };
  const malformedBriefCanonicals=[
    malformedDecisionResult((draft)=>{draft.decisionBrief={availability:'unavailable',reason:'arbitrary_blocker'};}),
    malformedDecisionResult((draft)=>{draft.citations[0].sourceUrl='https://';draft.sourceProvenance.sourceUrl='https://';}),
    malformedDecisionResult((draft)=>{draft.citations[0].evaluatedAt='2026-99-99T00:00:00Z';
      draft.sourceProvenance.evaluatedAt='2026-99-99T00:00:00Z';}),
    malformedDecisionResult((draft)=>{draft.decisionBrief.evidence.push({point:'thesis:0',refs:['claim-9197']});}),
    malformedDecisionResult((draft)=>{draft.decisionBrief.evidence[1].point='thesis:0';}),
    malformedDecisionResult((draft)=>{draft.sourceProvenance={};}),
    malformedDecisionResult((draft)=>{draft.decisionBrief=null;}),
    malformedDecisionResult((draft)=>{draft.citations[0].sourceUrl='https://example.com:99999/a';
      draft.sourceProvenance.sourceUrl='https://example.com:99999/a';}),
    malformedDecisionResult((draft)=>{draft.citations[0].evaluatedAt='2026-02-30T00:00:00Z';
      draft.sourceProvenance.evaluatedAt='2026-02-30T00:00:00Z';}),
    malformedDecisionResult((draft)=>{draft.citations[0].evaluatedAt='2026-08-07T10:20:00';
      draft.sourceProvenance.evaluatedAt='2026-08-07T10:20:00';}),
    malformedDecisionResult((draft)=>{draft.citations[0].evaluatedAt='2026-08-07T24:00:00Z';
      draft.sourceProvenance.evaluatedAt='2026-08-07T24:00:00Z';}),
    malformedDecisionResult((draft)=>{draft.decisionBrief.thesis[0]='   ';}),
    malformedDecisionResult((draft)=>{draft.citations[0].sourceKey=9197;draft.sourceProvenance.sourceKey=9197;}),
    malformedDecisionResult((draft)=>{draft.citations[0].sourceName=9197;draft.sourceProvenance.sourceName=9197;}),
    malformedDecisionResult((draft)=>{draft.decisionBrief.evidence[0].refs=[9197];}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope.recommendationAuthority='none';
      draft.decisionEnvelope.valuationReadiness='missing';draft.decisionEnvelope.userAction='buy';}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope.userAction='avoid';}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope=structuredClone(formalEnvelope);
      draft.decisionEnvelope.userAction='buy';draft.decisionEnvelope.valuationSummary.baseUpsidePct=14.9;}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope=structuredClone(formalEnvelope);
      draft.decisionEnvelope.userAction='buy';draft.decisionEnvelope.entryPlan.rewardRisk=1.99;}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope=structuredClone(formalEnvelope);
      draft.decisionEnvelope.valuationSummary.method=null;}),
    malformedDecisionResult((draft)=>{draft.decisionEnvelope=structuredClone(formalEnvelope);
      draft.decisionEnvelope.valuationSummary.sourceRefs=[];}),
    malformedDecisionResult(()=>{},(card)=>({...card,decisionEnvelope:{...card.decisionEnvelope,
      decisionRevisionId:`decision-v3.13:${'e'.repeat(64)}`}})),
    malformedDecisionResult(()=>{},(card)=>({...card,researchDecision:{decisionEnvelope:{...card.decisionEnvelope,
      reason:'contradictory_nested_envelope'}}})),
  ].map((value)=>codec.canonicalJson(value));
  const conflict=compactResult('2026-08-08T10:20:01Z','2026-08-08T10:22:00Z');
  const staleCollision=structuredClone(first);
  staleCollision.projections[0].payload.sourceLedCorrectness.contentHash='e'.repeat(64);
  staleCollision.projections[0].bundle.canonical=codec.canonicalJson(staleCollision.projections[0].payload);
  staleCollision.projections[0].payloadChecksum=codec.sha256(staleCollision.projections[0].bundle.canonical);
  const tampered=structuredClone(first);const tamperedId=`decision-v3.13:${'f'.repeat(64)}`;
  const tamperedCard={...card,decisionRevisionId:tamperedId,
    decisionEnvelope:{...card.decisionEnvelope,decisionRevisionId:tamperedId}};
  tampered.decisionRevisions[0].decisionRevisionId=tamperedId;
  tampered.decisionRevisions[0].bundle=codec.immutableBundle('legacy_decision_revision_v3_13',tamperedCard);
  const missing=structuredClone(first);missing.decisionRevisions=[];
  const noncanonical=structuredClone(first);
  noncanonical.decisionRevisions[0].identityBundle.canonical=
    noncanonical.decisionRevisions[0].identityBundle.canonical.replace(',{',', {');
  const firstCanonical=codec.canonicalJson(first);const conflictCanonical=codec.canonicalJson(conflict);
  const uncitedCanonical=codec.canonicalJson(uncited);
  const staleCollisionCanonical=codec.canonicalJson(staleCollision);
  const tamperedCanonical=codec.canonicalJson(tampered);
  const missingCanonical=codec.canonicalJson(missing);const noncanonicalCanonical=codec.canonicalJson(noncanonical);
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES
      ('71300000-0000-4000-8000-000000000097','com.stockinsider.auth-source-worker',
       encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
       repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
       '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
       (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
         convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
       ) WITH ORDINALITY seed(value,ordinal)),
       'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
       'v313-service-completion-1','2026-08-08T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
       encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',
       date_trunc('second',clock_timestamp())-interval '1 second',clock_timestamp(),
       clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('1',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES
      ('71300000-0000-4000-8000-000000000095','71300000-0000-4000-8000-000000000097','compact_radar_projection',
       'stage_barrier',5,NULL,0,NULL,NULL,repeat('3',64),repeat('3',64),'leased',1,5,
       encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
       clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    SET ROLE service_role;
    DO $uncited_brief$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(uncitedCanonical).toString('hex')}','hex'),
          ${sqlLiteral(uncitedCanonical)}::jsonb,'${codec.sha256(uncitedCanonical)}');
        RAISE EXCEPTION 'expected_uncited_brief_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'data_integrity_failure' THEN RAISE;END IF;
      END;
    END $uncited_brief$;
    ${malformedBriefCanonicals.map((canonical,index)=>`DO $invalid_brief_${index}$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(canonical).toString('hex')}','hex'),
          ${sqlLiteral(canonical)}::jsonb,'${codec.sha256(canonical)}');
        RAISE EXCEPTION 'expected_invalid_brief_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'data_integrity_failure' THEN RAISE;END IF;
      END;
    END $invalid_brief_${index}$;`).join('\n')}
    DO $missing_revision$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(missingCanonical).toString('hex')}','hex'),
          ${sqlLiteral(missingCanonical)}::jsonb,'${codec.sha256(missingCanonical)}');
        RAISE EXCEPTION 'expected_missing_revision_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'decision_revision_projection_mismatch' THEN RAISE;END IF;
      END;
    END $missing_revision$;
    DO $noncanonical_identity$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(noncanonicalCanonical).toString('hex')}','hex'),
          ${sqlLiteral(noncanonicalCanonical)}::jsonb,'${codec.sha256(noncanonicalCanonical)}');
        RAISE EXCEPTION 'expected_noncanonical_identity_failure';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'decision_revision_identity_conflict' THEN RAISE;END IF;
      END;
    END $noncanonical_identity$;
    DO $identity_conflict$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(tamperedCanonical).toString('hex')}','hex'),
          ${sqlLiteral(tamperedCanonical)}::jsonb,'${codec.sha256(tamperedCanonical)}');
        RAISE EXCEPTION 'expected_identity_conflict_missing';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'decision_revision_projection_mismatch' THEN RAISE;END IF;
      END;
    END $identity_conflict$;
    SELECT status FROM public.complete_legacy_producer_job_v3_11(
      '71300000-0000-4000-8000-000000000097','71300000-0000-4000-8000-000000000095',
      '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(firstCanonical).toString('hex')}','hex'),
      ${sqlLiteral(firstCanonical)}::jsonb,'${codec.sha256(firstCanonical)}');
    RESET ROLE;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('71300000-0000-4000-8000-000000000094','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
      repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
      ) WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
      'v313-service-completion-exact-retry','2026-08-08T10:20:00Z',NULL,NULL,convert_to('{}','utf8'),'{}',
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',
      date_trunc('second',clock_timestamp())-interval '1 second',clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('5',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES('71300000-0000-4000-8000-000000000093','71300000-0000-4000-8000-000000000094',
      'compact_radar_projection','stage_barrier',5,NULL,0,NULL,NULL,repeat('5',64),repeat('5',64),'leased',1,5,
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    SET ROLE service_role;
    DO $stale_key_collision$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000094','71300000-0000-4000-8000-000000000093',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(staleCollisionCanonical).toString('hex')}','hex'),
          ${sqlLiteral(staleCollisionCanonical)}::jsonb,'${codec.sha256(staleCollisionCanonical)}');
        RAISE EXCEPTION 'expected_stale_key_collision_missing';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'data_integrity_failure' THEN RAISE;END IF;
      END;
    END $stale_key_collision$;
    SELECT status FROM public.complete_legacy_producer_job_v3_11(
      '71300000-0000-4000-8000-000000000094','71300000-0000-4000-8000-000000000093',
      '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(firstCanonical).toString('hex')}','hex'),
      ${sqlLiteral(firstCanonical)}::jsonb,'${codec.sha256(firstCanonical)}');
    RESET ROLE;
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('71300000-0000-4000-8000-000000000098','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
      repeat('a',40),repeat('b',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
      ) WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743',
      'v313-service-completion-2','2026-08-08T10:20:01Z',NULL,NULL,convert_to('{}','utf8'),'{}',
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',
      date_trunc('second',clock_timestamp())-interval '1 second',clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('2',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code)
    VALUES('71300000-0000-4000-8000-000000000096','71300000-0000-4000-8000-000000000098',
      'compact_radar_projection','stage_barrier',5,NULL,0,NULL,NULL,repeat('4',64),repeat('4',64),'leased',1,5,
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000099','utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL);
    SET ROLE service_role;
    DO $conflict$ BEGIN
      BEGIN
        PERFORM * FROM public.complete_legacy_producer_job_v3_11(
          '71300000-0000-4000-8000-000000000098','71300000-0000-4000-8000-000000000096',
          '71300000-0000-4000-8000-000000000099',decode('${Buffer.from(conflictCanonical).toString('hex')}','hex'),
          ${sqlLiteral(conflictCanonical)}::jsonb,'${codec.sha256(conflictCanonical)}');
        RAISE EXCEPTION 'expected_conflict_missing';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'decision_evaluation_checksum_conflict' THEN RAISE;END IF;
      END;
    END $conflict$;
    RESET ROLE;
    SELECT jsonb_build_object(
      'firstStatus',(SELECT status::text FROM public.legacy_producer_runs_v3_11 WHERE run_id='71300000-0000-4000-8000-000000000097'),
      'exactRetryStatus',(SELECT status::text FROM public.legacy_producer_runs_v3_11 WHERE run_id='71300000-0000-4000-8000-000000000094'),
      'secondStatus',(SELECT status::text FROM public.legacy_producer_jobs_v3_11 WHERE job_id='71300000-0000-4000-8000-000000000096'),
      'revisions',(SELECT count(*) FROM public.legacy_decision_revisions_v3_13 WHERE decision_revision_id='${revisionId}'),
      'evaluations',(SELECT count(*) FROM public.legacy_decision_revision_evaluations_v3_13 WHERE decision_revision_id='${revisionId}'),
      'projectionFks',(SELECT count(*) FROM pg_constraint con JOIN pg_class relation ON relation.oid=con.conrelid
        WHERE relation.relname IN('legacy_decision_revisions_v3_13','legacy_decision_revision_evaluations_v3_13')
          AND con.contype='f' AND pg_get_constraintdef(con.oid) LIKE '%legacy_radar_projections_v3_11%'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{firstStatus:'success',exactRetryStatus:'success',secondStatus:'leased',revisions:1,evaluations:1,
    projectionFks:0});
});

test('V3.13 SQL decision envelope enforces the exact 15 percent and 2.0 authority boundaries',()=>{
  const envelopes=runtime('decision-envelope.js');
  const relative=(currentPe)=>({valuation:{status:'valuation_review',reason:'formal_target_unavailable'},currentPrice:100,
    researchScore:{axes:{valuation:{trustworthy:true,currentPe,historyPeP25:10,historyPeMedian:15,
      historyPeP75:20,sectorPe:16,historySampleCount:252,sectorCount:8,asOf:'2026-08-07',
      valuationEvidence:{algorithm:'official-relative-pe-evidence-v1',evidenceRoot:'a'.repeat(64),
        currentObservationRoot:'b'.repeat(64),historyMembershipRoot:'c'.repeat(64),
        sectorMembershipRoot:'d'.repeat(64),historySessions:252,sectorPeers:8},
      sourceRefs:['twse-openapi:official']}}},qualityActionEligible:true,marketAllowsAction:true,
    technical:{technicalState:'at_support',plane:{current:100}},geometry:{availability:'available',
      entryZone:[99,101],invalidation:94,trigger:null}});
  const formal=(base,invalidation)=>({valuation:{status:'normal',valuationRange:{bear:90,base,bull:140},
    method:{method:'pe'},asOf:'2026-08-07',evidence:{sourceRefs:['official-filing']}},currentPrice:100,
    qualityActionEligible:true,marketAllowsAction:true,technical:{technicalState:'breakout_confirmed',plane:{current:100}},
    geometry:{availability:'available',entryZone:[99,101],invalidation,trigger:null}});
  const exactFormal=envelopes.deriveDecisionEnvelope(formal(115,92.5));
  const exactRelative=envelopes.deriveDecisionEnvelope(relative(12.75));
  const validAvoid=envelopes.deriveDecisionEnvelope(relative(12.7515));
  const negativeHalfTie=envelopes.deriveDecisionEnvelope(formal(98.75,92.5));
  const lowUpside={...envelopes.deriveDecisionEnvelope(formal(114.99,92.5)),userAction:'buy'};
  const lowRewardRisk={...envelopes.deriveDecisionEnvelope(formal(115,92.49625)),userAction:'buy'};
  const lowRelative={...validAvoid,userAction:'research_starter'};
  const forgedRelative={...validAvoid,userAction:'research_starter',valuationSummary:{...validAvoid.valuationSummary,
    relativeDiscountPct:15}};
  const insufficientHistory={...exactRelative,valuationSummary:{...exactRelative.valuationSummary,
    thresholdAuthority:{...exactRelative.valuationSummary.thresholdAuthority,historySessions:251}}};
  const excessiveHistory={...exactRelative,valuationSummary:{...exactRelative.valuationSummary,
    thresholdAuthority:{...exactRelative.valuationSummary.thresholdAuthority,historySessions:253}}};
  const insufficientPeers={...exactRelative,valuationSummary:{...exactRelative.valuationSummary,
    thresholdAuthority:{...exactRelative.valuationSummary.thresholdAuthority,sectorPeers:7}}};
  const missingQuality=envelopes.deriveDecisionEnvelope({...formal(120,90),qualityActionEligible:false,
    qualityReadiness:'missing'});
  const missingMarket=envelopes.deriveDecisionEnvelope({...relative(10),marketAllowsAction:false,
    marketReadiness:'missing'});
  const technicalEnvelope=(technicalState,availability,trigger,geometry={})=>envelopes.deriveDecisionEnvelope({
    ...relative(10),technical:{technicalState,plane:{current:100}},geometry:{availability,trigger,
      entryZone:null,invalidation:null,...geometry}});
  const waitReclaim=technicalEnvelope('below_support','conditional',{kind:'reclaim',threshold:102});
  const avoidChase=technicalEnvelope('extended','conditional',{kind:'pullback',threshold:98});
  const invalidated=technicalEnvelope('invalidated','invalidated',null);
  const waitBreakout=technicalEnvelope('breakout_pending','available',{kind:'breakout',threshold:102},
    {entryZone:[101,103],invalidation:96});
  const wrongTriggers=[
    {...waitReclaim,entryPlan:{...waitReclaim.entryPlan,trigger:{kind:'breakout',threshold:102}}},
    {...avoidChase,entryPlan:{...avoidChase.entryPlan,trigger:{kind:'reclaim',threshold:102}}},
    {...invalidated,entryPlan:{...invalidated.entryPlan,trigger:{kind:'reclaim',threshold:102}}},
    {...waitBreakout,entryPlan:{...waitBreakout.entryPlan,trigger:{kind:'pullback',threshold:98}}},
    {...waitReclaim,entryPlan:{...waitReclaim.entryPlan,trigger:{threshold:102}}},
    {...waitReclaim,entryPlan:{...waitReclaim.entryPlan,trigger:{kind:'reclaim',threshold:102,arbitrary:true}}},
  ];
  const unavailable=envelopes.unavailableDecisionEnvelope({reason:'valuation_missing'});
  const missingAsAvoid={...unavailable,userAction:'avoid'};
  const values=[exactFormal,exactRelative,validAvoid,negativeHalfTie,lowUpside,lowRewardRisk,lowRelative,forgedRelative,
    insufficientHistory,excessiveHistory,insufficientPeers,missingQuality,missingMarket,waitReclaim,avoidChase,invalidated,
    waitBreakout,...wrongTriggers,missingAsAvoid]
    .map((value)=>`public.legacy_valid_decision_envelope_v3_13(${sqlLiteral(JSON.stringify(value))}::jsonb)`);
  const actual=JSON.parse(psql(`SELECT jsonb_build_array(${values.join(',')})::text;`,['-At']).trim());
  assert.deepEqual(actual,[true,true,true,true,false,false,false,false,false,false,false,true,true,true,true,true,true,
    false,false,false,false,false,false,false]);
});

test('V3.13 SQL decision canonicalizer is byte-equal to the tracked worker for disclosure values',()=>{
  const codec=runtime('codec.js');
  const value={action:'accumulate',entry:236.5,invalidation:219.5,upsidePct:15,riskRatio:2.25,
    unavailable:null,flags:[true,false],text:'comma, colon: and escaped "value"'};
  const expected=codec.canonicalJson(value);
  const actual=psql(`SELECT public.legacy_canonical_json_v3_13(${sqlLiteral(expected)}::jsonb);`,['-At']).trim();
  assert.equal(actual,expected);
});

test('V3.13 projection guard serializes every writer, rejects non-monotonic time, and retains exactly 1500 rows',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.legacy_radar_projections_v3_11(projection_key,"window",as_of,producer_commit_sha,
      worker_sha256,material_change_root,payload_canonical,payload_json,payload_sha256)
    SELECT 'retention-fixture-'||ordinal,'daily','2026-01-01T00:00:00Z'::timestamptz+ordinal*interval '1 second',
      repeat('a',40),repeat('b',64),repeat('c',64),convert_to(payload::text,'utf8'),payload,
      encode(extensions.digest(convert_to(payload::text,'utf8'),'sha256'),'hex')
    FROM(SELECT ordinal,jsonb_build_object('ordinal',ordinal) payload FROM generate_series(1,1501) ordinal) rows
    ORDER BY ordinal;
    DO $non_monotonic$ BEGIN
      BEGIN
        INSERT INTO public.legacy_radar_projections_v3_11(projection_key,"window",as_of,producer_commit_sha,
          worker_sha256,material_change_root,payload_canonical,payload_json,payload_sha256)
        SELECT 'retention-fixture-old','daily','2026-01-01T00:00:00Z',repeat('a',40),repeat('b',64),
          repeat('c',64),convert_to(value::text,'utf8'),value,
          encode(extensions.digest(convert_to(value::text,'utf8'),'sha256'),'hex')
        FROM(SELECT jsonb_build_object('ordinal',0) value) payload;
        RAISE EXCEPTION 'expected_non_monotonic_missing';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM<>'non_monotonic_projection' THEN RAISE;END IF;
      END;
    END $non_monotonic$;
    SELECT jsonb_build_object(
      'rows',(SELECT count(*) FROM public.legacy_radar_projections_v3_11 WHERE "window"='daily'),
      'oldest',(SELECT min(as_of) FROM public.legacy_radar_projections_v3_11 WHERE "window"='daily'),
      'newest',(SELECT max(as_of) FROM public.legacy_radar_projections_v3_11 WHERE "window"='daily'),
      'guards',(SELECT count(*) FROM pg_trigger trigger JOIN pg_class relation ON relation.oid=trigger.tgrelid
        WHERE relation.relname='legacy_radar_projections_v3_11'
          AND trigger.tgname IN('legacy_radar_projection_insert_guard_v3_13','legacy_radar_projection_retention_v3_13')))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual({rows:result.rows,guards:result.guards},{rows:1500,guards:2});
  assert.equal(new Date(result.oldest).toISOString(),'2026-01-01T00:00:02.000Z');
  assert.equal(new Date(result.newest).toISOString(),'2026-01-01T00:25:01.000Z');
});

test('V3.13 financial fact append authority rejects future reported periods and the 129th distinct series row',()=>{
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,'active',repeat('8',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-000000000080','9180');
    DO $series$
    DECLARE i integer;v_rejected boolean:=false;v_future_rejected boolean:=false;v_day date;
    BEGIN
      FOR i IN 1..128 LOOP
        v_day:=date '2025-01-01'+i;
        PERFORM public.append_financial_fact_v3(ROW(
          '71300000-0000-4000-8000-000000000080','net_asset_value',NULL,v_day,'instant',
          i::double precision,'TWD','twse','official_filing','reported','reported_period',
          v_day::timestamptz,v_day::timestamptz,v_day::timestamptz+interval '1 hour',NULL,
          'twse-openapi:series-bound:'||i)::public.financial_fact_input_v3,
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      END LOOP;
      BEGIN
        v_day:=date '2025-06-01';
        PERFORM public.append_financial_fact_v3(ROW(
          '71300000-0000-4000-8000-000000000080','net_asset_value',NULL,v_day,'instant',129,
          'TWD','twse','official_filing','reported','reported_period',v_day::timestamptz,
          v_day::timestamptz,v_day::timestamptz+interval '1 hour',NULL,
          'twse-openapi:series-bound:129')::public.financial_fact_input_v3,
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      EXCEPTION WHEN SQLSTATE 'PT409' THEN v_rejected:=true;
      END;
      IF NOT v_rejected THEN RAISE EXCEPTION '129th series row was accepted';END IF;
      BEGIN
        PERFORM public.append_financial_fact_v3(ROW(
          '71300000-0000-4000-8000-000000000080','net_asset_value',NULL,date '2027-01-01','instant',130,
          'TWD','twse','official_filing','reported','reported_period','2026-08-07T00:00:00Z'::timestamptz,
          '2026-08-07T00:00:00Z'::timestamptz,'2026-08-07T01:00:00Z'::timestamptz,NULL,
          'twse-openapi:future-reported-period')::public.financial_fact_input_v3,
          'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001');
      EXCEPTION WHEN SQLSTATE 'PT422' THEN v_future_rejected:=true;
      END;
      IF NOT v_future_rejected THEN RAISE EXCEPTION 'future reported period was accepted';END IF;
    END $series$;
    SELECT jsonb_build_object(
      'facts',(SELECT count(*) FROM public.opportunity_financial_facts_v3
        WHERE stock_id='71300000-0000-4000-8000-000000000080'),
      'series',(SELECT count(*) FROM public.opportunity_financial_fact_series_registry_v3
        WHERE stock_id='71300000-0000-4000-8000-000000000080'),
      'audits',(SELECT count(*) FROM public.opportunity_rpc_audit_v3
        WHERE caller_principal_id='a11d4e67-7d0a-4c44-8a9d-1d5c3b875001'
          AND function_name='append_financial_fact_v3'))::text;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{facts:128,series:1,audits:128});
});

test('DI-008 parser output crosses job completion and persistence before an adjusted read', async () => {
  const official=runtime('official-twse-valuation.js');
  const parsedPrice=official.parseOfficialPriceHistory({stat:'OK',data:[
    ['115/07/23','1,000','222,000','221.00','223.00','220.00','222.00'],
  ]},{exchange:'TWSE',symbol:'9199',sourceUrl:`${official.TWSE_PRICE_HISTORY_URL}?date=20260701&stockNo=9199&response=json`,
    collectedAt:'2026-07-23T10:00:00Z'});
  assert.equal(parsedPrice.length,1);
  const parsedSnapshots=await official.loadCorporateActionSnapshots({sessions:[['TWSE','2026-07-23']],
    collectedAt:'2026-07-23T10:00:00Z',fetchImpl:async(url)=>{
      const feed=official.CORPORATE_ACTION_FEEDS.TWSE.find((candidate)=>url.includes(candidate.path));
      const data=feed===official.CORPORATE_ACTION_FEEDS.TWSE[0]
        ?[['115年07月23日','9199','DI-008','100.00','50.00']]:[];
      return new Response(JSON.stringify({stat:'OK',fields:feed.header,data}),{status:200,
        headers:{'content-type':'application/json'}});
    }});
  assert.equal(parsedSnapshots.length,1);assert.equal(parsedSnapshots[0].declaredEventCount,1);
  const completionPayload={schema:'legacy-facts-refresh-result-v3.11',decisions:[],shallowObservations:[],
    sourceCandidates:[],dislocationCandidates:[],officialIngestion:{schema:'legacy-official-ingestion-v3.13',
      financialFacts:[],priceObservations:parsedPrice,corporateActionSnapshots:parsedSnapshots,reportedValuations:[]}};
  const result=JSON.parse(psql(`
    BEGIN;
    INSERT INTO public.internal_principal_role_bindings_v3(principal_id,role,valid_from,valid_to,status,configuration_hash,recorded_at)
    VALUES('a11d4e67-7d0a-4c44-8a9d-1d5c3b875001','opportunity_runner','2026-01-01',NULL,'active',repeat('7',64),clock_timestamp());
    INSERT INTO public.stocks(id,symbol) VALUES('71300000-0000-4000-8000-000000000090','9199');
    WITH key(canonical) AS(VALUES(convert_to('["instrument_roster","71300000-0000-4000-8000-000000000090"]','utf8')))
    INSERT INTO public.opportunity_authority_stream_registry_v3(family,stream_key_hash,stream_key_canonical,registered_at)
    SELECT 'instrument_roster',encode(extensions.digest(canonical,'sha256'),'hex'),canonical,'2026-01-01' FROM key;
    INSERT INTO public.stock_instruments_v3(instrument_authority_id,stock_id,symbol,exchange,instrument_type,
      listing_status,official_legal_name,official_short_name,provider,source_timestamp,valid_from,valid_to,
      roster_version,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000091','71300000-0000-4000-8000-000000000090','9199','TWSE',
      'common_stock','active','DI-008 Parser Fixture','DI008','twse','2026-01-01','2026-01-01',NULL,
      'tw-instrument-roster-v3.0','2026-01-01');
    INSERT INTO public.tw_trading_sessions_v3(session_authority_id,session_id,market,open_at,close_at,status,
      provider,source_timestamp,collected_at,source_ref,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000092','2026-07-23','TWSE','2026-07-23T01:00:00Z',
      '2026-07-23T05:30:00Z','completed','twse','2026-07-23T05:30:00Z','2026-07-23T06:00:00Z',
      'twse-calendar:di008','2026-07-23T06:00:00Z');
    INSERT INTO public.legacy_producer_runs_v3_11(run_id,owner_label,owner_token_hash,producer_commit_sha,worker_sha256,
      scheduler_config_canonical,scheduler_config_sha256,legacy_seed_symbols,legacy_seed_set_hash,scheduled_occurrence_id,
      source_cutoff,trading_date,trading_session_authority_hash,authority_canonical,authority_json,authority_hash,status,
      started_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,logical_run_key,attempt)
    VALUES('71300000-0000-4000-8000-000000000080','com.stockinsider.auth-source-worker',
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000081','utf8'),'sha256'),'hex'),
      repeat('8',40),repeat('9',64),decode('${legacyRuntimeConfigHex}','hex'),
      '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2',
      (SELECT array_agg(value ORDER BY ordinal) FROM jsonb_array_elements_text(
        convert_from(decode('${legacyRuntimeConfigHex}','hex'),'utf8')::jsonb->'legacySeedSymbols'
      ) WITH ORDINALITY seed(value,ordinal)),
      'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743','v313-di008-parser-persistence',
      date_trunc('second',clock_timestamp()),'2026-07-23',NULL,convert_to('{}','utf8'),'{}'::jsonb,
      encode(extensions.digest(convert_to('{}','utf8'),'sha256'),'hex'),'running',clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '120 seconds',NULL,NULL,repeat('8',64),1);
    INSERT INTO public.legacy_producer_jobs_v3_11(job_id,run_id,stage,job_kind,stage_ordinal,shard_ordinal,
      execution_ordinal,revision_id,predecessor_job_id,input_hash,payload_hash,status,attempt,max_attempts,
      owner_token_hash,leased_at,heartbeat_at,lease_expires_at,terminal_at,failure_code,recorded_at)
    VALUES('71300000-0000-4000-8000-000000000082','71300000-0000-4000-8000-000000000080','facts_refresh',
      'stage_barrier',3,NULL,0,NULL,NULL,repeat('1',64),repeat('1',64),'leased',1,5,
      encode(extensions.digest(convert_to('71300000-0000-4000-8000-000000000081','utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '120 seconds',NULL,NULL,clock_timestamp());
    WITH output(value) AS(VALUES(${sqlLiteral(JSON.stringify(completionPayload))}::jsonb))
    SELECT completion.status FROM output CROSS JOIN LATERAL public.complete_legacy_producer_job_v3_11(
      '71300000-0000-4000-8000-000000000080','71300000-0000-4000-8000-000000000082',
      '71300000-0000-4000-8000-000000000081',convert_to(output.value::text,'utf8'),output.value,
      encode(extensions.digest(convert_to(output.value::text,'utf8'),'sha256'),'hex')) completion;
    WITH selected AS (
      SELECT session_id,session_authority_id,row_number() OVER(ORDER BY session_id) ordinal
      FROM (SELECT session_id,session_authority_id FROM public.tw_trading_sessions_v3
        WHERE market='TWSE' AND status='completed' AND session_id<='2026-07-23'
        ORDER BY session_id DESC LIMIT 122) bounded
    ), ordered AS (SELECT * FROM selected ORDER BY session_id)
    INSERT INTO public.opportunity_corporate_action_snapshots_v3(
      snapshot_id,exchange,session_id,session_authority_id,corporate_action_version,provider,collected_at,
      declared_event_count,dataset_hash,recorded_at
    ) SELECT extensions.gen_random_uuid(),'TWSE',session_id,session_authority_id,'tw-corporate-action-v3.1','twse',
      session_id::timestamp AT TIME ZONE 'UTC'+interval '8 hours',0,
      encode(extensions.digest(convert_to('v313-adjustment:'||session_id::text,'utf8'),'sha256'),'hex'),
      session_id::timestamp AT TIME ZONE 'UTC'+interval '8 hours'
    FROM ordered WHERE session_id<>'2026-07-23' ON CONFLICT DO NOTHING;

    WITH selected AS (
      SELECT session_id,session_authority_id,row_number() OVER(ORDER BY session_id) ordinal
      FROM (SELECT session_id,session_authority_id FROM public.tw_trading_sessions_v3
        WHERE market='TWSE' AND status='completed' AND session_id<='2026-07-23'
        ORDER BY session_id DESC LIMIT 122) bounded ORDER BY session_id
    ) INSERT INTO public.opportunity_price_observations_v3(stock_id,exchange,session_id,session_authority_id,
      raw_open,raw_high,raw_low,raw_close,volume,turnover_twd,provider,source_timestamp,collected_at,source_ref,recorded_at)
    SELECT (SELECT stock_id FROM public.opportunity_price_observations_v3
        WHERE source_ref='twse-rwd:STOCK_DAY:2026-07-23:9199'),'TWSE',session_id,session_authority_id,
      99+ordinal,101+ordinal,98+ordinal,100+ordinal,1000,100000,'twse',
      session_id::timestamp AT TIME ZONE 'UTC'+interval '7 hours',
      session_id::timestamp AT TIME ZONE 'UTC'+interval '8 hours','twse:v313-adjusted:'||session_id::text,
      session_id::timestamp AT TIME ZONE 'UTC'+interval '8 hours'
    FROM selected WHERE session_id<>'2026-07-23';

    WITH plane AS (
      SELECT public.read_legacy_candidate_fact_plane_v3_11(clock_timestamp(),jsonb_build_object('candidates',
        jsonb_build_array(jsonb_build_object('stockId',(SELECT stock_id FROM public.opportunity_price_observations_v3
          WHERE source_ref='twse-rwd:STOCK_DAY:2026-07-23:9199'),'symbol','9199','deepSelected',true,
          'shallowSelected',true)))) value
    ) SELECT jsonb_build_object('count',jsonb_array_length(value->'priceRows'),
      'firstClose',(value#>>'{priceRows,0,5}')::double precision,
      'lastClose',(value#>ARRAY['priceRows',(jsonb_array_length(value->'priceRows')-1)::text,'5'])::double precision,
      'referenceCount',(SELECT count(*) FROM jsonb_array_elements(value->'priceRows') row(value)
        WHERE (row.value->>7)~'^[0-9a-f]{64}$'),
      'parsedSourcePersisted',(SELECT count(*) FROM public.opportunity_price_observations_v3
        WHERE source_ref='twse-rwd:STOCK_DAY:2026-07-23:9199'),
      'parsedActionPersisted',(SELECT count(*) FROM public.opportunity_corporate_action_events_v3
        WHERE symbol='9199' AND source_row_ref='${parsedSnapshots[0].events[0].sourceRowRef}'),
      'allPriceRows',(SELECT count(*) FROM public.opportunity_price_observations_v3 WHERE stock_id=(SELECT stock_id
        FROM public.opportunity_price_observations_v3 WHERE source_ref='twse-rwd:STOCK_DAY:2026-07-23:9199')),
      'jobStatus',(SELECT status FROM public.legacy_producer_jobs_v3_11 WHERE job_id='71300000-0000-4000-8000-000000000082'),
      'resultRows',(SELECT count(*) FROM public.legacy_producer_job_results_v3_11 WHERE job_id='71300000-0000-4000-8000-000000000082'))::text FROM plane;
    ROLLBACK;
  `,['-At']).trim().split('\n').find((line)=>line.startsWith('{')));
  assert.deepEqual(result,{count:121,firstClose:50.5,lastClose:222,referenceCount:121,
    parsedSourcePersisted:1,parsedActionPersisted:1,allPriceRows:121,jobStatus:'succeeded',resultRows:1});
});

test('real TypeScript evaluation executor output stages and commits through PostgreSQL', () => {
  const runId = '123e4567-e89b-42d3-a456-426614179101';
  const jobId = '123e4567-e89b-42d3-a456-426614179102';
  const ownerToken = 'typescript-postgres-integration-owner';
  const inputHash = 'e'.repeat(64);
  const strategyPopulationHash = sha256Canonical(['strategy-population-v3.0', []]);
  const strategyRows = ['official_only', 'source_led', 'hybrid'].map((strategy) => ({
    strategy,
    selectedCandidateIds: [],
    excludedCandidateIdsAndReasons: [],
    selectedCount: 0,
    verifiedChangePrecisionNumerator: 0,
    verifiedChangePrecisionDenominator: 0,
    verifiedChangePrecision: null,
    contradictionCaptureNumerator: 0,
    contradictionCaptureDenominator: 0,
    contradictionCaptureRate: null,
    timeToFirstVerifiedChangeMinutes: null,
    reviewerResolutionNumerator: 0,
    reviewerResolutionDenominator: 0,
    reviewerResolutionRate: null,
    facts: ['insufficient_product_value_evidence'],
    preCapCandidateCount: 0,
    preCapOrderedIdentityHash: strategyPopulationHash,
    deferredDueStrategyEvidenceCap: 0,
    retainedCandidateCount: 0,
  }));
  const readBody = [
    '1'.repeat(64),
    '2'.repeat(64),
    '3'.repeat(64),
    [],
    0,
    0,
    null,
    null,
    null,
    null,
    [0, strategyPopulationHash, 0, 0],
    strategyRows,
    {
      acceptancePassed: false,
      backtestDatesReady: false,
      legacyMetricsReady: false,
      linkPrecisionPassed: false,
      linkRecallPassed: false,
      liveDatesReady: false,
      operationsPassed: false,
      promotionReady: false,
      securityPassed: false,
      v3MetricsReady: false,
    },
    [
      'insufficient_backtest_dates',
      'insufficient_live_dates',
      'legacy_baseline_unavailable',
      'insufficient_link_precision_evidence',
      'insufficient_link_recall_evidence',
      'acceptance_evidence_unavailable',
      'security_evidence_unavailable',
      'operations_evidence_unavailable',
    ],
    'fail',
  ];
  const executed = executeWorkerPayload('evaluation_bundle', readBody, { runId });
  const output = [
    'opportunity-job-output-v3.3',
    'evaluation_bundle',
    runId,
    jobId,
    inputHash,
    executed,
    [],
  ];
  const outputCanonical = canonicalJson(output);
  const outputHash = sha256Canonical(output);
  const payload = [
    'opportunity-job-payload-v3.3',
    'evaluation_bundle',
    runId,
    'evaluate',
    'evaluation_bundle:0',
    [
      '123e4567-e89b-42d3-a456-426614179201',
      '123e4567-e89b-42d3-a456-426614179202',
      '123e4567-e89b-42d3-a456-426614179203',
      ['official_only', 'source_led', 'hybrid'],
    ],
  ];
  const payloadCanonical = canonicalJson(payload);
  const payloadHash = sha256Canonical(payload);
  const committed = JSON.parse(psql(`
    INSERT INTO public.opportunity_runs(
      run_id,preparation_key,logical_key,attempt,mode,run_purpose,source_cutoff,
      comparison_contract_key,evaluation_dataset_lock_hash,status,created_at,sealed_at,recorded_at
    ) VALUES(
      '${runId}',repeat('d',64),repeat('e',64),1,'shadow_evaluate',
      'shadow_evaluation_daily','2026-07-23T06:58:00Z',
      'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
      encode(extensions.digest(convert_to('source-led-eval-v3.7','utf8'),'sha256'),'hex'),
      'running','2026-07-23T06:58:01Z','2026-07-23T06:58:02Z','2026-07-23T06:58:01Z'
    );
    INSERT INTO public.opportunity_run_jobs_v3(
      job_id,run_id,stage,shard_key,input_hash,status,attempt,owner_token_hash,
      attempt_started_at,lease_expires_at,heartbeat_at,created_at,recorded_at
    ) VALUES(
      '${jobId}','${runId}','evaluate','evaluation_bundle:0','${inputHash}',
      'leased',1,encode(extensions.digest(convert_to(${sqlLiteral(ownerToken)},'utf8'),'sha256'),'hex'),
      clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp(),
      clock_timestamp(),clock_timestamp()
    );
    INSERT INTO public.opportunity_job_payloads_v3(
      job_id,run_id,payload_kind,payload_canonical,payload_json,payload_hash
    ) VALUES(
      '${jobId}','${runId}','evaluation_bundle',
      decode('${Buffer.from(payloadCanonical).toString('hex')}','hex'),
      ${sqlLiteral(payloadCanonical)}::jsonb,'${payloadHash}'
    );
    SELECT public.stage_opportunity_job_output_v3(
      '${jobId}',${sqlLiteral(ownerToken)},'evaluation_bundle',
      decode('${Buffer.from(outputCanonical).toString('hex')}','hex'),
      ${sqlLiteral(outputCanonical)}::jsonb,'${outputHash}',
      ROW(0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0)::public.opportunity_job_counts_v3
    );
    SELECT public.complete_opportunity_job_v3(
      '${jobId}',${sqlLiteral(ownerToken)},'${outputHash}',
      ROW(0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0)::public.opportunity_job_counts_v3
    );
    SELECT jsonb_build_object(
      'jobStatus',(SELECT status FROM public.opportunity_run_jobs_v3 WHERE job_id='${jobId}'),
      'evaluationCount',(SELECT count(*) FROM public.opportunity_evaluation_results_v3
        WHERE run_id='${runId}'),
      'payload',(SELECT payload_json FROM public.opportunity_evaluation_results_v3
        WHERE run_id='${runId}'),
      'nextPayloadKind',(SELECT payload_kind FROM public.opportunity_job_payloads_v3
        WHERE run_id='${runId}' AND job_id<>'${jobId}')
    )::text;
  `, ['-At']).trim().split('\n').at(-1));
  assert.deepEqual(committed, {
    jobStatus: 'succeeded',
    evaluationCount: 1,
    payload: executed,
    nextPayloadKind: 'finalize',
  });
});

test('public selector is one point-in-time statement across cold, active, failed, success and tie branches', () => {
  const rows = psql(`
    INSERT INTO public.opportunity_runs(
      run_id,preparation_key,logical_key,attempt,mode,run_purpose,source_cutoff,
      comparison_contract_key,status,created_at,terminal_at,recorded_at
    ) VALUES
      ('123e4567-e89b-42d3-a456-426614178101',repeat('1',64),NULL,1,
        'enrich_rank','ad_hoc_shadow','2026-07-31T08:00:00Z',repeat('9',64),
        'failed','2026-08-01T00:00:00Z','2026-08-01T01:00:00Z','2026-08-01T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178102',repeat('2',64),NULL,1,
        'enrich_rank','production_shadow_daily','2026-08-02T08:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        'failed','2026-08-02T00:00:00Z','2026-08-03T00:00:00Z','2026-08-02T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178103',repeat('3',64),repeat('3',64),1,
        'enrich_rank','production_shadow_daily','2026-08-04T08:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        'success','2026-08-04T00:00:00Z','2026-08-04T09:00:00Z','2026-08-04T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178104',repeat('4',64),repeat('4',64),1,
        'enrich_rank','production_shadow_daily','2026-08-05T08:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        'success','2026-08-05T00:00:00Z','2026-08-05T09:00:00Z','2026-08-05T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178105',repeat('5',64),repeat('5',64),1,
        'enrich_rank','production_shadow_daily','2026-08-05T08:00:00Z',
        'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729',
        'success','2026-08-05T00:00:00Z','2026-08-05T09:00:00Z','2026-08-05T00:00:00Z');
    INSERT INTO public.opportunity_run_jobs_v3(
      job_id,run_id,stage,shard_key,input_hash,status,attempt,output_kind,output_hash,
      created_at,terminal_at,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614178201',
      '123e4567-e89b-42d3-a456-426614178102',
      'source_documents','warning-fixture',repeat('a',64),'succeeded',1,
      'source_connector_summary',repeat('b',64),
      '2026-08-02T10:00:00Z','2026-08-02T11:00:00Z','2026-08-02T10:00:00Z'
    );
    INSERT INTO public.opportunity_run_warning_facts_v3(
      run_id,warning,producing_job_id,evidence_ref,recorded_at
    ) VALUES(
      '123e4567-e89b-42d3-a456-426614178102','connector_degraded',
      '123e4567-e89b-42d3-a456-426614178201','fixture:connector',
      '2026-08-02T11:00:00Z'
    );
    INSERT INTO public.opportunity_public_projections_v3(
      run_id,contract_version,acceptance_version,payload_canonical,payload_json,payload_hash,recorded_at
    ) VALUES
      ('123e4567-e89b-42d3-a456-426614178103','source-led-opportunity-v3.6','1.46.0',
        convert_to('{"run":"one"}','utf8'),'{"run":"one"}',
        encode(extensions.digest(convert_to('{"run":"one"}','utf8'),'sha256'),'hex'),
        '2026-08-04T09:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178104','source-led-opportunity-v3.6','1.46.0',
        convert_to('{"run":"tie-a"}','utf8'),'{"run":"tie-a"}',
        encode(extensions.digest(convert_to('{"run":"tie-a"}','utf8'),'sha256'),'hex'),
        '2026-08-05T09:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178105','source-led-opportunity-v3.6','1.46.0',
        convert_to('{"run":"tie-b"}','utf8'),'{"run":"tie-b"}',
        encode(extensions.digest(convert_to('{"run":"tie-b"}','utf8'),'sha256'),'hex'),
        '2026-08-05T09:00:00Z');
    SELECT label||E'\\t'||row_to_json(selection)::text
    FROM (VALUES
      ('cold','2020-01-01T00:00:00Z'::timestamptz),
      ('no_match','2026-08-01T12:00:00Z'::timestamptz),
      ('active','2026-08-02T12:00:00Z'::timestamptz),
      ('failed','2026-08-03T12:00:00Z'::timestamptz),
      ('success','2026-08-04T12:00:00Z'::timestamptz),
      ('tie','2026-08-05T12:00:00Z'::timestamptz)
    ) cases(label,cutoff)
    CROSS JOIN LATERAL public.select_opportunity_public_projection_v3(cases.cutoff) selection
    ORDER BY cases.cutoff;
  `, ['-At']).trim().split('\n').filter((line) => line.includes('\t')).map((line) => {
    const [label, json] = line.split('\t');
    return [label, JSON.parse(json)];
  });
  const byLabel = Object.fromEntries(rows);
  assert.deepEqual(
    [byLabel.cold.availability, byLabel.cold.unavailable_reason, byLabel.cold.warnings],
    ['unavailable', 'cold_start', ['shadow_only']],
  );
  assert.deepEqual(
    [byLabel.no_match.availability, byLabel.no_match.unavailable_reason],
    ['unavailable', 'no_matching_success'],
  );
  assert.deepEqual(
    [byLabel.active.unavailable_reason, byLabel.active.warnings],
    ['matching_run_in_progress', ['connector_degraded', 'shadow_only']],
  );
  assert.deepEqual(
    [byLabel.failed.unavailable_reason, byLabel.failed.warnings],
    ['latest_matching_failed', ['connector_degraded', 'shadow_only']],
  );
  assert.equal(byLabel.success.availability, 'available');
  assert.equal(byLabel.success.selected_run_id, '123e4567-e89b-42d3-a456-426614178103');
  assert.deepEqual(byLabel.success.payload_json, { run: 'one' });
  assert.deepEqual(
    [byLabel.tie.availability, byLabel.tie.unavailable_reason, byLabel.tie.selected_run_id],
    ['unavailable', 'latest_matching_failed', null],
  );
});
