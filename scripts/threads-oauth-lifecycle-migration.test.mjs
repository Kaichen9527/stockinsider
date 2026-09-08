import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(new URL('../migrations/20260908_threads_oauth_lifecycle_v7.sql', import.meta.url), 'utf8');

test('Threads lifecycle migration deletes only the named Vault credential and is service-role only', () => {
  assert.match(sql, /WHERE name = 'threads_access_token'/u);
  assert.match(sql, /DELETE FROM vault[.]secrets WHERE id = v_secret_id/u);
  assert.match(sql, /threads_user_id_hash TEXT NOT NULL/u);
  assert.match(sql, /request_digest TEXT NOT NULL UNIQUE/u);
  assert.doesNotMatch(sql, /threads_user_id\s+TEXT/u);
  assert.match(sql, /metadata->>'owner_user_id_hash'/u);
  assert.match(sql, /v_owner_matches AND v_secret_id IS NOT NULL/u);
  assert.match(sql, /REVOKE ALL ON FUNCTION public[.]revoke_threads_source_credential_v7\(TEXT,TEXT,TEXT,TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/u);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public[.]revoke_threads_source_credential_v7\(TEXT,TEXT,TEXT,TEXT\)[\s\S]*TO service_role/u);
  assert.match(sql, /SET lifecycle = 'blocked_auth'/u);
});
