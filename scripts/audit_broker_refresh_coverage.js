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

function candidateCards(radar) {
  return [
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = candidateCards(radar).filter((card) =>
    card.revaluationStatus === 'pending' ||
    card.displayTargetMode === 'needs_revaluation' ||
    card.staleReason ||
    card.targetStaleKind ||
    card.displayBucket === 'hot_tracking'
  );
  const issues = [];
  const checked = [];
  for (const card of cards) {
    checked.push(card.symbol);
    const job = card.revaluationJobSummary;
    const plan = Array.isArray(card.nextEvidenceSearchPlan) ? card.nextEvidenceSearchPlan.join(' ') : '';
    const hasBrokerPlan = /券商|外資|FactSet|MoneyDJ|UDN|鉅亨/i.test(plan);
    const hasBrokerAttempt = Boolean(job?.brokerSearchSummary);
    if (!hasBrokerPlan) issues.push(`${card.symbol}:missing_broker_search_plan`);
    if (job?.jobId && !hasBrokerAttempt && job.status !== 'queued') {
      issues.push(`${card.symbol}:durable_job_without_broker_attempt_summary`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `broker-refresh-coverage-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Broker refresh coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Broker refresh coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`broker refresh coverage audit failed: ${err.message}`);
  process.exit(1);
});
