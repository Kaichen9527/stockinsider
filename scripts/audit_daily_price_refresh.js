#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}_${res.status}`);
  return res.json();
}

function hoursOld(value) {
  if (!value) return Infinity;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return Infinity;
  return (Date.now() - ms) / (1000 * 60 * 60);
}

function checkCard(bucket, card, issues) {
  const label = `${card.symbol || 'unknown'}:${bucket}`;
  if (!finite(card.currentPrice) || card.currentPrice <= 0) {
    issues.push(`${label}:missing_current_price`);
  }
  if (!card.priceAsOf) {
    issues.push(`${label}:missing_price_as_of`);
    return;
  }
  if (hoursOld(card.priceAsOf) > 96) {
    issues.push(`${label}:price_as_of_too_old:${card.priceAsOf}`);
  }
  if (!card.targetCoverageStatus) {
    issues.push(`${label}:missing_target_coverage_status`);
  }
}

async function main() {
  const radar = await fetchJson(`${baseUrl}/api/radar/daily`);
  const issues = [];
  const dataHealth = radar.dataHealth || {};
  if (!dataHealth.priceRefreshLastSuccessAt) {
    issues.push('radar:missing_price_refresh_last_success_at');
  } else if (hoursOld(dataHealth.priceRefreshLastSuccessAt) > 96) {
    issues.push(`radar:price_refresh_too_old:${dataHealth.priceRefreshLastSuccessAt}`);
  }
  if (!dataHealth.priceRefreshScheduledAt) issues.push('radar:missing_price_refresh_scheduled_at');

  for (const card of radar.opportunities || []) checkCard('opportunities', card, issues);
  for (const card of radar.scenarioUpsideCandidates || []) checkCard('scenarioUpsideCandidates', card, issues);
  for (const card of radar.earlyWatchlist || []) checkCard('earlyWatchlist', card, issues);

  const html = await fetch(`${baseUrl}/`).then((res) => res.text());
  const normalizedHtml = html.replace(/<!--.*?-->/g, '').replace(/\s+/g, ' ');
  if (!/現價[^<]{0,80}NT\$/.test(normalizedHtml)) issues.push('homepage:missing_current_price_chip');
  if (!/股價日期/.test(html)) issues.push('homepage:missing_price_date_label');

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `daily-price-refresh-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ baseUrl, passed: issues.length === 0, issues, checkedAt: new Date().toISOString() }, null, 2),
  );
  if (issues.length) {
    console.error(`Daily price refresh audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Daily price refresh audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`daily price refresh audit failed: ${err.message}`);
  process.exit(1);
});
