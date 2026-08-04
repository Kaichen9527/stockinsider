#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, '.agent', 'reports');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const baseUrl = getArg('--base-url', process.env.E2E_BASE_URL || 'http://127.0.0.1:3010').replace(/\/+$/, '');
const maxCalendarDays = Number(getArg('--max-calendar-days', '3'));

function parseAsOf(value) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ageDays(value) {
  const ms = parseAsOf(value);
  if (ms == null) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000)));
}

async function fetchJson(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    throw new Error(`${pathname} returned ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

async function main() {
  const radar = await fetchJson('/api/radar/daily');
  const focusSummary = String(radar.focusSummary || '');
  const marketAgeDays = ageDays(radar.marketRegimeUpdatedAt || radar.asOf);
  const themeAgeDays = ageDays(radar.themeHeatUpdatedAt || radar.asOf);
  const freshnessStatus = radar.marketFreshnessStatus || 'unknown';
  const staleSummaryIsExplicit = /偏舊|最後更新|SLA|刷新|等待|逾時/.test(focusSummary);
  const failures = [];

  if (marketAgeDays != null && marketAgeDays > maxCalendarDays && !staleSummaryIsExplicit) {
    failures.push(`marketRegimeUpdatedAt is ${marketAgeDays} days old but focusSummary does not show stale state`);
  }
  if (themeAgeDays != null && themeAgeDays > maxCalendarDays && !staleSummaryIsExplicit) {
    failures.push(`themeHeatUpdatedAt is ${themeAgeDays} days old but focusSummary does not show stale state`);
  }
  if (freshnessStatus === 'stale' && !staleSummaryIsExplicit) {
    failures.push('marketFreshnessStatus is stale but summary is not explicit');
  }
  if (/2026-04-24.*risk-on|2026\/4\/24.*risk-on/.test(focusSummary) && !staleSummaryIsExplicit) {
    failures.push('focusSummary still presents 2026-04-24 risk-on as current');
  }

  const report = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    ok: failures.length === 0,
    failures,
    radar: {
      asOf: radar.asOf || null,
      marketRegime: radar.marketRegime || null,
      marketRegimeUpdatedAt: radar.marketRegimeUpdatedAt || null,
      themeHeatUpdatedAt: radar.themeHeatUpdatedAt || null,
      marketFreshnessStatus: radar.marketFreshnessStatus || null,
      marketFreshnessReason: radar.marketFreshnessReason || null,
      focusSummary,
      marketAgeDays,
      themeAgeDays,
    },
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const file = path.join(REPORTS_DIR, `market-freshness-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
