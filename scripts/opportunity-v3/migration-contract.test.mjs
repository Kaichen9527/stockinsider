import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256Canonical } from '../../web/src/lib/opportunity-v3/canonical.ts';
import { executeWorkerPayload } from '../../web/src/lib/opportunity-v3/worker-executors.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(root, 'migrations/20260724_source_led_opportunity_engine_v3.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
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
    CREATE TABLE public.source_entities(id uuid PRIMARY KEY);
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
    ALTER DATABASE postgres OWNER TO stockinsider_managed_migrator;
    ALTER SCHEMA public OWNER TO stockinsider_managed_migrator;
    GRANT USAGE ON SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO stockinsider_managed_migrator WITH GRANT OPTION;
    GRANT ALL PRIVILEGES ON TABLE public.source_entities,public.stocks,public.stock_signals
      TO stockinsider_managed_migrator WITH GRANT OPTION;
  `);
  for (let application = 0; application < 2; application += 1) {
    command(pg.psql, [
      '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port),
      '-U', 'stockinsider_managed_migrator', '-d', 'postgres', '-f', migrationPath,
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
      SELECT jsonb_build_object('schema','legacy-source-sync-result-v3.11') payload;
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
    SELECT jsonb_build_object(
      'created',(SELECT disposition FROM legacy_lease_capture),
      'busy',(SELECT disposition FROM legacy_busy_capture),
      'resumed',(SELECT disposition FROM legacy_resume_capture),
      'sameRun',(SELECT run_id FROM legacy_lease_capture)=(SELECT run_id FROM legacy_resume_capture),
      'sameJob',(SELECT job_id FROM legacy_lease_capture)=(SELECT job_id FROM legacy_resume_capture),
      'completed',(SELECT status FROM legacy_complete_capture),
      'failed',(SELECT status FROM legacy_fail_capture),
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
    jobDeterministic: result.jobDeterministic }, {
    created: 'created', busy: 'owner_already_leased', resumed: 'resumed', sameRun: true, sameJob: true,
    completed: 'running', failed: 'running', jobDeterministic: true,
  });
  assert.equal(Number(result.scheduledHour), 18); assert.equal(Number(result.scheduledMinute), 20);
  assert.ok(Number(result.weekday) >= 1 && Number(result.weekday) <= 5);
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
  const claimBody = sql.match(/CREATE OR REPLACE FUNCTION claim_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const completionBody = sql.match(/CREATE OR REPLACE FUNCTION complete_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const heartbeatBody = sql.match(/CREATE OR REPLACE FUNCTION heartbeat_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const failBody = sql.match(/CREATE OR REPLACE FUNCTION fail_legacy_producer_job_v3_11[\s\S]*?\nEND \$\$;/u)?.[0] ?? '';
  const primaryFailBody = sql.match(/CREATE OR REPLACE FUNCTION fail_opportunity_job_v3[\s\S]*?\n\$fn\$;/u)?.[0] ?? '';
  assert.match(claimBody, /'priorLedger'[\s\S]*prior_run[.]status='success'[\s\S]*legacy_candidate_discovery_ledger_v3_11/u);
  assert.match(claimBody, /ORDER BY prior_run[.]source_cutoff DESC,prior_run[.]terminal_at DESC,prior_run[.]run_id LIMIT 1/u);
  assert.match(claimBody, /'priorRevisions'[\s\S]*legacy_analysis_revisions_v3_11[\s\S]*revision[.]source_cutoff<v_run[.]source_cutoff/u);
  assert.match(completionBody, /CASE WHEN v_revision_created THEN 'material_revision_created' ELSE 'no_material_change' END/u);
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
	      'opportunity_peer_authority_header_counts_v3_internal'
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
  assert.equal(decoded.comparisonContractKey, 'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41');
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
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
        encode(extensions.digest(convert_to('source-led-eval-v3.7','utf8'),'sha256'),'hex'),
        'success','2026-04-01T08:00:01Z','2026-04-01T08:00:02Z',
        '2026-04-01T08:00:03Z','2026-04-01T08:00:01Z'
      ),
      (
        '123e4567-e89b-42d3-a456-426614177902',repeat('8',64),repeat('8',64),1,
        'label_outcomes','outcome_label_daily','2026-07-20',
        '2026-07-20T09:00:00Z',
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
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
      'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
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
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
        'failed','2026-08-02T00:00:00Z','2026-08-03T00:00:00Z','2026-08-02T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178103',repeat('3',64),repeat('3',64),1,
        'enrich_rank','production_shadow_daily','2026-08-04T08:00:00Z',
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
        'success','2026-08-04T00:00:00Z','2026-08-04T09:00:00Z','2026-08-04T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178104',repeat('4',64),repeat('4',64),1,
        'enrich_rank','production_shadow_daily','2026-08-05T08:00:00Z',
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
        'success','2026-08-05T00:00:00Z','2026-08-05T09:00:00Z','2026-08-05T00:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178105',repeat('5',64),repeat('5',64),1,
        'enrich_rank','production_shadow_daily','2026-08-05T08:00:00Z',
        'ebaa6dbdaa7dd55bb261187008f51e930919e7c0cfe07732d531e01267e67c41',
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
      ('123e4567-e89b-42d3-a456-426614178103','source-led-opportunity-v3.6','1.44.6',
        convert_to('{"run":"one"}','utf8'),'{"run":"one"}',
        encode(extensions.digest(convert_to('{"run":"one"}','utf8'),'sha256'),'hex'),
        '2026-08-04T09:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178104','source-led-opportunity-v3.6','1.44.6',
        convert_to('{"run":"tie-a"}','utf8'),'{"run":"tie-a"}',
        encode(extensions.digest(convert_to('{"run":"tie-a"}','utf8'),'sha256'),'hex'),
        '2026-08-05T09:00:00Z'),
      ('123e4567-e89b-42d3-a456-426614178105','source-led-opportunity-v3.6','1.44.6',
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
