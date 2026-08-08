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

function allCards(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.recentFormal7d || []),
    ...(radar.fallbackOpportunities90d || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = allCards(radar);
  const issues = [];
  const tracked = ['3008'];

  for (const symbol of tracked) {
    const card = cards.find((item) => String(item.symbol) === symbol) || null;
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const signals = card?.crossThemeSignals || [];
    const text = JSON.stringify({
      title: card?.thesisTitle || detail.reportSnapshot?.title,
      summary: card?.thesisSummary || detail.reportSnapshot?.summaryBullets,
      signals,
    });
    if (!/光學|鏡頭|optical|XR|旗艦/i.test(text)) {
      issues.push(`${symbol}:missing_primary_optical_cross_theme`);
    }
    if (/光通訊|CPO|800G|光模組/i.test(text) && !signals.some((item) => item.themeKey === 'optical-communication-watch')) {
      issues.push(`${symbol}:optical_communication_mentioned_without_cross_theme_signal`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `cross-theme-discovery-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Cross-theme discovery audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Cross-theme discovery audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`cross-theme discovery audit failed: ${err.message}`);
  process.exit(1);
});
