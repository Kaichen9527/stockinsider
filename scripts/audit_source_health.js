#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const expectedTelegramChannels = ['investanchors', 'twstockanalysis', 'Gooaye', 'johnstock888', 'eaglewealth', 'a178178', 'musclestock'];
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function main() {
  const res = await fetch(`${baseUrl}/api/radar/daily`);
  if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
  const radar = await res.json();
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];
  const raw = JSON.stringify(radar.sourceHealthSummary || {});
  if (/browserType\.launch|chrome-headless-shell|chromium_headless_shell|npx playwright install/i.test(raw)) {
    issues.push('raw_playwright_stack_in_source_health');
  }

  for (const connector of ['investanchors', 'threads', 'instagram']) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_source_health_detail`);
      continue;
    }
    const reason = `${item.displayFailureReason || ''} ${item.failureReason || ''} ${item.degradedReason || ''}`;
    if (/playwright_runtime_unavailable/i.test(reason) && !item.ignoredServerlessSkip) {
      issues.push(`${connector}:playwright_status_not_marked_ignored`);
    }
    if (/playwright_runtime_unavailable/i.test(reason) && /抓取失敗|fetch_failed/i.test(`${item.status || ''} ${item.normalizedFailureCode || ''}`)) {
      issues.push(`${connector}:serverless_status_presented_as_fetch_failure`);
    }
    if (connector === 'threads' && /auth/i.test(`${item.normalizedFailureCode || ''}`) && !/cookie|session|登入/i.test(reason)) {
      issues.push('threads:auth_degraded_without_cookie_reason');
    }
  }

  for (const connector of ['podcast', 'youtube']) {
    const item = details.find((entry) => entry.connector === connector);
    if (!item) {
      issues.push(`${connector}:missing_source_health_detail`);
      continue;
    }
    if (!item.lastSuccessAt && !item.displayFailureReason && !item.failureReason && !item.degradedReason) {
      issues.push(`${connector}:missing_success_or_failure_reason`);
    }
    if (!Array.isArray(item.searchedTargets)) {
      issues.push(`${connector}:missing_searched_targets`);
    }
  }

  const telegram = details.find((entry) => entry.connector === 'telegram');
  if (!telegram) {
    issues.push('telegram:missing_source_health_detail');
  } else {
    const channels = telegram.channelBreakdown || [];
    const channelNames = new Set(channels.map((item) => item.channel));
    for (const channel of expectedTelegramChannels) {
      if (!channelNames.has(channel)) issues.push(`telegram:missing_channel_${channel}`);
    }
    for (const channel of channels) {
      if (!channel.searched) issues.push(`telegram:${channel.channel}:not_searched`);
      if (typeof channel.fetchedPosts !== 'number') issues.push(`telegram:${channel.channel}:missing_fetched_posts`);
      if (typeof channel.recordsWritten !== 'number') issues.push(`telegram:${channel.channel}:missing_records_written`);
      if (!Array.isArray(channel.matchedSymbols)) issues.push(`telegram:${channel.channel}:missing_matched_symbols`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `source-health-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Source health audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Source health audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`source health audit failed: ${err.message}`);
  process.exit(1);
});
