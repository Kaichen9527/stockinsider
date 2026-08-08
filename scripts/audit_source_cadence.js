#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const hourly = new Set(['threads', 'instagram', 'telegram']);
const daily = new Set(['investanchors', 'podcast', 'youtube']);

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];
  for (const connector of [...hourly, ...daily]) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_detail`);
      continue;
    }
    const expectedTier = hourly.has(connector) ? 'hourly_social' : 'daily_kol';
    const expectedCadence = hourly.has(connector) ? 1 : 24;
    if (item.refreshTier !== expectedTier) issues.push(`${connector}:refresh_tier_${item.refreshTier || 'missing'}`);
    if (item.refreshCadenceHours !== expectedCadence) issues.push(`${connector}:cadence_${item.refreshCadenceHours || 'missing'}`);
    if (!item.lastTerminalStatus && !item.displayFailureReason && !item.failureReason && !item.degradedReason) {
      issues.push(`${connector}:missing_terminal_or_failure`);
    }
    const recordsThisRun = Number(item.recordsWrittenThisRun || 0);
    const reason = `${item.displayFailureReason || ''} ${item.failureReason || ''} ${item.degradedReason || ''}`;
    if (['success', 'valid'].includes(String(item.lastTerminalStatus || item.status)) && recordsThisRun === 0 && !/暫無新增/.test(reason)) {
      issues.push(`${connector}:success_zero_records_missing_no_new_data_label`);
    }
    if (/等待本機 worker|等待本機 launchd worker/.test(reason) && item.lastTerminalRunAt) {
      issues.push(`${connector}:shows_waiting_worker_after_terminal_run`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `source-cadence-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Source cadence audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Source cadence audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`source cadence audit failed: ${err.message}`);
  process.exit(1);
});
