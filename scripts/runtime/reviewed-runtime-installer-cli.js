#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalJson, sha256 } = require('./codec');
const { resolveReviewedRuntimeRelease } = require('./reviewed-runtime-release');
const { TRACKED_RUNTIME_PATHS, runtimeBundleSha256,
  runtimeBundleSha256ForPresentMembers } = require('./tracked-runtime-bundle');
const { activateTrackedRuntimeRelease } = require('./auth-source-worker-installation');
const { acquireActivationLock, captureSchedulerRollback, createLocalRuntimePlatform,
  recoverInterruptedActivation } = require('./local-runtime-platform');
const { resolveCredentialReference } = require('./credential-resolver');

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const HOST_PIN_PATH = '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json';
const PREPARED_PATHS = Object.freeze([...TRACKED_RUNTIME_PATHS,
  'config/runtime/auth-source-dag.json', 'package.json', 'package-lock.json',
  'scripts/com.stockinsider.auth-source-worker.plist', HOST_PIN_PATH].sort());

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function git(cwd, args) {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', TZ: 'Asia/Taipei' } }).trim();
}

function parseArguments(argv) {
  const values = { activate: false, prepareOnly: false, sourceCommit: null, attestationCommit: null,
    authorityFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--prepare-only') values.prepareOnly = true;
    else if (value === '--activate') values.activate = true;
    else if (value === '--source-commit' && SHA40.test(argv[index + 1] ?? '')) values.sourceCommit = argv[++index];
    else if (value === '--attestation-commit' && SHA40.test(argv[index + 1] ?? '')) values.attestationCommit = argv[++index];
    else if (value === '--authority-file' && path.isAbsolute(argv[index + 1] ?? '')) values.authorityFile = argv[++index];
    else fail('invalid_arguments');
  }
  if (!values.sourceCommit || !values.attestationCommit) fail('invalid_arguments');
  if (values.prepareOnly === values.activate) fail('production_runtime_activation_authority_required');
  if (values.activate && !values.authorityFile) fail('production_runtime_activation_authority_required');
  return Object.freeze(values);
}

function verifyRegularSource(detachedRoot, repositoryPath) {
  const absolute = path.join(detachedRoot, repositoryPath);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('authoritative_path_invalid');
  const prefix = fs.readFileSync(absolute).subarray(0, 128).toString('utf8');
  if (prefix.startsWith('version https://git-lfs.github.com/spec/v1')) fail('authoritative_path_invalid');
}

function copyReviewedPath(detachedRoot, stagingRoot, repositoryPath) {
  verifyRegularSource(detachedRoot, repositoryPath);
  const target = path.join(stagingRoot, repositoryPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(detachedRoot, repositoryPath), target, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(target, 0o600);
}

function releaseSnapshot(root) {
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('active_runtime_conflict');
  const rows = [];
  const visit = (relative) => {
    const directory = path.join(root, relative);
    for (const name of fs.readdirSync(directory).sort()) {
      const childRelative = relative ? `${relative}/${name}` : name;
      const absolute = path.join(root, childRelative);
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        rows.push([childRelative, 'directory']);
        visit(childRelative);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        rows.push([childRelative, 'file', stat.mode & 0o777, sha256(fs.readFileSync(absolute))]);
      } else if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(absolute);
        const resolved = fs.realpathSync(absolute);
        if (!resolved.startsWith(`${fs.realpathSync(root)}${path.sep}`)) fail('active_runtime_conflict');
        rows.push([childRelative, 'symlink', target]);
      } else fail('active_runtime_conflict');
    }
  };
  visit('');
  return sha256(canonicalJson(rows));
}

