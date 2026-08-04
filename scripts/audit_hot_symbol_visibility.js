#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const issues = [];
  const hotTracking = radar.hotTracking || [];
  const hot3008 = hotTracking.find((item) => String(item.symbol) === '3008');
  if (!hot3008) {
    issues.push('3008:not_in_hot_tracking');
  } else {
    if (hot3008.displayBucket !== 'hot_tracking') issues.push('3008:display_bucket_not_hot_tracking');
    if (hot3008.isActionableRecommendation) issues.push('3008:hot_tracking_marked_actionable');
    if (!/已反映|重估|回測|熱股/.test(`${hot3008.hotTrackingReason || ''} ${hot3008.whyNotPromoted || ''}`)) {
      issues.push('3008:missing_hot_tracking_reason');
    }
  }

  const formalSymbols = new Set((radar.opportunities || []).map((item) => String(item.symbol || '')));
  if (formalSymbols.has('3008')) issues.push('3008:incorrectly_in_formal_opportunities');

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `hot-symbol-visibility-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, hotTrackingSymbols: hotTracking.map((item) => item.symbol), checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Hot symbol visibility audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Hot symbol visibility audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`hot symbol visibility audit failed: ${err.message}`);
  process.exit(1);
});
