import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

function executable(name) {
  const resolved = spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'postgres-tool', name], { encoding: 'utf8' }).stdout.trim();
  return resolved || ['/opt/homebrew/bin', '/usr/local/bin'].map((directory) => path.join(directory, name)).find(existsSync) || null;
}

function p95(values) {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1];
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

async function reservePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  assert.ok(address && typeof address === 'object');
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 5000))]);
  if (!graceful) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function waitForProductionServer(url, child, logs) {
  const deadline = Date.now() + 30000;
  let lastReadiness = 'no response received';
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      assert.fail(`production Next server exited before readiness\n${logs.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastReadiness = `status ${response.status}: ${(await response.text()).slice(0, 500)}`;
    } catch (error) { lastReadiness = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`production Next server readiness timeout (${lastReadiness})\n${logs.join('')}`);
}

export async function runControlledProjectionPerformanceOracle({ root }) {
  const packageScripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const diagnostic = packageScripts['diagnostic:source-led-opportunity-v3:product-runtime'];
  assert.ok(diagnostic.indexOf('build:source-led-opportunity-v3') < diagnostic.indexOf('test:source-led-opportunity-v3:performance'));
  if (!existsSync(path.join(root, 'web/.next/BUILD_ID'))) {
    const build = spawnSync('npm', ['run', 'build:source-led-opportunity-v3'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, OPPORTUNITY_V3_UI_FIXTURE: 'disabled' },
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
  }
  assert.ok(existsSync(path.join(root, 'web/.next/BUILD_ID')), 'the diagnostic must supply a completed production build before PCR-022');
  const initdb = executable('initdb');
  const pgCtl = executable('pg_ctl');
  const psql = executable('psql');
  assert.ok(initdb && pgCtl && psql, 'PostgreSQL tools are mandatory');
  // PostgreSQL Unix sockets have a 103-byte path limit on macOS. The protected
  // worker intentionally gives model runs a long private TMPDIR, so this local
  // fixture must use a short, private directory rather than inheriting it.
  const directory = mkdtempSync('/tmp/stockinsider-pcr022-');
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  const log = path.join(directory, 'postgres.log');
  mkdirSync(socket);
  // A PID-derived port collides when acceptance owners or a prior interrupted
  // fixture share the modulo range. Reserve a currently available loopback port
  // exactly as the production Next probe below does; the fixture remains local
  // and its readiness is still enforced by pg_ctl -w.
  const port = await reservePort();
  const user = os.userInfo().username;
  const run = (binary, args, input = undefined) => {
    const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', input, env: { ...process.env, LC_ALL: 'C' } });
    const startupLog = binary === pgCtl && args.includes('start') && existsSync(log)
      ? `\nPostgreSQL startup log:\n${readFileSync(log, 'utf8')}`
      : '';
    assert.equal(result.status, 0, `${result.stderr || result.stdout}${startupLog}`);
    return result.stdout;
  };
  run(initdb, ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
  run(pgCtl, ['-D', data, '-l', log, '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
  const query = (sql) => run(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-At'], sql);
  let projectionServer;
  let nextServer;
  try {
    query(`CREATE TABLE legacy_radar_projections_v3_11(
      projection_id uuid PRIMARY KEY, "window" text NOT NULL, as_of timestamptz NOT NULL,
      created_at timestamptz NOT NULL, payload_json jsonb NOT NULL, payload_sha256 text NOT NULL);
      CREATE INDEX legacy_radar_projections_v3_11_window_read_idx
        ON legacy_radar_projections_v3_11("window",as_of DESC,created_at DESC,projection_id ASC);
      INSERT INTO legacy_radar_projections_v3_11
      SELECT (lpad(to_hex(sequence),32,'0')::uuid),
        (ARRAY['daily','three_day','weekly','home'])[(sequence % 4)+1],
        '2026-08-01T00:00:00Z'::timestamptz-(sequence||' seconds')::interval,
        '2026-08-01T00:00:00Z'::timestamptz-(sequence||' milliseconds')::interval,
        jsonb_build_object('opportunities','[]'::jsonb,'sequence',sequence),repeat('a',64)
      FROM generate_series(1,6000) sequence; ANALYZE legacy_radar_projections_v3_11;`);
    for (const window of ['daily', 'three_day', 'weekly', 'home']) {
      const plan = query(`SET enable_seqscan=off; EXPLAIN (ANALYZE,FORMAT JSON)
        SELECT payload_json,payload_sha256,as_of,created_at,projection_id
        FROM legacy_radar_projections_v3_11 WHERE "window"='${window}'
        ORDER BY as_of DESC,created_at DESC,projection_id ASC LIMIT 2;`);
      assert.match(plan, /legacy_radar_projections_v3_11_window_read_idx/u);
      assert.doesNotMatch(plan, /"Node Type": "Seq Scan"/u);
    }
    const databaseLatencies = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      query(`SELECT payload_json FROM legacy_radar_projections_v3_11 WHERE "window"='daily' ORDER BY as_of DESC,created_at DESC,projection_id ASC LIMIT 2;`);
      databaseLatencies.push(performance.now() - started);
    }
    assert.ok(databaseLatencies[0] <= 5000, `database cold gate: ${databaseLatencies[0]}ms`);
    assert.ok(p95(databaseLatencies.slice(1)) <= 1500, `database warm p95 gate: ${p95(databaseLatencies.slice(1))}ms`);

    let providerCalls = 0;
    let projectionReads = 0;
    let runtimeHealthReads = 0;
    const asOf = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
    const basePayload = {
      opportunities: [], sourceSignals: [], scenarioUpsideCandidates: [], hotTracking: [], fallbackOpportunities90d: [],
      earlyWatchlist: [], discoveredStocks: [], reports: [], hotThemes: [], connectorStatus: [], themeHypotheses: [],
      sourceHealthSummary: null, dataHealth: null, marketHighlightSummary: null, globalLeadLagSummary: null,
      discoveryFreshnessSummary: null, marketIndexSignal: null, agentStatus: { lastSuccessfulRunAt: null },
      focusSummary: '受控 compact projection 效能測試', marketFreshnessStatus: 'pending',
      riskDisclosure: '受控測試資料，不是投資建議。', lastUpdatedAt: asOf, generatedAt: asOf, asOf,
    };
    projectionServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/rest/v1/legacy_runtime_health_observations_v3_11') {
        runtimeHealthReads += 1;
        response.setHeader('content-type', 'application/json');
        response.setHeader('content-range', '*/0');
        response.end('[]');
        return;
      }
      if (request.method !== 'GET' || url.pathname !== '/rest/v1/legacy_radar_projections_v3_11') {
        providerCalls += 1;
        response.statusCode = 503;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: 'unexpected_non_projection_read' }));
        return;
      }
      const storageWindow = String(url.searchParams.get('window') ?? '').replace(/^eq\./u, '');
      const publicWindow = storageWindow === 'three_day' ? 'hot' : storageWindow;
      if (!['daily', 'hot', 'weekly', 'home'].includes(publicWindow)
        || url.searchParams.get('limit') !== '2') {
        providerCalls += 1;
        response.statusCode = 503;
        response.end(JSON.stringify({ error: 'unexpected_projection_query' }));
        return;
      }
      projectionReads += 1;
      const payload = { ...basePayload, sourceLedCorrectness: { schema: 'legacy-radar-v3.11.3', window: publicWindow, asOf } };
      const row = { payload_json: payload, payload_sha256: sha256Canonical(payload), as_of: asOf,
        created_at: asOf, projection_id: '00000000-0000-0000-0000-000000000001' };
      response.setHeader('content-type', 'application/json');
      response.setHeader('content-range', '0-0/1');
      response.end(JSON.stringify([row]));
    });
    await new Promise((resolve, reject) => {
      projectionServer.once('error', reject);
      projectionServer.listen(0, '127.0.0.1', resolve);
    });
    const projectionAddress = projectionServer.address();
    assert.ok(projectionAddress && typeof projectionAddress === 'object');
    const nextPort = await reservePort();
    const nextLogs = [];
    nextServer = spawn(path.join(root, 'web/node_modules/.bin/next'), ['start', '--hostname', '127.0.0.1', '--port', String(nextPort)], {
      cwd: path.join(root, 'web'),
      env: {
        ...process.env,
        NODE_ENV: 'production', SOURCE_LED_OPPORTUNITY_V3: 'disabled', LEGACY_RADAR_CORRECTNESS_PROJECTION: 'enabled',
        OPPORTUNITY_V3_UI_FIXTURE: 'disabled', SUPABASE_URL: `http://127.0.0.1:${projectionAddress.port}`,
        SUPABASE_SERVICE_ROLE_KEY: 'controlled-projection-service-role-key',
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${projectionAddress.port}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'controlled-projection-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [nextServer.stdout, nextServer.stderr]) stream?.on('data', (chunk) => nextLogs.push(String(chunk)));
    const baseUrl = `http://127.0.0.1:${nextPort}`;
    await waitForProductionServer(`${baseUrl}/api/radar/daily`, nextServer, nextLogs);
    providerCalls = 0;
    projectionReads = 0;
    runtimeHealthReads = 0;
    const routeLatencies = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const response = await fetch(`${baseUrl}/api/radar/daily`, { headers: { 'cache-control': 'no-cache' } });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
      routeLatencies.push(performance.now() - started);
    }
    assert.ok(routeLatencies[0] <= 5000, `production route cold gate: ${routeLatencies[0]}ms`);
    assert.ok(p95(routeLatencies.slice(1)) <= 1500, `production route warm p95 gate: ${p95(routeLatencies.slice(1))}ms`);
    const concurrentStarted = performance.now();
    const responses = await Promise.all(['/', '/api/radar/daily', '/api/radar/hot', '/api/radar/weekly', '/api/radar/daily']
      .map((pathname) => fetch(`${baseUrl}${pathname}`, { headers: { 'cache-control': 'no-cache' } })
        .then(async (response) => ({ pathname, response, body: await response.text() }))) );
    assert.ok(performance.now() - concurrentStarted <= 10000);
    for (const { pathname, response, body } of responses) {
      assert.ok(response.ok, `${pathname} returned ${response.status}: ${body.slice(0, 500)}\n${nextLogs.join('')}`);
    }
    assert.match(responses[0].response.headers.get('content-type') ?? '', /text\/html/u);
    assert.ok(Buffer.byteLength(responses[0].body) <= 250000);
    assert.ok(responses.slice(1).every(({ body }) => Buffer.byteLength(body) <= 150000));
    for (const { body } of responses.slice(1)) assert.equal(JSON.parse(body).sourceLedCorrectness.schema, 'legacy-radar-v3.11.3');
    assert.equal(providerCalls, 0, 'projection reads never call providers or deep research');
    assert.equal(projectionReads, routeLatencies.length + responses.length,
      'every production read is accounted for by exactly one compact projection query');
    assert.equal(runtimeHealthReads, routeLatencies.length + responses.length,
      'every production read has one bounded runtime-health authority query');
  } finally {
    await stopProcess(nextServer);
    if (projectionServer) await new Promise((resolve) => projectionServer.close(resolve));
    run(pgCtl, ['-D', data, '-m', 'fast', '-w', 'stop']);
    rmSync(directory, { recursive: true, force: true });
  }
}
