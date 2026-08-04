#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const ROOT_DIR = path.resolve(__dirname, '..');
const baseUrl = (argValue('--base-url', 'http://127.0.0.1:3010') || '').replace(/\/$/, '');
const reportsDir = path.join(ROOT_DIR, '.agent', 'reports');
const envFiles = [path.join(ROOT_DIR, '.env'), path.join(ROOT_DIR, '.env.local')];
const namespacedKeys = [
  'THREADS_COOKIE_FALLBACK_SESSIONID',
  'THREADS_COOKIE_FALLBACK_CSRFTOKEN',
  'THREADS_COOKIE_FALLBACK_DS_USER_ID',
  'THREADS_COOKIE_FALLBACK_IG_DID',
  'THREADS_COOKIE_FALLBACK_MID',
  'THREADS_COOKIE_FALLBACK_DATR',
  'THREADS_COOKIE_FALLBACK_PS_L',
  'THREADS_COOKIE_FALLBACK_PS_N',
];
const legacyKeys = ['sessionid', 'csrftoken', 'ds_user_id', 'ig_did', 'mid', 'datr', 'ps_l', 'ps_n'];
const recommended = ['sessionid', 'csrftoken', 'ds_user_id'];

function parseEnvKeyCounts() {
  const counts = Object.fromEntries([...namespacedKeys, ...legacyKeys].map((key) => [key, 0]));
  let latestMtime = null;
  for (const file of envFiles) {
    if (!fs.existsSync(file)) continue;
    const stat = fs.statSync(file);
    if (!latestMtime || stat.mtime.getTime() > new Date(latestMtime).getTime()) latestMtime = stat.mtime.toISOString();
    const content = fs.readFileSync(file, 'utf8');
    for (const rawLine of content.split('\n')) {
      const match = rawLine.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (match && counts[match[1]] != null) counts[match[1]] += 1;
    }
  }
  return { counts, latestMtime };
}

async function main() {
  const env = parseEnvKeyCounts();
  const issues = [];
  const presentNamespaced = namespacedKeys.filter((key) => env.counts[key] > 0);
  const presentLegacy = legacyKeys.filter((key) => env.counts[key] > 0);
  const presentLegacySet = new Set(presentLegacy);
  const missingRecommended = recommended.filter((key) => {
    const namespacedEquivalent =
      key === 'sessionid'
        ? 'THREADS_COOKIE_FALLBACK_SESSIONID'
        : key === 'csrftoken'
          ? 'THREADS_COOKIE_FALLBACK_CSRFTOKEN'
          : 'THREADS_COOKIE_FALLBACK_DS_USER_ID';
    return env.counts[namespacedEquivalent] === 0 && !presentLegacySet.has(key);
  });
  if (presentNamespaced.length === 0 && presentLegacy.length === 0) issues.push('threads:no_cookie_keys_present');
  if (missingRecommended.length > 0) issues.push(`threads:missing_recommended_cookie_keys:${missingRecommended.join(',')}`);

  let sourceHealthThread = null;
  try {
    const res = await fetch(`${baseUrl}/api/radar/daily`);
    if (!res.ok) throw new Error(`radar_fetch_${res.status}`);
    const radar = await res.json();
    sourceHealthThread = (radar.sourceHealthSummary?.connectorDetails || []).find((item) => item.connector === 'threads') || null;
    if (!sourceHealthThread) {
      issues.push('threads:missing_source_health');
    } else {
      const accountStatus = sourceHealthThread.accountFeedStatus || null;
      const reason = `${sourceHealthThread.displayFailureReason || ''} ${sourceHealthThread.failureReason || ''} ${sourceHealthThread.degradedReason || ''}`.toLowerCase();
      if (accountStatus !== 'attempted' && accountStatus !== 'auth_degraded') {
        issues.push(`threads:unexpected_account_feed_status:${accountStatus || 'missing'}`);
      }
      if (accountStatus === 'auth_degraded' && !/cookie|session|auth|登入|credential|missing/i.test(reason)) {
        issues.push('threads:auth_degraded_without_cookie_or_session_reason');
      }
    }
  } catch (error) {
    issues.push(`radar_fetch_failed:${error.message}`);
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `threads-cookie-config-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const safeReport = {
    baseUrl,
    passed: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
    env: {
      latestMtime: env.latestMtime,
      presentNamespacedKeys: presentNamespaced,
      presentLegacyKeys: presentLegacy,
      missingRecommended,
    },
    sourceHealth: sourceHealthThread
      ? {
          lastTerminalStatus: sourceHealthThread.lastTerminalStatus || null,
          accountFeedStatus: sourceHealthThread.accountFeedStatus || null,
          fallbackCookieSource: sourceHealthThread.fallbackCookieSource || null,
          missingRecommendedCookieNames: sourceHealthThread.missingRecommendedCookieNames || [],
          envLastModifiedAt: sourceHealthThread.envLastModifiedAt || null,
        }
      : null,
  };
  fs.writeFileSync(reportPath, JSON.stringify(safeReport, null, 2));
  if (issues.length) {
    console.error(`Threads cookie config audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Threads cookie config audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`threads cookie config audit failed: ${error.message}`);
  process.exit(1);
});
