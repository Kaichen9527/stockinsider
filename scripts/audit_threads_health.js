#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const STATE_PATH = path.join(ROOT_DIR, '.agent', 'auth-source-worker-state.json');
const REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');

function parseArgs(argv) {
  const parsed = {
    statePath: STATE_PATH,
    maxAgeMinutes: 7 * 24 * 60,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') parsed.json = true;
    else if (arg === '--state-path' && argv[index + 1]) parsed.statePath = argv[++index];
    else if (arg === '--max-age-minutes' && argv[index + 1]) parsed.maxAgeMinutes = Math.max(1, Number(argv[++index]) || parsed.maxAgeMinutes);
  }
  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function minutesSince(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function routeHasSearchOrFailure(route) {
  if (!route) return false;
  const searched = Array.isArray(route.searchedKeywords) && route.searchedKeywords.length > 0;
  const matched = Array.isArray(route.matchedSymbols) && route.matchedSymbols.length > 0;
  const records = Number(route.recordsWritten || 0) > 0;
  const explicitFailure = Boolean(route.authFailureReason || route.failureReason || route.degradedReason || route.error);
  return searched || matched || records || explicitFailure;
}

function validateThreadsJob(job, options, id) {
  const issues = [];
  const ageMinutes = minutesSince(job?.lastRunAt);
  if (!job) issues.push(`${id}_missing`);
  else {
    if (ageMinutes > options.maxAgeMinutes) issues.push(`${id}_stale`);
    if (!Array.isArray(job.lastRoutes) || job.lastRoutes.length === 0) issues.push(`${id}_routes_missing`);
    if (Array.isArray(job.lastRoutes) && !job.lastRoutes.some(routeHasSearchOrFailure)) {
      issues.push(`${id}_no_search_or_explicit_failure`);
    }
    if (
      job.lastStatus === 'degraded' &&
      !String(job.lastSummary || '').includes('threads') &&
      !job.lastRoutes.some((route) => route.authFailureReason || route.failureReason || route.degradedReason)
    ) {
      issues.push(`${id}_degraded_without_reason`);
    }
  }
  return {
    id,
    ok: issues.length === 0,
    issues,
    lastRunAt: job?.lastRunAt || null,
    lastStatus: job?.lastStatus || null,
    lastSummary: job?.lastSummary || null,
    ageMinutes: Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null,
    routes: job?.lastRoutes || [],
  };
}

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.statePath)) throw new Error(`state file not found: ${options.statePath}`);
  const state = readJson(options.statePath);
  const stockJob = validateThreadsJob(state['threads-stock-refresh'], options, 'threads-stock-refresh');
  const sessionJob = state['threads-session-health']
    ? validateThreadsJob(state['threads-session-health'], options, 'threads-session-health')
    : {
        id: 'threads-session-health',
        ok: true,
        issues: ['not_yet_run_after_upgrade'],
        lastRunAt: null,
        lastStatus: null,
        lastSummary: 'session health job exists after upgrade but has not run yet',
        ageMinutes: null,
        routes: [],
      };
  const failures = [stockJob, sessionJob].filter((job) => !job.ok);
  const report = {
    generatedAt: nowIso(),
    statePath: options.statePath,
    maxAgeMinutes: options.maxAgeMinutes,
    ok: failures.length === 0,
    failures,
    jobs: [stockJob, sessionJob],
  };
  const reportFile = path.join(REPORTS_DIR, `threads-health-audit-${nowIso().replace(/[:.]/g, '-')}.json`);
  report.reportFile = reportFile;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Threads health: ${report.ok ? 'ok' : 'failed'}`);
    for (const job of report.jobs) {
      console.log(`- ${job.id}: ${job.lastStatus || 'n/a'} ${job.lastSummary || ''}`);
      if (job.issues.length) console.log(`  issues: ${job.issues.join(', ')}`);
    }
    console.log(`Report: ${reportFile}`);
  }
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`threads health audit failed: ${error.message}`);
  process.exit(1);
});
