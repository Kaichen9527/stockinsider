import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encryptBackupChunks, BACKUP_ENVELOPE_OVERHEAD_BYTES } from './local-backup-envelope.mjs';
import { LINUX_RESTORE_CONTRACT, LINUX_RESTORE_REQUIREMENTS, prepareLinuxRestoreCandidate, executeLinuxStagingRestore, assessLinuxRestoreCapacityFixture, verifyLinuxRestoreFixture } from '../deployment/staging/vnext/linux-restore-candidate.mjs';

const GiB = 1024 ** 3;
const contextSha256 = 'a'.repeat(64);
// Deliberately public synthetic key bytes; never a production recovery identity.
const fixtureKey = () => Buffer.alloc(32, 0x71);
async function encrypted(plaintext = Buffer.from('NONPRODUCTION_RESTORE_FIXTURE')) {
  const chunks = [];
  for await (const chunk of encryptBackupChunks([plaintext], { key: fixtureKey(), contextSha256, maxPlaintextBytes: 65537 })) chunks.push(chunk);
  return Buffer.concat(chunks);
}
function options(ciphertext, fixtureConsumer = () => {}) {
  return { ciphertext, fixtureKeyChunks: [fixtureKey()], contextSha256, fixtureConsumer };
}
function budget() {
  return { sourceCiphertextBytes: GiB, immutableCiphertextCopyBytes: GiB, expandedArchiveBytes: 2 * GiB, restoredClusterBytes: 3 * GiB, walBytes: GiB, restoreScratchBytes: GiB / 2, oldReleaseBytes: GiB / 8, newReleaseBytes: GiB / 8, growthBytes: 2 * GiB, diskAvailableBytes: 30 * GiB, memoryAvailableBytes: 4 * GiB, memoryPeakBytes: GiB };
}

test('fixed Linux PG17 staging plan and every missing integration remain disabled', () => {
  const result = prepareLinuxRestoreCandidate(structuredClone(LINUX_RESTORE_CONTRACT));
  assert.equal(result.state, 'Disabled');
  assert.equal(result.executionAllowed, false);
  assert.equal(result.restoreVerified, false);
  assert.equal(result.stagingAccepted, false);
  assert.equal(result.plan.platform, 'linux');
  assert.equal(result.plan.postgresMajor, 17);
  assert.equal(result.plan.binaryDirectoryIntent, '/usr/lib/postgresql/17/bin');
  assert.equal(result.plan.locale, 'C');
  assert.equal(result.plan.cluster.listenAddresses, '');
  assert.equal(result.plan.cluster.socketPermissions, '0700');
  assert.equal(result.plan.cluster.inheritedEnvironment, false);
  assert.equal(new Set([result.plan.sourceRootIntent, result.plan.dataRootIntent, result.plan.runtimeRootIntent]).size, 3);
  assert.equal(LINUX_RESTORE_REQUIREMENTS.length, 9);
  assert.ok(LINUX_RESTORE_REQUIREMENTS.every(item => item.state === 'NOT_IMPLEMENTED'));
  assert.throws(() => { result.plan.enabled = true; }, TypeError);
});

test('unknown, missing, substituted executable and production-collision plans reject', () => {
  const patches = [{ enabled: true }, { ready: true }, { platform: 'darwin' }, { postgresMajor: 16 }, { locale: 'en_US.UTF-8' }, { binaryDirectoryIntent: '/opt/homebrew/bin' }, { executable: '/usr/bin/psql' }, { sourceRootIntent: '/opt/stockinsider/current' }, { dataRootIntent: '/var/lib/postgresql/17/main' }, { databaseIntent: 'stockinsider' }, { dbname: 'stockinsider' }, { runtimeRootIntent: '/run/postgresql' }, { socketDirectory: '/run/postgresql' }, { PGHOST: '/run/postgresql' }, { environment: { PGSERVICE: 'production' } }, { keyAccess: 'private-file' }, { cluster: { ...LINUX_RESTORE_CONTRACT.cluster, listenAddresses: '*' } }, { cluster: { ...LINUX_RESTORE_CONTRACT.cluster, inheritedEnvironment: true } }];
  for (const patch of patches) assert.throws(() => prepareLinuxRestoreCandidate({ ...structuredClone(LINUX_RESTORE_CONTRACT), ...patch }), /closed_contract/u);
  const missing = structuredClone(LINUX_RESTORE_CONTRACT); delete missing.hostLock;
  assert.throws(() => prepareLinuxRestoreCandidate(missing), /closed_contract/u);
  assert.throws(() => prepareLinuxRestoreCandidate(), /closed_contract/u);
});

