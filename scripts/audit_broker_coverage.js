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
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ];
  return cards.filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

function brokerCoverageFrom(detail) {
  const appendix = detail.appendix || {};
  const sourceAppendix = detail.sourceAppendix || {};
  const groups = [
    ...(appendix.coverageStatus || []),
    ...((appendix.groups || []).map((group) => ({ label: group.label, items: group.items || [] })) || []),
    ...(sourceAppendix.coverageStatus || []),
    ...((sourceAppendix.groups || []).map((group) => ({ label: group.label, items: group.items || [] })) || []),
  ];
  return groups.find((group) =>
    /券商|外資|broker/i.test(String(group.group || group.label || group.sourceType || ''))
  ) || null;
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar);
  const issues = [];

  for (const card of cards) {
    const symbol = String(card.symbol || '');
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const brokerConsensus = detail.valuationPanel?.brokerConsensus || null;
    const brokerCoverage = brokerCoverageFrom(detail);
    const gate = detail.valuationPanel?.valuationConfidenceGate || null;
    const label = `${symbol}:broker_coverage`;

    if (!brokerCoverage) {
      issues.push(`${label}:missing_broker_coverage_status`);
    } else {
      const hasHit = brokerCoverage.matched === true || brokerCoverage.status === 'hit' || (Array.isArray(brokerCoverage.items) && brokerCoverage.items.length > 0);
      const hasReason = Boolean(brokerCoverage.failureReason || brokerCoverage.summary || brokerCoverage.staleReason);
      if (!hasHit && !hasReason) issues.push(`${label}:missing_failure_or_stale_reason`);
    }

    if (brokerConsensus && brokerConsensus.sourceCount > 0 && !brokerConsensus.summary) {
      issues.push(`${label}:consensus_missing_summary`);
    }
    if (card.displayBucket === 'formal' && gate && gate.brokerCitationCount < 1 && gate.officialCitationCount < 1) {
      issues.push(`${label}:formal_without_broker_or_official_citation`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `broker-coverage-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2),
  );
  if (issues.length) {
    console.error(`Broker coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Broker coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`broker coverage audit failed: ${err.message}`);
  process.exit(1);
});
