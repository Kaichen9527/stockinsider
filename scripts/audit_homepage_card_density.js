#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3012') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');
const forbidden = ['估值安全狀態', 'PE 比價：', 'Forward PE：', '模型輔助訊號：', '社群來源摘要：', '非正式買點：'];

async function main() {
  const res = await fetch(baseUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`homepage_${res.status}`);
  const html = await res.text();
  const issues = forbidden.filter((text) => html.includes(text)).map((text) => `homepage_contains_${text}`);

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `homepage-card-density-audit-${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2));
  if (issues.length) {
    console.error(`Homepage card density audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Homepage card density audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`homepage card density audit failed: ${err.message}`);
  process.exit(1);
});
