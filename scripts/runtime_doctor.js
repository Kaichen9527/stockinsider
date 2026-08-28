#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { canonicalJson, sha256 } = require('./runtime/codec');
const { assessTrackedRuntimeHealth } = require('./runtime/runtime-health');
const { buildInstalledRuntimeHealthObservation } = require('./runtime/runtime-health');
const { observeRuntimeHealth, publishRuntimeHealthObservation } = require('./runtime/runtime-health-observer');
const { resolveCredentialReference } = require('./runtime/credential-resolver');
const { runtimeBundleSha256 } = require('./runtime/tracked-runtime-bundle');

const ROOT_DIR = path.resolve(__dirname, '..');
const HOME_DIR = process.env.HOME || '/Users/kaerchen';
const RUNTIME_APP_DIR =
  process.env.STOCKINSIDER_RUNTIME_APP_DIR ||
  path.join(HOME_DIR, 'Library', 'Application Support', 'StockInsiderRuntime', 'app');
const SERVICE_ROOT = fs.existsSync(path.join(RUNTIME_APP_DIR, 'scripts', 'launchd-wrapper.sh')) ? RUNTIME_APP_DIR : ROOT_DIR;
const AGENT_DIR = path.join(SERVICE_ROOT, '.agent');
const REPORTS_DIR = path.join(AGENT_DIR, 'reports');
const RUNTIME_DIR = path.join(AGENT_DIR, 'runtime');
const LOCAL_REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');
const uid = process.getuid ? process.getuid() : Number(process.env.UID || 501);
const strictData = process.argv.includes('--strict-data');
const TRACKED_RUNTIME_ROOT =
  process.env.STOCKINSIDER_RUNTIME_ROOT ||
  path.join(HOME_DIR, 'Library', 'Application Support', 'StockInsiderRuntime');
const TRACKED_CURRENT = path.join(TRACKED_RUNTIME_ROOT, 'current');

const services = [
  {
    label: 'com.stockinsider.web',
    expectedRunning: true,
    bootLog: path.join(AGENT_DIR, 'web.launchd.boot.log'),
    stdoutLog: path.join(RUNTIME_DIR, 'web.launchd.out.log'),
    stderrLog: path.join(RUNTIME_DIR, 'web.launchd.err.log'),
  },
  {
    label: 'com.stockinsider.auth-source-worker',
    expectedRunning: true,
    bootLog: path.join(AGENT_DIR, 'auth-source-worker.launchd.boot.log'),
    stdoutLog: path.join(RUNTIME_DIR, 'auth-source-worker.launchd.out.log'),
    stderrLog: path.join(RUNTIME_DIR, 'auth-source-worker.launchd.err.log'),
  },
  {
    label: 'com.stockinsider.data-collect',
    expectedRunning: false,
    bootLog: path.join(AGENT_DIR, 'data-collect.launchd.boot.log'),
    stdoutLog: path.join(RUNTIME_DIR, 'data-collect.launchd.out.log'),
    stderrLog: path.join(RUNTIME_DIR, 'data-collect.launchd.err.log'),
  },
];

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function parseLaunchctlPrint(label) {
  const result = run('launchctl', ['print', `gui/${uid}/${label}`]);
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    return {
      ok: false,
      loaded: false,
      state: 'not-loaded',
      pid: null,
      lastExitCode: null,
      raw: output.trim(),
    };
  }
  const state = output.match(/\n\s*state = ([^\n]+)/)?.[1]?.trim() || 'unknown';
  const pidRaw = output.match(/\n\s*pid = (\d+)/)?.[1] || null;
  const lastExit = output.match(/last exit code = ([^\n]+)/)?.[1]?.trim() || null;
  return {
    ok: true,
    loaded: true,
    state,
    pid: pidRaw ? Number(pidRaw) : null,
    lastExitCode: lastExit,
    raw: output,
  };
}

function readCanonical(file) {
  const text = fs.readFileSync(file, 'utf8');
  const value = JSON.parse(text);
  if (`${canonicalJson(value)}\n` !== text) throw new Error(`noncanonical runtime file: ${path.basename(file)}`);
  return value;
}

function trackedRuntimeAvailable() {
  try {
    return fs.lstatSync(TRACKED_CURRENT).isSymbolicLink() &&
      fs.statSync(path.join(TRACKED_CURRENT, 'installation-manifest.json')).isFile();
  } catch {
    return false;
  }
}

function oneShotSchedulerHealthy(scheduler) {
  return scheduler.loaded === true && (Boolean(scheduler.pid) || scheduler.lastExitCode === '0');
}

function trackedIdentityCompatible(publicHealth, commitSha) {
  return publicHealth.producerCommitSha === commitSha &&
    publicHealth.consumerCommitSha === commitSha &&
    publicHealth.compatibility === 'compatible';
}

