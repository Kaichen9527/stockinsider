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

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function visibleCards(radar) {
  const cards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ];
  return cards.filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);
}

function keyAssumptionItems(ledger, caseLabel = 'Base') {
  return (ledger || []).filter((item) =>
    item.caseLabel === caseLabel &&
    ['revenue', 'gross_margin', 'operating_margin', 'eps', 'multiple', 'target_price'].includes(item.key)
  );
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const cards = visibleCards(radar);
  const issues = [];

  for (const card of cards) {
    const symbol = String(card.symbol || '');
    const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
    const panel = detail.valuationPanel || {};
    const ledger = panel.assumptionLedger || [];
    const gate = panel.valuationConfidenceGate || detail.targetSnapshot?.valuationConfidenceGate || null;
    const baseItems = keyAssumptionItems(ledger, 'Base');
    const label = `${symbol}:valuation_assumptions`;

    const baseTargetFormal = gate?.baseTargetFormal === true;
    if (baseItems.length < 6) issues.push(`${label}:base_ledger_missing_key_items`);
    for (const item of baseItems) {
      if (baseTargetFormal && !item.value) issues.push(`${label}:${item.key}:missing_value`);
      if (!Array.isArray(item.sourceTypes) || item.sourceTypes.length === 0) issues.push(`${label}:${item.key}:missing_source_types`);
      if (!Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0) issues.push(`${label}:${item.key}:missing_source_refs`);
    }

    const targetVerdictFormal = detail.targetSnapshot?.verdict === 'formal' || card.displayBucket === 'formal';
    if (targetVerdictFormal && !baseTargetFormal) {
      issues.push(`${label}:formal_without_valuation_confidence_gate`);
    }
    if (targetVerdictFormal) {
      const internalOnly = baseItems.filter((item) => item.trustLevel === 'internal_only').map((item) => item.key);
      if (internalOnly.length > 0) issues.push(`${label}:formal_internal_only_${internalOnly.join('_')}`);
    }
    const baseUpside = card.displayBaseUpsidePct ?? detail.targetSnapshot?.displayBaseUpsidePct ?? null;
    if (finite(baseUpside) && baseUpside > 30 && gate && gate.externalCitationCount < 1) {
      issues.push(`${label}:base_upside_over_30_without_external_citation`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `valuation-assumptions-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: cards.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2),
  );
  if (issues.length) {
    console.error(`Valuation assumptions audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Valuation assumptions audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`valuation assumptions audit failed: ${err.message}`);
  process.exit(1);
});
