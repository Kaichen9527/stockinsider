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

function needsRevaluation(card) {
  return Boolean(
    card.revaluationStatus === 'pending' ||
      card.displayTargetMode === 'needs_revaluation' ||
      card.staleReason ||
      card.targetStaleKind ||
      card.displayBucket === 'hot_tracking' ||
      card.recommendationGateStatus === 'needs_revaluation'
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar).filter(needsRevaluation);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    const job = card.revaluationJobSummary || null;
    checked.push({ symbol: card.symbol, status: job?.status || null, sla: card.revaluationSlaStatus || job?.slaStatus || null });
    if (!job) {
      issues.push(`${card.symbol}:missing_revaluation_job_summary`);
      continue;
    }
    if (!card.revaluationSlaStatus && !job.slaStatus) issues.push(`${card.symbol}:missing_sla_status`);
    if (!card.nextRevaluationAt && !job.nextAttemptAt && ['queued', 'running'].includes(job.status)) issues.push(`${card.symbol}:missing_next_revaluation_at`);
    const missingEvidence = card.missingRepricingEvidence || job.missingEvidence || job.requiredEvidence || [];
    if (!Array.isArray(missingEvidence) || missingEvidence.length === 0) issues.push(`${card.symbol}:missing_repricing_evidence`);
    if (!card.brokerEvidenceSearchStatus && !job.brokerEvidenceSearchStatus) issues.push(`${card.symbol}:missing_broker_evidence_search_status`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `revaluation-sla-v2-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Revaluation SLA v2 audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Revaluation SLA v2 audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`revaluation SLA v2 audit failed: ${err.message}`);
  process.exit(1);
});