async function fetchTrackedHealth(config) {
  const key = resolveCredentialReference('keychain:stockinsider-runtime:internal-api-key');
  const response = await fetch(`${config.legacyRadarBaseUrl}/api/internal/health-check`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`tracked health endpoint HTTP ${response.status}`);
  const payload = await response.json();
  const runtime = payload?.sourceLedRuntime;
  if (!runtime || typeof runtime !== 'object') throw new Error('tracked health payload missing');
  return {
    status: runtime.status ?? null,
    reasons: Array.isArray(runtime.reasons) ? runtime.reasons : null,
    producerCommitSha: runtime.producer?.commitSha ?? null,
    consumerCommitSha: runtime.consumer?.commitSha ?? null,
    compatibility: runtime.consumer?.compatibility ?? null,
    schedulerOwner: runtime.scheduler?.owner ?? null,
    lastTerminalStatus: runtime.runtime?.lastTerminalStatus ?? null,
    projectionFreshness: runtime.projection?.freshness ?? null,
  };
}

function schedulerObservationRow(label) {
  const status = parseLaunchctlPrint(label);
  const plist = path.join(HOME_DIR, 'Library', 'LaunchAgents', `${label}.plist`);
  return Object.freeze({
    label,
    enabled: status.loaded,
    plistSha256: fileHash(plist),
  });
}

