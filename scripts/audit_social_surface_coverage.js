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
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];

  for (const connector of ['threads', 'instagram']) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_source_health`);
      continue;
    }
    const searched = (item.searchedTargets || []).map((value) => String(value));
    const reason = `${item.displayFailureReason || ''} ${item.failureReason || ''} ${item.degradedReason || ''}`.toLowerCase();
    const hasAccountFeed = searched.some((value) => /account_feed|登入|recommended|following/i.test(value));
    const hasPublicOrAuthor =
      searched.some((value) => /public_search|author_watch|symbol|theme|keyword|visible/i.test(value)) ||
      item.recordsWritten24h > 0 ||
      item.recordsWritten > 0;
    if (!hasAccountFeed && !/cookie|session|auth|登入|missing_credentials/.test(reason)) {
      issues.push(`${connector}:account_feed_not_attempted_or_not_reported`);
    }
    if (!hasPublicOrAuthor && !reason) {
      issues.push(`${connector}:public_or_author_surface_missing`);
    }
  }

  const bulltalk = details.find((entry) => entry.connector === 'bulltalk');
  if (!bulltalk) issues.push('bulltalk:missing_source_health');
  else if (!bulltalk.lastTerminalRunAt && !bulltalk.lastSuccessAt && !bulltalk.displayFailureReason) {
    issues.push('bulltalk:missing_terminal_run_or_failure_reason');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `social-surface-coverage-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Social surface coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Social surface coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`social surface coverage audit failed: ${err.message}`);
  process.exit(1);
});
