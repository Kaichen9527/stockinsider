#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function visibleCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

function coverageGroups(detail) {
  return [
    ...(Array.isArray(detail.appendix) ? detail.appendix : []),
    ...(detail.appendix?.coverageStatus || []),
    ...(Array.isArray(detail.sourceAppendix) ? detail.sourceAppendix : []),
    ...(detail.sourceAppendix?.coverageStatus || []),
  ];
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar);
  const issues = [];

  for (const card of cards) {
    const symbol = String(card.symbol || '');
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const panel = detail.valuationPanel || {};
    const coverage = coverageGroups(detail).find((item) => /broker|券商|外資/i.test(String(item.id || item.label || '')));
    const label = `${symbol}:broker_consensus_depth`;
    if (!coverage) {
      issues.push(`${label}:missing_broker_coverage`);
    } else if (!coverage.matched && !coverage.failureReason && !coverage.summary) {
      issues.push(`${label}:missing_broker_missing_reason`);
    }
    if (panel.brokerConsensus && panel.brokerConsensus.sourceCount > 0) {
      if (!panel.brokerConsensus.summary) issues.push(`${label}:consensus_missing_summary`);
      if (!panel.brokerConsensus.latestReportDate) issues.push(`${label}:consensus_missing_latest_date`);
    }
    if (card.displayBucket === 'formal') {
      const gate = panel.valuationConfidenceGate || detail.targetSnapshot?.valuationConfidenceGate;
      if (!gate?.baseTargetFormal) issues.push(`${label}:formal_without_base_gate`);
      if ((gate?.brokerCitationCount || 0) + (gate?.officialCitationCount || 0) < 1) {
        issues.push(`${label}:formal_without_broker_or_official_citation`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `broker-consensus-depth-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Broker consensus depth audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Broker consensus depth audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`broker consensus depth audit failed: ${err.message}`);
  process.exit(1);
});
