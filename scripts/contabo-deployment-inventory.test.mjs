import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { extractNginxReferences } from './contabo-deployment-inventory.mjs';
import { assessCleanupCandidates, verifyCleanupEvidence } from './contabo-cleanup-preflight.mjs';
import { CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';

const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);

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
    links: [{ path: '/opt/old/current', target: '/opt/old/releases/a' }],
    releases: [{ path: '/opt/old/releases/a' }],
    services: [], containers: [], nginx: [{ source: '/etc/nginx/sites-enabled/old',
      references: { filesystem: ['/opt/old/current'], loopback: [] } }] };
  const candidate = { path: '/opt/old/releases/a', bytes: 100, requires: ['api_migrated'] };
  const policy = { schema: 'stockinsider-all-app-retention-policy-v1', host: 'vmi3152467',
    retainedPaths: ['/opt/current'], candidates: [candidate] };
  const [blocked] = assessCleanupCandidates(inventory, policy, {}, {}, now);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('active_external_reference'));
  assert.ok(blocked.reasons.includes('verified_archive_and_restore_receipts_required'));
  assert.ok(blocked.reasons.includes('external_prerequisite_missing:api_migrated'));
});

test('an explicit unreferenced archived candidate can pass without authorizing deletion', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const inventory = { schema: 'stockinsider-contabo-deployment-inventory-v1',
    observedAt: new Date(now).toISOString(), host: 'vmi3152467',
    links: [], releases: [{ path: '/opt/old/releases/a' }],
    services: [], containers: [], nginx: [] };
  const receipt = 'a'.repeat(64);
  const policy = { schema: 'stockinsider-all-app-retention-policy-v1', host: 'vmi3152467',
    retainedPaths: ['/opt/current'], candidates: [{ path: '/opt/old/releases/a', archiveReceiptSha256: receipt,
      restoreReceiptSha256: receipt, requires: ['api_migrated'] }] };
  assert.equal(assessCleanupCandidates(inventory, policy, { api_migrated: true },
    { '/opt/old/releases/a': true }, now)[0].eligible, true);
});

test('cleanup evidence hashes and semantically binds the exact remote release to its restore', () => {
  const file = { path: 'server.js', bytes: 1, mode: 0o600, mtimeMs: 0,
    sha256: createHash('sha256').update('x').digest('hex') };
  const tree = { schema: 'stockinsider-vps-release-tree-v1', releasePath: '/opt/app/releases/a',
    fileCount: 1, totalBytes: 1, files: [file] };
  tree.treeSha256 = createHash('sha256').update(canonical(tree)).digest('hex');
  const manifest = { schema: 'stockinsider-vps-release-export-v1', host: '5.104.83.211',
    releasePath: '/opt/app/releases/a', tree, plaintextStoredOnMac: false,
    externalSecretsArchived: false, remoteDeletePerformed: false };
  const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const plaintextSha256 = createHash('sha256').update('tar').digest('hex');
  const archive = { manifest, contextSha256, postTreeSha256: tree.treeSha256, treeStable: true,
    result: { plaintextSha256, plaintextBytes: 10240 } };
  const restore = { schema: 'stockinsider-vps-release-restore-v1', host: '5.104.83.211',
    releasePath: '/opt/app/releases/a', sourceContextSha256: contextSha256,
    sourcePlaintextSha256: plaintextSha256, treeSha256: tree.treeSha256,
    fileCount: 1, totalBytes: 1, symlinkCount: 0, externalSecretSymlinkCount: 0,
    externalSecretRebindRequired: false, externalSecretRebindPolicies: [],
    externalSecretBytesArchived: 0, externalSecretsArchived: false,
    deploymentReconstructionPlanVerified: true,
    restoreVerified: true, plaintextPersistedAfterVerification: false,
    temporaryRestoreRemoved: true, remoteDeletePerformed: false };
  const archiveBytes = Buffer.from(JSON.stringify(archive)), restoreBytes = Buffer.from(JSON.stringify(restore));
  const candidate = { path: '/opt/app/releases/a',
    archiveReceiptPath: `${CONFIRMED_BACKUP_DIRECTORY}/archive.json`,
    restoreReceiptPath: `${CONFIRMED_BACKUP_DIRECTORY}/restore.json`,
    archiveReceiptSha256: createHash('sha256').update(archiveBytes).digest('hex'),
    restoreReceiptSha256: createHash('sha256').update(restoreBytes).digest('hex') };
  assert.equal(verifyCleanupEvidence(candidate, archiveBytes, restoreBytes), true);
  assert.equal(verifyCleanupEvidence({ ...candidate, path: '/opt/app/releases/b' }, archiveBytes, restoreBytes), false);
});

test('Minday legacy release cannot become eligible before its redacted secret is migrated', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const releasePath = '/opt/minday-admin-console-releases/20260803T153606Z';
  const inventory = { schema: 'stockinsider-contabo-deployment-inventory-v1',
    observedAt: new Date(now).toISOString(), host: 'vmi3152467', links: [],
    releases: [{ path: releasePath }], services: [], containers: [], nginx: [] };
  const policy = { schema: 'stockinsider-all-app-retention-policy-v1', host: 'vmi3152467',
    retainedPaths: [], candidates: [{ path: releasePath }] };
  const [blocked] = assessCleanupCandidates(inventory, policy, {}, { [releasePath]: true }, now);
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('external_prerequisite_missing:minday_admin_secret_migration_verified'));
  assert.equal(assessCleanupCandidates(inventory, policy,
    { minday_admin_secret_migration_verified: true }, { [releasePath]: true }, now)[0].eligible, true);
});
