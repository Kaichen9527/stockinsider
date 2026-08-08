#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function hasNormalizedMultipleText(text) {
  return /normalized|forward|常態|標準化|正常化|cycle|景氣循環|同業|可比|券商/i.test(String(text || ''));
}

function textIncludesUnverifiedCustomer(text) {
  return /未取得具名|未取得可引用|直接客戶\s*\/\s*訂單來源待補|不納入已驗證 Base|供應鏈映射推估/.test(String(text || ''));
}

async function checkDeepDive(card, issues) {
  const symbol = String(card.symbol || '').trim();
  if (!symbol) return;
  const detail = await fetchJson(`${baseUrl}/api/stocks/${symbol}/deep-dive`);
  const target = detail.targetSnapshot || {};
  const panel = detail.valuationPanel || {};
  const base = detail.valuationPanel?.baseCaseDetail || {};
  const gate = panel.valuationConfidenceGate || target.valuationConfidenceGate || null;
  const ledger = panel.assumptionLedger || [];
  const label = `${symbol}:valuation`;
  const status = card.valuationSanityStatus || target.valuationSanityStatus || null;
  const reason = card.valuationSanityReason || target.valuationSanityReason || null;

  if ((card.displayBaseUpsidePct || 0) > 80 && status === 'normal') {
    issues.push(`${label}:base_upside_over_80_without_review`);
  }
  if (((card.displayBaseUpsidePct || 0) > 80 || (card.displayScenarioUpsidePct || 0) > 200) && !reason && status !== 'normal') {
    issues.push(`${label}:review_missing_reason`);
  }
  const customerText = [base.customerExposure, ...(base.evidenceBasis || []), ...(base.sharedBasisRefs || [])].join(' ');
  if (card.displayBucket === 'formal' && textIncludesUnverifiedCustomer(customerText)) {
    issues.push(`${label}:formal_base_uses_unverified_customer_evidence`);
  }
  const currentPe = base.currentPeRatio;
  const currentPb = base.currentPbRatio;
  const abnormalMultiple =
    (finite(currentPe) && currentPe > 80) ||
    (finite(currentPb) && currentPb > 8);
  if (card.displayBucket === 'formal' && abnormalMultiple && !hasNormalizedMultipleText(base.multipleBridge || '')) {
    issues.push(`${label}:formal_abnormal_multiple_without_normalized_explanation`);
  }
  if (card.displayBucket === 'formal' && status && status !== 'normal') {
    issues.push(`${label}:formal_sanity_${status}`);
  }
  if (card.displayBucket === 'formal' && gate && gate.baseTargetFormal !== true) {
    issues.push(`${label}:formal_without_base_target_verification`);
  }
  if (card.displayBucket === 'formal' && card.baseTargetVerificationStatus && card.baseTargetVerificationStatus !== 'verified') {
    issues.push(`${label}:formal_base_verification_${card.baseTargetVerificationStatus}`);
  }
  const baseInternalOnlyItems = ledger.filter((item) => item.caseLabel === 'Base' && item.trustLevel === 'internal_only');
  if (card.displayBucket === 'formal' && baseInternalOnlyItems.length > 0) {
    issues.push(`${label}:formal_base_internal_only_ledger`);
  }
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  const visible = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
  ].filter((item, index, arr) => item.symbol && arr.findIndex((probe) => probe.symbol === item.symbol) === index);

  for (const card of radar.opportunities || []) {
    const label = `${card.symbol || 'unknown'}:formal`;
    if (!card.valuationSanityStatus) issues.push(`${label}:missing_valuation_sanity_status`);
    if (card.valuationSanityStatus && card.valuationSanityStatus !== 'normal') {
      issues.push(`${label}:valuation_sanity_${card.valuationSanityStatus}`);
    }
    if ((card.displayBaseUpsidePct || 0) > 80) {
      issues.push(`${label}:formal_base_upside_over_80`);
    }
  }

  for (const card of visible) {
    await checkDeepDive(card, issues);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `valuation-sanity-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, checkedSymbols: visible.map((item) => item.symbol), issues, checkedAt: new Date().toISOString() }, null, 2),
  );
  if (issues.length) {
    console.error(`Valuation sanity audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Valuation sanity audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`valuation sanity audit failed: ${err.message}`);
  process.exit(1);
});
