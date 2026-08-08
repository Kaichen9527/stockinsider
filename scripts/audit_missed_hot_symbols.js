#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const fixture = argValue('--fixture', null);
const symbolArg = argValue('--symbols', null);
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function allVisibleSymbols(radar) {
  return new Set([
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
    ...(radar.discoveredStocks || []),
    ...(radar.recentFormal7d || []),
    ...(radar.fallbackOpportunities90d || []),
  ].map((item) => String(item.symbol || '')).filter(Boolean));
}

function excludedSymbols(radar) {
  return new Map(
    [
      ...(radar.opportunities || []),
      ...(radar.scenarioUpsideCandidates || []),
      ...(radar.earlyWatchlist || []),
      ...(radar.hotTracking || []),
      ...(radar.discoveredStocks || []),
      ...(radar.recentFormal7d || []),
      ...(radar.fallbackOpportunities90d || []),
    ]
      .filter((item) => item?.excludedReason || item?.whyNotVisible || item?.archiveReason)
      .map((item) => [String(item.symbol || ''), item.excludedReason || item.whyNotVisible || item.archiveReason]),
  );
}

function fixtureRadar(name) {
  if (name !== 'market-movers') throw new Error(`unknown_fixture_${name}`);
  return {
    opportunities: [],
    scenarioUpsideCandidates: [],
    earlyWatchlist: [
      {
        symbol: '9992',
        name: 'Fixture 社群熱股',
        candidateSourceType: 'social_heat',
        candidateReason: 'fixture social heat candidate',
      },
    ],
    hotTracking: [
      {
        symbol: '9991',
        name: 'Fixture 漲停熱股',
        candidateSourceType: 'market_mover',
        hotMoverSignal: {
          signalType: 'limit_up',
          changePct: 9.92,
          volume: 120000,
          volumeRatio: 4.2,
          source: 'fixture',
          asOf: new Date().toISOString(),
          summary: 'fixture limit-up hot mover is visible as hot tracking',
        },
      },
      {
        symbol: '9993',
        name: 'Fixture 已排除熱股',
        excludedReason: 'market mover excluded by valuation sanity fixture',
      },
    ],
    discoveredStocks: [],
    recentFormal7d: [],
    fallbackOpportunities90d: [],
  };
}

async function main() {
  const radar = fixture ? fixtureRadar(fixture) : await fetchJson(`${baseUrl}/api/radar/daily`);
  const visible = allVisibleSymbols(radar);
  const excluded = excludedSymbols(radar);
  const issues = [];
  const checkedSymbols = symbolArg
    ? symbolArg.split(',').map((item) => item.trim()).filter(Boolean)
    : fixture
      ? ['9991', '9992', '9993']
      : ['3008'];

  for (const symbol of checkedSymbols) {
    if (!visible.has(symbol) && !excluded.has(symbol)) {
      try {
        if (fixture) throw new Error('fixture_has_no_deep_dive');
        const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
        if (!detail?.symbol) issues.push(`${symbol}:not_visible_and_no_deep_dive`);
      } catch {
        issues.push(`${symbol}:not_visible_and_no_deep_dive`);
      }
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `missed-hot-symbols-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: fixture ? null : baseUrl,
        fixture,
        passed: issues.length === 0,
        checkedSymbols,
        visibleSymbols: [...visible],
        excludedSymbols: Object.fromEntries(excluded),
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Missed hot symbols audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Missed hot symbols audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`missed hot symbols audit failed: ${err.message}`);
  process.exit(1);
});
