#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const expectedConnectors = ['investanchors', 'threads', 'telegram', 'podcast', 'youtube'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];
  for (const connector of expectedConnectors) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_connector_detail`);
      continue;
    }
    const hasSuccess = Boolean(item.lastSuccessAt) || Number(item.recordsWritten24h || item.recordsWritten || 0) > 0;
    const hasReason = Boolean(item.displayFailureReason || item.failureReason || item.degradedReason || item.normalizedFailureCode);
    if (!hasSuccess && !hasReason) issues.push(`${connector}:missing_success_or_degraded_reason`);
    if (connector === 'threads' && /auth/i.test(String(item.normalizedFailureCode || '')) && !/cookie|session|登入/i.test(`${item.displayFailureReason || item.failureReason || item.degradedReason || ''}`)) {
      issues.push('threads:auth_degraded_without_cookie_reason');
    }
    if ((connector === 'podcast' || connector === 'youtube') && !Array.isArray(item.searchedTargets)) {
      issues.push(`${connector}:missing_searched_targets`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `source-worker-freshness-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Source worker freshness audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Source worker freshness audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`source worker freshness audit failed: ${err.message}`);
  process.exit(1);
});
