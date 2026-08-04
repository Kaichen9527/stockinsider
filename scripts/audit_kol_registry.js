#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const requiredKols = ['股癌', '投資癮', '定錨投筆', '游庭皓的財經皓角', 'M觀點', '財經M平方', '股市隱者', '財報狗', 'John 林睿閔'];
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), 'web', '.env'));
loadEnvFile(path.join(process.cwd(), 'web', '.env.local'));

async function fetchSupabase(pathname) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('missing_supabase_env');
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${pathname}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) throw new Error(`supabase_${res.status}_${await res.text()}`);
  return res.json();
}

function hasEndpoint(metadata) {
  if (!metadata || typeof metadata !== 'object') return false;
  return Boolean(
    metadata.youtubeUrl ||
      metadata.appleUrl ||
      metadata.spotifyUrl ||
      metadata.telegramUrl ||
      metadata.investanchorsUrl ||
      (Array.isArray(metadata.rssUrls) && metadata.rssUrls.length > 0),
  );
}

async function main() {
  fs.mkdirSync(reportsDir, { recursive: true });
  const rows = await fetchSupabase('kol_profiles?select=display_name,primary_platform,discovery_state,metadata&limit=1000');
  const approved = rows.filter((row) => row.discovery_state === 'approved');
  const byName = new Map(approved.map((row) => [row.display_name, row]));
  const issues = [];
  for (const name of requiredKols) {
    const row = byName.get(name);
    if (!row) {
      issues.push(`${name}:missing_approved_profile`);
      continue;
    }
    if (!hasEndpoint(row.metadata)) issues.push(`${name}:missing_fetchable_endpoint`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    ok: issues.length === 0,
    issues,
    requiredKols,
    found: requiredKols.map((name) => ({ name, profile: byName.get(name) || null })),
  };
  const reportPath = path.join(reportsDir, `kol-registry-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (issues.length) {
    console.error(`KOL registry audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('KOL registry audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(`KOL registry audit failed: ${error.message}`);
  process.exit(1);
});