function writeCanonicalAtomic(filename, value) {
  const temporary = `${filename}.next-${crypto.randomBytes(16).toString('hex')}`;
  const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try {
    fs.writeFileSync(descriptor, `${canonicalJson(value)}\n`);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filename);
  const directory = fs.openSync(path.dirname(filename), fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

async function refreshTrackedObservation({ releaseRoot, manifest, rollbackPackage, proposedPlistBytes }) {
  const runtimeRoot = TRACKED_RUNTIME_ROOT;
  const reviewedRelease = Object.freeze({
    commitSha: manifest.commitSha,
    treeSha: manifest.reviewedTreeSha,
    workerSha256: manifest.worker?.sha256,
    configSha256: manifest.config?.sha256,
    reviewAttestationSha256: manifest.reviewAttestationSha256,
  });
  const rawDoctor = await observeRuntimeHealth({
    releaseRoot,
    runtimeRoot,
    manifest,
    reviewedRelease,
    proposedPlistBytes,
    rollbackPackage,
    schedulerRows: [
      'com.stockinsider.data-collect',
      'com.stockinsider.night-shift',
      'com.stockinsider.research-daemon',
      'com.stockinsider.auth-source-worker',
    ].map(schedulerObservationRow),
  });
  const normalized = buildInstalledRuntimeHealthObservation({
    manifest: Object.freeze({ ...manifest, manifestSha256: sha256(Buffer.from(canonicalJson(manifest))) }),
    reviewedRelease,
    doctor: rawDoctor,
  });
  writeCanonicalAtomic(path.join(releaseRoot, 'runtime-health-observation.json'), normalized);
  await publishRuntimeHealthObservation({ releaseRoot, observation: normalized });
  return normalized;
}

async function trackedMain() {
  const failures = [];
  let report;
  try {
    const pointer = fs.readlinkSync(TRACKED_CURRENT);
    const match = pointer.match(/^releases\/([0-9a-f]{40})$/u);
    if (!match) throw new Error('tracked current pointer invalid');
    const commitSha = match[1];
    const releaseRoot = fs.realpathSync(TRACKED_CURRENT);
    if (releaseRoot !== fs.realpathSync(path.join(TRACKED_RUNTIME_ROOT, pointer))) {
      throw new Error('tracked current pointer escapes releases');
    }
    const manifest = readCanonical(path.join(releaseRoot, 'installation-manifest.json'));
    const observation = readCanonical(path.join(releaseRoot, 'runtime-health-observation.json'));
    const journal = readCanonical(path.join(TRACKED_RUNTIME_ROOT, 'activation-journal.json'));
    const configPath = path.join(releaseRoot, 'config/runtime/auth-source-dag.json');
    const rollbackPath = path.join(releaseRoot, 'scheduler-rollback-package.json');
    const plistPath = path.join(HOME_DIR, 'Library', 'LaunchAgents', 'com.stockinsider.auth-source-worker.plist');
    const scheduler = parseLaunchctlPrint('com.stockinsider.auth-source-worker');
    const competingSchedulers = [
      'com.stockinsider.data-collect',
      'com.stockinsider.night-shift',
      'com.stockinsider.research-daemon',
    ].filter((label) => parseLaunchctlPrint(label).loaded);
    const rollbackPackage = readCanonical(rollbackPath);
    const refreshedObservation = await refreshTrackedObservation({ releaseRoot, manifest, rollbackPackage,
      proposedPlistBytes: fs.readFileSync(plistPath) });
    const localHealth = assessTrackedRuntimeHealth(refreshedObservation);
    const publicHealth = await fetchTrackedHealth(readCanonical(configPath));

    if (manifest.commitSha !== commitSha) failures.push('manifest commit does not match active pointer');
    if (runtimeBundleSha256(releaseRoot) !== manifest.worker?.sha256) failures.push('tracked worker hash mismatch');
    if (sha256(fs.readFileSync(configPath)) !== manifest.config?.sha256) failures.push('tracked config hash mismatch');
    if (sha256(fs.readFileSync(rollbackPath)) !== manifest.schedulerRollback?.sha256) failures.push('scheduler rollback hash mismatch');
    if (journal.commitSha !== commitSha || journal.phase !== 'complete') failures.push('activation journal incomplete');
    if (!scheduler.loaded) failures.push('tracked scheduler owner not loaded');
    else if (!oneShotSchedulerHealthy(scheduler)) failures.push('tracked one-shot scheduler has not exited successfully');
    if (sha256(fs.readFileSync(plistPath)) !== observation.ownerPlistSha256) failures.push('scheduler plist hash mismatch');
    if (competingSchedulers.length > 0) failures.push(`competing schedulers loaded: ${competingSchedulers.join(',')}`);
    if (localHealth.status !== 'pass') failures.push(...localHealth.reasons.map((reason) => `local health: ${reason}`));
    if (publicHealth.status !== 'pass') failures.push(`public health: ${(publicHealth.reasons || []).join(',') || 'failed'}`);
    if (!trackedIdentityCompatible(publicHealth, commitSha)) failures.push('consumer/producer commit incompatibility');
    if (publicHealth.schedulerOwner !== 'com.stockinsider.auth-source-worker') failures.push('public scheduler owner mismatch');
    if (publicHealth.lastTerminalStatus !== 'success') failures.push('last producer run is not successful');
    if (publicHealth.projectionFreshness !== 'fresh') failures.push('compact projection is not fresh');

    report = {
      checkedAt: new Date().toISOString(),
      mode: 'tracked-reviewed-runtime',
      ok: failures.length === 0,
      failures,
      active: {
        commitSha,
        reviewedTreeSha: manifest.reviewedTreeSha,
        workerSha256: manifest.worker?.sha256 ?? null,
        configSha256: manifest.config?.sha256 ?? null,
        manifestSha256: observation.manifestSha256 ?? null,
        pointer,
      },
      scheduler: {
        loaded: scheduler.loaded,
        state: scheduler.state,
        pid: scheduler.pid,
        lastExitCode: scheduler.lastExitCode,
        competingSchedulers,
      },
      runtime: {
        stateSchema: localHealth.runtime.stateSchema,
        lastTerminalRunAt: localHealth.runtime.lastTerminalRunAt,
        lastTerminalStatus: publicHealth.lastTerminalStatus,
        stuckRunCount: localHealth.runtime.stuckRunCount,
      },
      projection: {
        asOf: localHealth.projection.asOf,
        freshness: publicHealth.projectionFreshness,
      },
      consumer: {
        commitSha: publicHealth.consumerCommitSha,
        compatibility: publicHealth.compatibility,
      },
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    report = {
      checkedAt: new Date().toISOString(),
      mode: 'tracked-reviewed-runtime',
      ok: false,
      failures,
    };
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

function statFile(file) {
  try {
    const stat = fs.statSync(file);
    return {
      exists: true,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      ageMinutes: Math.round((Date.now() - stat.mtime.getTime()) / 60000),
    };
  } catch {
    return { exists: false, size: 0, mtime: null, ageMinutes: null };
  }
}

function fileHash(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}

function compareRuntimeFile(relativePath) {
  const repoFile = path.join(ROOT_DIR, relativePath);
  const runtimeFile = path.join(SERVICE_ROOT, relativePath);
  const repoStat = statFile(repoFile);
  const runtimeStat = statFile(runtimeFile);
  const repoHash = fileHash(repoFile);
  const runtimeHash = fileHash(runtimeFile);
  return {
    relativePath,
    repoFile,
    runtimeFile,
    repoStat,
    runtimeStat,
    repoHash,
    runtimeHash,
    matchesRepo: Boolean(repoHash && runtimeHash && repoHash === runtimeHash),
    runtimeUsesRepoDirectly: path.resolve(SERVICE_ROOT) === path.resolve(ROOT_DIR),
  };
}

function latestDataCollectReport() {
  try {
    return fs
      .readdirSync(REPORTS_DIR)
      .filter((name) => /data-collect\.md$/.test(name))
      .map((name) => {
        const file = path.join(REPORTS_DIR, name);
        const stat = fs.statSync(file);
        return { file, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0] || null;
  } catch {
    return null;
  }
}

async function fetchHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('http://127.0.0.1:3010/api/internal/health-check', { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text().catch(() => '') };
    }
    return { ok: true, status: res.status, body: await res.json() };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadWorkerState() {
  const file = path.join(AGENT_DIR, 'auth-source-worker-state.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      exists: true,
      jobs: Object.entries(parsed.jobs || {}).map(([job, info]) => ({
        job,
        lastRunAt: info?.lastRunAt || null,
        lastStatus: info?.lastStatus || null,
        lastDurationMs: info?.lastDurationMs || null,
      })),
    };
  } catch {
    return { exists: false, jobs: [] };
  }
}

function checkPlaywrightChromium() {
  const webDir = path.join(SERVICE_ROOT, 'web');
  const script = `
    const fs = require('fs');
    const { chromium } = require('playwright');
    const executablePath = chromium.executablePath();
    console.log(executablePath);
    process.exit(fs.existsSync(executablePath) ? 0 : 2);
  `;
  const result = run('node', ['-e', script], { cwd: webDir });
  const executablePath = String(result.stdout || '').trim().split('\n').filter(Boolean).pop() || null;
  return {
    ok: result.status === 0,
    executablePath,
    status: result.status,
    error: String(result.stderr || '').trim() || null,
    hint:
      result.status === 0
        ? null
        : `Run "cd ${webDir} && npx playwright install chromium" for the local launchd browser worker.`,
  };
}

async function main() {
  const serviceResults = services.map((service) => {
    const launchd = parseLaunchctlPrint(service.label);
    const bootLog = statFile(service.bootLog);
    const stdoutLog = statFile(service.stdoutLog);
    const stderrLog = statFile(service.stderrLog);
    const hasExConfig = Boolean(launchd.lastExitCode && /78|EX_CONFIG/.test(launchd.lastExitCode));
    const runningOk = service.expectedRunning ? Boolean(launchd.pid || launchd.state === 'running') : launchd.loaded;
    return {
      ...service,
      launchd,
      bootLog,
      stdoutLog,
      stderrLog,
      runningOk,
      hasExConfig,
    };
  });

  const health = await fetchHealth();
  const latestReport = latestDataCollectReport();
  const workerState = loadWorkerState();
  const playwrightChromium = checkPlaywrightChromium();
  const runtimeScriptChecks = [
    compareRuntimeFile('scripts/runtime/auth-source-worker-cli.js'),
    compareRuntimeFile('scripts/local-auth-source-worker.sh'),
    compareRuntimeFile('scripts/launchd-wrapper.sh'),
  ];

  const failures = [];
  for (const service of serviceResults) {
    if (!service.launchd.loaded) failures.push(`${service.label} not loaded`);
    if (service.expectedRunning && !service.runningOk) failures.push(`${service.label} not running`);
    if (service.hasExConfig) failures.push(`${service.label} last exit is EX_CONFIG`);
    if (!service.bootLog.exists) failures.push(`${service.label} missing boot marker`);
  }
  if (!health.ok) failures.push(`health endpoint failed: ${health.error || health.status}`);
  if (strictData && !latestReport) failures.push('data collect report missing');
  if (!playwrightChromium.ok) failures.push('playwright chromium executable missing for local auth-source-worker');
  for (const check of runtimeScriptChecks) {
    if (!check.runtimeUsesRepoDirectly && !check.matchesRepo) {
      failures.push(`runtime script stale: ${check.relativePath}`);
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    serviceRoot: SERVICE_ROOT,
    ok: failures.length === 0,
    failures,
    services: serviceResults.map((service) => ({
      label: service.label,
      loaded: service.launchd.loaded,
      state: service.launchd.state,
      pid: service.launchd.pid,
      lastExitCode: service.launchd.lastExitCode,
      bootLog: service.bootLog,
      stdoutLog: service.stdoutLog,
      stderrLog: service.stderrLog,
    })),
    health,
    workerState,
    runtimeScriptChecks,
    playwrightChromium,
    dataCollectLatestReport: latestReport
      ? { file: latestReport.file, mtime: latestReport.mtime.toISOString(), ageMinutes: Math.round((Date.now() - latestReport.mtime.getTime()) / 60000) }
      : null,
  };

  const reportPath = path.join(LOCAL_REPORTS_DIR, `runtime-doctor-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(LOCAL_REPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv.includes('--legacy') || !trackedRuntimeAvailable() ? main : trackedMain;

if (require.main === module) {
  entrypoint().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  fetchTrackedHealth,
  oneShotSchedulerHealthy,
  readCanonical,
  trackedIdentityCompatible,
  refreshTrackedObservation,
  writeCanonicalAtomic,
  trackedMain,
  trackedRuntimeAvailable,
};
