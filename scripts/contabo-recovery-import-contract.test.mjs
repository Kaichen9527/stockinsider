import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('provider recovery is a bounded one-time Contabo import over SSH stdin', () => {
  const local = read('scripts/restore-contabo-provider-recovery.mjs');
  const remote = read('deployment/vps/import-provider-recovery-client.mjs');
  const route = read('web/src/app/api/internal/provider-recovery-import/route.ts');
  assert.match(local, /decryptSmallBackupPayload/u);
  assert.match(local, /spawnSync\('ssh'.+input: transfer/su);
  assert.match(local, /transfer[?][.]fill\(0\)/u);
  assert.match(remote, /http:\/\/127[.]0[.]0[.]1:3100\/api\/internal\/provider-recovery-import/u);
  assert.match(remote, /INTERNAL_API_KEY=/u);
  assert.doesNotMatch(remote, /console[.]log\([^\n]*(?:token|key)/iu);
  assert.match(route, /provider_recovery_existing_token_conflict/u);
  assert.match(route, /idempotentReplay: true/u);
  assert.match(route, /timingSafeEqual/u);
  assert.match(route, /stockInsiderDataPlaneMode\(\) !== 'contabo'/u);
  assert.match(route, /requireActiveVpsWriter/u);
  assert.match(route, /plaintext[.]fill\(0\)/u);
});

test('private Storage restore authenticates streams and publishes only hash-addressed files', () => {
  const local = read('scripts/restore-contabo-private-artifacts.mjs');
  const remote = read('deployment/vps/receive-contabo-private-artifact.mjs');
  assert.match(local, /createDecipheriv\('aes-256-gcm'/u);
  assert.match(local, /spawn\('ssh'.+child[.]stdin/su);
  assert.match(local, /objectHashesVerified: true/u);
  assert.doesNotMatch(local, /writeFile\([^\n]*(?:plaintext|temporary)/u);
  assert.match(remote, /\/var\/lib\/stockinsider\/artifacts/u);
  assert.match(remote, /constants[.]O_NOFOLLOW/u);
  assert.match(remote, /expectedHash[.]slice\(0, 2\)/u);
  assert.match(remote, /hash[.]digest\('hex'\) !== expectedHash/u);
});

test('FinMind bootstrap uses portable encrypted credentials on Contabo', () => {
  const route = read('web/src/app/api/internal/finmind-token-bootstrap/route.ts');
  assert.match(route, /stockInsiderDataPlaneMode\(\) === 'contabo'/u);
  assert.match(route, /replaceProviderCredential/u);
  assert.match(route, /plaintext[.]fill\(0\)/u);
  assert.match(route, /bootstrap_stockinsider_finmind_api_token_v6/u,
    'Supabase compatibility branch remains available until rollback observation ends');
});
