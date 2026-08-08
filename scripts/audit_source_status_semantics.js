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

function terminalLooksBad(item) {
  const status = String(item.lastTerminalStatus || item.status || '');
  if (status === 'partial') return Boolean(item.failureReason || item.displayFailureReason || item.normalizedFailureCode);
  return ['failed', 'timed_out', 'degraded'].includes(status);
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const details = radar.sourceHealthSummary?.connectorDetails || [];
  const issues = [];
  const raw = JSON.stringify(radar.sourceHealthSummary || {});
  if (/browserType\.launch|chrome-headless-shell|npx playwright install/i.test(raw)) {
    issues.push('raw_playwright_stack_visible');
  }

  for (const item of details) {
    const label = item.connector || item.label || 'unknown';
    const records = Number(item.recordsWritten24h || item.recordsWritten || 0);
    const hasSuccess = Boolean(item.lastSuccessAt || item.lastSuccessfulRecordsAt || records > 0);
    const explanation = String(item.statusExplanation || item.displayFailureReason || item.noNewDataReason || '');
    if (hasSuccess && terminalLooksBad(item)) {
      if (!/上次成功|已有|有寫入|部分|暫無新增|待重試/.test(explanation)) {
        issues.push(`${label}:terminal_issue_hides_recent_success`);
      }
      if (/抓取失敗$/.test(explanation)) {
        issues.push(`${label}:recent_success_displayed_as_plain_failure`);
      }
    }
    if (records > 0 && item.workerFreshnessStatus === 'degraded' && !/上次成功|已有|待重試/.test(explanation)) {
      issues.push(`${label}:records_written_but_degraded_without_context`);
    }
  }

  const ptt = details.find((item) => item.connector === 'ptt' || item.id === 'ptt');
  if (!ptt) {
    issues.push('ptt_missing_from_source_health');
  } else {
    const pttRecords = Number(ptt.recordsWritten24h || ptt.recordsWritten || 0);
    const articles = Number(ptt.articlesFetched || ptt.metadata?.articles_fetched || ptt.metadata?.articlesFetched || 0);
    const pushes = Number(ptt.pushCommentsParsed || ptt.metadata?.push_comments_parsed || ptt.metadata?.pushCommentsParsed || 0);
    if (pttRecords > 0 && (articles <= 0 || pushes <= 0)) {
      issues.push('ptt_visible_without_article_push_stats');
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `source-status-semantics-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, details, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Source status semantics audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Source status semantics audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`source status semantics audit failed: ${err.message}`);
  process.exit(1);
});
