#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const coverage = radar.pluginSourceCoverageSummary || null;
  const issues = [];
  if (!coverage) issues.push('missing_plugin_source_coverage_summary');
  for (const key of ['financialData', 'socialDiscovery', 'modelAssist', 'deploymentQa']) {
    if (!coverage?.[key]?.summary) issues.push(`missing_${key}_summary`);
    if (!Array.isArray(coverage?.[key]?.sources) || coverage[key].sources.length === 0) issues.push(`missing_${key}_sources`);
  }
  if (coverage?.modelAssist?.summary && !/輔助|assistive|不直接/.test(coverage.modelAssist.summary)) {
    issues.push('model_assist_summary_missing_boundary');
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `plugin-source-coverage-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, coverage, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Plugin source coverage audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Plugin source coverage audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`plugin source coverage audit failed: ${err.message}`);
  process.exit(1);
});
