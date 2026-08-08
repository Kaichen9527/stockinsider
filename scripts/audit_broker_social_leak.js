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

function cardsFromRadar(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ];
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = cardsFromRadar(radar);
  const issues = [];
  const leaks = [];

  for (const card of cards) {
    if (!card.brokerSocialLeakSummary) continue;
    leaks.push({ symbol: card.symbol, summary: card.brokerSocialLeakSummary, bucket: card.displayBucket, gate: card.recommendationGateStatus });
    if (/正式|Base 可作正式|verified/i.test(String(card.whyBaseIsFormal || '')) && /社群|轉述|leak/i.test(String(card.whyBaseIsFormal || ''))) {
      issues.push(`${card.symbol}:social_broker_leak_used_as_formal_base_reason`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `broker-social-leak-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, leakCount: leaks.length, leaks, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Broker social leak audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Broker social leak audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`broker social leak audit failed: ${err.message}`);
  process.exit(1);
});
