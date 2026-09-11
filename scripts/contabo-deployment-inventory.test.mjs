import assert from 'node:assert/strict';
import test from 'node:test';
import { extractNginxReferences } from './contabo-deployment-inventory.mjs';
import { assessCleanupCandidates } from './contabo-cleanup-preflight.mjs';

test('nginx inventory emits only local routes and filesystem dependencies', () => {
  const references = extractNginxReferences(`
    root /opt/taskbuddy-v539/current;
    proxy_pass http://127.0.0.1:3100/api;
    proxy_pass https://user:password@example.com/private;
    alias /srv/files/$tenant;
  `);
  assert.deepEqual(references.filesystem, ['/opt/taskbuddy-v539/current']);
  assert.deepEqual(references.loopback, ['http://127.0.0.1:3100/api']);
  assert.equal(JSON.stringify(references).includes('password'), false);
});

test('cleanup preflight blocks active references, missing receipts and external prerequisites', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const inventory = { schema: 'stockinsider-contabo-deployment-inventory-v1',
    observedAt: new Date(now).toISOString(), host: 'vmi3152467',
    links: [{ path: '/opt/old/current', target: '/opt/old/releases/a' }], releases: [{ path: '/opt/old/releases/a' }],
    services: [], containers: [], nginx: [{ source: '/etc/nginx/sites-enabled/old',
      references: { filesystem: ['/opt/old/current'], loopback: [] } }] };
  const candidate = { path: '/opt/old', bytes: 100, requires: ['api_migrated'] };
  const policy = { schema: 'stockinsider-all-app-retention-policy-v1', host: 'vmi3152467',
    retainedPaths: ['/opt/current'], candidates: [candidate] };
  const [blocked] = assessCleanupCandidates(inventory, policy, {}, now);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('active_external_reference'));
  assert.ok(blocked.reasons.includes('verified_archive_and_restore_receipts_required'));
  assert.ok(blocked.reasons.includes('external_prerequisite_missing:api_migrated'));
});

test('an explicit unreferenced archived candidate can pass without authorizing deletion', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const inventory = { schema: 'stockinsider-contabo-deployment-inventory-v1',
    observedAt: new Date(now).toISOString(), host: 'vmi3152467',
    links: [{ path: '/opt/old/current', target: '/opt/old/releases/a' }], releases: [{ path: '/opt/old/releases/a' }],
    services: [], containers: [], nginx: [] };
  const receipt = 'a'.repeat(64);
  const policy = { schema: 'stockinsider-all-app-retention-policy-v1', host: 'vmi3152467',
    retainedPaths: ['/opt/current'], candidates: [{ path: '/opt/old', archiveReceiptSha256: receipt,
      restoreReceiptSha256: receipt, requires: ['api_migrated'] }] };
  assert.equal(assessCleanupCandidates(inventory, policy, { api_migrated: true }, now)[0].eligible, true);
});
