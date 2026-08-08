#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const REQUIRED_THEMES = [
  'passive-components-mlcc',
  'quartz-frequency-components',
  'memory-rerating',
  'ai-server-global-lead',
  'optical-cpo-global-lead',
];

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  const hotThemes = radar.hotThemes || [];
  const themeByKey = new Map(hotThemes.map((theme) => [theme.themeKey, theme]));
  const checkedThemes = [];

  for (const themeKey of REQUIRED_THEMES) {
    const theme = themeByKey.get(themeKey);
    if (!theme) {
      issues.push(`${themeKey}:missing_theme_heat_card`);
      continue;
    }
    const capitalSignals = theme.capitalFlowSignals || {};
    const peerCount = arrayLength(theme.foreignPeerBasket) || arrayLength(capitalSignals.foreign_peer_basket);
    const mappedCount = arrayLength(theme.relatedSymbols) || arrayLength(capitalSignals.tw_mapped_symbols);
    checkedThemes.push({
      themeKey,
      themeName: theme.themeName,
      peerCount,
      mappedCount,
      sourceStatus: capitalSignals.overseas_signal_status || null,
      leadLagSpreadPct: theme.leadLagSpreadPct ?? capitalSignals.lead_lag_spread_pct ?? null,
    });
    if (peerCount === 0) issues.push(`${themeKey}:missing_foreign_peer_basket`);
    if (mappedCount === 0) issues.push(`${themeKey}:missing_tw_mapped_symbols`);
    if (!capitalSignals.overseas_lead_lag_signal && !theme.foreignPeerBasket) {
      issues.push(`${themeKey}:missing_overseas_lead_lag_signal`);
    }
  }

  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ];
  const leadLagCards = cards.filter((card) => card.globalThemeLeadLagSignal);
  const formalLeadLagOnly = leadLagCards.filter(
    (card) =>
      (card.displayBucket === 'formal' || card.recommendationBucket === 'high_conviction' || card.recommendationBucket === 'early_formal') &&
      !card.whyBaseIsFormal &&
      !card.baseTargetVerificationStatus,
  );
  if (formalLeadLagOnly.length > 0) {
    issues.push(`lead_lag_card_promoted_without_base_verification:${formalLeadLagOnly.map((card) => card.symbol).join(',')}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `global-theme-lead-lag-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl,
        passed: issues.length === 0,
        checkedThemes,
        leadLagCards: leadLagCards.map((card) => ({
          symbol: card.symbol,
          bucket: card.displayBucket || card.recommendationBucket || null,
          themeKey: card.globalThemeLeadLagSignal?.themeKey || null,
          sourceStatus: card.globalThemeLeadLagSignal?.sourceStatus || null,
        })),
        issues,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  if (issues.length) {
    console.error(`Global theme lead-lag audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Global theme lead-lag audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`global theme lead-lag audit failed: ${err.message}`);
  process.exit(1);
});