test('duplicate, partial and extra program/member inventories cannot pass a closed plan', () => {
  for (const programs of [['initdb'], [...LINUX_RESTORE_CONTRACT.programs, 'curl'], ['initdb', 'pg_ctl', 'createdb', 'pg_restore', 'pg_restore']]) assert.throws(() => prepareLinuxRestoreCandidate({ ...LINUX_RESTORE_CONTRACT, programs }), /closed_contract/u);
  for (const databaseManifestSchemas of [[], ['stockinsider-database-export-v3'], ['stockinsider-database-export-v3', 'stockinsider-database-export-v3']]) assert.throws(() => prepareLinuxRestoreCandidate({ ...LINUX_RESTORE_CONTRACT, databaseManifestSchemas }), /closed_contract/u);
  const extra = [...LINUX_RESTORE_CONTRACT.programs]; extra.ready = true;
  assert.throws(() => prepareLinuxRestoreCandidate({ ...LINUX_RESTORE_CONTRACT, programs: extra }), /closed_contract/u);
});

test('host facade accepts no FD, callback, configuration or readiness authority', async () => {
  let invoked = false;
  await assert.rejects(executeLinuxStagingRestore(), /not_implemented/u);
  for (const value of [true, { fd: 3 }, { ready: true }, { adapter: () => { invoked = true; } }, LINUX_RESTORE_CONTRACT]) await assert.rejects(executeLinuxStagingRestore(value), /overrides_forbidden/u);
  assert.equal(invoked, false);
  assert.throws(() => prepareLinuxRestoreCandidate(LINUX_RESTORE_CONTRACT, { approval: true }), /closed_contract/u);
});

test('hypothetical full peak retains disk and memory floors without granting host admission', () => {
  const input = budget();
  const costNames = ['sourceCiphertextBytes', 'immutableCiphertextCopyBytes', 'expandedArchiveBytes', 'restoredClusterBytes', 'walBytes', 'restoreScratchBytes', 'oldReleaseBytes', 'newReleaseBytes', 'growthBytes'];
  const peak = costNames.reduce((sum, key) => sum + input[key], 0);
  const exact = { ...input, diskAvailableBytes: peak + 15 * GiB, memoryAvailableBytes: 2.5 * GiB };
  const pass = assessLinuxRestoreCapacityFixture(exact);
  assert.equal(pass.diskPeakFits, true); assert.equal(pass.memoryPeakFits, true);
  assert.equal(pass.executionAllowed, false); assert.equal(pass.hostReservationVerified, false);
  assert.equal(assessLinuxRestoreCapacityFixture({ ...exact, diskAvailableBytes: exact.diskAvailableBytes - 1 }).diskPeakFits, false);
  assert.equal(assessLinuxRestoreCapacityFixture({ ...exact, memoryAvailableBytes: exact.memoryAvailableBytes - 1 }).memoryPeakFits, false);
  assert.equal(assessLinuxRestoreCapacityFixture({ ...exact, oldReleaseBytes: input.oldReleaseBytes + 1 }).diskPeakFits, false);
  assert.equal(assessLinuxRestoreCapacityFixture({ ...exact, newReleaseBytes: input.newReleaseBytes + 1 }).diskPeakFits, false);
  const missing = budget(); delete missing.walBytes;
  for (const bad of [missing, { ...input, ready: true }, { ...input, expandedArchiveBytes: null }, { ...input, restoredClusterBytes: 0 }, { ...input, immutableCiphertextCopyBytes: 0 }, { ...input, oldReleaseBytes: 0 }, { ...input, newReleaseBytes: 0 }, { ...input, diskAvailableBytes: Infinity }, { ...input, walBytes: 0 }, { ...input, restoreScratchBytes: -1 }, { ...input, memoryPeakBytes: GiB - 1 }]) assert.throws(() => assessLinuxRestoreCapacityFixture(bad), /capacity_/u);
});

test('synthetic envelope authenticates before its sole consumer; owned plaintext is wiped afterwards', async () => {
  const ciphertext = await encrypted();
  const original = Buffer.from(ciphertext);
  let received;
  const config = options(ciphertext, plaintext => { received = plaintext; assert.equal(plaintext.toString(), 'NONPRODUCTION_RESTORE_FIXTURE'); });
  const result = await verifyLinuxRestoreFixture(config);
  assert.ok(received.every(byte => byte === 0));
  assert.deepEqual(ciphertext, original);
  assert.deepEqual(config.fixtureKeyChunks[0], fixtureKey());
  assert.equal(result.state, 'FixtureOnly');
  assert.equal(result.envelopeAuthenticatedBeforeConsumer, true);
  assert.equal(result.ownedBuffersCleared, true);
  for (const key of ['plaintextArchiveWritten', 'osKeyFdVerified', 'immutableHostDescriptorVerified', 'restoreVerified', 'stagingAccepted']) assert.equal(result[key], false);
});

