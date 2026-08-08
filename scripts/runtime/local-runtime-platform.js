'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { canonicalJson, sha256 } = require('./codec');
const { runtimeBundleSha256 } = require('./tracked-runtime-bundle');
const { observeRuntimeHealth } = require('./runtime-health-observer');

const PRIOR_LABELS = Object.freeze([
  'com.stockinsider.data-collect', 'com.stockinsider.night-shift', 'com.stockinsider.research-daemon',
]);
const OWNER_LABEL = 'com.stockinsider.auth-source-worker';

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function atomicCanonical(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.next-${crypto.randomBytes(16).toString('hex')}`;
  const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
  try { fs.writeFileSync(descriptor, `${canonicalJson(value)}\n`); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filename);
  const directory = fs.openSync(path.dirname(filename), fs.constants.O_RDONLY);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
function fsyncDirectory(directoryPath) {
  const descriptor = fs.openSync(directoryPath, fs.constants.O_RDONLY);
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function acquireActivationLock(runtimeRoot) {
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  const runtimeStat = fs.lstatSync(runtimeRoot);
  if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink() || runtimeStat.uid !== process.getuid() ||
    (runtimeStat.mode & 0o077) !== 0) fail('active_runtime_conflict');
  const lockPath = path.join(runtimeRoot, 'activation.lock');
  const acquired = spawnSync('/usr/bin/shlock', ['-f', lockPath, '-p', String(process.pid)], {
    encoding: 'utf8', env: { PATH: '/usr/bin:/bin' },
  });
  if (acquired.status !== 0) fail('active_runtime_conflict');
  let descriptor;
  try {
    descriptor = fs.openSync(lockPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    fs.fchmodSync(descriptor, 0o600);
    const stat = fs.fstatSync(descriptor);
    const bytes = fs.readFileSync(descriptor, 'utf8');
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 ||
      bytes.trim() !== String(process.pid)) fail('active_runtime_conflict');
    fsyncDirectory(runtimeRoot);
    let released = false;
    return Object.freeze({
      release() {
        if (released) fail('scheduler_rollback_failed');
        const current = fs.lstatSync(lockPath);
        if (!current.isFile() || current.isSymbolicLink() || current.dev !== stat.dev || current.ino !== stat.ino) {
          fail('scheduler_rollback_failed');
        }
        fs.unlinkSync(lockPath);
        fsyncDirectory(runtimeRoot);
        fs.closeSync(descriptor);
        descriptor = undefined;
        released = true;
      },
    });
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try { fs.unlinkSync(lockPath); fsyncDirectory(runtimeRoot); } catch { /* fail closed on the original error */ }
    throw error;
  }
}
function ownedRegularBytes(filename, missingAllowed = false) {
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o022) !== 0) fail('scheduler_capture_invalid');
    return fs.readFileSync(descriptor);
  } catch (error) {
    if (missingAllowed && error?.code === 'ENOENT') return null;
    if (error?.code === 'ELOOP') fail('scheduler_capture_invalid');
    throw error;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
function atomicOwnedFile(filename, bytes) {
  const directoryPath = path.dirname(filename);
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
  const directoryStat = fs.lstatSync(directoryPath);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== process.getuid() ||
    (directoryStat.mode & 0o022) !== 0) fail('scheduler_rollback_failed');
  const temporary = path.join(directoryPath, `.${path.basename(filename)}.next-${crypto.randomBytes(16).toString('hex')}`);
  const descriptor = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
    fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporary, filename);
  fsyncDirectory(directoryPath);
  const installed = ownedRegularBytes(filename);
  if (installed.compare(bytes) !== 0 || sha256(installed) !== sha256(bytes)) fail('scheduler_rollback_failed');
}
function canonicalFile(filename) {
  const text = fs.readFileSync(filename, 'utf8');
  const value = JSON.parse(text);
  if (`${canonicalJson(value)}\n` !== text) fail('manifest_noncanonical');
  return value;
}
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}
function launchctl(args, tolerateMissing = false) {
  const result = spawnSync('/bin/launchctl', args, { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: os.homedir() } });
  if (result.status !== 0 && !tolerateMissing) fail('scheduler_activation_failed');
  return result;
}
function plistPath(label) { return path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`); }
async function startOwnerAndWait(label, maximumSeconds = 1500, dependencies = {}) {
  const invokeLaunchctl = dependencies.launchctl ?? launchctl;
  const waitOneSecond = dependencies.waitOneSecond ?? (() => new Promise((resolve) => setTimeout(resolve, 1000)));
  if (typeof invokeLaunchctl !== 'function' || typeof waitOneSecond !== 'function') fail('scheduler_activation_failed');
  invokeLaunchctl(['start', label]);
  for (let elapsed = 0; elapsed <= maximumSeconds; elapsed += 1) {
    const state = invokeLaunchctl(['list', label]);
    const output = state.stdout ?? '';
    if (!/"PID"\s*=\s*\d+/u.test(output)) {
      const exitStatus = output.match(/"LastExitStatus"\s*=\s*(-?\d+)/u);
      if (exitStatus) {
        if (Number(exitStatus[1]) === 0) return;
        fail('scheduler_activation_failed');
      }
    }
    if (elapsed < maximumSeconds) await waitOneSecond();
  }
  fail('scheduler_activation_failed');
}
async function replaceOwnerAndWait(label, target, proposedPlistBytes, priorOwnerState, dependencies = {}) {
  const invokeLaunchctl = dependencies.launchctl ?? launchctl;
  const installFile = dependencies.atomicOwnedFile ?? atomicOwnedFile;
  const waitForOwner = dependencies.startOwnerAndWait ?? startOwnerAndWait;
  if (typeof invokeLaunchctl !== 'function' || typeof installFile !== 'function' ||
    typeof waitForOwner !== 'function' || !priorOwnerState || typeof priorOwnerState.enabled !== 'boolean') {
    fail('scheduler_activation_failed');
  }
  if (priorOwnerState.enabled) invokeLaunchctl(['unload', target]);
  installFile(target, proposedPlistBytes);
  invokeLaunchctl(['load', target]);
  await waitForOwner(label);
}
function schedulerRow(label) {
  const filename = plistPath(label);
  const bytes = ownedRegularBytes(filename, true);
  const installed = bytes !== null;
  const listed = launchctl(['list', label], true).status === 0;
  const executableMatch = bytes?.toString('utf8').match(/<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/u);
  const executablePath = executableMatch?.[1] ?? null;
  let executableSha256 = null;
  if (executablePath && path.isAbsolute(executablePath)) {
    try {
      const descriptor = fs.openSync(executablePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try { const stat = fs.fstatSync(descriptor); if (stat.isFile() && (stat.mode & 0o022) === 0) executableSha256 = sha256(fs.readFileSync(descriptor)); }
      finally { fs.closeSync(descriptor); }
    } catch { executableSha256 = null; }
  }
  if (installed && (!executablePath || !executableSha256)) fail('scheduler_capture_invalid');
  return { label, installed, enabled: listed, plistSha256: bytes ? sha256(bytes) : null,
    plistBase64: bytes ? bytes.toString('base64') : null, executablePath, executableSha256 };
}
function validateSchedulerRow(row, label) {
  if (!exactKeys(row, ['label','installed','enabled','plistSha256','plistBase64','executablePath','executableSha256']) ||
    row.label !== label || typeof row.installed !== 'boolean' || typeof row.enabled !== 'boolean') fail('scheduler_rollback_failed');
  if (row.installed) {
    if (!/^[0-9a-f]{64}$/u.test(row.plistSha256) || typeof row.plistBase64 !== 'string' ||
      !path.isAbsolute(row.executablePath ?? '') || !/^[0-9a-f]{64}$/u.test(row.executableSha256)) fail('scheduler_rollback_failed');
    const bytes = Buffer.from(row.plistBase64, 'base64');
    if (bytes.toString('base64') !== row.plistBase64 || sha256(bytes) !== row.plistSha256) fail('scheduler_rollback_failed');
  } else if (row.plistSha256 !== null || row.plistBase64 !== null || row.executablePath !== null ||
    row.executableSha256 !== null || row.enabled) fail('scheduler_rollback_failed');
}
function validateRollbackPackage(value) {
  if (!exactKeys(value, ['schema','capturedAt','priorOwners','newOwnerPriorState','proposedOwnerPlist']) ||
    value.schema !== 'stockinsider-scheduler-rollback-v1' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(value.capturedAt) ||
    !Array.isArray(value.priorOwners) || value.priorOwners.length !== PRIOR_LABELS.length ||
    !exactKeys(value.proposedOwnerPlist, ['sha256','base64']) ||
    !/^[0-9a-f]{64}$/u.test(value.proposedOwnerPlist.sha256) ||
    typeof value.proposedOwnerPlist.base64 !== 'string') fail('scheduler_rollback_failed');
  value.priorOwners.forEach((row, index) => validateSchedulerRow(row, PRIOR_LABELS[index]));
  validateSchedulerRow(value.newOwnerPriorState, OWNER_LABEL);
  const proposed = Buffer.from(value.proposedOwnerPlist.base64, 'base64');
  if (proposed.toString('base64') !== value.proposedOwnerPlist.base64 || sha256(proposed) !== value.proposedOwnerPlist.sha256) {
    fail('scheduler_rollback_failed');
  }
}
function captureSchedulerRollback(proposedPlistBytes) {
  if (!Buffer.isBuffer(proposedPlistBytes) || proposedPlistBytes.length < 1) fail('scheduler_capture_invalid');
  const value = { schema: 'stockinsider-scheduler-rollback-v1', capturedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    priorOwners: PRIOR_LABELS.map(schedulerRow), newOwnerPriorState: schedulerRow(OWNER_LABEL),
    proposedOwnerPlist: { sha256: sha256(proposedPlistBytes), base64: proposedPlistBytes.toString('base64') } };
  validateRollbackPackage(value);
  return Object.freeze({ value, bytes: Buffer.from(`${canonicalJson(value)}\n`), sha256: sha256(`${canonicalJson(value)}\n`) });
}
function restoreRow(row) {
  if (![...PRIOR_LABELS, OWNER_LABEL].includes(row?.label)) fail('scheduler_rollback_failed');
  validateSchedulerRow(row, row.label);
  const filename = plistPath(row.label);
  launchctl(['unload', filename], true);
  if (row.installed) {
    const bytes = Buffer.from(row.plistBase64, 'base64');
    if (sha256(bytes) !== row.plistSha256) fail('scheduler_rollback_failed');
    let executable;
    try { executable = fs.openSync(row.executablePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
    catch { fail('scheduler_rollback_failed'); }
    try { if (sha256(fs.readFileSync(executable)) !== row.executableSha256) fail('scheduler_rollback_failed'); }
    finally { fs.closeSync(executable); }
    atomicOwnedFile(filename, bytes);
    if (row.enabled) launchctl(['load', filename]);
  } else {
    const existing = ownedRegularBytes(filename, true);
    if (existing !== null) { fs.renameSync(filename, `${filename}.rollback-quarantine-${Date.now()}`); fsyncDirectory(path.dirname(filename)); }
  }
}

function validateActivationJournal(value, runtimeRoot) {
  if (!exactKeys(value, ['schema','commitSha','phase','priorPointer','priorManifestSha256','priorScheduler','releaseRoot',
    'stagingRoot','rollbackPackageSha256','recordedAt']) || value.schema !== 'stockinsider-runtime-activation-journal-v3' ||
    !/^[0-9a-f]{40}$/u.test(value.commitSha) ||
    !(value.priorPointer === null || /^releases\/[0-9a-f]{40}$/u.test(value.priorPointer)) ||
    !(value.priorManifestSha256 === null || /^[0-9a-f]{64}$/u.test(value.priorManifestSha256)) ||
    (value.priorPointer === null) !== (value.priorManifestSha256 === null) ||
    !['captured','release_published','old_owners_disabled','new_owner_loaded','doctor_passed','complete','rolled_back','recovered'].includes(value.phase) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(value.recordedAt) ||
    value.releaseRoot !== path.join(runtimeRoot, 'releases', value.commitSha) ||
    path.dirname(value.stagingRoot) !== path.join(runtimeRoot, 'releases') ||
    !/^[.]staging-[0-9a-f]{32}$/u.test(path.basename(value.stagingRoot))) fail('scheduler_rollback_failed');
  validateRollbackPackage(value.priorScheduler);
  if (sha256(`${canonicalJson(value.priorScheduler)}\n`) !== value.rollbackPackageSha256) fail('scheduler_rollback_failed');
}
function validatePriorInstallationManifest(manifest, commitSha, failure = 'scheduler_rollback_failed') {
  if (!exactKeys(manifest, ['schema','commitSha','reviewedTreeSha','reviewAttestationSha256','worker','config','installedAt',
    'schedulerRollback','rollback']) || manifest.schema !== 'stockinsider-runtime-installation-v1.1' ||
    manifest.commitSha !== commitSha ||
    !exactKeys(manifest.worker, ['repositoryPath','sha256']) ||
    manifest.worker.repositoryPath !== 'scripts/runtime/auth-source-worker-cli.js' ||
    !/^[0-9a-f]{64}$/u.test(manifest.worker.sha256) ||
    !exactKeys(manifest.config, ['repositoryPath','sha256']) ||
    manifest.config.repositoryPath !== 'config/runtime/auth-source-dag.json' ||
    !/^[0-9a-f]{64}$/u.test(manifest.config.sha256)) fail(failure);
}
function verifyJournalPriorRelease(runtimeRoot, pointer, manifestSha256) {
  if (pointer === null) return;
  const root = path.join(runtimeRoot, pointer);
  const stat = fs.lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('scheduler_rollback_failed');
  const bytes = ownedRegularBytes(path.join(root, 'installation-manifest.json'));
  const manifest = JSON.parse(bytes.toString('utf8'));
  validatePriorInstallationManifest(manifest, path.basename(root));
  const configBytes = ownedRegularBytes(path.join(root, 'config/runtime/auth-source-dag.json'));
  if (`${canonicalJson(manifest)}\n` !== bytes.toString('utf8') || sha256(bytes) !== manifestSha256 ||
    runtimeBundleSha256(root) !== manifest.worker.sha256 || sha256(configBytes) !== manifest.config.sha256) {
    fail('scheduler_rollback_failed');
  }
}
function restoreJournalPointer(runtimeRoot, pointer, manifestSha256) {
  const current = path.join(runtimeRoot, 'current');
  const next = path.join(runtimeRoot, 'current.next');
  if (fs.existsSync(next)) fail('scheduler_rollback_failed');
  if (pointer === null) {
    if (fs.existsSync(current)) fs.renameSync(current, `${current}.rollback-quarantine-${Date.now()}`);
  } else {
    verifyJournalPriorRelease(runtimeRoot, pointer, manifestSha256);
    fs.symlinkSync(pointer, next); fs.renameSync(next, current);
  }
  fsyncDirectory(runtimeRoot);
}
function cleanupJournalPaths(runtimeRoot, value) {
  const releasesRoot = path.join(runtimeRoot, 'releases');
  for (const candidate of [value.stagingRoot, value.releaseRoot]) {
    if (fs.existsSync(candidate) && (!fs.existsSync(path.join(runtimeRoot, 'current')) ||
      fs.realpathSync(path.join(runtimeRoot, 'current')) !== fs.realpathSync(candidate))) {
      fs.renameSync(candidate, `${candidate}.rollback-quarantine-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    }
  }
  fsyncDirectory(releasesRoot);
}
function recoverInterruptedActivation(runtimeRoot) {
  const journalPath = path.join(runtimeRoot, 'activation-journal.json');
  if (!fs.existsSync(journalPath)) return false;
  const prior = canonicalFile(journalPath);
  validateActivationJournal(prior, runtimeRoot);
  if (['complete','rolled_back','recovered'].includes(prior.phase)) return false;
  restoreRow(prior.priorScheduler.newOwnerPriorState);
  for (const row of [...prior.priorScheduler.priorOwners].reverse()) restoreRow(row);
  restoreJournalPointer(runtimeRoot, prior.priorPointer, prior.priorManifestSha256);
  cleanupJournalPaths(runtimeRoot, prior);
  atomicCanonical(journalPath, { ...prior, phase: 'recovered', recordedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z') });
  return true;
}

function createLocalRuntimePlatform({ runtimeRoot, preparedRoot, manifest, reviewedRelease, rollbackPackage, proposedPlistBytes }) {
  const releasesRoot = path.join(runtimeRoot, 'releases');
  const releaseRoot = path.join(releasesRoot, manifest.commitSha);
  const stagingRoot = path.join(releasesRoot, `.staging-${crypto.randomBytes(16).toString('hex')}`);
  const current = path.join(runtimeRoot, 'current');
  let priorPointer = null;
  const verifyPriorPointer = (pointer) => {
    if (pointer === null) { if (manifest.rollback !== null) fail('active_pointer_invalid'); return; }
    if (!manifest.rollback || pointer !== `releases/${manifest.rollback.releaseDirectoryName}`) fail('active_pointer_invalid');
    const priorRoot = path.join(runtimeRoot, pointer);
    const rootStat = fs.lstatSync(priorRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('active_pointer_invalid');
    const manifestBytes = ownedRegularBytes(path.join(priorRoot, 'installation-manifest.json'));
    const priorManifest = JSON.parse(manifestBytes.toString('utf8'));
    validatePriorInstallationManifest(priorManifest, manifest.rollback.commitSha, 'active_pointer_invalid');
    const configBytes = ownedRegularBytes(path.join(priorRoot, 'config/runtime/auth-source-dag.json'));
    if (`${canonicalJson(priorManifest)}\n` !== manifestBytes.toString('utf8') ||
      sha256(manifestBytes) !== manifest.rollback.manifestSha256 ||
      priorManifest.commitSha !== manifest.rollback.commitSha ||
      runtimeBundleSha256(priorRoot) !== priorManifest.worker.sha256 ||
      sha256(configBytes) !== priorManifest.config.sha256) {
      fail('active_pointer_invalid');
    }
  };
  const filesystem = {
    captureActivePointer: async () => {
      if (!fs.existsSync(current)) return null;
      const stat = fs.lstatSync(current); if (!stat.isSymbolicLink()) fail('active_pointer_invalid');
      priorPointer = fs.readlinkSync(current);
      if (!/^releases\/[0-9a-f]{40}$/u.test(priorPointer) ||
        fs.realpathSync(current) !== fs.realpathSync(path.join(runtimeRoot, priorPointer))) fail('active_pointer_invalid');
      verifyPriorPointer(priorPointer);
      return priorPointer;
    },
    stage: async () => {
      fs.mkdirSync(releasesRoot, { recursive: true, mode: 0o700 });
      if (fs.existsSync(releaseRoot) || fs.existsSync(stagingRoot)) fail('active_runtime_conflict');
      fs.cpSync(preparedRoot, stagingRoot, { recursive: true, dereference: false, errorOnExist: true, force: false });
      fs.writeFileSync(path.join(stagingRoot, 'scheduler-rollback-package.json'), rollbackPackage.bytes, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(stagingRoot, 'installation-manifest.json'), `${canonicalJson(manifest)}\n`, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(path.join(stagingRoot, 'com.stockinsider.auth-source-worker.plist'), proposedPlistBytes, { flag: 'wx', mode: 0o600 });
      fsyncDirectory(stagingRoot);
    },
    verifyStaged: async () => {
      if (runtimeBundleSha256(stagingRoot) !== reviewedRelease.workerSha256 ||
        sha256(fs.readFileSync(path.join(stagingRoot, 'config/runtime/auth-source-dag.json'))) !== reviewedRelease.configSha256 ||
        sha256(fs.readFileSync(path.join(stagingRoot, 'scheduler-rollback-package.json'))) !== manifest.schedulerRollback.sha256 ||
        rollbackPackage.value.schema !== 'stockinsider-scheduler-rollback-v1' ||
        rollbackPackage.value.proposedOwnerPlist.sha256 !== sha256(proposedPlistBytes) ||
        Buffer.from(rollbackPackage.value.proposedOwnerPlist.base64, 'base64').compare(proposedPlistBytes) !== 0 ||
        canonicalJson(canonicalFile(path.join(stagingRoot, 'installation-manifest.json'))) !== canonicalJson(manifest)) fail('staged_hash_mismatch');
    },
    publishRelease: async () => {
      fs.renameSync(stagingRoot, releaseRoot);
      fsyncDirectory(releasesRoot);
      const next = path.join(runtimeRoot, 'current.next');
      if (fs.existsSync(next)) fail('active_pointer_invalid');
      fs.symlinkSync(path.relative(runtimeRoot, releaseRoot), next);
      fs.renameSync(next, current);
      fsyncDirectory(runtimeRoot);
    },
    writeHealthObservation: async (observation) => atomicCanonical(path.join(current, 'runtime-health-observation.json'), observation),
    restoreActivePointer: async (pointer) => {
      const next = path.join(runtimeRoot, 'current.next');
      if (fs.existsSync(next)) fail('scheduler_rollback_failed');
      if (pointer === null) {
        if (fs.existsSync(current)) fs.renameSync(current, `${current}.rollback-quarantine-${Date.now()}`);
      } else { verifyPriorPointer(pointer); fs.symlinkSync(pointer, next); fs.renameSync(next, current); }
      fsyncDirectory(runtimeRoot);
      if (pointer !== null && fs.readlinkSync(current) !== pointer) fail('scheduler_rollback_failed');
    },
    cleanupIncomplete: async (state = { stagingRoot, releaseRoot, commitSha: manifest.commitSha }) => {
      const expectedRelease = path.join(releasesRoot, state.commitSha);
      if (path.dirname(state.stagingRoot) !== releasesRoot ||
        !/^[.]staging-[0-9a-f]{32}$/u.test(path.basename(state.stagingRoot)) ||
        state.releaseRoot !== expectedRelease) fail('scheduler_rollback_failed');
      if (fs.existsSync(state.stagingRoot)) fs.renameSync(state.stagingRoot, `${state.stagingRoot}.rollback-quarantine-${Date.now()}`);
      if (fs.existsSync(state.releaseRoot) && (!fs.existsSync(current) || fs.realpathSync(current) !== fs.realpathSync(state.releaseRoot))) {
        fs.renameSync(state.releaseRoot, `${state.releaseRoot}.rollback-quarantine-${Date.now()}`);
      }
      fsyncDirectory(releasesRoot);
    },
  };
  const scheduler = {
    capture: async () => rollbackPackage.value,
    disablePriorOwners: async (snapshot) => {
      if (canonicalJson(snapshot.priorOwners.map(({ label }) => schedulerRow(label))) !== canonicalJson(snapshot.priorOwners)) {
        fail('scheduler_snapshot_changed');
      }
      for (const row of snapshot.priorOwners) if (row.enabled) launchctl(['unload', plistPath(row.label)]);
    },
    loadNewOwner: async () => {
      if (canonicalJson(schedulerRow(OWNER_LABEL)) !== canonicalJson(rollbackPackage.value.newOwnerPriorState)) {
        fail('scheduler_snapshot_changed');
      }
      const target = plistPath(OWNER_LABEL);
      await replaceOwnerAndWait(OWNER_LABEL, target, proposedPlistBytes,
        rollbackPackage.value.newOwnerPriorState);
    },
    doctor: async () => {
      const schedulerRows = [...PRIOR_LABELS, OWNER_LABEL].map(schedulerRow);
      return observeRuntimeHealth({ releaseRoot, runtimeRoot, manifest, reviewedRelease, proposedPlistBytes,
        rollbackPackage, schedulerRows });
    },
    restore: async (snapshot) => {
      validateRollbackPackage(snapshot);
      restoreRow(snapshot.newOwnerPriorState);
      for (const row of [...snapshot.priorOwners].reverse()) restoreRow(row);
    },
  };
  const journalPath = path.join(runtimeRoot, 'activation-journal.json');
  let journalContext = null;
  const journal = {
    recover: async () => { recoverInterruptedActivation(runtimeRoot); },
    begin: async ({ priorScheduler, priorPointer }) => {
      journalContext = { commitSha: manifest.commitSha, priorScheduler, priorPointer,
        priorManifestSha256: manifest.rollback?.manifestSha256 ?? null, releaseRoot, stagingRoot };
      atomicCanonical(journalPath, { schema: 'stockinsider-runtime-activation-journal-v3', commitSha: manifest.commitSha,
        phase: 'captured', priorPointer, priorManifestSha256: manifest.rollback?.manifestSha256 ?? null,
        priorScheduler, releaseRoot, stagingRoot,
        rollbackPackageSha256: rollbackPackage.sha256,
        recordedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z') });
    },
    write: async (phase) => {
      if (!journalContext) fail('scheduler_activation_failed');
      atomicCanonical(journalPath, { schema: 'stockinsider-runtime-activation-journal-v3', commitSha: manifest.commitSha,
        phase, ...journalContext, rollbackPackageSha256: rollbackPackage.sha256,
        recordedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z') });
    },
    rollback: async () => atomicCanonical(journalPath, { schema: 'stockinsider-runtime-activation-journal-v3',
      commitSha: manifest.commitSha, phase: 'rolled_back', ...(journalContext ?? {}),
      rollbackPackageSha256: rollbackPackage.sha256,
      recordedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z') }),
  };
  return Object.freeze({ filesystem, journal, scheduler });
}

module.exports = { OWNER_LABEL, PRIOR_LABELS, acquireActivationLock, atomicCanonical, captureSchedulerRollback,
  createLocalRuntimePlatform, ownedRegularBytes, recoverInterruptedActivation, replaceOwnerAndWait, startOwnerAndWait,
  validateActivationJournal, validateRollbackPackage };
