import assert from 'node:assert/strict';
import test from 'node:test';
import { assessBackupSet } from './local-backup-set.mjs';
import { assessBackupFreshness } from './local-backup-freshness.mjs';
import { planBackupRotation } from './local-backup-rotation.mjs';

const member = (json, filename, sha256) => ({ json, filename, sha256 });
const valid = () => ({
  database: member({ manifest: { schema: 'stockinsider-database-export-v2', snapshot: null,
    snapshotStrategy: 'pg_dump_internal_consistent_snapshot' }, remoteEphemeralCredentialsRemoved: true,
    contextSha256: 'c', result: { envelopeVerified: true, plaintextSha256: 'p' } }),
  storageInventory: member({ objects: 1, inventoryStable: true, restoreVerified: false,
    receipts: [{ contextSha256: 's' }] }, 'storage-inventory.json', 'inventory-sha'),
  storageManifests: [member({ contextSha256: 's', manifest: { schema: 'stockinsider-storage-export-v1' },
    result: { envelopeVerified: true } })],
  storageRestore: member({ schema: 'stockinsider-storage-restore-rehearsal-v1',
    source: { inventoryFilename: 'storage-inventory.json', inventorySha256: 'inventory-sha' },
    objectsRestored: 1, privateHashAddressedLayoutVerified: true, objectHashesVerified: true,
    temporaryFilesRemoved: true, restoredPlaintextRetained: false }),
  provider: member({ manifest: { schema: 'stockinsider-provider-recovery-v1' }, contextSha256: 'provider-context',
    result: { envelopeVerified: true, plaintextSha256: 'provider-plain' } }, 'provider.manifest.json'),
  providerVerification: member({ schema: 'stockinsider-provider-recovery-verification-v1',
    credentialsDecryptedAndValidated: true, secretsPrinted: false,
    source: { manifestFilename: 'provider.manifest.json', contextSha256: 'provider-context',
      plaintextSha256: 'provider-plain' } }),
  restore: member({ schema: 'stockinsider-contabo-restore-rehearsal-v2', restoreVerified: true,
    applicationValidationPassed: true, source: { plaintextSha256: 'p', contextSha256: 'c' },
    restore: { unixSocketOnly: true, plaintextArchiveWritten: false, ownerAndAclReplay: true,
      portableMigrationApplied: true } }),
});

test('a backup set is complete only after all members and a clean application restore', () => {
  assert.equal(assessBackupSet(valid()).completeSystemBackup, true);
  const legacy = valid(); legacy.database.json.manifest = { schema: 'stockinsider-database-export-v1' };
  assert.equal(assessBackupSet(legacy).completeSystemBackup, true);
  const compact = valid(); compact.database.json.manifest = { schema: 'stockinsider-database-compact-v1',
    compactionPolicyVersion: 'legacy-runtime-v1', sourceBackupId: 'database-source',
    sourceBackupPlaintextSha256: 'a'.repeat(64), compactionReceiptId: 'receipt' };
  assert.equal(assessBackupSet(compact).completeSystemBackup, true);
  compact.database.json.manifest.compactionReceiptId = null;
  assert.ok(assessBackupSet(compact).reasons.includes('database_export_unverified'));
  const partial = valid(); partial.restore.json.applicationValidationPassed = false;
  assert.deepEqual(assessBackupSet(partial).reasons, ['clean_restore_not_verified']);
  const missing = valid(); missing.storageManifests = [];
  assert.ok(assessBackupSet(missing).reasons.includes('storage_members_incomplete'));
});

test('Mac freshness ignores exports that were not restored', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const complete = { manifest: { schema: 'stockinsider-local-backup-set-v2', id: 'one',
    createdAt: '2026-09-11T00:01:00Z', completeSystemBackup: true, restoreVerified: true } };
  assert.equal(assessBackupFreshness([complete], now).fresh, true);
  assert.equal(assessBackupFreshness([{ manifest: { ...complete.manifest, restoreVerified: false } }], now).fresh, false);
  assert.equal(assessBackupFreshness([complete], now + 2 * 86_400_000).reason, 'backup_overdue');
});

test('rotation retains fourteen days, four weekly copies, latest two and all cold unique sets', () => {
  const now = Date.parse('2026-09-11T00:00:00Z');
  const receipts = [];
  for (let day = 0; day < 80; day += 4) receipts.push({ manifest: {
    schema: 'stockinsider-local-backup-set-v2', id: `set-${day}`,
    createdAt: new Date(now - day * 86_400_000).toISOString(), retentionClass: day === 76 ? 'cold-unique' : 'daily',
    completeSystemBackup: true, restoreVerified: true, members: [] } });
  receipts.push({ manifest: { id: 'unverified', completeSystemBackup: false } });
  const plan = planBackupRotation(receipts, now);
  assert.ok(plan.retainedSetIds.includes('set-76'));
  assert.ok(plan.retainedSetIds.includes('set-0'));
  assert.ok(plan.retainedSetIds.includes('set-4'));
  assert.ok(plan.manualReview.includes('unverified'));
  assert.equal(plan.destructiveActionPerformed, false);
  assert.ok(plan.quarantineCandidates.length > 0);
});
