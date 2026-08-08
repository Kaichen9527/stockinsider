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

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const connector = (radar.sourceHealthSummary?.connectorDetails || []).find((item) => item.connector === 'ptt' || item.id === 'ptt');
  const issues = [];
  if (!connector) {
    issues.push('ptt_connector_status_missing');
  } else {
    const meta = connector.metadata || connector.lastRunMetadata || {};
    const articles = Number(connector.articlesFetched || meta.articles_fetched || meta.articlesFetched || 0);
    const comments = Number(connector.pushCommentsParsed || meta.push_comments_parsed || meta.pushCommentsParsed || 0);
    const matched = Array.isArray(meta.matched_symbols) ? meta.matched_symbols.length : Number(meta.matchedSymbols || connector.matchedSymbols || 0);
    if ((connector.recordsWritten24h || connector.recordsWrittenThisRun || 0) > 0) {
      if (articles <= 0) issues.push('ptt_written_without_articles_fetched_metadata');
      if (comments <= 0) issues.push('ptt_written_without_push_comments_metadata');
      if (matched <= 0) issues.push('ptt_written_without_matched_symbols_metadata');
      if (!connector.statusExplanation && !connector.displayFailureReason && ['failed', 'timed_out', 'partial'].includes(String(connector.lastTerminalStatus || connector.status || ''))) {
        issues.push('ptt_partial_or_timeout_without_status_explanation');
      }
    } else if (!connector.failureReason && !connector.noNewDataReason) {
      issues.push('ptt_no_records_without_reason');
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `ptt-fulltext-coverage-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, connector, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`PTT fulltext coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('PTT fulltext coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`ptt fulltext coverage audit failed: ${err.message}`);
  process.exit(1);
});
