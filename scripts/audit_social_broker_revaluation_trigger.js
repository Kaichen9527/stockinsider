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

function cardsFromRadar(radar) {
  return [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
}

function fixtureRadar(name) {
  if (name !== 'broker-leak') throw new Error(`unknown_fixture_${name}`);
  return {
    opportunities: [],
    scenarioUpsideCandidates: [],
    earlyWatchlist: [
      {
        symbol: '9995',
        name: 'Fixture 券商轉述候選',
        brokerSocialLeakSummary: '社群轉述 Morgan Stanley target price / forward EPS，僅作重估觸發。',
        revaluationJobSummary: {
          status: 'queued',
          queuedAt: new Date().toISOString(),
          lastAttemptAt: null,
          lastResult: '等待公開券商/官方來源交叉驗證；社群轉述不可支撐正式 Base。',
          requiredEvidence: ['公開券商摘要', 'Forward EPS 來源', 'target PE / consensus 佐證'],
          slaHours: 24,
        },
        recommendationGateStatus: 'insufficient_bridge',
        whyBaseIsFormal: null,
        whyChanged: 'social_broker_leak 只觸發 revaluation，不可單獨 formal promotion。',
      },
    ],
    hotTracking: [
      {
        symbol: '9996',
        name: 'Fixture 過價券商熱股',
        brokerSocialLeakSummary: '社群轉述 FactSet 目標價上修，需重估驗證。',
        revaluationReason: 'social_broker_leak triggered broker search; formal gate remains blocked.',
        recommendationGateStatus: 'over_target',
      },
    ],
  };
}

async function main() {
  const radar = fixture ? fixtureRadar(fixture) : await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = cardsFromRadar(radar);
  const issues = [];
  for (const card of cards) {
    if (!card.brokerSocialLeakSummary) continue;
    if (!card.revaluationJobSummary && !card.revaluationReason) {
      issues.push(`${card.symbol}:social_broker_leak_without_revaluation_context`);
    }
    if (card.recommendationGateStatus === 'formal_pass' && /social_broker_leak|社群/.test(String(card.whyBaseIsFormal || card.whyChanged || ''))) {
      issues.push(`${card.symbol}:formal_base_appears_social_broker_driven`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `social-broker-revaluation-trigger-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: fixture ? null : baseUrl,
        fixture,
        passed: issues.length === 0,
        issues,
        checkedSymbols: cards.map((card) => card.symbol),
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  if (issues.length) {
    console.error(`Social broker revaluation trigger audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Social broker revaluation trigger audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`social broker revaluation trigger audit failed: ${err.message}`);
  process.exit(1);
});