function prepareReviewedRelease({ repositoryRoot, sourceCommit, attestationCommit, runtimeRoot }) {
  const reviewedRelease = resolveReviewedRuntimeRelease({ repositoryRoot, sourceCommit, attestationCommit });
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-reviewed-runtime-'));
  const detachedRoot = path.join(temporaryParent, 'source');
  const preparedRoot = path.join(runtimeRoot, 'prepared');
  const stagingRoot = path.join(preparedRoot, `.staging-${crypto.randomBytes(16).toString('hex')}`);
  const finalRoot = path.join(preparedRoot, sourceCommit);
  let worktreeAdded = false;
  try {
    fs.mkdirSync(preparedRoot, { recursive: true, mode: 0o700 });
    git(repositoryRoot, ['worktree', 'add', '--detach', detachedRoot, sourceCommit]);
    worktreeAdded = true;
    if (git(detachedRoot, ['rev-parse', 'HEAD']) !== sourceCommit ||
      git(detachedRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('source_tree_dirty');
    fs.mkdirSync(stagingRoot, { mode: 0o700 });
    for (const repositoryPath of PREPARED_PATHS) copyReviewedPath(detachedRoot, stagingRoot, repositoryPath);
    execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts'], {
      cwd: stagingRoot, stdio: 'inherit', env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: temporaryParent,
        npm_config_cache: path.join(temporaryParent, 'npm-cache'), NODE_ENV: 'production', TZ: 'Asia/Taipei' },
    });
    if (git(detachedRoot, ['status', '--porcelain=v1', '--untracked-files=all']) !== '') fail('source_tree_dirty');
    if (runtimeBundleSha256(stagingRoot) !== reviewedRelease.workerSha256 ||
      sha256(fs.readFileSync(path.join(stagingRoot, 'config/runtime/auth-source-dag.json'))) !== reviewedRelease.configSha256) {
      fail('staged_hash_mismatch');
    }
    const preparation = {
      attestationCommit, commitSha: sourceCommit, configSha256: reviewedRelease.configSha256,
      preparedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
      reviewAttestationSha256: reviewedRelease.reviewAttestationSha256,
      reviewedTreeSha: reviewedRelease.treeSha, schema: 'stockinsider-reviewed-runtime-preparation-v1',
      workerSha256: reviewedRelease.workerSha256,
    };
    fs.writeFileSync(path.join(stagingRoot, 'release-preparation.json'), `${canonicalJson(preparation)}\n`, { flag: 'wx', mode: 0o600 });
    if (fs.existsSync(finalRoot)) {
      const existingText = fs.readFileSync(path.join(finalRoot, 'release-preparation.json'), 'utf8');
      const existing = JSON.parse(existingText);
      if (!exactObject(existing, ['attestationCommit','commitSha','configSha256','preparedAt','reviewAttestationSha256',
        'reviewedTreeSha','schema','workerSha256']) || `${canonicalJson(existing)}\n` !== existingText ||
        existing.schema !== 'stockinsider-reviewed-runtime-preparation-v1' || existing.commitSha !== sourceCommit
        || existing.attestationCommit !== attestationCommit || existing.reviewedTreeSha !== reviewedRelease.treeSha
        || existing.workerSha256 !== reviewedRelease.workerSha256 || existing.configSha256 !== reviewedRelease.configSha256
        || existing.reviewAttestationSha256 !== reviewedRelease.reviewAttestationSha256 ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(existing.preparedAt)) fail('active_runtime_conflict');
      fs.writeFileSync(path.join(stagingRoot, 'release-preparation.json'), existingText, { flag: 'w', mode: 0o600 });
      if (releaseSnapshot(finalRoot) !== releaseSnapshot(stagingRoot)) fail('active_runtime_conflict');
      fs.rmSync(stagingRoot, { recursive: true, force: true });
      return Object.freeze({ ...existing, disposition: 'already_prepared_non_activating', path: finalRoot });
    } else {
      fs.renameSync(stagingRoot, finalRoot);
    }
    return Object.freeze({ ...preparation, disposition: 'prepared_non_activating', path: finalRoot });
  } finally {
    if (worktreeAdded) {
      try { git(repositoryRoot, ['worktree', 'remove', '--force', detachedRoot]); } catch { /* detached temp cleanup only */ }
    }
    fs.rmSync(temporaryParent, { recursive: true, force: true });
    if (fs.existsSync(stagingRoot)) fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function exactObject(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function readCanonical(filename) {
  const text = fs.readFileSync(filename, 'utf8'); const value = JSON.parse(text);
  if (`${canonicalJson(value)}\n` !== text) fail('production_runtime_activation_authority_required');
  return value;
}
function readOwnerOnlyCanonical(filename) {
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
      fail('production_runtime_activation_authority_required');
    }
    const text = fs.readFileSync(descriptor, 'utf8'); const value = JSON.parse(text);
    if (`${canonicalJson(value)}\n` !== text) fail('production_runtime_activation_authority_required');
    return value;
  } catch (error) {
    if (error?.code === 'production_runtime_activation_authority_required') throw error;
    fail('production_runtime_activation_authority_required');
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function pinnedNodeFromReviewedFixture(preparedRoot) {
  const fixture = readCanonical(path.join(preparedRoot, HOST_PIN_PATH));
  const selected = Array.isArray(fixture.executables) ? fixture.executables.find((row) => row?.name === 'node') : null;
  const stat = selected?.path ? fs.lstatSync(selected.path, { bigint: true }) : null;
  if (!selected || typeof selected.path !== 'string' || !path.isAbsolute(selected.path) || !SHA64.test(selected.sha256) ||
    typeof selected.version !== 'string' || fs.realpathSync(selected.path) !== selected.realpath ||
    !stat?.isFile() || stat.isSymbolicLink() || stat.dev.toString() !== selected.stat?.device ||
    stat.ino.toString() !== selected.stat?.inode || stat.size.toString() !== selected.stat?.size ||
    Number(stat.uid) !== selected.stat?.uid || Number(stat.gid) !== selected.stat?.gid ||
    (stat.mode & 0o177777n).toString(8).padStart(6, '0') !== selected.stat?.mode || (stat.mode & 0o022n) !== 0n ||
    sha256(fs.readFileSync(selected.path)) !== selected.sha256 ||
    execFileSync(selected.path, ['--version'], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).trim() !== selected.version) {
    fail('pinned_node_mismatch');
  }
  return selected.path;
}

function renderProposedPlist(preparedRoot, runtimeRoot, commitSha) {
  const template = fs.readFileSync(path.join(preparedRoot, 'scripts/com.stockinsider.auth-source-worker.plist'), 'utf8');
  const current = path.join(runtimeRoot, 'current');
  const rendered = template.replaceAll('__PINNED_NODE22__', pinnedNodeFromReviewedFixture(preparedRoot))
    .replaceAll('__RUNTIME_CURRENT__', current).replaceAll('__RUNTIME_ROOT__', runtimeRoot)
    .replaceAll('__RUNTIME_HOME__', os.homedir())
    .replaceAll('__REVIEWED_COMMIT_SHA__', commitSha);
  if (rendered.includes('__')) fail('scheduler_activation_failed');
  if (!rendered.includes('<string>/usr/bin/env</string>') || !rendered.includes('<string>-i</string>') ||
    rendered.includes('<key>EnvironmentVariables</key>')) fail('scheduler_activation_failed');
  return Buffer.from(rendered);
}

function validateActivationAuthority(authority, options, now = new Date(), resolver = resolveCredentialReference) {
  if (!exactObject(authority, ['approvedAt','approvedBy','attestationCommit','commitSha','expiresAt','mutation','nonce','schema','signature']) ||
    authority.schema !== 'stockinsider-runtime-activation-authority-v2' || authority.approvedBy !== 'repository-owner' ||
    authority.mutation !== 'tracked_runtime_activation' || authority.commitSha !== options.sourceCommit ||
    authority.attestationCommit !== options.attestationCommit || !SHA64.test(authority.signature) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(authority.approvedAt) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(authority.expiresAt) ||
    !/^[0-9a-f]{32}$/u.test(authority.nonce)) fail('production_runtime_activation_authority_required');
  const approved = Date.parse(authority.approvedAt); const expires = Date.parse(authority.expiresAt); const current = now.getTime();
  if (!Number.isFinite(approved) || !Number.isFinite(expires) || approved > current || current > expires ||
    expires - approved > 15 * 60 * 1000) fail('production_runtime_activation_authority_required');
  const unsigned = { ...authority }; delete unsigned.signature;
  const key = resolver('keychain:stockinsider-runtime:activation-authority-hmac');
  const expected = crypto.createHmac('sha256', key).update(canonicalJson(unsigned), 'utf8').digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(authority.signature, 'hex'))) {
    fail('production_runtime_activation_authority_required');
  }
  return authority;
}

