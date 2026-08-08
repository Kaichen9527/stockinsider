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

function relevantCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

function needsBrokerRadar(card) {
  return Boolean(
    card.revaluationStatus === 'pending' ||
      card.staleReason ||
      card.targetStaleKind ||
      card.brokerSocialLeakSummary ||
      card.displayBucket === 'hot_tracking' ||
      card.displayTargetMode === 'needs_revaluation'
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = relevantCards(radar);
  const issues = [];
  const checked = [];

  for (const card of cards) {
    if (!needsBrokerRadar(card)) continue;
    const status = card.brokerEvidenceSearchStatus || card.revaluationJobSummary?.brokerEvidenceSearchStatus || null;
    checked.push({ symbol: card.symbol, brokerStatus: status?.status || null, formalGate: card.formalGateStatus || card.recommendationGateStatus || null });
    if (!status) issues.push(`${card.symbol}:missing_broker_evidence_search_status`);
    if (status && !status.summary) issues.push(`${card.symbol}:broker_status_missing_summary`);
    const plan = Array.isArray(card.nextEvidenceSearchPlan) ? card.nextEvidenceSearchPlan.join(' ') : '';
    if (!/券商|外資|FactSet|MoneyDJ|UDN|鉅亨|EPS|目標價/i.test(`${plan} ${status?.summary || ''}`)) {
      issues.push(`${card.symbol}:broker_plan_missing_expected_sources`);
    }
    if (card.brokerSocialLeakSummary && (card.formalGateStatus === 'formal_pass' || card.recommendationGateStatus === 'formal_pass')) {
      issues.push(`${card.symbol}:social_broker_leak_directly_formal`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `broker-evidence-radar-v2-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checked, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Broker evidence radar v2 audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Broker evidence radar v2 audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`broker evidence radar v2 audit failed: ${err.message}`);
  process.exit(1);
});
