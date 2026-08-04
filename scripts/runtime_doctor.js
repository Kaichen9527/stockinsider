#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
