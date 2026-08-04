#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function loadDotEnv(filepath) {
  if (!fs.existsSync(filepath)) return;
  const content = fs.readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] != null) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadDotEnv(path.join(process.cwd(), '.env'));
loadDotEnv(path.join(process.cwd(), '.env.local'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const reportsDir = path.join(process.cwd(), '.agent', 'reports');

async function supabaseGet(pathname) {
  if (!supabaseUrl || !supabaseKey) throw new Error('missing_supabase_service_credentials');
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${pathname}`, {
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${pathname}_${res.status}_${text.slice(0, 200)}`);
  }
  return res.json();
}

function encryptedPayloadLooksSafe(row) {
  const payload = row.encrypted_payload || {};
  const text = JSON.stringify(payload);
  return payload.algorithm === 'aes-256-gcm' && payload.iv && payload.tag && payload.ciphertext && !/sessionid|csrftoken|ds_user_id|cookie/i.test(text);
}

async function main() {
  const issues = [];
  const [states, runs, artifacts, sessions] = await Promise.all([
    supabaseGet('worker_job_states?select=job_id,status,last_run_at,last_scheduled_at,last_routes,metadata&limit=100'),
    supabaseGet('worker_job_runs?select=job_id,status,started_at,finished_at,routes&order=started_at.desc&limit=20'),
    supabaseGet('runtime_artifacts?select=artifact_key,artifact_type,created_at&order=created_at.desc&limit=20'),
    supabaseGet('source_sessions?select=platform,session_kind,status,encrypted_payload,cookie_count,validated_at,failure_reason&limit=20'),
  ]);

  const stateIds = new Set(states.map((row) => row.job_id));
  if (!stateIds.has('social-source-refresh-6h')) issues.push('worker_job_states:missing_social_source_refresh_6h');
  if (!runs.some((row) => row.job_id === 'social-source-refresh-6h')) issues.push('worker_job_runs:missing_social_source_refresh_6h_run');
  if (!artifacts.some((row) => row.artifact_key === 'auth-source-worker-state-latest')) issues.push('runtime_artifacts:missing_worker_state_artifact');

  for (const session of sessions) {
    if (Number(session.cookie_count || 0) > 0 && !encryptedPayloadLooksSafe(session)) {
      issues.push(`source_sessions:${session.platform}:payload_not_encrypted_or_contains_cookie_text`);
    }
  }

  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `supabase-runtime-state-audit-${stamp}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ passed: issues.length === 0, issues, checkedAt: new Date().toISOString(), stateCount: states.length, runCount: runs.length }, null, 2),
  );
  if (issues.length) {
    console.error(`Supabase runtime state audit failed: ${issues.join(', ')}`);
    console.error(`Report: ${reportPath}`);
    process.exit(1);
  }
  console.log('Supabase runtime state audit: pass');
  console.log(`Report: ${reportPath}`);
}

main().catch((err) => {
  console.error(`supabase runtime state audit failed: ${err.message}`);
  process.exit(1);
});
