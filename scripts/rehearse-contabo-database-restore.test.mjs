import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('restore rehearsal is socket-only and never persists the plaintext archive',()=>{
  const source=readFileSync(new URL('./rehearse-contabo-database-restore.mjs',import.meta.url),'utf8');
  assert.match(source,/listen_addresses=''/u);
  assert.match(source,/unix_socket_permissions=0700/u);
  assert.match(source,/plaintextArchiveWritten:false/u);
  assert.match(source,/constants\.O_NOFOLLOW/u);
  assert.match(source,/mode:0o600/u);
  assert.match(source,/identityFenceEnabled===false/u);
  assert.match(source,/applicationValidationPassed:true/u);
  assert.match(source,/applicationTables===7/u);
  assert.match(source,/applicationFunctions===3/u);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|PGPASSWORD/u);
});

test('restore rehearsal rejects incomplete arguments before reading a backup',()=>{
  assert.throws(()=>execFileSync(process.execPath,[new URL('./rehearse-contabo-database-restore.mjs',import.meta.url).pathname],{
    encoding:'utf8',stdio:'pipe',
  }),error=>{
    const payload=JSON.parse(error.stderr.trim());
    return payload.error.startsWith('usage:')&&payload.restoreVerified===false;
  });
});
