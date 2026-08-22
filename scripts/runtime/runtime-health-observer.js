'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalJson, sha256 } = require('./codec');
const { resolveCredentialReference, resolvePostgresConnectionReference } = require('./credential-resolver');
const { runtimeBundleSha256 } = require('./tracked-runtime-bundle');
const { assessProjectionFreshness } = require('./projection-freshness');
const { assessReleaseCompatibility } = require('../../web/src/lib/opportunity-v3/release-compatibility-runtime');

function canonicalFile(filename) {
  const text = fs.readFileSync(filename, 'utf8'); const value = JSON.parse(text);
  if (`${canonicalJson(value)}\n` !== text) throw new Error('manifest_noncanonical');
  return value;
}

function restCredentials(resolver){
  const supabaseUrl=resolver('keychain:stockinsider-runtime:supabase-url');
  const serviceRoleKey=resolver('keychain:stockinsider-runtime:supabase-service-role-key');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(supabaseUrl??'')||typeof serviceRoleKey!=='string'
      ||serviceRoleKey.length<32)throw new Error('runtime REST credential unavailable');
  return {supabaseUrl,serviceRoleKey};
}

async function restJson({resolver,fetchImpl=globalThis.fetch,path:pathname,method='GET',body}){
  const {supabaseUrl,serviceRoleKey}=restCredentials(resolver);
  const response=await fetchImpl(`${supabaseUrl}/rest/v1/${pathname}`,{method,
    headers:{apikey:serviceRoleKey,Authorization:`Bearer ${serviceRoleKey}`,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(10000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>1_000_000)throw new Error('runtime REST response bound');
  let payload=null;try{payload=bytes.length?JSON.parse(bytes.toString('utf8')):null;}catch{throw new Error('runtime REST invalid response');}
  if(!response.ok)throw new Error('runtime REST rejected');return payload;
}

async function observeDatabaseRest(config,resolver,fetchImpl){
  const [health,projections]=await Promise.all([
    restJson({resolver,fetchImpl,method:'POST',path:'rpc/read_legacy_runtime_health_rest_v3_15',body:{}}),
    restJson({resolver,fetchImpl,path:'legacy_radar_projections_v3_11?select=as_of,payload_canonical,payload_json,payload_sha256,producer_commit_sha,worker_sha256&window=eq.daily&order=as_of.desc,created_at.desc,projection_id&limit=1'}),
  ]);
  if(!health||typeof health!=='object'||Array.isArray(health)||!Array.isArray(health.leases)
      ||!Number.isInteger(health.stuckRunCount)||health.stuckRunCount<0||health.stuckRunCount>1000)
    throw new Error('runtime REST health contract');
  const run=health.lastRun&&typeof health.lastRun==='object'?health.lastRun:null;const leases=health.leases;
  const projection=Array.isArray(projections)?projections[0]??null:null;
  const now=Date.now();const leaseStatus=leases.length===0?'absent':leases.length!==1?'invalid'
    :Date.parse(leases[0].lease_expires_at)>=now?'active':'expired';
  const canonical=typeof projection?.payload_canonical==='string'&&/^\\x[0-9a-f]+$/iu.test(projection.payload_canonical)
    ?Buffer.from(projection.payload_canonical.slice(2),'hex'):null;
  const checksumMatches=canonical&&sha256(canonical)===projection.payload_sha256;
  const correctness=projection?.payload_json?.sourceLedCorrectness??{};
  const projectionHealth=['legacy-radar-v3.13.0','legacy-radar-v3.14.0','legacy-radar-v3.17.0','legacy-radar-v3.18.0'].includes(correctness.schema)
    ?assessProjectionFreshness({contentAsOf:correctness.contentAsOf??projection.as_of,
      evaluatedAt:correctness.evaluatedAt??projection.as_of,publishedAt:correctness.publishedAt??projection.as_of,
      tradingSessions:Array.isArray(correctness.freshnessSchedule)?correctness.freshnessSchedule:[]})
    :projection?{status:'fresh',reason:'legacy_pre_v313_projection',missedExpectedRuns:0,actionsEnabled:true,nextExpectedAt:null}
      :{status:'unavailable',missedExpectedRuns:3};
  return {config,lastRunNonterminal:run?.status==='running',
    lastTerminalRunAt:run&&run.status!=='running'?new Date(run.terminal_at).toISOString():null,
    lastTerminalStatus:run&&run.status!=='running'?run.status:null,leaseStatus,
    negativeRunDuration:Boolean(run?.terminal_at&&Date.parse(run.terminal_at)<Date.parse(run.started_at)),
    producerCommitSha:run?.producer_commit_sha??null,projectionAsOf:projection?new Date(projection.as_of).toISOString():null,
    projectionChecksum:projection?.payload_sha256??null,projectionFreshness:!projection?'missing':!checksumMatches?'invalid'
      :projectionHealth.status==='fresh'?'fresh':'stale',projectionHealth,stateSchema:'stockinsider-producer-state-v1',
    stuckRunCount:health.stuckRunCount,
    workerSha256:run?.worker_sha256??projection?.worker_sha256??null,
    schedulerConfigSha256:run?.scheduler_config_sha256??null,releaseIdentity:projection?.payload_json?.releaseIdentity??null,
    projectionSchema:correctness.schema??null};
}

async function observeDatabase(releaseRoot, config, resolver, clientFactory,fetchImpl) {
  if(!clientFactory)return observeDatabaseRest(config,resolver,fetchImpl);
  const connectionString = resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url', resolver);
  const Client = clientFactory ?? require(path.join(releaseRoot, 'node_modules/pg')).Client;
  const client = new Client({ connectionString, application_name: 'stockinsider-runtime-doctor',
    statement_timeout: 10000, query_timeout: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const table = await client.query("SELECT to_regclass('public.legacy_producer_runs_v3_11') AS runs,to_regclass('public.legacy_radar_projections_v3_11') AS projections");
    if (!table.rows[0]?.runs || !table.rows[0]?.projections) throw new Error('runtime_state_schema_missing');
    const runResult = await client.query(`SELECT status,started_at,terminal_at,heartbeat_at,lease_expires_at,producer_commit_sha,worker_sha256,scheduler_config_sha256
      FROM public.legacy_producer_runs_v3_11 ORDER BY started_at DESC,run_id DESC LIMIT 1`);
    const stuckResult = await client.query(`SELECT count(*)::integer AS count FROM public.legacy_producer_runs_v3_11
      WHERE status='running' AND lease_expires_at<clock_timestamp()`);
    const leaseResult = await client.query(`SELECT status,lease_expires_at FROM public.legacy_producer_jobs_v3_11
      WHERE status='leased' ORDER BY leased_at DESC,job_id LIMIT 2`);
    const projectionResult = await client.query(`SELECT as_of,payload_canonical,payload_json,payload_sha256,producer_commit_sha,worker_sha256
      FROM public.legacy_radar_projections_v3_11 WHERE "window"='daily' ORDER BY as_of DESC,created_at DESC,projection_id LIMIT 1`);
    await client.query('COMMIT');
    const run = runResult.rows[0] ?? null; const projection = projectionResult.rows[0] ?? null;
    const leases = leaseResult.rows;
    const leaseStatus = leases.length === 0 ? 'absent' : leases.length !== 1 ? 'invalid'
      : Date.parse(leases[0].lease_expires_at) >= Date.now() ? 'active' : 'expired';
    const checksumMatches = projection && Buffer.isBuffer(projection.payload_canonical) &&
      sha256(projection.payload_canonical) === projection.payload_sha256;
    const correctness = projection?.payload_json?.sourceLedCorrectness ?? {};
    const projectionHealth = ['legacy-radar-v3.13.0','legacy-radar-v3.14.0','legacy-radar-v3.17.0','legacy-radar-v3.18.0']
      .includes(projection?.payload_json?.sourceLedCorrectness?.schema)
      ? assessProjectionFreshness({
      contentAsOf: correctness.contentAsOf ?? projection.as_of,
      evaluatedAt: correctness.evaluatedAt ?? projection.as_of,
      publishedAt: correctness.publishedAt ?? projection.as_of,
      tradingSessions: Array.isArray(correctness.freshnessSchedule) ? correctness.freshnessSchedule : [],
    }) : projection ? { status:'fresh',reason:'legacy_pre_v313_projection',missedExpectedRuns:0,
      actionsEnabled:true,nextExpectedAt:null } : { status: 'unavailable', missedExpectedRuns: 3 };
    return {
      config,
      lastRunNonterminal: run?.status === 'running',
      lastTerminalRunAt: run && run.status !== 'running' ? new Date(run.terminal_at).toISOString() : null,
      lastTerminalStatus: run && run.status !== 'running' ? run.status : null,
      leaseStatus,
      negativeRunDuration: Boolean(run?.terminal_at && Date.parse(run.terminal_at) < Date.parse(run.started_at)),
      producerCommitSha: run?.producer_commit_sha ?? null,
      projectionAsOf: projection ? new Date(projection.as_of).toISOString() : null,
      projectionChecksum: projection?.payload_sha256 ?? null,
      projectionFreshness: !projection ? 'missing' : !checksumMatches ? 'invalid'
        : projectionHealth.status === 'fresh' ? 'fresh' : 'stale',
      projectionHealth,
      stateSchema: 'stockinsider-producer-state-v1',
      stuckRunCount: Number(stuckResult.rows[0]?.count ?? 0),
      workerSha256: run?.worker_sha256 ?? projection?.worker_sha256 ?? null,
      schedulerConfigSha256: run?.scheduler_config_sha256 ?? null,
      releaseIdentity: projection?.payload_json?.releaseIdentity ?? null,
      projectionSchema: correctness.schema ?? null,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* read-only connection cleanup */ }
    throw error;
  } finally { await client.end(); }
}

async function observeConsumer(config, resolver, fetchImpl = globalThis.fetch) {
  const key = resolver('keychain:stockinsider-runtime:internal-api-key');
  const response = await fetchImpl(`${config.legacyRadarBaseUrl}/api/internal/health-check`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}`,
      'X-StockInsider-Runtime-Consumer-Check': 'v1' }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('consumer_health_unavailable');
  const payload = await response.json();
  const commitSha = payload?.sourceLedRuntime?.consumer?.commitSha;
  return typeof commitSha === 'string' && /^[0-9a-f]{40}$/u.test(commitSha) ? commitSha : null;
}

async function publishRuntimeHealthObservation({ releaseRoot, observation, resolver = resolveCredentialReference,
  clientFactory,fetchImpl }) {
  const canonical = canonicalJson(observation); const digest = sha256(canonical);
  if(!clientFactory){
    const accepted=await restJson({resolver,fetchImpl,method:'POST',path:'rpc/append_legacy_runtime_health_rest_v3_15',body:{
      p_producer_commit_sha:observation.producerCommitSha,p_worker_sha256:observation.workerSha256,
      p_scheduler_config_sha256:observation.schedulerConfigSha256,p_observation_canonical:`\\x${Buffer.from(canonical).toString('hex')}`,
      p_observation_json:observation,p_observation_sha256:digest,p_observed_at:new Date().toISOString()}});
    if(accepted!==true)throw new Error('runtime health publication rejected');
    return Object.freeze({observationSha256:digest});
  }
  const connectionString = resolver('keychain:stockinsider-runtime:database-url');
  const Client = clientFactory ?? require(path.join(releaseRoot, 'node_modules/pg')).Client;
  const client = new Client({ connectionString, application_name: 'stockinsider-runtime-health-publisher',
    statement_timeout: 10000, query_timeout: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const table = await client.query("SELECT to_regclass('public.legacy_runtime_health_observations_v3_11') AS observations");
    if (!table.rows[0]?.observations) throw new Error('runtime_health_schema_missing');
    await client.query(`INSERT INTO public.legacy_runtime_health_observations_v3_11(
      producer_commit_sha,worker_sha256,scheduler_config_sha256,observation_canonical,observation_json,
      observation_sha256,observed_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp())
      ON CONFLICT(producer_commit_sha,observation_sha256) DO NOTHING`, [observation.producerCommitSha,
      observation.workerSha256, observation.schedulerConfigSha256, Buffer.from(canonical), observation, digest]);
    await client.query('COMMIT');
    return Object.freeze({ observationSha256: digest });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve publication failure */ }
    throw error;
  } finally { await client.end(); }
}

async function observeRuntimeHealth({ releaseRoot, runtimeRoot, manifest, reviewedRelease, proposedPlistBytes,
  rollbackPackage, schedulerRows, resolver = resolveCredentialReference, clientFactory, fetchImpl }) {
  const installation = canonicalFile(path.join(releaseRoot, 'installation-manifest.json'));
  const journal = canonicalFile(path.join(runtimeRoot, 'activation-journal.json'));
  const config = canonicalFile(path.join(releaseRoot, 'config/runtime/auth-source-dag.json'));
  const database = await observeDatabase(releaseRoot, config, resolver, clientFactory,fetchImpl);
  const consumerCommitSha = await observeConsumer(config, resolver, fetchImpl);
  const owner = schedulerRows.find((row) => row.label === 'com.stockinsider.auth-source-worker');
  const competingOwners = schedulerRows.filter((row) => row.label !== 'com.stockinsider.auth-source-worker' && row.enabled)
    .map((row) => row.label);
  const runtimeManifestSha256=sha256(Buffer.from(canonicalJson(installation)));
  const releaseCompatibility=assessReleaseCompatibility({schema:database.projectionSchema,
    releaseIdentity:database.releaseIdentity,expectedConsumerSha:reviewedRelease.commitSha,
    expectedRuntimeManifestSha:runtimeManifestSha256});
  return {
    status: 'pass',
    observation: {
      activationJournalComplete: journal.commitSha === manifest.commitSha && journal.phase === 'new_owner_loaded',
      activePointerValid: fs.realpathSync(path.join(runtimeRoot, 'current')) === fs.realpathSync(releaseRoot),
      competingOwners,
      configSha256: sha256(fs.readFileSync(path.join(releaseRoot, 'config/runtime/auth-source-dag.json'))),
      consumerCommitSha,
      consumerCompatibility: consumerCommitSha === reviewedRelease.commitSha&&releaseCompatibility.compatible
        ? 'compatible':releaseCompatibility.reason,
      releaseCompatibility,
      lastRunNonterminal: database.lastRunNonterminal,
      lastTerminalRunAt: database.lastTerminalRunAt,
      lastTerminalStatus: database.lastTerminalStatus,
      leaseStatus: database.leaseStatus,
      manifestCanonical: canonicalJson(installation) === canonicalJson(manifest),
      manifestPresent: true,
      runtimeManifestSha256,
      negativeRunDuration: database.negativeRunDuration,
      ownerPlistSha256: owner?.plistSha256 ?? null,
      projectionAsOf: database.projectionAsOf,
      projectionChecksum: database.projectionChecksum,
      projectionFreshness: database.projectionFreshness,
      reviewAttestationSha256: installation.reviewAttestationSha256,
      schedulerOwner: owner?.enabled ? owner.label : null,
      schedulerPlistSha256: sha256(proposedPlistBytes),
      schedulerRollbackPackagePresent: fs.existsSync(path.join(releaseRoot, 'scheduler-rollback-package.json')),
      schedulerRollbackPackageSha256: sha256(fs.readFileSync(path.join(releaseRoot, 'scheduler-rollback-package.json'))),
      stateSchema: database.stateSchema,
      stuckRunCount: database.stuckRunCount,
      workerSha256: runtimeBundleSha256(releaseRoot),
    },
  };
}

module.exports = { observeConsumer, observeDatabase, observeRuntimeHealth, publishRuntimeHealthObservation };
