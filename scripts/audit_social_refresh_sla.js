#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const socialConnectors = ['investanchors', 'threads', 'instagram', 'telegram', 'podcast', 'youtube'];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];
  for (const connector of socialConnectors) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_source_health_detail`);
      continue;
    }
    if (Number(item.refreshCadenceHours || 0) !== 6) {
      issues.push(`${connector}:refresh_cadence_not_6h`);
    }
    if (!item.lastScheduledAt && !item.lastAttemptAt && !item.lastSuccessAt) {
      issues.push(`${connector}:missing_schedule_attempt_success_time`);
    }
    const terminalEvidence =
      item.lastTerminalStatus ||
      item.lastAttemptStatus ||
      item.canonicalWorkerStatus ||
      item.workerFreshnessStatus ||
      item.normalizedFailureCode;
    if (!terminalEvidence) {
      issues.push(`${connector}:missing_terminal_status`);
    }
    const needsReason = ['stale', 'missing', 'degraded'].includes(String(item.workerFreshnessStatus || ''));
    const reason = item.displayFailureReason || item.failureReason || item.degradedReason || item.normalizedFailureCode;
    if (needsReason && !reason) {
      issues.push(`${connector}:missing_sla_failure_reason`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `social-refresh-sla-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Social refresh SLA audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Social refresh SLA audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`social refresh SLA audit failed: ${err.message}`);
  process.exit(1);
});