test('tampered, truncated, wrong-key/context and oversized input never reaches a consumer', async () => {
  const good = await encrypted();
  const changed = Buffer.from(good); changed[changed.length - 1] ^= 1;
  const changedBody = Buffer.from(good); changedBody[BACKUP_ENVELOPE_OVERHEAD_BYTES - 16] ^= 1;
  let calls = 0;
  const consume = () => { calls++; };
  const variants = [options(changed, consume), options(changedBody, consume), options(good.subarray(0, good.length - 1), consume), options(Buffer.concat([good, Buffer.from([0])]), consume), { ...options(good, consume), contextSha256: 'b'.repeat(64) }, { ...options(good, consume), fixtureKeyChunks: [Buffer.alloc(32, 2)] }, options(Buffer.alloc(BACKUP_ENVELOPE_OVERHEAD_BYTES + 65537), consume), options(Buffer.alloc(BACKUP_ENVELOPE_OVERHEAD_BYTES), consume), options('not-binary', consume)];
  for (const variant of variants) await assert.rejects(verifyLinuxRestoreFixture(variant), /^Error: linux_restore_fixture_rejected$/u);
  assert.equal(calls, 0);
});

test('finite binary key chunks require exactly 32 bytes and cannot introduce an FD/backend', async () => {
  const ciphertext = await encrypted();
  for (const fixtureKeyChunks of [[], [Buffer.alloc(31)], [Buffer.alloc(33)], [Buffer.alloc(16), Buffer.alloc(17)], Array.from({ length: 33 }, () => Buffer.alloc(0)), ['key'], [3]]) await assert.rejects(verifyLinuxRestoreFixture({ ...options(ciphertext), fixtureKeyChunks }), /fixture_rejected/u);
  for (const patch of [{ keyFd: 3 }, { ready: true }, { fixtureKeyChunks: { async *[Symbol.asyncIterator]() { yield fixtureKey(); } } }]) await assert.rejects(verifyLinuxRestoreFixture({ ...options(ciphertext), ...patch }), /fixture_rejected/u);
  const chunks = Array.from({ length: 32 }, () => Buffer.from([0x71]));
  chunks[Symbol.iterator] = () => { throw Error('must_not_iterate_caller_iterator'); };
  assert.equal((await verifyLinuxRestoreFixture({ ...options(ciphertext), fixtureKeyChunks: chunks })).state, 'FixtureOnly');
});

test('private ciphertext/key snapshot survives caller mutation between authentication and replay', async () => {
  const ciphertext = await encrypted();
  let called = false;
  const config = options(ciphertext, plaintext => { called = true; assert.equal(plaintext.toString(), 'NONPRODUCTION_RESTORE_FIXTURE'); });
  const pending = verifyLinuxRestoreFixture(config);
  ciphertext.fill(0); config.fixtureKeyChunks[0].fill(0); config.contextSha256 = 'b'.repeat(64); config.fixtureConsumer = () => { throw Error('replaced'); };
  assert.equal((await pending).state, 'FixtureOnly');
  assert.equal(called, true);
});

test('ciphertext property is captured once before bounded allocation', async () => {
  const ciphertext = await encrypted();
  let reads = 0;
  const config = options(ciphertext);
  Object.defineProperty(config, 'ciphertext', { enumerable: true, get() { reads++; if (reads > 1) throw Error('repeated_property_read'); return ciphertext; } });
  assert.equal((await verifyLinuxRestoreFixture(config)).state, 'FixtureOnly');
  assert.equal(reads, 1);
  const limit = await encrypted(Buffer.alloc(65536, 1));
  assert.equal((await verifyLinuxRestoreFixture(options(limit))).state, 'FixtureOnly');
});

test('consumer errors are sanitized and a fixture deadline wipes owned bytes without a termination claim', async t => {
  const ciphertext = await encrypted();
  let received;
  await assert.rejects(verifyLinuxRestoreFixture(options(ciphertext, plaintext => { received = plaintext; const error = Error('PRIVATE_NONPRODUCTION_DIAGNOSTIC'); error.code = 'EPIPE'; throw error; })), /^Error: linux_restore_fixture_rejected$/u);
  assert.ok(received.every(byte => byte === 0));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let entered;
  const executing = new Promise(resolve => { entered = resolve; });
  const pending = verifyLinuxRestoreFixture(options(ciphertext, plaintext => { received = plaintext; entered(); return new Promise(() => {}); }));
  await executing;
  t.mock.timers.tick(1000);
  await assert.rejects(pending, /fixture_rejected/u);
  assert.ok(received.every(byte => byte === 0));
});

test('candidate source has no process, filesystem, network or inherited environment access', () => {
  const source = fs.readFileSync(new URL('../deployment/staging/vnext/linux-restore-candidate.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:child_process|fs|net|http|https|tls)|process\.(?:env|argv)|\b(?:spawn|execFile|readFile|createReadStream)\s*\(/u);
  assert.ok(source.includes("from '../../../scripts/local-backup-envelope.mjs'"));
  const historical = fs.readFileSync(new URL('./rehearse-contabo-database-restore.mjs', import.meta.url), 'utf8');
  assert.ok(historical.includes("PG_BIN='/opt/homebrew/bin'"));
  assert.ok(historical.includes('authenticationFile.close()'));
  assert.ok(historical.includes('streamArchivePathTo(archivePath'));
});
