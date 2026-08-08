#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const fixture = argValue('--fixture', null);
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function fixtureRadar(name) {
  if (name !== 'static-radar') throw new Error(`unknown_fixture_${name}`);
  return {
    opportunities: [],
    scenarioUpsideCandidates: [
      {
        symbol: '9994',
        name: 'Fixture 情境候選',
        candidateSourceType: 'global_lead_lag',
        candidateReason: 'fixture overseas lead-lag scenario candidate',
      },
    ],
    earlyWatchlist: [
      {
        symbol: '9992',
        name: 'Fixture 早期候選',
        candidateSourceType: 'social_heat',
        whyNotFormal: 'fixture blocked by bridge gate',
      },
    ],
    hotTracking: [
      {
        symbol: '9991',
        name: 'Fixture 漲停熱股',
        candidateSourceType: 'market_mover',
        hotMoverSignal: {
          signalType: 'limit_up',
          changePct: 9.9,
          volume: 120000,
          volumeRatio: 4.2,
          source: 'fixture',
          asOf: new Date().toISOString(),
          summary: 'fixture limit-up hot mover',
        },
      },
    ],
    discoveryFreshnessSummary: {
      lastCheckedAt: new Date().toISOString(),
      sourceRuns24h: 4,
      recordsWritten24h: 42,
      newCandidates24h: 3,
      promoted24h: 1,
      downgraded24h: 1,
      archived24h: 1,
      blockedCandidates: 1,
      reflectedCandidates: 1,
      topDiscoverySource: 'PTT Stock',
      unchangedReason: 'fixture refreshed with candidates but no formal gate promotion',
      sourceSummary: 'fixture source summary',
      candidateSummary: 'fixture candidate summary',
    },
    globalLeadLagSummary: {
      activeThemes: 1,
      pendingPriceRefresh: 0,
      measuredThemes: 1,
      sourceUnavailable: 0,
      summary: 'fixture global lead-lag summary',
    },
  };
}

async function main() {
  const radar = fixture ? fixtureRadar(fixture) : await fetchJson(`${baseUrl}/api/radar/daily`);
  const summary = radar.discoveryFreshnessSummary || null;
  const issues = [];
  if (!summary) {
    issues.push('missing_discovery_freshness_summary');
  } else {
    if (!summary.lastCheckedAt) issues.push('missing_last_checked_at');
    if (typeof summary.sourceRuns24h !== 'number') issues.push('missing_source_runs_24h');
    if (typeof summary.recordsWritten24h !== 'number') issues.push('missing_records_written_24h');
    if (!summary.unchangedReason) issues.push('missing_unchanged_reason');
    if (!summary.sourceSummary || !summary.candidateSummary) issues.push('missing_source_or_candidate_summary');
    if (typeof summary.blockedCandidates !== 'number') issues.push('missing_blocked_candidates');
    if (typeof summary.reflectedCandidates !== 'number') issues.push('missing_reflected_candidates');
    if (!summary.topDiscoverySource && summary.recordsWritten24h > 0) issues.push('missing_top_discovery_source');
    if (summary.sourceRuns24h === 0 && summary.recordsWritten24h === 0 && !/stale|SLA|資料源|沒有/.test(summary.unchangedReason)) {
      issues.push('no_source_activity_without_explanation');
    }
  }
  const allCards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ];
  if (allCards.length === 0 && !summary?.unchangedReason) issues.push('empty_recommendation_pool_without_reason');
  if ((radar.globalLeadLagSummary?.activeThemes || 0) === 0) issues.push('missing_global_lead_lag_summary');

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `recommendation-pool-freshness-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        fixture,
        passed: issues.length === 0,
        summary,
        globalLeadLagSummary: radar.globalLeadLagSummary || null,
        counts: {
          opportunities: (radar.opportunities || []).length,
          scenario: (radar.scenarioUpsideCandidates || []).length,
          early: (radar.earlyWatchlist || []).length,
          hot: (radar.hotTracking || []).length,
        },
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Recommendation pool freshness audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Recommendation pool freshness audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`recommendation pool freshness audit failed: ${err.message}`);
  process.exit(1);
});
