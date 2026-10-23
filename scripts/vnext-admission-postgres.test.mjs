/** Real PostgreSQL only, in a uniquely owned network-none Docker fixture.
 * Synthetic business inputs/principals do not establish production writer/rights.
 * Retains its database and evidence; only stops its own container after the run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const container = process.env.VNEXT_TEST_CONTAINER;
if (!container || !/^stockinsider-vnext-oct22-[a-z0-9-]+$/u.test(container)) throw new Error('explicit_owned_container_required');
const artifacts = process.env.VNEXT_NATIVE_ARTIFACTS;
if (!artifacts || !path.isAbsolute(artifacts) || fs.existsSync(artifacts)) throw new Error('fresh_absolute_native_artifacts_required');
fs.mkdirSync(artifacts, { mode: 0o700 });
const digest = value => createHash('sha256').update(value).digest('hex');
const dockerArgs = ['--host=unix:///var/run/docker.sock'];
const docker = (args, input) => spawnSync('docker', [...dockerArgs, ...args], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const inspect = docker(['inspect', container]);
assert.equal(inspect.status, 0, inspect.stderr);
const identity = JSON.parse(inspect.stdout)[0];
assert.equal(identity.Config.Labels['codex.task'], 'stockinsider-vnext-oct22');
assert.equal(identity.HostConfig.NetworkMode, 'none');
assert.deepEqual(identity.HostConfig.PortBindings, {});
assert.equal(identity.HostConfig.Memory, 1073741824);
const events = [];
const save = (name, value) => fs.writeFileSync(path.join(artifacts, name + '.json'), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
function query(sql, { reject } = {}) {
  const result = docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'vnext', '-v', 'ON_ERROR_STOP=1'], `\\set VERBOSITY verbose\nSET statement_timeout='30s';\n${sql}\n`);
  events.push({ sqlSha256: digest(sql), exit: result.status, stdoutSha256: digest(result.stdout), stderrSha256: digest(result.stderr) });
  if (reject) { assert.notEqual(result.status, 0, result.stdout); assert.match(result.stderr, reject); return result; }
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function queryAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', [...dockerArgs, 'exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'vnext', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; }); child.on('error', reject);
    child.on('close', code => { events.push({ sqlSha256: digest(sql), exit: code, stdoutSha256: digest(stdout), stderrSha256: digest(stderr), actualProcessClosed: true }); code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)); });
    child.stdin.end(`SET statement_timeout='30s';\n${sql}\n`);
  });
}
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const commandSQL = (principal, command, request) => `SET ROLE service_role; SELECT public.vnext_command_v1(${literal(principal)},${literal(command)},${literal(JSON.stringify(request))}::jsonb);`;
const command = (principal, verb, request) => JSON.parse(query(commandSQL(principal, verb, request)).split('\n').at(-1));
const mutationRequest = (symbol, key, variant = '') => ({ requestKey: key, symbols: [symbol], inputs: { [symbol]: {
  hash: digest(symbol + variant), eligible: true, tradingValid: true, contraindication: false,
  roots: ['synthetic-root-' + symbol], eventAt: new Date(Date.now() - 3600000).toISOString(),
  cutoff: new Date().toISOString(), evidence: [{ id: 'e1', source: 'synthetic-local.invalid', value: 10, eventAt: new Date(Date.now() - 3600000).toISOString(), availableAt: new Date(Date.now() - 1800000).toISOString(), kind: 'fact' }],
} } });
// Rows are encoded by PostgreSQL to_jsonb, sorted and hashed outside business codecs.
function state() {
  const names = query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'vnext_%' ORDER BY tablename;`).split('\n').filter(Boolean);
  return Object.fromEntries(names.map(name => {
    const text = query(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM public.${name} t;`);
    return [name, { count: JSON.parse(text).length, sha256: digest(text) }];
  }));
}

const operator = 'synthetic-operator', author = 'synthetic-author', reviewer = 'synthetic-reviewer';
const source = fs.readFileSync('migrations/20261022_stockinsider_vnext_20_v1.sql');
const capture = zlib.gunzipSync(fs.readFileSync('scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')).toString();
const capturedDefinition = (kind, name) => {
  const escaped = name.replaceAll('.', '\\.');
  const regex = kind === 'FUNCTION' ? new RegExp(`CREATE FUNCTION public\\.${escaped}\\(.*?\\n\\$\\$;`, 'su') : new RegExp(`CREATE TABLE public\\.${escaped} \\(.*?\\n\\);`, 'su');
  const match = capture.match(regex); if (!match) throw new Error('captured_definition_missing:' + name); return match[0];
};
const sourceFence = capturedDefinition('FUNCTION', 'enforce_production_writer_fence');
const writerTable = capturedDefinition('TABLE', 'production_writer_releases');
const leaseTable = capturedDefinition('TABLE', 'production_write_leases');
save('source-seal', { migration: { sha256: digest(source), bytes: source.length }, capturedFenceSha256: digest(sourceFence), capturedSchemaSha256: digest(capture), nodeVersion: process.version, containerImage: identity.Image, isolation: 'network none/no published ports', scope: 'synthetic isolated VM DB, inactive captured writer release; no production writer approval' });

await test('vNext actual isolated PostgreSQL atomic admission and identity boundaries', { timeout: 240000 }, async t => {
  try {
    await t.test('candidate migration commits with private schema ACL and hardened new owner', () => {
      query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role NOLOGIN BYPASSRLS; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO service_role; ${writerTable}\n${leaseTable}\n${sourceFence}`);
      query(source.toString());
      // Isolated ledger unit fixture only: this admin seed is not legacy RPC
      // coexistence proof. The separate genuine-prefix fixture tests activation.
      query('UPDATE public.vnext_mode_v1 SET enabled=true,legacy_fenced=true');
      assert.equal(query(`SELECT version() LIKE 'PostgreSQL 17.11%';`), 't');
      assert.equal(query(`SELECT has_function_privilege('anon','public.vnext_command_v1(text,text,jsonb)','EXECUTE');`), 'f');
      query(`SET ROLE service_role; SELECT * FROM public.vnext_members_v1;`, { reject: /permission denied/u });
      query(`INSERT INTO public.vnext_principals_v1 VALUES('${operator}','operator',true),('${author}','author',true),('${reviewer}','reviewer',true);`);
      // Official-session representation is explicitly synthetic and pre-cutoff.
      const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const dates = [...new Set(['2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-21',today])];
      for (const date of dates) query(`INSERT INTO public.vnext_sessions_v1 VALUES('${date}','${date}T06:00:00Z',false);`);
      save('installed-state', state());
    });
    await t.test('empty explicit SQL scope mutates no business table', () => {
      query(`UPDATE public.vnext_sessions_v1 SET completed=true WHERE session_date='2026-10-15';`);
      const before = state(); const response = command(operator, 'enqueue', { requestKey: 'empty', symbols: [], inputs: {} });
      assert.deepEqual(response.jobs, []); assert.deepEqual(state(), before);
    });
    await t.test('parallel entrypoints preserve20 across seeded prior-day active history and4 actual starts today', async () => {
      // Historical active rows are explicit synthetic fixture setup, not claims of
      // five real operating days or previous model/author execution.
      query(`INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session)
        SELECT (1000+n)::text,'waiting',repeat('a',64),'{"syntheticHistoricalFixture":true}'::jsonb,'2026-10-15'
        FROM generate_series(1,16)n;`);
      const day = query(`SELECT max(session_date)::text FROM public.vnext_sessions_v1 WHERE session_date<=(clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date;`);
      const requests = Array.from({ length: 8 }, (_, i) => mutationRequest(String(2000 + i), `parallel-current-${i}`));
      const responses = await Promise.all(requests.map(r => queryAsync(commandSQL(operator, 'enqueue', r))));
      const jobs = responses.flatMap(text => JSON.parse(text).jobs).filter(j => j.jobId);
      assert.equal(jobs.length, 4);
      const claims = (await Promise.all(jobs.flatMap(j => [queryAsync(commandSQL(author, 'claim', { jobId: j.jobId })), queryAsync(commandSQL(author, 'claim', { jobId: j.jobId }))]))).map(JSON.parse);
      assert.equal(claims.filter(c => c.execute).length, 4);
      assert.equal(Number(query(`SELECT count(*) FROM public.vnext_jobs_v1 WHERE session_date='${day}' AND started_at IS NOT NULL;`)), 4);
      assert.equal(Number(query(`SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited';`)), 20);
      const originalRequest = requests.find(r => r.symbols[0] === jobs[0].symbol);
      const replay = command(operator, 'enqueue', originalRequest);
      assert.equal(replay.jobs[0].jobId, jobs[0].jobId);
      assert.equal(Number(query(`SELECT count(*) FROM public.vnext_jobs_v1 WHERE session_date='${day}' AND started_at IS NOT NULL;`)), 4);
      const result = command(operator, 'enqueue', mutationRequest('3999', 'full-capacity'));
      assert.ok(result.jobs.every(j => !j.jobId));
      const failed = claims.find(c => c.execute);
      command(author, 'fail', { jobId: failed.jobId, executionId: failed.executionId, reason: 'synthetic permanent missing source', permanent: true });
      assert.equal(Number(query(`SELECT count(*) FROM public.vnext_jobs_v1 WHERE session_date='${day}' AND started_at IS NOT NULL;`)), 4);
      assert.equal(Number(query(`SELECT count(*) FROM public.vnext_members_v1 WHERE state<>'exited';`)), 19);
      const refill = command(operator, 'enqueue', mutationRequest('3998', 'no-budget-refill'));
      assert.ok(refill.jobs.every(j => !j.jobId));
      save('concurrency-daily', { day, priorDaySyntheticActiveFixtures: 16, requests:8, admissions:4, duplicateClaims:8, actualStarts:4, beforeFailureActive:20, afterPermanentFailureActive:19, failureConsumes:true, noBudgetRefillDeferred:true });
      save('final-state', state());
    });
    await t.test('unprovisioned principal and wrong role fail without mutation', () => {
      const before = state();
      query(commandSQL('unknown', 'enqueue', mutationRequest('3998', 'bad-principal')), { reject: /vnext_principal_not_provisioned/u });
      query(commandSQL(author, 'enqueue', mutationRequest('3998', 'bad-role')), { reject: /vnext_operator_required/u });
      assert.deepEqual(state(), before);
    });
  } finally {
    save('query-events', events);
    const stats = docker(['stats', '--no-stream', '--format', '{{json .}}', container]);
    save('container-resources', { exit: stats.status, result: stats.stdout.trim(), hardMemoryLimitBytes: identity.HostConfig.Memory });
    save('terminal-state', { container: container, retainedForAudit: true, sourceSha256: digest(source), queryCount: events.length, pendingQueryChildren: 0, cleanup: 'container stop and backend absence recorded by external owning runner; not inferred here' });
  }
});
