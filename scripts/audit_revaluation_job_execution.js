#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function visibleCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

function needsDurableJob(card) {
  return Boolean(
    card.revaluationStatus === 'pending' ||
      card.displayTargetMode === 'needs_revaluation' ||
      card.staleReason ||
      card.targetStaleKind ||
      card.displayBucket === 'hot_tracking' ||
      card.displayBucket === 'revaluation_queue' ||
      card.recommendationGateStatus === 'needs_revaluation',
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar);
  const issues = [];
  const checked = [];
  for (const card of cards) {
    if (!needsDurableJob(card)) continue;
    checked.push(card.symbol);
    const job = card.revaluationJobSummary;
    if (!job) {
      issues.push(`${card.symbol}:missing_revaluation_job`);
      continue;
    }
    if (!job.jobId) issues.push(`${card.symbol}:missing_durable_job_id`);
    if (!job.status || !job.lastResult) issues.push(`${card.symbol}:incomplete_job_result`);
    if (!job.queuedAt && ['queued', 'running'].includes(job.status)) issues.push(`${card.symbol}:missing_queued_at`);
    if (!Array.isArray(job.requiredEvidence) || job.requiredEvidence.length === 0) issues.push(`${card.symbol}:missing_required_evidence`);
    if (job.status !== 'queued' && job.status !== 'running' && !job.lastAttemptAt) issues.push(`${card.symbol}:completed_without_attempt_at`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `revaluation-job-execution-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Revaluation job execution audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Revaluation job execution audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`revaluation job execution audit failed: ${err.message}`);
  process.exit(1);
});