function consumeAuthorityNonce(runtimeRoot, authority) {
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  const ledger = path.join(runtimeRoot, 'activation-authority-nonces');
  try { fs.mkdirSync(ledger, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const ledgerStat = fs.lstatSync(ledger);
  if (!ledgerStat.isDirectory() || ledgerStat.isSymbolicLink() || ledgerStat.uid !== process.getuid() ||
    (ledgerStat.mode & 0o077) !== 0) fail('production_runtime_activation_authority_required');
  const filename = path.join(ledger, authority.nonce);
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(descriptor, `${sha256(canonicalJson(authority))}\n`);
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (error?.code === 'EEXIST' || error?.code === 'ELOOP') fail('production_runtime_activation_authority_required');
    throw error;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  const directory = fs.openSync(ledger, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function priorRelease(runtimeRoot) {
  const current = path.join(runtimeRoot, 'current');
  if (!fs.existsSync(current)) return null;
  const stat = fs.lstatSync(current);
  if (!stat.isSymbolicLink()) fail('active_pointer_invalid');
  const resolved = fs.realpathSync(current);
  const releases = fs.realpathSync(path.join(runtimeRoot, 'releases'));
  if (!resolved.startsWith(`${releases}${path.sep}`)) fail('active_pointer_invalid');
  let descriptor;
  try { descriptor = fs.openSync(path.join(resolved, 'installation-manifest.json'), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch { fail('active_pointer_invalid'); }
  const statManifest = fs.fstatSync(descriptor);
  if (!statManifest.isFile() || statManifest.uid !== process.getuid() || (statManifest.mode & 0o077) !== 0) {
    fs.closeSync(descriptor); fail('active_pointer_invalid');
  }
  const bytes = fs.readFileSync(descriptor); fs.closeSync(descriptor);
  const prior = JSON.parse(bytes.toString('utf8'));
  if (!exactObject(prior, ['schema','commitSha','reviewedTreeSha','reviewAttestationSha256','worker','config','installedAt',
    'schedulerRollback','rollback']) || prior.schema !== 'stockinsider-runtime-installation-v1.1' ||
    !exactObject(prior.worker, ['repositoryPath','sha256']) ||
    prior.worker.repositoryPath !== 'scripts/runtime/auth-source-worker-cli.js' || !SHA64.test(prior.worker.sha256) ||
    !exactObject(prior.config, ['repositoryPath','sha256']) ||
    prior.config.repositoryPath !== 'config/runtime/auth-source-dag.json' || !SHA64.test(prior.config.sha256)) {
    fail('active_pointer_invalid');
  }
  let configDescriptor;
  try { configDescriptor = fs.openSync(path.join(resolved, 'config/runtime/auth-source-dag.json'),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch { fail('active_pointer_invalid'); }
  const configStat = fs.fstatSync(configDescriptor);
  const configBytes = fs.readFileSync(configDescriptor); fs.closeSync(configDescriptor);
  if (!configStat.isFile() || configStat.uid !== process.getuid() || (configStat.mode & 0o077) !== 0 ||
    `${canonicalJson(prior)}\n` !== bytes.toString('utf8') || !SHA40.test(prior.commitSha) ||
    path.basename(resolved) !== prior.commitSha ||
    runtimeBundleSha256ForPresentMembers(resolved) !== prior.worker.sha256 ||
    sha256(configBytes) !== prior.config.sha256) {
    fail('active_pointer_invalid');
  }
  return { commitSha: prior.commitSha, manifestSha256: sha256(bytes), releaseDirectoryName: prior.commitSha };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const repositoryRoot = git(__dirname, ['rev-parse', '--show-toplevel']);
  const runtimeRoot = process.env.STOCKINSIDER_RUNTIME_ROOT
    ? path.resolve(process.env.STOCKINSIDER_RUNTIME_ROOT)
    : path.join(os.homedir(), 'Library', 'Application Support', 'StockInsiderRuntime');
  if (options.prepareOnly) {
    const result = prepareReviewedRelease({ repositoryRoot, runtimeRoot, ...options });
    process.stdout.write(`${canonicalJson(result)}\n`);
    return;
  }
  const authority = validateActivationAuthority(readOwnerOnlyCanonical(options.authorityFile), options);
  const activationLock = acquireActivationLock(runtimeRoot);
  try {
    consumeAuthorityNonce(runtimeRoot, authority);
    recoverInterruptedActivation(runtimeRoot);
    const result = prepareReviewedRelease({ repositoryRoot, runtimeRoot, ...options });
    const reviewedRelease = resolveReviewedRuntimeRelease({ repositoryRoot, sourceCommit: options.sourceCommit,
      attestationCommit: options.attestationCommit });
    const proposedPlistBytes = renderProposedPlist(result.path, runtimeRoot, options.sourceCommit);
    const rollbackPackage = captureSchedulerRollback(proposedPlistBytes);
    const manifest = {
      schema: 'stockinsider-runtime-installation-v1.1', commitSha: reviewedRelease.commitSha,
      reviewedTreeSha: reviewedRelease.treeSha, reviewAttestationSha256: reviewedRelease.reviewAttestationSha256,
      worker: { repositoryPath: 'scripts/runtime/auth-source-worker-cli.js', sha256: reviewedRelease.workerSha256 },
      config: { repositoryPath: 'config/runtime/auth-source-dag.json', sha256: reviewedRelease.configSha256 },
      installedAt: new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'),
      schedulerRollback: { releasePath: 'scheduler-rollback-package.json', sha256: rollbackPackage.sha256,
        capturedAt: rollbackPackage.value.capturedAt, priorOwnerCount: 3 }, rollback: priorRelease(runtimeRoot),
    };
    const platform = createLocalRuntimePlatform({ runtimeRoot, preparedRoot: result.path, manifest, reviewedRelease,
      rollbackPackage, proposedPlistBytes });
    const activated = await activateTrackedRuntimeRelease({ manifest, reviewedRelease, ...platform,
      activationAuthority: authority,
      verifyActivationAuthority: (candidate) => {
        validateActivationAuthority(candidate, options);
        return true;
      } });
    process.stdout.write(`${canonicalJson(activated)}\n`);
  } finally {
    activationLock.release();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`reviewed runtime preparation failed: ${error?.code ?? error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { PREPARED_PATHS, consumeAuthorityNonce, parseArguments, pinnedNodeFromReviewedFixture,
  prepareReviewedRelease, releaseSnapshot, renderProposedPlist, validateActivationAuthority };
