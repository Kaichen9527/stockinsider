import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { accessSync, chmodSync, constants as fsConstants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { canonicalJson } from '../../web/src/lib/opportunity-v3/canonical.ts';
import { compactRadarEtag, selectCompactRadarProjectionRows, validateCompactRadarProjectionRow } from '../../web/src/lib/opportunity-v3/compact-radar-validation.ts';
import { validateIngestionValuesV3 } from '../../web/src/lib/opportunity-v3/request-values.ts';
import { runControlledProjectionPerformanceOracle } from './performance-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const change = path.join(root, '.loop-engineering/state/changes/source-led-opportunity-engine-v3');
const inventory = JSON.parse(readFileSync(path.join(change, 'acceptance-tests.json'), 'utf8'));
const expectedIds = Array.from({ length: 31 }, (_, index) => `PCR-${String(index + 1).padStart(3, '0')}`);
const baselineMode = process.env.OPPORTUNITY_V3_PCR_PREIMPLEMENTATION_BASELINE === 'round85-requirements-only';
const baselineCase = process.env.OPPORTUNITY_V3_ACCEPTANCE_CASE;

if (baselineMode) {
  assert.equal(
    process.env.OPPORTUNITY_V3_ACCEPTANCE_TRACK,
    'requirements_baseline',
    'PCR baseline mode is reserved for the Requirements traceability oracle',
  );
  assert.equal(
    process.env.OPPORTUNITY_V3_ACCEPTANCE_OWNER_CHILD,
    'true',
    'PCR baseline mode is reserved for a traceability owner child',
  );
  assert.match(baselineCase ?? '', /^PCR-(?:00[1-9]|0[12][0-9]|03[01])$/u, 'PCR baseline case identity');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureFor(item) {
  const fixture = {
    id: item.id,
    requirement: item.requirement,
    layer: item.layer,
    setup: item.setup,
    expected: item.expected,
  };
  return {
    ...fixture,
    fixtureSha256: sha256(canonicalJson([
      'source-led-opportunity-product-correctness-fixture-v1',
      fixture.id,
      fixture.requirement,
      fixture.layer,
      fixture.setup,
      fixture.expected,
    ])),
  };
}

const fixtures = inventory.cases
  .filter((item) => item.id.startsWith('PCR-'))
  .map(fixtureFor);

assert.deepEqual(fixtures.map(({ id }) => id), expectedIds, 'PCR fixture IDs are closed and ordered');
for (const fixture of fixtures) {
  assert.match(fixture.requirement, /\S/u, `${fixture.id} requirement`);
  assert.match(fixture.layer, /\S/u, `${fixture.id} layer`);
  assert.match(fixture.setup, /\S/u, `${fixture.id} setup`);
  assert.match(fixture.expected, /\S/u, `${fixture.id} expected`);
  assert.match(fixture.fixtureSha256, /^[0-9a-f]{64}$/u, `${fixture.id} fixture SHA-256`);
}

const boundaryContract = JSON.parse(readFileSync(path.join(change, 'pcr-implementation-boundaries-v3.json'), 'utf8'));
assert.equal(boundaryContract.schema, 'source-led-opportunity-pcr-implementation-boundaries-v1');
assert.equal(boundaryContract.version, 'source-led-opportunity-pcr-boundaries-v3.11.4');
const plannedBoundaries = Object.freeze(Object.fromEntries(
  boundaryContract.boundaries.map((boundary) => [boundary.id, boundary]),
));
assert.deepEqual(Object.keys(plannedBoundaries), expectedIds, 'PCR planned behavior boundaries are closed and ordered');

const require = createRequire(import.meta.url);
const runtime = (name) => require(path.join(root, 'scripts/runtime', name));

function citedPublicationEvidence(ref,evaluatedAt='2026-08-01T10:20:00Z'){
  return {claimId:ref,sourceKey:'mops',sourceName:'公開資訊觀測站',sourceUrl:'https://mops.twse.com.tw/mops/web/index',
    claimAsOf:'2026-08-01T09:00:00Z',sourcePublishedAt:'2026-08-01T09:00:00Z',
    sourceCollectedAt:'2026-08-01T10:00:00Z',analysisGeneratedAt:evaluatedAt,
    decisionBrief:{thesis:['官方來源形成可追溯研究依據。','本次評估保留來源與時點。','決策與揭露共用相同 revision。'],
      risks:['資料更新可能改變判斷。','技術條件失效時不得進場。','缺少估值時只保留研究訊號。'],evidence:[
        {point:'thesis:0',refs:[ref]},{point:'thesis:1',refs:[ref]},{point:'thesis:2',refs:[ref]},
        {point:'risk:0',refs:[ref]},{point:'risk:1',refs:[ref]},{point:'risk:2',refs:[ref]}]}};
}

function assertImplementedBehaviorBoundary(fixture) {
  const boundary = plannedBoundaries[fixture.id];
  assert.ok(boundary, `${fixture.id} implementation behavior boundary`);
  assert.equal(boundary.implementationState, 'implemented', `${fixture.id} implementation must be recorded`);
  for (const [label, value] of [
    ['operation', boundary.operation],
    ['owner path', boundary.owner?.path],
    ['owner export', boundary.owner?.export],
    ['caller path', boundary.caller?.path],
    ['caller function', boundary.caller?.function],
    ['effect', boundary.effect],
  ]) assert.match(value ?? '', /\S/u, `${fixture.id} ${label}`);
  assert.notEqual(boundary.owner.path, boundary.caller.path,
    `${fixture.id} caller must be a real boundary, not a same-file token`);
  assert.notEqual(boundary.owner.export, boundary.caller.function,
    `${fixture.id} caller must be a result dependency, not the owner declaration`);
  assert.doesNotMatch(boundary.effect, /(?:token-only|regex-only|nonempty file|placeholder)/iu,
    `${fixture.id} effect cannot be a superficial proof`);
  const ownerPath = path.join(root, boundary.owner.path);
  const callerPath = boundary.caller.path.startsWith('protected://') ? null : path.join(root, boundary.caller.path);
  assert.ok(readFileSync(ownerPath, 'utf8').includes(boundary.owner.export), `${fixture.id} owner export exists`);
  if (callerPath) assert.ok(readFileSync(callerPath, 'utf8').includes(boundary.owner.export) || readFileSync(callerPath, 'utf8').includes(boundary.caller.function), `${fixture.id} caller is implemented`);
  return boundary;
}

function seeds() { return [...runtime('source-run-config.js').LEGACY_SEED_SYMBOLS]; }
function ohlcv(count = 122, transform = (row) => row) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.05 + 2 * Math.sin(index / 3);
    return transform({ session: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      open: close - 0.2, high: close + 1, low: close - 1, close, volume: 1000 + index }, index);
  });
}
function runtimeRelease() {
  const reviewedRelease = { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), reviewAttestationSha256: 'c'.repeat(64), workerSha256: 'd'.repeat(64), configSha256: 'e'.repeat(64) };
  const manifest = { schema: 'stockinsider-runtime-installation-v1.1', commitSha: reviewedRelease.commitSha, reviewedTreeSha: reviewedRelease.treeSha,
    reviewAttestationSha256: reviewedRelease.reviewAttestationSha256, worker: { repositoryPath: 'scripts/runtime/auth-source-worker-cli.js', sha256: reviewedRelease.workerSha256 },
    config: { repositoryPath: 'config/runtime/auth-source-dag.json', sha256: reviewedRelease.configSha256 }, installedAt: '2026-08-01T04:30:00Z',
    schedulerRollback: { releasePath: 'scheduler-rollback-package.json', sha256: 'f'.repeat(64), capturedAt: '2026-08-01T04:20:00Z', priorOwnerCount: 3 }, rollback: null };
  return { manifest, reviewedRelease };
}
function passingRuntimeDoctor(manifest, reviewedRelease) {
  return { status: 'pass', observation: {
    activationJournalComplete: true, activePointerValid: true, competingOwners: [],
    configSha256: reviewedRelease.configSha256, consumerCommitSha: reviewedRelease.commitSha,
    consumerCompatibility: 'compatible', lastRunNonterminal: false, lastTerminalRunAt: '2026-08-01T04:30:00Z',
    lastTerminalStatus: 'success', leaseStatus: 'absent', manifestCanonical: true, manifestPresent: true,
    negativeRunDuration: false, ownerPlistSha256: '9'.repeat(64), projectionAsOf: '2026-08-01T04:30:00Z',
    projectionChecksum: '8'.repeat(64), projectionFreshness: 'fresh',
    reviewAttestationSha256: reviewedRelease.reviewAttestationSha256,
    schedulerOwner: 'com.stockinsider.auth-source-worker', schedulerPlistSha256: '9'.repeat(64),
    schedulerRollbackPackagePresent: true, schedulerRollbackPackageSha256: manifest.schedulerRollback.sha256,
    stateSchema: 'stockinsider-producer-state-v1', stuckRunCount: 0, workerSha256: reviewedRelease.workerSha256,
  } };
}
const testActivationProof = Object.freeze({
  activationAuthority: Object.freeze({ schema: 'test-authority' }),
  verifyActivationAuthority: async () => true,
});
function peRows(count, stockId = 'subject') {
  return Array.from({ length: count }, (_, index) => ({ stockId, authority: 'official', value: 8 + index / 1000,
    asOf: new Date(Date.UTC(2020, 0, index + 1)).toISOString(), tradingSessionAuthorityHash: 'a'.repeat(64) }));
}

const checks = {
  'PCR-001': async () => {
    const { manifest, reviewedRelease } = runtimeRelease(); const calls = [];
    const result = await runtime('auth-source-worker-installer.js').installTrackedAuthSourceWorker({ manifest, reviewedRelease,
      filesystem: { stage: async () => calls.push('stage'), verifyStaged: async () => calls.push('verify') } });
    assert.equal(result.disposition, 'prepared'); assert.deepEqual(calls, ['stage', 'verify']);
    assert.equal(readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')).length, 1226);
    assert.ok(!readFileSync(path.join(root, 'scripts/runtime/auth-source-worker-cli.js'), 'utf8').includes('.agent/'));
    const bundle = runtime('tracked-runtime-bundle.js');
    assert.deepEqual([...bundle.TRACKED_RUNTIME_PATHS].sort(), bundle.TRACKED_RUNTIME_PATHS);
    assert.equal(bundle.TRACKED_RUNTIME_PATHS.length, 45);
    assert.equal(bundle.runtimeBundleSha256(root), sha256(bundle.runtimeBundleBytes(root)));
    assert.ok(bundle.TRACKED_RUNTIME_PATHS.includes('scripts/runtime/auth-source-worker-cli.js'));
    assert.ok(bundle.TRACKED_RUNTIME_PATHS.includes('scripts/runtime/tracked-runtime-bundle.js'));
    const bundleRoot = mkdtempSync(path.join(os.tmpdir(), 'runtime-bundle-nofollow-'));
    try {
      for (const repositoryPath of bundle.TRACKED_RUNTIME_PATHS) {
        const filename = path.join(bundleRoot, repositoryPath);
        mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
        writeFileSync(filename, `${repositoryPath}\n`, { mode: 0o600 });
      }
      const completeBundleSha = bundle.runtimeBundleSha256(bundleRoot);
      assert.match(completeBundleSha, /^[0-9a-f]{64}$/u);
      assert.equal(bundle.runtimeBundleSha256ForPresentMembers(bundleRoot), completeBundleSha);
      for (const additiveMember of [
        'scripts/runtime/market-analysis.js',
        'scripts/runtime/official-twse-valuation.js',
        'scripts/runtime/underreaction-score.js',
      ]) unlinkSync(path.join(bundleRoot, additiveMember));
      assert.throws(() => bundle.runtimeBundleSha256(bundleRoot), { code: 'ENOENT' });
      const predecessorBundleSha = bundle.runtimeBundleSha256ForPresentMembers(bundleRoot);
      assert.match(predecessorBundleSha, /^[0-9a-f]{64}$/u);
      assert.notEqual(predecessorBundleSha, completeBundleSha);
      const linkedPath = path.join(bundleRoot, bundle.TRACKED_RUNTIME_PATHS[0]);
      unlinkSync(linkedPath);
      symlinkSync(path.join(bundleRoot, bundle.TRACKED_RUNTIME_PATHS[1]), linkedPath);
      assert.throws(() => bundle.runtimeBundleSha256(bundleRoot), /runtime bundle path escapes root/u);
    } finally { rmSync(bundleRoot, { recursive: true, force: true }); }
    const installerCli = runtime('reviewed-runtime-installer-cli.js');
    assert.deepEqual(installerCli.parseArguments(['--prepare-only','--source-commit','1'.repeat(40),
      '--attestation-commit','2'.repeat(40)]), { activate: false, prepareOnly: true, sourceCommit: '1'.repeat(40),
      attestationCommit: '2'.repeat(40), authorityFile: null });
    assert.throws(() => installerCli.parseArguments(['--source-commit','1'.repeat(40), '--attestation-commit','2'.repeat(40)]),
      { code: 'production_runtime_activation_authority_required' });
    assert.throws(() => installerCli.parseArguments(['--activate','--source-commit','1'.repeat(40),
      '--attestation-commit','2'.repeat(40),'--authority-file','/tmp/authority.json','--doctor-observation','/tmp/fake.json']),
    { code: 'invalid_arguments' });
    const authorityOptions = { sourceCommit: '1'.repeat(40), attestationCommit: '2'.repeat(40) };
    const authorityUnsigned = { approvedAt: '2026-08-01T04:00:00Z', approvedBy: 'repository-owner',
      attestationCommit: authorityOptions.attestationCommit, commitSha: authorityOptions.sourceCommit,
      expiresAt: '2026-08-01T04:10:00Z', mutation: 'tracked_runtime_activation', nonce: 'a'.repeat(32),
      schema: 'stockinsider-runtime-activation-authority-v2' };
    const authorityKey = 'test-activation-authority-hmac-key';
    const authority = { ...authorityUnsigned,
      signature: createHmac('sha256', authorityKey).update(canonicalJson(authorityUnsigned), 'utf8').digest('hex') };
    assert.equal(installerCli.validateActivationAuthority(authority, authorityOptions,
      new Date('2026-08-01T04:05:00Z'), () => authorityKey), authority);
    assert.throws(() => installerCli.validateActivationAuthority({ ...authority, commitSha: '3'.repeat(40) },
      authorityOptions, new Date('2026-08-01T04:05:00Z'), () => authorityKey),
    { code: 'production_runtime_activation_authority_required' });
    const nonceRoot = mkdtempSync(path.join(os.tmpdir(), 'runtime-nonce-race-'));
    try {
      const nonceScript = `const path=require('node:path');const cli=require(path.join(process.argv[1],'scripts/runtime/reviewed-runtime-installer-cli.js'));try{cli.consumeAuthorityNonce(process.argv[2],{nonce:'${'b'.repeat(32)}',schema:'test'});}catch{process.exitCode=1;}`;
      const runNonce = () => new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', nonceScript, root, nonceRoot], { stdio: 'ignore' });
        child.once('exit', (code) => resolve(code));
      });
      assert.deepEqual((await Promise.all([runNonce(), runNonce()])).sort(), [0, 1]);
    } finally { rmSync(nonceRoot, { recursive: true, force: true }); }
    const credentials = runtime('credential-resolver.js').hydrateRuntimeCredentials({
      STOCKINSIDER_DATABASE_URL_REF: 'keychain:stockinsider-runtime:database-url',
      INTERNAL_API_KEY_REF: 'keychain:stockinsider-runtime:internal-api-key',
    }, (reference) => reference.endsWith('database-url') ? 'postgresql://test/stockinsider' : 'test-internal-api-key');
    assert.equal(credentials.STOCKINSIDER_DATABASE_URL, 'postgresql://test/stockinsider');
    assert.equal(credentials.INTERNAL_API_KEY, 'test-internal-api-key');
    assert.throws(() => runtime('credential-resolver.js').hydrateRuntimeCredentials({
      STOCKINSIDER_DATABASE_URL: 'postgresql://ambient/forbidden', INTERNAL_API_KEY: 'ambient-forbidden-key',
    }, () => 'unused', { requireReferences: true }), /runtime credential references required/u);
    const isolatedEnvironment = { HOME: '/Users/test', PATH: '/usr/bin:/bin', NODE_ENV: 'production', TZ: 'Asia/Taipei',
      STOCKINSIDER_REVIEWED_COMMIT_SHA: '1'.repeat(40),
      STOCKINSIDER_DATABASE_URL_REF: 'keychain:stockinsider-runtime:database-url',
      INTERNAL_API_KEY_REF: 'keychain:stockinsider-runtime:internal-api-key' };
    assert.doesNotThrow(() => runtime('credential-resolver.js').assertExactRuntimeEnvironment(isolatedEnvironment));
    const darwinEnvironment = { ...isolatedEnvironment,
      __CF_USER_TEXT_ENCODING: `0x${process.getuid().toString(16)}:0x0:0x0` };
    assert.doesNotThrow(() => runtime('credential-resolver.js').assertExactRuntimeEnvironment(darwinEnvironment, 'darwin'));
    assert.throws(() => runtime('credential-resolver.js').assertExactRuntimeEnvironment(darwinEnvironment, 'linux'),
      /runtime environment not isolated/u);
    assert.throws(() => runtime('credential-resolver.js').assertExactRuntimeEnvironment({ ...isolatedEnvironment,
      __CF_USER_TEXT_ENCODING: '0x0:0x0:0x0' }, 'darwin'), /runtime environment not isolated/u);
    for (const injected of ['NODE_OPTIONS','DYLD_INSERT_LIBRARIES','HTTPS_PROXY','GIT_CONFIG_GLOBAL','npm_config_userconfig']) {
      assert.throws(() => runtime('credential-resolver.js').assertExactRuntimeEnvironment({ ...isolatedEnvironment,
        [injected]: '/tmp/unreviewed' }), /runtime environment not isolated/u);
    }
    const snapshots = mkdtempSync(path.join(os.tmpdir(), 'runtime-snapshot-'));
    try {
      for (const name of ['left','right']) { mkdirSync(path.join(snapshots, name)); writeFileSync(path.join(snapshots, name, 'worker.js'), 'reviewed\n'); }
      assert.equal(installerCli.releaseSnapshot(path.join(snapshots, 'left')), installerCli.releaseSnapshot(path.join(snapshots, 'right')));
      writeFileSync(path.join(snapshots, 'right', 'worker.js'), 'tampered\n');
      assert.notEqual(installerCli.releaseSnapshot(path.join(snapshots, 'left')), installerCli.releaseSnapshot(path.join(snapshots, 'right')));
    } finally { rmSync(snapshots, { recursive: true, force: true }); }
    const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(packageJson.scripts['agent:runtime:install'], 'node scripts/runtime/reviewed-runtime-installer-cli.js');
    assert.equal(packageJson.scripts['agent:runtime:activate-reviewed'], 'node scripts/runtime/reviewed-runtime-installer-cli.js --activate');
    const localPlatform = runtime('local-runtime-platform.js');
    assert.equal(typeof localPlatform.captureSchedulerRollback, 'function');
    assert.equal(typeof localPlatform.createLocalRuntimePlatform, 'function');
    const transientLaunchctlRows = ['', '"LastExitStatus" = 0;'];
    const launchctlCalls = [];
    await localPlatform.startOwnerAndWait('com.stockinsider.test-owner', 1, {
      launchctl: (args) => {
        launchctlCalls.push(args);
        return { status: 0, stdout: args[0] === 'start' ? '' : transientLaunchctlRows.shift() };
      },
      waitOneSecond: async () => {},
    });
    assert.deepEqual(launchctlCalls, [
      ['start', 'com.stockinsider.test-owner'],
      ['list', 'com.stockinsider.test-owner'],
      ['list', 'com.stockinsider.test-owner'],
    ]);
    await assert.rejects(localPlatform.startOwnerAndWait('com.stockinsider.test-owner', 0, {
      launchctl: (args) => ({ status: 0, stdout: args[0] === 'start' ? '' : '"LastExitStatus" = 78;' }),
      waitOneSecond: async () => {},
    }), { code: 'scheduler_activation_failed' });
    const ownerReplacementCalls = [];
    await localPlatform.replaceOwnerAndWait('com.stockinsider.test-owner', '/tmp/test-owner.plist',
      Buffer.from('new-owner'), { enabled: true }, {
        launchctl: (args) => ownerReplacementCalls.push(['launchctl', ...args]),
        atomicOwnedFile: (target, bytes) => ownerReplacementCalls.push(['install', target, bytes.toString('utf8')]),
        startOwnerAndWait: async (label) => ownerReplacementCalls.push(['wait', label]),
      });
    assert.deepEqual(ownerReplacementCalls, [
      ['launchctl', 'unload', '/tmp/test-owner.plist'],
      ['install', '/tmp/test-owner.plist', 'new-owner'],
      ['launchctl', 'load', '/tmp/test-owner.plist'],
      ['wait', 'com.stockinsider.test-owner'],
    ]);
    ownerReplacementCalls.length = 0;
    await localPlatform.replaceOwnerAndWait('com.stockinsider.test-owner', '/tmp/test-owner.plist',
      Buffer.from('new-owner'), { enabled: false }, {
        launchctl: (args) => ownerReplacementCalls.push(['launchctl', ...args]),
        atomicOwnedFile: (target, bytes) => ownerReplacementCalls.push(['install', target, bytes.toString('utf8')]),
        startOwnerAndWait: async (label) => ownerReplacementCalls.push(['wait', label]),
      });
    assert.deepEqual(ownerReplacementCalls, [
      ['install', '/tmp/test-owner.plist', 'new-owner'],
      ['launchctl', 'load', '/tmp/test-owner.plist'],
      ['wait', 'com.stockinsider.test-owner'],
    ]);
    const schedulerCaptureRoot = mkdtempSync(path.join(os.tmpdir(), 'scheduler-capture-nofollow-'));
    try {
      const plistPath = path.join(schedulerCaptureRoot, 'legacy.plist');
      writeFileSync(plistPath, 'legacy-plist\n', { mode: 0o600 });
      chmodSync(plistPath, 0o644);
      assert.equal(localPlatform.ownedRegularBytes(plistPath).toString('utf8'), 'legacy-plist\n');
      unlinkSync(plistPath);
      symlinkSync(path.join(schedulerCaptureRoot, 'missing.plist'), plistPath);
      assert.throws(() => localPlatform.ownedRegularBytes(plistPath), { code: 'scheduler_capture_invalid' });
    } finally { rmSync(schedulerCaptureRoot, { recursive: true, force: true }); }
    const activationLockRoot = mkdtempSync(path.join(os.tmpdir(), 'runtime-activation-lock-'));
    try {
      const lockScript = `const path=require('node:path');const platform=require(path.join(process.argv[1],'scripts/runtime/local-runtime-platform.js'));try{const lock=platform.acquireActivationLock(process.argv[2]);require('node:fs').appendFileSync(process.argv[3],process.argv[4]+'\\n');setTimeout(()=>{lock.release();},750);}catch{process.exitCode=1;}`;
      const entered = path.join(activationLockRoot, 'entered');
      const runActivation = (nonce) => new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', lockScript, root, activationLockRoot, entered, nonce], { stdio: 'ignore' });
        child.once('exit', (code) => resolve(code));
      });
      let shlockAvailable = true;
      try { accessSync('/usr/bin/shlock', fsConstants.X_OK); } catch { shlockAvailable = false; }
      assert.deepEqual((await Promise.all([runActivation('nonce-a'), runActivation('nonce-b')])).sort(),
        shlockAvailable ? [0, 1] : [1, 1]);
      if (shlockAvailable) assert.equal(readFileSync(entered, 'utf8').trim().split('\n').length, 1);
      else assert.equal(existsSync(entered), false, 'unsupported hosts must fail closed before activation');
    } finally { rmSync(activationLockRoot, { recursive: true, force: true }); }
    assert.doesNotMatch(readFileSync(path.join(root, 'scripts/runtime/local-runtime-platform.js'), 'utf8'), /runtime-health-input/u);
    assert.doesNotMatch(readFileSync(path.join(root, 'scripts/install-local-runtime.sh'), 'utf8'), /rsync|\.agent\/scripts|data-collect/u);
    const plist = readFileSync(path.join(root, 'scripts/com.stockinsider.auth-source-worker.plist'), 'utf8');
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<false\/>/u);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<false\/>/u);
    assert.match(plist, /<string>\/usr\/bin\/env<\/string>\s*<string>-i<\/string>/u);
    assert.doesNotMatch(plist, /<key>EnvironmentVariables<\/key>/u);
    const reviewedRuntime = runtime('reviewed-runtime-release.js');
    const sourceCommit = '1'.repeat(40); const attestationCommit = '2'.repeat(40);
    const sourceTree = '3'.repeat(40); const evidenceTree = '4'.repeat(40);
    const baseSha = '5'.repeat(40); const reviewBytes = Buffer.from('# exact review\n');
    const attestationBytes = Buffer.from(`${runtime('codec.js').canonicalJson({
      baseSha,
      evidenceSha256: sha256(reviewBytes),
      headSha: sourceCommit,
      p0: 0,
      p1: 0,
      range: `${baseSha}..${sourceCommit}`,
      reviewedAt: '2026-08-02T08:00:00Z',
      schema: 'stockinsider-exact-review-attestation-v1',
      treeSha: sourceTree,
      verdict: 'PASS',
    })}\n`);
    const sourceBytes = new Map(bundle.TRACKED_RUNTIME_PATHS.map((repositoryPath) => [repositoryPath, Buffer.from(repositoryPath)]));
    sourceBytes.set('config/runtime/auth-source-dag.json', Buffer.from('{}\n'));
    const evidenceBytes = new Map([
      [reviewedRuntime.REVIEW_PATH, reviewBytes],
      [reviewedRuntime.ATTESTATION_PATH, attestationBytes],
      [reviewedRuntime.PCR_PATH, Buffer.from('{}\n')],
    ]);
    const repository = {
      objectType: () => 'commit', parents: () => [sourceCommit], tree: (commit) => commit === sourceCommit ? sourceTree : evidenceTree,
      replacements: () => [], isAncestor: () => true,
      changedRows: () => reviewedRuntime.EVIDENCE_PATHS.map((repositoryPath) => ['A', repositoryPath]),
      entry: (tree, repositoryPath) => (tree === sourceTree ? sourceBytes : evidenceBytes).has(repositoryPath)
        ? { mode: '100644', type: 'blob', object: '6'.repeat(40) } : null,
      bytes: (tree, repositoryPath) => (tree === sourceTree ? sourceBytes : evidenceBytes).get(repositoryPath),
    };
    const resolved = reviewedRuntime.resolveReviewedRuntimeRelease({ repositoryRoot: root, sourceCommit, attestationCommit }, repository);
    assert.equal(resolved.commitSha, sourceCommit); assert.equal(resolved.treeSha, sourceTree);
    assert.equal(resolved.reviewAttestationSha256, sha256(attestationBytes));
    assert.equal(resolved.configSha256, sha256(Buffer.from('{}\n')));
    assert.throws(() => reviewedRuntime.resolveReviewedRuntimeRelease({ repositoryRoot: root, sourceCommit, attestationCommit }, {
      ...repository, changedRows: () => [...repository.changedRows(), ['A', 'unexpected']],
    }), { code: 'attestation_commit_has_extra_diff' });
    const activationCalls = [];
    const activated = await runtime('auth-source-worker-installer.js').installTrackedAuthSourceWorker({ manifest, reviewedRelease, install: true,
      ...testActivationProof,
      filesystem: { captureActivePointer: async () => 'old', stage: async () => activationCalls.push('stage'),
        verifyStaged: async () => activationCalls.push('verify'), publishRelease: async () => activationCalls.push('publish'),
        writeHealthObservation: async () => activationCalls.push('health-observation'),
        restoreActivePointer: async () => activationCalls.push('restore-pointer'),
        cleanupIncomplete: async () => activationCalls.push('cleanup') },
      scheduler: { capture: async () => 'owners', disablePriorOwners: async () => activationCalls.push('disable'),
        loadNewOwner: async () => activationCalls.push('load'), doctor: async () => passingRuntimeDoctor(manifest, reviewedRelease),
        restore: async () => activationCalls.push('restore-scheduler') }, journal: {
        recover: async () => {}, begin: async () => {}, write: async () => {}, rollback: async () => {},
      } });
    assert.equal(activated.disposition, 'activated'); assert.deepEqual(activationCalls, ['stage','verify','publish','disable','load','health-observation']);
  },
  'PCR-002': () => {
    const { manifest, reviewedRelease } = runtimeRelease(); const validate = runtime('auth-source-worker-installation.js').validateRuntimeInstallationManifest;
    assert.equal(validate(manifest, reviewedRelease).manifestSha256.length, 64);
    assert.throws(() => validate({ ...manifest, surprise: true }, reviewedRelease), { code: 'attestation_schema_mismatch' });
    assert.throws(() => validate({ ...manifest, worker: { ...manifest.worker, sha256: '0'.repeat(64) } }, reviewedRelease), { code: 'staged_hash_mismatch' });
  },
  'PCR-003': async () => {
    const { manifest, reviewedRelease } = runtimeRelease(); const calls = [];
    const result = await runtime('auth-source-worker-installation.js').activateTrackedRuntimeRelease({ manifest, reviewedRelease,
      ...testActivationProof,
      filesystem: { captureActivePointer: async () => 'old', stage: async () => calls.push('stage'), verifyStaged: async () => calls.push('verify'), publishRelease: async () => calls.push('publish'), writeHealthObservation: async () => calls.push('health-observation'), restoreActivePointer: async () => calls.push('restore-pointer'), cleanupIncomplete: async () => calls.push('cleanup') },
      scheduler: { capture: async () => 'owners', disablePriorOwners: async () => calls.push('disable'), loadNewOwner: async () => calls.push('load'), doctor: async () => ({ status: 'fail' }), restore: async () => calls.push('restore-scheduler') },
      journal: { recover: async () => calls.push('recover'), begin: async () => calls.push('captured'),
        write: async (phase) => calls.push(phase), rollback: async () => calls.push('journal-rollback') } });
    assert.equal(result.disposition, 'rolled_back'); assert.ok(calls.indexOf('restore-scheduler') < calls.indexOf('restore-pointer'));
    assert.ok(calls.indexOf('restore-pointer') < calls.indexOf('cleanup'));
    assert.ok(calls.indexOf('cleanup') < calls.indexOf('journal-rollback'));
    assert.deepEqual(calls.slice(0, 4), ['recover','captured','stage','verify']);
    assert.ok(calls.indexOf('release_published') < calls.indexOf('disable'));
    assert.ok(calls.indexOf('old_owners_disabled') < calls.indexOf('load'));
    let residue = false; let doctorAttempts = 0;
    const retryFilesystem = { captureActivePointer: async () => null,
      stage: async () => { if (residue) throw Object.assign(new Error('active_runtime_conflict'), { code: 'active_runtime_conflict' }); },
      verifyStaged: async () => {}, publishRelease: async () => { residue = true; }, writeHealthObservation: async () => {},
      restoreActivePointer: async () => {}, cleanupIncomplete: async () => { residue = false; } };
    const retryScheduler = { capture: async () => 'owners', disablePriorOwners: async () => {}, loadNewOwner: async () => {},
      doctor: async () => (++doctorAttempts === 1 ? { status: 'fail' } : passingRuntimeDoctor(manifest, reviewedRelease)),
      restore: async () => {} };
    const retryJournal = { recover: async () => {}, begin: async () => {}, write: async () => {}, rollback: async () => {} };
    const firstAttempt = await runtime('auth-source-worker-installation.js').activateTrackedRuntimeRelease({ manifest,
      reviewedRelease, ...testActivationProof, filesystem: retryFilesystem, scheduler: retryScheduler, journal: retryJournal });
    const secondAttempt = await runtime('auth-source-worker-installation.js').activateTrackedRuntimeRelease({ manifest,
      reviewedRelease, ...testActivationProof, filesystem: retryFilesystem, scheduler: retryScheduler, journal: retryJournal });
    assert.equal(firstAttempt.disposition, 'rolled_back'); assert.equal(secondAttempt.disposition, 'activated');
    const failedTerminalCalls = [];
    const failedTerminalDoctor = passingRuntimeDoctor(manifest, reviewedRelease);
    failedTerminalDoctor.observation.lastTerminalStatus = 'failed';
    const failedTerminal = await runtime('auth-source-worker-installation.js').activateTrackedRuntimeRelease({ manifest,
      reviewedRelease, ...testActivationProof,
      filesystem: { captureActivePointer: async () => 'old', stage: async () => {}, verifyStaged: async () => {},
        publishRelease: async () => {}, writeHealthObservation: async () => failedTerminalCalls.push('health-observation'),
        restoreActivePointer: async () => failedTerminalCalls.push('restore-pointer'), cleanupIncomplete: async () => {} },
      scheduler: { capture: async () => 'owners', disablePriorOwners: async () => {}, loadNewOwner: async () => {},
        doctor: async () => failedTerminalDoctor, restore: async () => failedTerminalCalls.push('restore-scheduler') },
      journal: { recover: async () => {}, begin: async () => {}, write: async () => {}, rollback: async () => {} },
    });
    assert.equal(failedTerminal.disposition, 'rolled_back');
    assert.deepEqual(failedTerminalCalls, ['restore-scheduler', 'restore-pointer'],
      'a terminal failed producer run must rollback before publishing health');
  },
  'PCR-004': async () => {
    const runtimeDoctor = require(path.join(root, 'scripts/runtime_doctor.js'));
    assert.equal(runtimeDoctor.oneShotSchedulerHealthy({ loaded: true, pid: null, lastExitCode: '0' }), true,
      'a loaded one-shot scheduler with a successful terminal exit is healthy');
    assert.equal(runtimeDoctor.oneShotSchedulerHealthy({ loaded: true, pid: 1234, lastExitCode: null }), true,
      'an actively running one-shot scheduler is healthy');
    assert.equal(runtimeDoctor.oneShotSchedulerHealthy({ loaded: true, pid: null, lastExitCode: '1' }), false,
      'a loaded one-shot scheduler with a failed terminal exit is unhealthy');
    assert.equal(runtimeDoctor.oneShotSchedulerHealthy({ loaded: false, pid: null, lastExitCode: '0' }), false,
      'an unloaded scheduler cannot borrow a prior successful exit');
    const trackedCommit = 'a'.repeat(40);
    assert.equal(runtimeDoctor.trackedIdentityCompatible({ producerCommitSha: trackedCommit,
      consumerCommitSha: trackedCommit, compatibility: 'compatible' }, trackedCommit), true);
    assert.equal(runtimeDoctor.trackedIdentityCompatible({ producerCommitSha: trackedCommit,
      consumerCommitSha: 'b'.repeat(40), compatibility: 'compatible' }, trackedCommit), false,
    'the doctor rejects a consumer from a different reviewed commit');
    const health = runtime('runtime-health.js').assessTrackedRuntimeHealth({ manifestPresent: false, manifestCanonical: false, reviewBindingValid: false,
      workerHashMatches: false, configHashMatches: false, schedulerRollbackPackagePresent: false, schedulerRollbackHashMatches: false,
      activationJournalComplete: false, activePointerValid: false, schedulerPlistMatches: false, schedulerOwner: null, competingOwners: [],
      leaseStatus: 'absent', stateSchema: null, stuckRunCount: 1, projectionFreshness: 'missing', consumerCompatibility: 'unknown' });
    assert.equal(health.status, 'fail'); assert.deepEqual(health.reasons.slice(0, 3), ['manifest_missing', 'review_binding_invalid', 'worker_hash_mismatch']);
    assert.deepEqual(Object.keys(health), ['schema','status','checkedAt','producer','scheduler','runtime','projection','consumer','reasons']);
    const projectionBytes = Buffer.from('{"projection":"direct-observation"}');
    class ReadOnlyDoctorClient {
      async connect() {}
      async end() {}
      async query(statement) {
        if (statement === 'BEGIN READ ONLY' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] };
        if (statement.includes('to_regclass')) return { rows: [{ runs: 'legacy_producer_runs_v3_11', projections: 'legacy_radar_projections_v3_11' }] };
        if (statement.includes('ORDER BY started_at')) return { rows: [{ status: 'success', started_at: '2026-08-01T04:00:00Z',
          terminal_at: '2026-08-01T04:10:00Z', producer_commit_sha: 'a'.repeat(40), worker_sha256: 'b'.repeat(64),
          scheduler_config_sha256: 'c'.repeat(64) }] };
        if (statement.includes('count(*)')) return { rows: [{ count: 0 }] };
        if (statement.includes("status='leased'")) return { rows: [] };
        if (statement.includes('legacy_radar_projections_v3_11')) return { rows: [{ as_of: new Date(),
          payload_canonical: projectionBytes, payload_sha256: sha256(projectionBytes),
          producer_commit_sha: 'a'.repeat(40), worker_sha256: 'b'.repeat(64) }] };
        if (statement.includes('tw_trading_sessions_v3')) return { rows: [] };
        throw new Error(`unexpected doctor query: ${statement}`);
      }
    }
    const observer = runtime('runtime-health-observer.js');
    const database = await observer.observeDatabase(root, { legacyRadarBaseUrl: 'https://example.test' },
      () => 'postgresql://doctor-read-only', ReadOnlyDoctorClient);
    assert.equal(database.stateSchema, 'stockinsider-producer-state-v1');
    assert.equal(database.lastTerminalStatus, 'success'); assert.equal(database.projectionFreshness, 'fresh');
    assert.equal(await observer.observeConsumer({ legacyRadarBaseUrl: 'https://example.test' },
      () => 'test-internal-key-000000', async (url, options) => {
        assert.equal(url, 'https://example.test/api/internal/health-check');
        assert.equal(options.headers.Authorization, 'Bearer test-internal-key-000000');
        assert.equal(options.headers['X-StockInsider-Runtime-Consumer-Check'], 'v1',
          'activation uses the authenticated constant-time consumer identity check');
        return { ok: true, json: async () => ({
          sourceLedRuntime: { consumer: { commitSha: 'd'.repeat(40) } },
        }) };
      }), 'd'.repeat(40));
    const healthRoute = readFileSync(path.join(root, 'web/src/app/api/internal/health-check/route.ts'), 'utf8');
    assert.match(healthRoute, /consumerCheck !== 'v1'/u);
    assert.match(healthRoute, /producerIdentity[?][.]configSha256/u,
      'full health falls back to the hash-bound projection config when the run table is not readable by Web');
    const publicationQueries = [];
    class HealthPublicationClient {
      async connect() { publicationQueries.push('connect'); }
      async end() { publicationQueries.push('end'); }
      async query(statement, values) {
        publicationQueries.push([statement, values]);
        if (statement === 'BEGIN' || statement === 'COMMIT' || statement === 'ROLLBACK') return { rows: [] };
        if (statement.includes('to_regclass')) return { rows: [{ observations: 'legacy_runtime_health_observations_v3_11' }] };
        if (statement.includes('INSERT INTO public.legacy_runtime_health_observations_v3_11')) return { rows: [] };
        throw new Error(`unexpected health publication query: ${statement}`);
      }
    }
    const publication = await observer.publishRuntimeHealthObservation({ releaseRoot: root,
      observation: { producerCommitSha: 'a'.repeat(40), workerSha256: 'b'.repeat(64),
        schedulerConfigSha256: 'c'.repeat(64), projectionFreshness: 'fresh' },
      resolver: () => 'postgresql://health-publication', clientFactory: HealthPublicationClient });
    assert.match(publication.observationSha256, /^[0-9a-f]{64}$/u);
    assert.ok(publicationQueries.some((entry) => Array.isArray(entry) &&
      entry[0].includes('legacy_runtime_health_observations_v3_11')));
  },
  'PCR-005': async () => {
    const config = readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')); const selected = runtime('source-run-config.js').validateAuthSourceDagConfig(config);
    assert.equal(selected.sha256, '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2');
    assert.equal(selected.config.legacyRadarBaseUrl, 'https://stockinsider-three.vercel.app');
    assert.equal(selected.seedSetHash, 'e6d9c09b8b552f5d9eaf389b76d2d90daa2d89578433d2a1ad63286888b3b743');
    assert.deepEqual(selected.config.stages.map((stage) => stage.name), runtime('source-run-config.js').LEGACY_STAGES);
    const legacyPayload = { opportunities: [], generatedAt: '2026-08-01T10:20:00Z' };
    let fetchCount = 0;
    const handlers = runtime('auth-source-worker-cli.js').buildStageHandlers(selected, 'a'.repeat(40), 'b'.repeat(64), {
      internalApiKey: 'test-internal-key-000000000000',
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, 'Bearer test-internal-key-000000000000');
        assert.equal(options.headers['X-StockInsider-Projection-Source'], 'tracked-producer');
        return { ok: true, arrayBuffer: async () => { fetchCount += 1; return Buffer.from(canonicalJson(legacyPayload)); } };
      },
    });
    const captured = await handlers.source_sync({ authorityHash: 'c'.repeat(64), payloadJson: [null,null,null,'2026-08-01T10:20:00Z'] });
    assert.equal(fetchCount, 3); assert.deepEqual(Object.keys(captured.json.legacyPayloads).sort(), ['daily','home','hot','weekly']);
    assert.equal(captured.json.legacyPayloadHashes.home, captured.json.legacyPayloadHashes.daily);
    const parser = runtime('auth-source-worker-cli.js');
    const adapterSource = readFileSync(path.join(root, 'scripts/runtime/postgres-legacy-producer-adapter.js'), 'utf8');
    assert.match(adapterSource, /set_config\('stockinsider[.]legacy_authority_hash',\$5,true\)[\s\S]*length\(configured[.]marker\)\*0/u,
      'transaction-pooler-safe claims explicitly carry the worker authority cache state');
    assert.equal(parser.LEGACY_RADAR_FETCH_TIMEOUT_MS, 60000, 'bootstrap producer reads admit the measured Vercel cold legacy path');
    const authorityPages = [['roster', null, null, [[
      '00000000-0000-4000-8000-000000002330', '2330', 'TWSE', 'common_stock', 'active', '台灣積體電路製造', '台積電',
    ]]]];
    const parse = (text) => parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000001', sourceKey: 'threads', rawFieldPayload: { text },
    }, authorityPages });
    assert.equal(parse('今天指數收在 2330 點，沒有提到任何個股。').candidates.length, 0);
    const explicitStock = parse('台積電 2330 股價轉強，列入觀察。');
    assert.equal(explicitStock.candidates.length, 1);
    assert.equal(explicitStock.candidates[0].name, '台積電',
      'official roster name remains attached through the source-led candidate funnel');
    assert.equal(explicitStock.candidates[0].sourceSummary, '台積電 2330 股價轉強,列入觀察。');
    const productionSurrogateBoundary = parse(`${'段'.repeat(92)}台積電 2330 股票轉強${'文'.repeat(100)}😀後續。`);
    assert.equal(productionSurrogateBoundary.candidates.length, 1);
    assert.equal(productionSurrogateBoundary.candidates[0].sourceSummary.isWellFormed(), true,
      'UTF-16 snippet windows must remain PostgreSQL jsonb-compatible Unicode scalar text');
    assert.doesNotThrow(() => JSON.parse(canonicalJson(productionSurrogateBoundary)));
    const productionLoneSurrogate = parse('台積電 2330 股票轉強 \ud83d');
    assert.equal(productionLoneSurrogate.candidates[0].sourceSummary.isWellFormed(), true,
      'malformed upstream UTF-16 must be replaced before immutable JSON persistence');
    const longNamePages = [['roster', null, null, [[
      '00000000-0000-4000-8000-000000002330', '2330', 'TWSE', 'common_stock', 'active', '超過四十字的官方公司完整名稱不應被送進公開短名稱欄位以免破壞公開契約而造成整批投影無法發布', null,
    ]]]];
    assert.equal(parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000009', sourceKey: 'threads',
      rawFieldPayload: { text: '2330 股票轉強。' },
    }, authorityPages: longNamePages }).candidates[0].name, null, 'public name remains within its 40-character contract');
    assert.match(explicitStock.candidates[0].claimId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u);
    const effectiveSource = parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000007', sourceKey: 'threads',
      sourcePublishedAt: '2026-07-31T20:00:00Z', sourceCollectedAt: '2026-08-01T10:00:00Z',
      rawFieldPayload: { text: '台積電 2330 股價轉強。' },
    }, authorityPages });
    assert.equal(effectiveSource.candidates[0].claimAsOf, '2026-07-31T20:00:00Z',
      'published time is the source effective time when collection is delayed');
    const invalidPublication = parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000008', sourceKey: 'threads',
      sourcePublishedAt: '2026-08-01T11:00:00Z', sourceCollectedAt: '2026-08-01T10:00:00Z',
      rawFieldPayload: { text: '台積電 2330 股價轉強。' },
    }, authorityPages });
    assert.equal(invalidPublication.candidates[0].claimAsOf, '2026-08-01T10:00:00Z',
      'legacy invalid publication ordering falls back to collection time');
    const aliasPages = [...authorityPages, ['alias', null, null, [[
      '00000000-0000-4000-8000-000000002330', '世界',
    ]]]];
    assert.equal(parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000002', sourceKey: 'threads',
      rawFieldPayload: { text: '這個世界很美好。' },
    }, authorityPages: aliasPages }).candidates.length, 0, 'ordinary-language aliases require stock context');
    const official = parser.extractRevisionCandidates({ frozenRevision: {
      revisionId: '00000000-0000-4000-8000-000000000003', sourceKey: 'mops_material_event',
      rawFieldPayload: { text: '台積電財報與股價展望更新。' },
    }, authorityPages });
    assert.equal(official.candidates[0].sourceClass, 'official');
    const authorityHash = 'e'.repeat(64);
    const firstFrozenRead = runtime('codec.js').immutableBundle('frozen_revision_authority', {
      authorityHash, authorityPages, frozenRevision: {
        revisionId: '00000000-0000-4000-8000-000000000004', sourceKey: 'threads',
        rawFieldPayload: { text: '台積電 2330 股價轉強。' },
      },
    });
    const firstFrozen = await handlers.mention_claim_extraction({ jobKind: 'revision_shard',
      readKind: 'frozen_revision_authority', readCanonical: firstFrozenRead.canonical,
      readJson: firstFrozenRead.json, readHash: firstFrozenRead.hash });
    assert.equal(firstFrozen.json.candidates.length, 1);
    const cachedFrozenRead = runtime('codec.js').immutableBundle('frozen_revision_authority', {
      authorityHash, authorityPages: [], frozenRevision: {
        revisionId: '00000000-0000-4000-8000-000000000005', sourceKey: 'threads',
        rawFieldPayload: { text: '台積電財報與股價更新。' },
      },
    });
    const cachedFrozen = await handlers.mention_claim_extraction({ jobKind: 'revision_shard',
      readKind: 'frozen_revision_authority', readCanonical: cachedFrozenRead.canonical,
      readJson: cachedFrozenRead.json, readHash: cachedFrozenRead.hash });
    assert.equal(cachedFrozen.json.candidates.length, 1, 'same-session shards reuse the hash-bound authority plane');
    const uncachedRead = runtime('codec.js').immutableBundle('frozen_revision_authority', {
      authorityHash: 'f'.repeat(64), authorityPages: [], frozenRevision: {
        revisionId: '00000000-0000-4000-8000-000000000006', sourceKey: 'threads', rawFieldPayload: { text: '2330 股票' },
      },
    });
    await assert.rejects(() => handlers.mention_claim_extraction({ jobKind: 'revision_shard',
      readKind: 'frozen_revision_authority', readCanonical: uncachedRead.canonical,
      readJson: uncachedRead.json, readHash: uncachedRead.hash }), /frozen authority cache unavailable/u);
    const retryRead = runtime('codec.js').immutableBundle('compact_projection_input', { analysisResult: { decisions: [],
      sourceCandidates: [{ symbol: '2330', name: '台積電', disposition: 'promoted', reason: 'new_source_evidence',
        sourceClass: 'official', raw: '2330', sourceSummary: '台積電財報更新', lastEvaluatedAt: '2026-08-01T10:20:00Z',
        ...citedPublicationEvidence('claim-2330') }] },
      sourceCutoff: '2026-08-01T10:20:00Z', legacyPayloads: captured.json.legacyPayloads,
      legacyPayloadHashes: captured.json.legacyPayloadHashes, legacySourceResultHash: captured.hash });
    const projected = await handlers.compact_radar_projection({ readKind: 'compact_projection_input',
      readCanonical: retryRead.canonical, readJson: retryRead.json, readHash: retryRead.hash });
    assert.equal(projected.json.projections.length, 4); assert.equal(fetchCount, 3,
      'a compact retry reuses the persisted source result and never refetches changed public payloads');
    assert.deepEqual(projected.json.projections[0].payload.discoveryDelta,
      { added: [], exited: [], continued: [], unchangedReasons: [] });
    assert.equal(projected.json.projections[0].payload.sourceSignals[0].chineseName, '台積電',
      'compact public projection carries the official source-signal name');
    assert.equal(projected.json.projections[0].payload.sourceSignals[0].sourceSummary, '台積電財報更新',
      'compact public projection carries bounded source context instead of repeating the ticker');
    const candidateInput = { mentionResult: { candidates: [{ stockId: '00000000-0000-4000-8000-000000009999', symbol: '9999',
      raw: '新公司', claimId: 'claim-9999', mentionId: 'mention-9999', sourceKey: 'threads', revisionId: null }] }, seedSymbols: seeds() };
    const firstCandidateRead = runtime('codec.js').immutableBundle('candidate_funnel_input', candidateInput);
    const firstCandidate = await handlers.candidate_funnel({ readKind: 'candidate_funnel_input', readCanonical: firstCandidateRead.canonical,
      readJson: firstCandidateRead.json, readHash: firstCandidateRead.hash });
    assert.equal(firstCandidate.json.candidates[0].disposition, 'promoted');
    const repeatCandidateRead = runtime('codec.js').immutableBundle('candidate_funnel_input', { ...candidateInput,
      priorLedger: [{ stockId: firstCandidate.json.candidates[0].stockId, materialEvidenceHash: firstCandidate.json.candidates[0].materialEvidenceHash }] });
    const repeatCandidate = await handlers.candidate_funnel({ readKind: 'candidate_funnel_input', readCanonical: repeatCandidateRead.canonical,
      readJson: repeatCandidateRead.json, readHash: repeatCandidateRead.hash });
    assert.equal(repeatCandidate.json.candidates[0].disposition, 'unchanged');
    const provenanceInput = runtime('codec.js').immutableBundle('candidate_funnel_input', { mentionResult: { candidates: [
      { stockId: '00000000-0000-4000-8000-000000008888', symbol: '8888', raw: 'older', claimId: 'claim-first', mentionId: 'mention-first', sourceKey: 'threads', revisionId: 'rev-first', sourceClass: 'community', sourcePriority: 40 },
      { stockId: '00000000-0000-4000-8000-000000008888', symbol: '8888', raw: 'newer', claimId: 'claim-last', mentionId: 'mention-last', sourceKey: 'mops', revisionId: 'rev-last', sourceClass: 'official', sourcePriority: 95 },
      { stockId: '00000000-0000-4000-8000-000000007777', symbol: '7777', raw: 'older equal priority', claimId: 'claim-older-equal', claimAsOf: '2026-07-31T10:00:00Z', mentionId: 'mention-older-equal', sourceKey: 'threads', revisionId: 'zzzz-older', sourceClass: 'community', sourcePriority: 50 },
      { stockId: '00000000-0000-4000-8000-000000007777', symbol: '7777', raw: 'newer equal priority', claimId: 'claim-newer-equal', claimAsOf: '2026-08-01T10:00:00Z', mentionId: 'mention-newer-equal', sourceKey: 'threads', revisionId: 'aaaa-newer', sourceClass: 'community', sourcePriority: 50 },
      { stockId: '00000000-0000-4000-8000-000000001111', symbol: '1111', raw: 'low', claimId: 'claim-low', mentionId: 'mention-low', sourceKey: 'threads', revisionId: 'rev-low', sourceClass: 'community', sourcePriority: 10 },
    ] }, seedSymbols: seeds() });
    const provenance = await handlers.candidate_funnel({ readKind: 'candidate_funnel_input', readCanonical: provenanceInput.canonical,
      readJson: provenanceInput.json, readHash: provenanceInput.hash });
    assert.deepEqual([provenance.json.candidates[0].symbol, provenance.json.candidates[0].claimId,
      provenance.json.candidates[0].revisionId], ['8888', 'claim-last', 'rev-last']);
    assert.ok(provenance.json.candidates[0].sourcePriority > provenance.json.candidates.at(-1).sourcePriority,
      'official evidence outranks community evidence');
    const equalPriority = provenance.json.candidates.find((candidate) => candidate.symbol === '7777');
    assert.deepEqual([equalPriority.claimId, equalPriority.claimAsOf, equalPriority.revisionId],
      ['claim-newer-equal', '2026-08-01T10:00:00Z', 'aaaa-newer'],
      'newest effective claim wins before an arbitrary revision identifier');
    assert.deepEqual(provenance.json.discoveryDelta.added.sort(), ['1111','7777','8888']);
    const sixtyCandidates = Array.from({ length: 60 }, (_, index) => ({
      stockId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      symbol: String(1000 + index), raw: `stock-${index}`, claimId: `claim-${index}`,
      claimAsOf: '2026-08-01T10:00:00Z',
      mentionId: `mention-${index}`, sourceKey: 'threads', sourceClass: 'community', sourcePriority: 60 - index,
      disposition: 'promoted', reason: 'new_out_of_seed_symbol', researchDisposition: 'source_signal_only',
      materialEvidenceHash: String(index).padStart(64, '0'), shallowSelected: index < 30, deepSelected: index < 20,
    }));
    const dislocationCandidates = Array.from({ length: 30 }, (_, index) => ({
      stockId: `00000000-0000-4000-8001-${String(index).padStart(12, '0')}`,
      symbol: String(2000 + index), name: `dislocation-${index}`, sourceRef: `price-${index}`,
      drawdown60Pct: -30 + index / 10,
    }));
    const factRead = runtime('codec.js').immutableBundle('candidate_fact_plane', { candidateResult: {
      candidates: sixtyCandidates, discoveryDelta: { added: [], exited: [], continued: [], unchangedReasons: [] },
    }, financialRows: [], priceRows: [], benchmarkRows: [], dislocationCandidates,
    sourceCutoff: '2026-08-01T10:20:00Z' });
    const capped = await handlers.facts_refresh({ readKind: 'candidate_fact_plane', readCanonical: factRead.canonical,
      readJson: factRead.json, readHash: factRead.hash });
    assert.equal(capped.json.decisions.length, 20); assert.equal(capped.json.shallowObservations.length, 10);
    assert.equal(capped.json.sourceCandidates.length, 40);
    assert.deepEqual(capped.json.sourceCandidates.map((candidate) => candidate.symbol).sort(),
      sixtyCandidates.filter((candidate) => !candidate.deepSelected).map((candidate) => candidate.symbol).sort(),
      'the persisted source-candidate plane remains the exact non-deep candidate partition');
    assert.equal(capped.json.dislocationCandidates.length, 30,
      'market dislocations remain separately bounded instead of replacing source-led candidates');
    assert.ok(capped.json.shallowObservations.every((candidate) => candidate.shallowStatus === 'enriched_observation'));
    const materialChangeHash = 'd'.repeat(64); const originalGeneratedAt = '2026-07-31T10:20:00Z';
    const priorAuthority=citedPublicationEvidence('claim-9999');
    const priorFacts={symbol:'9999',...priorAuthority,materialChangeHash,materialChangedBecause:[],
      researchMaturity:'source_signal',decisionBrief:{...priorAuthority.decisionBrief,action:'wait_reclaim'}};
    const analysisRead = runtime('codec.js').immutableBundle('analysis_revision_input', { factsResult: { decisions: [priorFacts],
      sourceCandidates: capped.json.sourceCandidates, dislocationCandidates: capped.json.dislocationCandidates },
      sourceCutoff: '2026-08-01T10:20:00Z', priorRevisions: [{ symbol: '9999', revisionId: 'revision-9999',
        materialChangeHash, analysisGeneratedAt: originalGeneratedAt,facts:priorFacts }] });
    const analysis = await handlers.analysis_revision({ readKind: 'analysis_revision_input', readCanonical: analysisRead.canonical,
      readJson: analysisRead.json, readHash: analysisRead.hash });
    assert.equal(analysis.json.decisions[0].evaluationDisposition, 'unchanged');
    assert.equal(analysis.json.decisions[0].analysisGeneratedAt, originalGeneratedAt);
    assert.equal(analysis.json.decisions[0].decisionBrief.action,'wait_reclaim');
    assert.deepEqual(analysis.json.decisionPayloads[0].bundle.json,priorFacts);
    assert.equal(analysis.json.sourceCandidates.length, 40);
    assert.equal(analysis.json.dislocationCandidates.length, 30);
    const publicationAnalysis={...analysis.json,
      sourceCandidates:analysis.json.sourceCandidates.map((candidate,index)=>({...candidate,
        ...citedPublicationEvidence(candidate.claimId??`source-candidate-${index}`)})),
      dislocationCandidates:analysis.json.dislocationCandidates.map((candidate,index)=>({...candidate,
        ...citedPublicationEvidence(`dislocation-${index}`)}))};
    const mixedProjectionRead = runtime('codec.js').immutableBundle('compact_projection_input', {
      analysisResult: publicationAnalysis, sourceCutoff: '2026-08-01T10:20:00Z',
      legacyPayloads: captured.json.legacyPayloads, legacyPayloadHashes: captured.json.legacyPayloadHashes,
      legacySourceResultHash: captured.hash,
    });
    const mixedProjection = await handlers.compact_radar_projection({ readKind: 'compact_projection_input',
      readCanonical: mixedProjectionRead.canonical, readJson: mixedProjectionRead.json, readHash: mixedProjectionRead.hash });
    assert.equal(mixedProjection.json.projections.length, 4);
    assert.ok(mixedProjection.json.projections.every((projection) => projection.payload.sourceSignals.length <= 30));
    assert.ok(mixedProjection.json.projections[0].payload.sourceSignals.some((signal) =>
      dislocationCandidates.some((candidate) => candidate.symbol === signal.symbol)),
    'ranked market dislocations can enter the compact signal projection without corrupting the durable source partition');
  },
  'PCR-006': async () => {
    const stages = runtime('source-run-config.js').LEGACY_STAGES; const completed = []; let nextIndex = 0; let interrupted = false;
    const adapter = { acquireLegacyProducerLease: async () => ({ runId: 'run', job: { jobId: `j${nextIndex}` }, disposition: nextIndex ? 'resumed' : 'created' }),
      claimLegacyProducerJob: async ({ jobId }) => {
        if (jobId === 'j2' && !interrupted) { interrupted = true; return null; }
        return { jobId, stage: stages[Number(jobId.slice(1))], payloadHash: 'a'.repeat(64) };
      },
      heartbeatLegacyProducerJob: async () => true,
      completeLegacyProducerJob: async ({ jobId, resultHash }) => { const index = Number(jobId.slice(1));
        assert.match(resultHash, /^[0-9a-f]{64}$/u); completed.push([jobId, resultHash]); nextIndex = index + 1;
        return index === 5 ? { status: 'succeeded' } : { status: 'running', nextJob: { jobId: `j${index + 1}` } }; },
      appendLegacyRuntimeFailureDiagnostic:async()=>true,failLegacyProducerJob: async () => ({ status: 'failed' }) };
    const handlers = Object.fromEntries(stages.map((stage) => [stage, async () => runtime('codec.js').immutableBundle(stage, [stage])]));
    const first = await runtime('auth-source-worker.js').runDurableAuthSourceWorker({ configBytes: readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')),
      adapter, sourceCommitSha: 'a'.repeat(40), workerBytes: Buffer.from('reviewed-worker'), stageHandlers: handlers, ownerToken: '00000000-0000-4000-8000-000000000001' });
    assert.equal(first.disposition, 'incomplete_job_graph'); assert.equal(nextIndex, 2);
    const result = await runtime('auth-source-worker.js').runDurableAuthSourceWorker({ configBytes: readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')),
      adapter, sourceCommitSha: 'a'.repeat(40), workerBytes: Buffer.from('reviewed-worker'), stageHandlers: handlers, ownerToken: '00000000-0000-4000-8000-000000000001' });
    assert.equal(result.status, 'succeeded'); assert.deepEqual(completed.map(([jobId]) => jobId), ['j0','j1','j2','j3','j4','j5']);
    let failedAfterLoss = false;
    const lost = await runtime('auth-source-worker.js').runDurableAuthSourceWorker({ configBytes: readFileSync(path.join(root, 'config/runtime/auth-source-dag.json')),
      adapter: { acquireLegacyProducerLease: async () => ({ runId: 'lost-run', job: { jobId: 'lost-job' }, disposition: 'created' }),
        claimLegacyProducerJob: async () => ({ jobId: 'lost-job', stage: stages[0] }), heartbeatLegacyProducerJob: async () => false,
        completeLegacyProducerJob: async () => { throw new Error('must not complete after lease loss'); },
        appendLegacyRuntimeFailureDiagnostic:async()=>true,
        failLegacyProducerJob: async () => { failedAfterLoss = true; return { status: 'failed' }; } },
      sourceCommitSha: 'a'.repeat(40), workerBytes: Buffer.from('reviewed-worker'), heartbeatIntervalMs: 1,
      stageHandlers: { [stages[0]]: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); return runtime('codec.js').immutableBundle('lost', []); } },
      ownerToken: '00000000-0000-4000-8000-000000000001' });
    assert.equal(lost.disposition, 'lease_lost'); assert.equal(failedAfterLoss, false);
  },
  'PCR-007': () => {
    const revisions = Array.from({ length: 2549 }, (_, index) => ({ identityKey: String(index).padStart(4, '0') })); let cursor = null; let seen = 0;
    do { const page = runtime('source-revision-pagination.js').pageSelectedRevisionCursor({ revisions, after: cursor }); seen += page.rows.length; cursor = page.nextCursor; assert.equal(page.selectedCount, 1000); } while (cursor);
    assert.equal(seen, 1000); assert.throws(() => runtime('source-revision-pagination.js').pageSelectedRevisionCursor({ revisions, after: '9999' }), /cursor must exist/u);
    const bootstrap = runtime('production-authority-bootstrap.js');
    const twse = Array.from({ length: 900 }, (_, index) => ({ 出表日期: '1150807', 公司代號: String(1000 + index),
      公司名稱: `上市公司${index}股份有限公司`, 公司簡稱: `上市${index}`, 產業別: '24', 上市日期: '20200101' }));
    const tpex = Array.from({ length: 800 }, (_, index) => ({ Date: '1150807', SecuritiesCompanyCode: String(2000 + index),
      CompanyName: `上櫃公司${index}股份有限公司`, CompanyAbbreviation: `上櫃${index}`,
      SecuritiesIndustryCode: '30', DateOfListing: '20200101' }));
    const roster = bootstrap.normalizeOfficialRoster(twse, tpex);
    assert.equal(roster.length, 1700); assert.deepEqual([roster[0].exchange, roster.at(-1).exchange], ['TWSE','TPEX']);
    const document = bootstrap.prepareLegacyDocument({ platform: 'ptt', id: 'document-1', external_id: null,
      title: '6239 股票', summary: '', content_text: '力成財報更新', document_url: 'https://example.test/post/1',
      published_at: '2026-08-07T01:00:00Z', collected_at: '2026-08-07T01:01:00Z' },
    '00000000-0000-4000-8000-000000000001');
    assert.equal(document.sourceKey, 'ptt'); assert.equal(document.acquisitionStatus, 'complete');
    assert.match(document.ingestionContentRevisionSha256, /^[0-9a-f]{64}$/u);
    assert.match(document.ingestionCanonicalContentHashV3, /^[0-9a-f]{64}$/u);
    assert.throws(() => bootstrap.prepareLegacyDocument({ platform: 'youtube', id: 'future-publication',
      title: '2330', summary: '', content_text: '', document_url: null,
      published_at: '2026-08-08T02:00:00Z', collected_at: '2026-08-08T01:00:00Z' },
    '00000000-0000-4000-8000-000000000001'), /publication timestamp after collection/u);
    const sourceCommit = 'a'.repeat(40); const attestationCommit = 'b'.repeat(40);
    const unsignedAuthority = { approvedAt: '2026-08-08T01:00:00Z', approvedBy: 'repository-owner',
      attestationCommit, commitSha: sourceCommit, expiresAt: '2026-08-08T01:15:00Z',
      mutation: 'production_authority_bootstrap', nonce: 'c'.repeat(32),
      schema: 'stockinsider-production-authority-bootstrap-v1' };
    const authorityKey = 'bootstrap-test-hmac-key';
    const authority = { ...unsignedAuthority,
      signature: createHmac('sha256', authorityKey).update(canonicalJson(unsignedAuthority)).digest('hex') };
    assert.equal(bootstrap.validateBootstrapAuthority(authority, { sourceCommit, attestationCommit },
      new Date('2026-08-08T01:05:00Z'), () => authorityKey), authority);
    assert.throws(() => bootstrap.validateBootstrapAuthority({ ...authority, commitSha: 'd'.repeat(40) },
      { sourceCommit, attestationCommit }, new Date('2026-08-08T01:05:00Z'), () => authorityKey),
    /production_authority_bootstrap_required/u);
    const bootstrapRuntime = mkdtempSync(path.join(os.tmpdir(), 'bootstrap-authority-nonce-'));
    try {
      bootstrap.consumeBootstrapNonce(bootstrapRuntime, authority);
      assert.throws(() => bootstrap.consumeBootstrapNonce(bootstrapRuntime, authority),
        /production_authority_bootstrap_required/u);
    } finally { rmSync(bootstrapRuntime, { recursive: true, force: true }); }
    const bootstrapSource = readFileSync(path.join(root, 'scripts/runtime/production-authority-bootstrap.js'), 'utf8');
    assert.match(bootstrapSource, /pg_advisory_lock/u); assert.match(bootstrapSource, /pg_advisory_unlock/u);
    assert.match(bootstrapSource, /if \(inTransaction\) await client[.]query\('ROLLBACK'\)/u);
  },
  'PCR-008': () => {
    const join = runtime('instrument-authority-join.js').resolveInstrumentAuthorityJoin; const roster = [{ stockId: '00000000-0000-4000-8000-000000002337', symbol: '2337', officialName: '旺宏', status: 'active' }];
    assert.equal(join({ symbol: '2337', roster }).stockId, roster[0].stockId); assert.equal(join({ symbol: '', chineseName: '未知', roster }).reason, 'missing_instrument_authority');
    assert.equal(join({ symbol: '2337', roster }).stockId, roster[0].stockId);
    assert.match(readFileSync(path.join(root, 'scripts/runtime/instrument-authority-join.js'), 'utf8'), /candidate\.stockId/u);
  },
  'PCR-009': () => {
    const disposition = runtime('discovery-disposition.js').deriveDiscoveryDisposition({ linked: { disposition: 'linked', stockId: 's', symbol: '9999' }, seedSymbols: seeds(), priorLedger: [], evidenceHash: 'x' });
    assert.deepEqual([disposition.reason, disposition.researchDisposition, disposition.seedMembership], ['new_out_of_seed_symbol','source_signal_only','out_of_seed']);
    const funnel = runtime('candidate-funnel.js').buildCandidateFunnel({ outcomes: [{
      name: '新公司', sourceSummary: '新公司 9999 財報轉強。', raw: '9999', claimId: 'c', mentionId: 'm',
      sourceClass: 'official', link: { disposition: 'linked', stockId: 's', symbol: '9999' },
    }], seedSymbols: seeds(), priorLedger: [] });
    assert.deepEqual([funnel.candidateLedger[0].name, funnel.candidateLedger[0].sourceSummary],
      ['新公司', '新公司 9999 財報轉強。'], 'official identity and source context survive funnel ranking');
    const worstCaseSignals = Array.from({ length: 30 }, (_, index) => ({
      symbol: String(1000 + index), name: '名'.repeat(40), disposition: 'promoted', reason: 'new_source_evidence',
      sourceClass: 'official', sourceSummary: '摘'.repeat(180), raw: String(1000 + index), claimId: `claim-${index}`,
      lastEvaluatedAt: '2026-08-01T10:20:00Z',
      ...citedPublicationEvidence(`claim-${index}`),
      researchScore: { underreactionScore:80-index/10,coverage:0.85,confidence:0.82,researchDisposition:'research_now',
        reasons:[{ axis:'fundamental',reason:'official_revenue_not_deteriorating' },
          { axis:'valuation',reason:'pe_compared_with_sector_and_own_history' },{ axis:'priceDislocation',reason:'drawdown_without_revenue_deterioration' }],
        risks:['formal_valuation_target_unavailable'],missingAxes:[],priceContext:{ currentPrice:100+index,drawdown60Pct:-18,
          drawdown120Pct:-24,bias20Pct:-8,bias60Pct:-12,bias120Pct:-18,rsi14:31,volumeRatio20:1.4,
          relativeStrength20Pct:-6,technicalState:'reclaim_required' },axes:{ fundamental:{ yoyGrowth:12.3 },
          valuation:{ currentPe:12.4,sectorPe:18.6,historyPeMedian:16.8,historyPeMin:11.2,historyPeMax:23.1,
            historySampleCount:4,asOf:'2026-08-01',sourceRef:`twse-openapi:BWIBBU_ALL:2026-08-01:${1000+index}`,
            historyAsOf:['2026-07-01','2026-05-01','2026-02-01','2025-08-01'] } } },
    }));
    const compact = runtime('compact-radar-projection.js').publishCompactRadarProjection({
      decisions: [], sourceCandidates: worstCaseSignals,
      discoveryDelta: { added: [], exited: [], continued: [], unchangedReasons: [] },
      window: 'daily', asOf: '2026-08-01T10:20:00Z', producerIdentity: { commitSha: 'a'.repeat(40) },
      legacyPayload: { opportunities: [], boundedLegacyPadding: 'x'.repeat(110_000) },
    });
    assert.equal(compact.payload.sourceSignals.length, 30, 'all bounded top-30 source signals remain visible');
    assert.ok(runtime('codec.js').byteLength(compact.payload) <= 150_000, 'worst-case named source signals fit the compact payload');
    assert.ok(compact.payload.sourceSignals.every((signal) => !Object.hasOwn(signal, 'researchDecision')),
      'source-signal cards omit duplicated optional recommendation metadata that the UI never consumes');
    const projection = runtime('compact-radar-projection.js');
    const selectiveMarket = { status: 'selective_or_defensive', completeness: 1 };
    const starterScore = {
      underreactionScore: 78, coverage: 1, confidence: 0.9, missingAxes: [],
      axes: {
        fundamental: { score: 88, trustworthy: true },
        priceDislocation: { score: 92, trustworthy: true },
        valuation: { score: 68, trustworthy: true,currentPe:10,historyPeP25:10,historyPeMedian:15,
          historyPeP75:20,sectorPe:16,historySampleCount:252,sectorCount:8,asOf:'2026-08-01',
          valuationEvidence:{algorithm:'official-relative-pe-evidence-v1',evidenceRoot:'a'.repeat(64),
            currentObservationRoot:'b'.repeat(64),historyMembershipRoot:'c'.repeat(64),
            sectorMembershipRoot:'d'.repeat(64),historySessions:252,sectorPeers:8},
          sourceRefs:['twse-openapi:BWIBBU_ALL:2026-08-01:9999'] },
        timing: { score: 76, trustworthy: true, technicalState: 'at_support' },
      }, priceContext: { technicalState: 'at_support',currentPrice:100 },
    };
    const starterInput={researchScore:starterScore,technical:{technicalState:'at_support',plane:{current:100}},
      geometry:{availability:'available',entryZone:[99,101],invalidation:95},qualityActionEligible:true,
      marketAllowsAction:true,lastEvaluatedAt:'2026-08-01T10:20:00Z'};
    const decisionEnvelope=runtime('decision-envelope.js').deriveDecisionEnvelope(starterInput);
    const setupReady = projection.derivePublicOpportunityView({ ...starterInput,decisionEnvelope }, selectiveMarket);
    assert.deepEqual([setupReady.opportunityAction,setupReady.decisionEnvelope.userAction,
      setupReady.decisionEnvelope.recommendationAuthority,setupReady.decisionEnvelope.valuationSummary.kind],
    ['setup_ready','research_starter','conditional_research','relative_reference_band'],
    'a complete relative-value case can become a research starter without fabricating a formal target');
    assert.equal(projection.derivePublicOpportunityView({ researchScore: {
      underreactionScore: 82, coverage: 1, confidence: 0.9, missingAxes: [],
      axes: { fundamental: { score: 90, trustworthy: true }, priceDislocation: { score: 90, trustworthy: true },
        valuation: { score: 80, trustworthy: true }, timing: { score: 18, trustworthy: true, technicalState: 'extended' } },
      priceContext: { technicalState: 'extended' },
    } }, selectiveMarket).opportunityAction, 'evidence_watch', 'missing valuation cannot be mislabeled as a technical avoid');
    assert.equal(projection.derivePublicOpportunityView({ researchScore: {
      underreactionScore: 82, coverage: 0.85, confidence: 0.8, missingAxes: ['valuation'],
      axes: { fundamental: { score: 90, trustworthy: true }, priceDislocation: { score: 90, trustworthy: true },
        valuation: { score: null, trustworthy: false }, timing: { score: 76, trustworthy: true, technicalState: 'at_support' } },
      priceContext: { technicalState: 'at_support' },
    } }, selectiveMarket).opportunityAction, 'evidence_watch', 'missing relative valuation cannot become a setup-ready candidate');
    const worker = runtime('auth-source-worker-cli.js');
    const priceHistory = Array.from({ length: 20 }, (_, index) => ({ session: `2026-07-${String(index + 1).padStart(2, '0')}`,
      open: 99, high: 101, low: 98, close: 100, volume: 1000 }));
    assert.equal(worker.priceResearchAxes(priceHistory, { currentPrice: 100, high20: 110, high60: 120, ma20: 100 }, []).timing.technicalState,
      'at_support', 'reasonable MA20 deviation is not mislabeled as an unconfirmed breakout');
    const aligned = projection.publishCompactRadarProjection({ decisions: [], sourceCandidates: [{
      symbol: '6285', name: '啟碁', disposition: 'promoted', reason: 'price_dislocation', sourceSummary: '官方證據',
      ...citedPublicationEvidence('claim-6285'),
      researchScore: { underreactionScore: 78, coverage: 1, confidence: 0.9, missingAxes: [],
        axes: { fundamental: { score: 88, trustworthy: true }, priceDislocation: { score: 92, trustworthy: true },
          valuation: { score: 68, trustworthy: true }, timing: { score: 76, trustworthy: true, technicalState: 'at_support' } },
        priceContext: { technicalState: 'at_support', bias20Pct: 0.2 } },
    }], discoveryDelta: { added: [], exited: [], continued: [], unchangedReasons: [] }, window: 'daily',
      asOf: '2026-08-01T10:20:00Z', producerIdentity: { commitSha: 'a'.repeat(40) },
      legacyPayload: { opportunities: [], marketRegime: 'risk-on', marketIndexSignal: { status: 'risk_on_can_attack' },
        marketHighlightSummary: { regimeLabel: '風險偏好擴張' } },
      marketAnalysis: { asOf: '2026-08-01T10:20:00Z', status: 'selective_or_defensive', completeness: 1,
        components: { taiex: { state: 'uptrend', drawdownPct: -5.94 }, otc: { state: 'uptrend', drawdownPct: -13.74 },
          breadth: { aboveMa20Pct: 49.12 }, foreignFlow: { net1d: -51870490959 } }, missingComponents: [] },
    });
    assert.deepEqual([aligned.payload.marketRegime, aligned.payload.marketIndexSignal.status,
      aligned.payload.sourceSignals[0].opportunityAction], ['selective-risk-on','selective_only','evidence_watch'],
    'legacy risk-on wording cannot contradict the valuation authority gate');
    assert.match(aligned.payload.underreactionMarket.summary, /外資單日淨賣超 518[.]7 億元/u);
  },
  'PCR-010': () => {
    const select = runtime('candidate-funnel.js').selectLiveDiscoveryCards;
    assert.deepEqual(select({ candidateLedger: [], totalOutage: true }), { cards: [], fallback: 'total_outage_zero_cards' });
    assert.equal(select({ candidateLedger: [{ symbol: '2337', disposition: 'rejected' }] }).cards.length, 0);
  },
  'PCR-011': () => {
    const mentions = Array.from({ length: 1000 }, (_, index) => ({ raw: String(1000 + index) }));
    const parsed = runtime('source-claim-extraction.js').writeRevisionEvidenceOutcomes({ revision: { revisionId: 'r' }, mentions,
      resolveInstrument: (mention) => mention.raw === '1001' ? (() => { throw new Error('provider'); })() : ({ disposition: 'linked', stockId: mention.raw, symbol: mention.raw }) });
    assert.equal(parsed.mentionCount, 1000); assert.equal(parsed.claimCount, 200); assert.equal(parsed.outcomes.filter((row) => row.rejectionReason === 'claim_cap_exceeded').length, 799);
    assert.equal(parsed.outcomes[1].rejectionReason, 'source_resolution_failed');
  },
  'PCR-012': () => {
    const bridge = runtime('valuation-operating-bridge.js').buildPointInTimeOperatingBridge({ revenue: 56.39, grossProfit: 18, operatingIncome: 5.639, pretaxIncome: 2.1, netIncome: 1.7721, dilutedShares: 1.969 });
    assert.ok(Math.abs(bridge.eps - 0.9) < 1e-12); assert.notEqual(bridge.eps, 30.04);
    assert.equal(runtime('valuation-operating-bridge.js').buildPointInTimeOperatingBridge({ revenue: 56.39 }).status, 'valuation_review');
    const domain = readFileSync(path.join(root, 'web/src/lib/domain.ts'), 'utf8');
    assert.match(domain, /const STOCK_SPECIFIC_BRIDGE_SEEDS:[^=]+=[^;]+Object[.]freeze\(\{\}\);/u);
    assert.match(domain, /const SEED_RESEARCH_OVERRIDES:[^=]+=[^;]+Object[.]freeze\(\{\}\);/u);
    const revenueReader = domain.slice(domain.indexOf('function buildRevenueSignalViewFromRows'), domain.indexOf('function buildFundamentalSnapshotViewFromRows'));
    const fundamentalReader = domain.slice(domain.indexOf('function buildFundamentalSnapshotViewFromRows'), domain.indexOf('function selectLatestPreferredRow'));
    assert.doesNotMatch(revenueReader, /SeedFallback|SEED_RESEARCH_OVERRIDES|TW_STORY_RESEARCH_SEEDS/u);
    assert.doesNotMatch(fundamentalReader, /SeedFallback|SEED_RESEARCH_OVERRIDES|TW_STORY_RESEARCH_SEEDS/u);
    const fallbackRecommendation = domain.slice(domain.indexOf('function fallbackRecommendation(seed:'), domain.indexOf('function fallbackThemeRows'));
    for (const token of ['targetPrice: null', 'stopLoss: null', "valuationSource: 'missing'", 'baseTarget: null', 'upsideTarget: null']) {
      assert.ok(fallbackRecommendation.includes(token), `non-authoritative seed boundary: ${token}`);
    }
    assert.match(fallbackRecommendation, /estimatedCatalystDate: null/u);
    assert.doesNotMatch(domain, /CATALYST_DATE_MAP/u);
    const fallbackDeepDive = domain.slice(domain.indexOf('async function fallbackStockDeepDive'), domain.indexOf('async function getDiscoveredStocks'));
    for (const token of ["freshness: 'missing'", 'evidenceItems: []', 'valuationCases: []', 'companyEvents: []', 'sourceCoverage: []', 'evidenceMatrix: []']) {
      assert.ok(fallbackDeepDive.includes(token), `fallback cannot fabricate freshness: ${token}`);
    }
    const fallbackInsight = domain.slice(domain.indexOf('async function fallbackStockInsight'), domain.indexOf('function fallbackThemeDetail'));
    assert.match(fallbackInsight, /const chart = realChart \?\? \[\]/u);
    assert.match(fallbackInsight, /chipMetrics: \{ source: 'unavailable' \}/u);
    assert.doesNotMatch(fallbackInsight, /seed[.]prices[.]map|foreign_net|positionSizeRule|8-12%/u);
    const fallbackThemes = domain.slice(domain.indexOf('function fallbackThemeRows'), domain.indexOf('async function fetchHistoricalPrices'));
    for (const token of ["verificationStatus: '未證實'", 'sourceCoverage: []', 'evidenceCount: 0', 'heatScore: 0', "asOfDate: ''", "freshness: 'missing'"]) {
      assert.ok(fallbackThemes.includes(token), `fallback theme/dashboard cannot fabricate freshness: ${token}`);
    }
    assert.doesNotMatch(fallbackThemes, /asIsoDate\(nowIso\(\)\)|asOf: nowIso\(\)|demo-daily-radar-|demo-theme-/u);
    const fallbackRadar = domain.slice(domain.indexOf('function fallbackRadarPayload'), domain.indexOf('function unavailableRadarPayload'));
    for (const token of ["asOf: ''", "marketRegime: 'producer-unavailable'", 'marketRegimeUpdatedAt: null', 'themeHeatUpdatedAt: null', "marketFreshnessStatus: 'missing'"]) {
      assert.ok(fallbackRadar.includes(token), `fallback radar cannot fabricate current market state: ${token}`);
    }
    const metricReaders = domain.slice(domain.indexOf('function buildRevenueSignalViewFromRows'), domain.indexOf('function selectLatestPreferredRow'));
    assert.doesNotMatch(metricReaders, /fallbackAsOf\s*\|\||nowIso\(\)/u);
    assert.equal((metricReaders.match(/filter\(\(row\) => pointInTimeMetricDate\(row\) !== null\)/gu) || []).length, 2);
    const staticRegistry = domain.slice(domain.indexOf('function globalLeadLagSignalForSymbol'), domain.indexOf('function mergeThemeWithRegistry'));
    assert.doesNotMatch(staticRegistry, /asOf: nowIso\(\)|source_timestamp: nowIso\(\)|asOfDate: asIsoDate\(nowIso\(\)\)/u);
  },
  'PCR-013': () => {
    const select = runtime('valuation-comparables.js').selectComparableValuationInputs; const roster = ['s','a','b','c','d','e','f','g','h'].map((stockId) => ({ stockId, sector: 'electronics' }));
    const multiples = ['a','b','c','d','e','f','g','h'].flatMap((stockId) => [{ stockId, method: 'pe', value: 10, asOf: '2026-01-01' }, { stockId, method: 'pe', value: 99, asOf: '2027-01-01' }]);
    const result = select({ subjectStockId: 's', roster, multiples, cutoff: '2026-06-01', sector: 'electronics' });
    assert.equal(result.availability, 'available'); assert.ok(result.rows.every((row) => row.value === 10));
    const ownPe = peRows(252, 's'); const latest = ownPe.at(-1).asOf;
    const sectorPe = Array.from({ length: 8 }, (_, index) => ({ stockId: `peer-${index}`, authority: 'official', value: 9 + index / 10,
      asOf: latest, sector: 'electronics', close: 100 + index, sharesOutstanding: 1_000_000 + index,
      tradingSessionAuthorityHash: 'a'.repeat(64) }));
    const golden = runtime('candidate-valuation.js').evaluateCandidateValuation({ stockId: 's', cutoff: '2026-06-01', asOf: '2026-06-01',
      facts: { revenue: 56.39, grossProfit: 18, operatingIncome: 5.639, pretaxIncome: 2.1, netIncome: 1.7721,
        dilutedShares: 1.969,depreciationAmortization:1,monthlyRevenueHistory:Array.from({length:18},(_,index)=>40+index),
        quarterlyRevenueHistory:[11,12,13,14,15,16,17,18],quarterlyNetIncomeRevenueHistory:[11,12,13,14,15,16,17,18],
        quarterlyNetIncomeHistory:[.5,.6,.7,.8,.9,1,1.1,1.2] }, roster, multiples,
      evidence: [{ stockId: 's', companySpecific: true, publishedAt: '2026-05-01', sourceRef: 'macronix-q1-2026' }],
      sector: 'electronics', cycleHistory: Array(12).fill(.9), crossCheck: { primary: 10, secondary: 11 },
      rows: [...ownPe, ...sectorPe], tradingSessionAuthorityHash: 'a'.repeat(64),
      scenarios: { bear: { multiple: 8, asOf: '2026-06-01', sourceRef: 'cycle-bear' },
        base: { multiple: 10, asOf: '2026-06-01', sourceRef: 'cycle-base' },
        bull: { multiple: 12, asOf: '2026-06-01', sourceRef: 'cycle-bull' } },
      valuationScores: { scenarioBridgeScore: 70, capitalStructureScore: 65, crossCheckScore: 80 } });
    assert.equal(golden.status, 'normal'); assert.ok(Math.abs(golden.eps - 0.9) < 1e-12);
    assert.ok(Number.isFinite(golden.targetPrice)&&golden.targetPrice>0); assert.notEqual(golden.eps, 30.04);
    const incomplete = runtime('candidate-valuation.js').evaluateCandidateValuation({ stockId: 's', cutoff: '2026-06-01', facts: { revenue: 56.39 } });
    assert.deepEqual([incomplete.status, incomplete.reason, incomplete.eps, incomplete.targetPrice], ['valuation_review','missing_valuation_method',null,null]);
  },
  'PCR-014': () => {
    const select = runtime('valuation-method.js').selectSectorValuationMethod;
    assert.equal(select({ sector: 'x', netIncome: -1, ebitda: 2, revenue: 5 }).method, 'ev_ebitda');
    assert.equal(select({ sector: 'information_service', netIncome: -1, ebitda: -1, revenue: 5, grossProfit: 2 }).method, 'ev_sales');
    assert.equal(select({ sector: 'finance_insurance', netIncome: 1, bookValue: 5, roe: 8 }).method, 'pb_roe');
    assert.equal(select({ sector: 'semiconductor', netIncome: 1, cycleHistory: [], crossCheck: null }).availability, 'unavailable');
  },
  'PCR-015': () => {
    const verify = runtime('valuation-evidence.js').verifyCompanyValuationEvidence;
    assert.equal(verify({ stockId: 's', cutoff: '2026-01-02T00:00:00Z', evidence: [{ stockId: 's', companySpecific: true, publishedAt: '2026-01-01T00:00:00Z' }] }).availability, 'available');
    assert.equal(verify({ stockId: 's', cutoff: '2026-01-02T00:00:00Z', evidence: [{ stockId: 's', companySpecific: true, publishedAt: '2026-01-03T00:00:00Z' }] }).availability, 'unavailable');
  },
  'PCR-016': () => {
    const derive = runtime('technical-state.js').deriveTechnicalEntryState;
    const base = { availability: 'available', current: 99, previousClose: 101, support: 100, resistance: 110,
      atr14: 2, ma20: 100, rsi14: 45, volumeRatio20: 1, macdHistogram: -0.1, relativeStrengthTaiex20: -1 };
    const crossed = derive({ plane: base });
    const stayed = derive({ plane: { ...base, previousClose: 99, brokeSupportPrior20: true } });
    assert.equal(crossed.technicalState, 'below_support'); assert.equal(stayed.technicalState, 'reclaim_required'); assert.equal(stayed.trigger.kind, 'reclaim'); assert.equal(stayed.entryZone, null);
  },
  'PCR-017': () => {
    const validate = runtime('technical-entry-geometry.js').validateLongEntryGeometry;
    assert.equal(validate({ technicalState: 'at_support', currentPrice: 100, entryZone: [99,101], invalidation: 98 }).availability, 'available');
    assert.equal(validate({ technicalState: 'at_support', currentPrice: 100, entryZone: [99,101], invalidation: 100 }).availability, 'unavailable');
    assert.equal(validate({ technicalState: 'reclaim_required', currentPrice: 90, entryZone: [99,101], invalidation: 88 }).availability, 'unavailable');
  },
  'PCR-018': () => {
    const rows = ohlcv(130); const plane = runtime('technical-plane.js').calculateAdjustedTechnicalPlane({ rows, asOf: '2030-01-01T00:00:00Z', benchmark: ohlcv(130), sector: ohlcv(130) });
    assert.equal(plane.availability, 'available'); assert.ok(Number.isFinite(plane.bias.bias20Pct)); assert.ok(plane.support < plane.resistance); assert.equal(plane.relativeStrength, 0);
    assert.ok(Number.isFinite(plane.macdSignal)); assert.ok(Number.isFinite(plane.macdHistogram));
    assert.equal(runtime('technical-plane.js').calculateAdjustedTechnicalPlane({ rows: [...rows, { ...rows.at(-1), session: '2031-01-01T00:00:00Z' }], asOf: '2030-01-01T00:00:00Z', benchmark: ohlcv(130) }).reason, 'future_observation');
    assert.equal(runtime('technical-plane.js').calculateAdjustedTechnicalPlane({ rows: rows.slice(0,121), asOf: '2030-01-01T00:00:00Z' }).reason, 'insufficient_adjusted_history');
  },
  'PCR-019': () => {
    const hash = runtime('analysis-material-change.js').hashMaterialAnalysisChange;
    const base = hash({ facts: { x: 1 }, factor: { version: 'v1' } }); assert.equal(base.materialChangeHash, hash({ facts: { x: 1 }, factor: { version: 'v1' } }).materialChangeHash);
    assert.notEqual(base.materialChangeHash, hash({ facts: { x: 1 }, factor: { version: 'v2' } }).materialChangeHash);
  },
  'PCR-020': () => {
    const append = runtime('analysis-revision.js').appendAnalysisRevision; const first = append({ input: { facts: { x: 1 } }, changedBecause: ['financial_fact_changed'], now: '2026-01-01T00:00:00Z' });
    const second = append({ priorRevision: first.revision, input: { facts: { x: 1 } }, changedBecause: [], now: '2026-01-02T00:00:00Z' });
    assert.equal(first.disposition, 'appended'); assert.equal(second.disposition, 'unchanged'); assert.equal(second.revision.analysisGeneratedAt, '2026-01-01T00:00:00Z');
  },
  'PCR-021': () => {
    const serialize = runtime('public-projection.js').serializeOpportunityPublicProjection;
    assert.equal(serialize({ mode: 'disabled' }), null); assert.equal(serialize({ mode: 'drain' }), null);
    const fundamental = { thesis: '9999 已有可追溯基本面證據。', latestChange: '本次重新檢查基本面品質。',
      risks: ['仍須持續追蹤財務風險。'], evidenceRefs: ['official-9999'], asOf: '2026-08-01T00:00:00Z' };
    const shadow = serialize({ mode: 'shadow', legacy: { legacyField: 7 }, cards: [{ symbol: '9999', action: 'valuation_review',
      fundamental, lastEvaluatedAt: '2026-08-01T00:00:00Z' }] });
    assert.equal(shadow.legacyField, 7); assert.equal(shadow.cards[0].symbol, '9999');
  },
  'PCR-022': async () => {
    const payload = { sourceLedCorrectness: { schema: 'legacy-radar-v3.11.3', window: 'daily', asOf: '2026-08-01T00:00:00Z' }, opportunities: [] };
    const hash = sha256(canonicalJson(payload)); const newest = { payload_json: payload, payload_sha256: hash,
      as_of: '2026-08-01T00:00:00Z', created_at: '2026-08-01T00:01:00Z', projection_id: 'a' };
    assert.equal(validateCompactRadarProjectionRow('daily', newest), payload);
    assert.equal(validateCompactRadarProjectionRow('daily', { ...newest, payload_sha256: '0'.repeat(64) }), null);
    assert.equal(compactRadarEtag(payload), `\"sha256:${hash}\"`);
    assert.equal(selectCompactRadarProjectionRows('daily', [newest]), payload);
    assert.throws(() => selectCompactRadarProjectionRows('daily', [newest, { ...newest, payload_sha256: 'f'.repeat(64), projection_id: 'b' }]), /projection_conflict/u);
    await runControlledProjectionPerformanceOracle({ root });
  },
  'PCR-023': () => {
    const candidate = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-v3.yml'), 'utf8');
    const protectedRoot = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-external-gate.yml'), 'utf8');
    const workflows = [candidate, protectedRoot];
    const owners = workflows.flatMap((source, workflowIndex) =>
      [...source.matchAll(/^\s*name:\s*stockinsider-v3-gate-root\s*$/gmu)].map(() => workflowIndex));
    assert.deepEqual(owners, [1], 'only the protected base workflow may own the required check context');
    assert.match(candidate, /name:\s*stockinsider-v3-diagnostic-product-runtime/u);
    assert.match(candidate, /^\s*pull_request:\s*$/mu);
    assert.doesNotMatch(candidate, /pull_request_target|continue-on-error:\s*true|name:\s*stockinsider-v3-gate-root/u);
    assert.match(protectedRoot, /^\s*pull_request_target:\s*$/mu);
    assert.match(protectedRoot, /ref:\s*\$\{\{ github[.]event[.]pull_request[.]base[.]sha \}\}/u);
    assert.match(protectedRoot, /stockinsider-v3-gate-bootstrap-\$\{\{ github[.]event[.]pull_request[.]head[.]sha \}\}/u);
    const bootstrap = readFileSync(path.join(root, 'scripts/opportunity-v3/protected-gate-root.mjs'), 'utf8');
    for (const token of ['event base must equal protected checkout','event head must equal attested subject',
      'registryCommitSha: baseCommitSha','registryTreeSha:',"schema: 'stockinsider-external-gate-attestation-v1'"]) {
      assert.ok(bootstrap.includes(token), `protected provenance: ${token}`);
    }
    assert.match(bootstrap, /requiredKeys\(event, \['action', 'number', 'pull_request', 'repository'\]/u);
    assert.doesNotMatch(bootstrap, /exactKeys\(event, \['action', 'number', 'pull_request', 'repository'\]/u);
    assert.match(readFileSync(path.join(root, 'scripts/opportunity-v3/gate-evidence.mjs'), 'utf8'), /validateOpportunityGateEvidence/u);
  },
  'PCR-024': () => {
    const component = readFileSync(path.join(root, 'web/src/app/components/RadarTabs.tsx'), 'utf8');
    const types = readFileSync(path.join(root, 'web/src/lib/types.ts'), 'utf8');
    const gateRunner = readFileSync(path.join(root, 'scripts/opportunity-v3/acceptance-gate-runner.mjs'), 'utf8');
    const workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-v3.yml'), 'utf8');
    for (const token of ['研究與進場判斷','四軸研究評分','乖離率與本益比脈絡','基本面品質','時機風險',
      '乖離率（BIAS）','交易所','模型','min-w-0','break-words','sourceSignals','新來源訊號','估值待補',
      'decisionEnvelope','現在可行動','等待條件','新來源待研究','估值來源：{signal.valuationExchange']) assert.ok(component.includes(token), token);
    for (const token of ['exchangeReportedPe','modelComparablePe','bias20Pct','timingRisk']) assert.ok(types.includes(token), token);
    assert.match(gateRunner, /PLAYWRIGHT_BROWSERS_PATH: '0'/u);
    assert.match(gateRunner, /const traceHome = track === 'model_runner' \? process\.env\.HOME \?\? '' : '\/tmp';/u);
    assert.match(gateRunner, /const traceTemp = track === 'model_runner' \? process\.env\.TMPDIR \?\? '' : '\/tmp';/u);
    assert.match(gateRunner, /model trace must retain one staged HOME\/TMPDIR/u);
    assert.ok(gateRunner.includes('/^\\/usr\\/lib\\/postgresql\\/[0-9]+\\/bin$/u'));
    assert.match(gateRunner, /product trace PostgreSQL bin is non-world-writable/u);
    assert.match(gateRunner, /for \(const name of \['initdb', 'pg_ctl', 'psql'\]\)/u);
    assert.match(gateRunner, /OPPORTUNITY_V3_POSTGRES_BIN: directory/u);
    assert.match(gateRunner, /PATH: `\$\{directory\}\$\{path[.]delimiter\}\/usr\/local\/bin:\/usr\/bin:\/bin`/u);
    assert.match(gateRunner, /HOME: traceHome/u);
    assert.match(gateRunner, /TMPDIR: traceTemp/u);
    assert.match(workflow, /PLAYWRIGHT_BROWSERS_PATH: "0"/u);
    assert.match(workflow, /[.]\/node_modules\/[.]bin\/playwright install --with-deps chromium/u);
    const output = execFileSync('npm', ['--prefix', 'web', 'run', 'test:e2e:v3-correctness'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    assert.match(output, /8 passed/u);
    assert.doesNotMatch(output, /skipped/u);
  },
  'PCR-025': () => {
    const select = runtime('bias-technical-history.js').selectBiasTechnicalHistory;
    assert.equal(select({ rows: ohlcv(370), asOf: '2030-01-01T00:00:00Z' }).reason, 'insufficient_own_history');
    assert.equal(select({ rows: ohlcv(371), asOf: '2030-01-01T00:00:00Z' }).endpointCount, 252);
    assert.equal(select({ rows: ohlcv(877), asOf: '2030-01-01T00:00:00Z' }).endpointCount, 758);
    assert.equal(select({ rows: ohlcv(878), asOf: '2030-01-01T00:00:00Z' }).reason, 'bias_selection_bound_violation');
  },
  'PCR-026': () => {
    const build = runtime('bias-universe-manifest.js').buildBiasUniverseManifest;
    const roster = Array.from({ length: 20000 }, (_, index) => ({ stockId: `s${String(index).padStart(5,'0')}`, sector: index < 8 ? 'semiconductor' : 'other' }));
    const histories = roster.slice(0,8).map((row) => ({ stockId: row.stockId, rows: ohlcv(20) })); const result = build({ roster, histories });
    assert.equal(result.availability, 'available'); assert.equal(result.sectors.semiconductor.count, 8);
    assert.equal(build({ roster: [...roster, { stockId: 'overflow' }], histories }).reason, 'bias_roster_exceeds_cap');
  },
  'PCR-027': () => {
    const bias = runtime('bias-action-cap.js');
    assert.deepEqual(bias.shadowBiasContribution({ ownLabel: 'extreme_low', sectorPercentile: 0.1, maxPoints: 7 }), { shadowBiasNormalized: 1, shadowBiasPoints: 7, promotedScoreInfluence: 0 });
    assert.equal(bias.applyBiasActionCap({ action: 'starter_now', bias20Atr: -3, technicalState: 'at_support' }).reason, 'bias_observe_only');
    assert.equal(bias.applyBiasActionCap({ action: 'starter_now', bias20Atr: -3, technicalState: 'reclaim_required' }).reason, 'reclaim_required');
  },
  'PCR-028': () => {
    const select = runtime('reported-pe-authority.js').selectOfficialReportedPe; const own = peRows(252); const latest = own.at(-1).asOf;
    const sector = Array.from({ length: 8 }, (_, index) => ({ stockId: `peer${index}`, authority: 'official', value: 9 + index, asOf: latest, sector: 'semiconductor', close: 100 + index, sharesOutstanding: 1000 + index, tradingSessionAuthorityHash: 'a'.repeat(64) }));
    const result = select({ stockId: 'subject', asOf: '2030-01-01T00:00:00Z', rows: [...own, ...sector], sector: 'semiconductor', tradingSessionAuthorityHash: 'a'.repeat(64) });
    assert.equal(result.availability, 'available'); assert.equal(result.observations.length, 252); assert.equal(result.sectorReference.count, 8);
    assert.equal(result.current.status,'available');assert.equal(result.ownHistory.count,252);assert.equal(result.sector.count,8);
    assert.equal(select({ stockId: 'subject', asOf: '2030-01-01T00:00:00Z', rows: peRows(1261) }).reason, 'insufficient_own_history');
    const conflict=select({ stockId: 'subject', asOf: '2030-01-01T00:00:00Z', rows: [...own, { ...own.at(-1), value: 99 }] });
    assert.equal(conflict.reason, 'authority_conflict');assert.equal(conflict.current.sourceRef,null);
    assert.equal(conflict.ownHistory.reason,'authority_conflict');assert.equal(conflict.sector.reason,'authority_conflict');
  },
  'PCR-029': () => {
    const calculate = runtime('fundamental-quality.js').calculateFundamentalQualityAxes;
    const boundary = calculate({ roicScore: 50, growthScore: 50, marginScore: 50 }); assert.equal(boundary.availableWeight, 0.65); assert.equal(boundary.qualityActionEligible, true);
    assert.equal(calculate({ roicScore: 49, growthScore: 49, marginScore: 49 }).qualityActionEligible, false);
    assert.equal(calculate({ roicScore: 80, growthScore: 80 }).qualityActionEligible, false);
  },
  'PCR-030': () => {
    const serialize = runtime('public-projection.js').serializeCorrectnessPublicUnion;
    const fundamental = { thesis: '2337 已有可追溯基本面證據。', latestChange: '本次重新檢查基本面品質。',
      risks: ['仍須持續追蹤財務風險。'], evidenceRefs: ['official-2337'], asOf: '2026-08-01T00:00:00Z' };
    const value = serialize({ symbol: '2337', action: 'wait_trigger', researchMaturity: 'fundamental_review', fundamental, technical: { technicalState: 'reclaim_required', trigger: { kind: 'reclaim', threshold: 100, volumeRatioMinimum: 1 }, plane: { maDeviation: -0.08, bias: { availability: 'available', bias20Pct: -8 } } },
      valuation: { status: 'valuation_review', reportedPe: { availability: 'unavailable', reason: 'authority_conflict' } }, evaluationDisposition: 'unchanged', lastEvaluatedAt: '2026-08-01T00:00:00Z', materialChangedBecause: [] });
    assert.equal(value.valuation.exchangeReportedPe.reason, 'authority_conflict');
    assert.equal(value.valuation.exchangeReportedPe.sourceRef,null);
    assert.equal(value.valuation.relativeMultiple.ownHistory.reason,'authority_conflict');
    assert.equal(value.valuation.relativeMultiple.sector.reason,'authority_conflict');
    assert.equal(value.timingRisk.reason, 'reclaim_required'); assert.match(value.noChangeMessage, /無重大變化/u); assert.deepEqual(value.materialChangedBecause, []);
  },
  'PCR-031': () => {
    const identity = runtime('comparison-identity.js'); const base = identity.buildComparableRunIdentity({ asOf: '2026-08-01', universeManifestHash: 'a'.repeat(64) });
    assert.equal(identity.STATIC_IDENTITY_MEMBERS.length, 41); assert.equal(base.comparisonContractKey, 'c81d16af92ec44fc2386165cd70f9665662e2052c680f831c78cf7d324020729');
    for (const [name, value] of identity.STATIC_IDENTITY_MEMBERS) assert.notEqual(identity.buildComparableRunIdentity({ asOf: '2026-08-01', universeManifestHash: 'a'.repeat(64), staticIdentityOverrides: { [name]: `${value}-changed` } }).comparisonContractKey, base.comparisonContractKey, name);
    assert.throws(() => identity.buildComparableRunIdentity({ asOf: 'x', universeManifestHash: 'x', staticIdentityOverrides: { factorCorrectnessContractVersion: null } }), /invalid static identity/u);
  },
};

test('public fundamental provenance remains bounded and fail-closed outside the approved PCR expectation registry', () => {
  const serialize = runtime('public-projection.js').serializeCorrectnessPublicUnion;
  const fundamental = { thesis: '2337 已有可追溯基本面證據。', latestChange: '本次重新檢查基本面品質。',
    risks: ['仍須持續追蹤財務風險。'], evidenceRefs: ['official-2337'], asOf: '2026-08-01T00:00:00Z' };
  for (const malformed of [
    { ...fundamental, thesis: 'x'.repeat(241) }, { ...fundamental, thesis: 'line one\nline two' },
    { ...fundamental, thesis: 'e\u0301' }, { ...fundamental, latestChange: 'x'.repeat(201) },
    { ...fundamental, risks: ['x'.repeat(161)] }, { ...fundamental, evidenceRefs: ['official-2337', 'official-2337'] },
    { ...fundamental, asOf: '2026-08-02T00:00:00Z' },
  ]) assert.throws(() => serialize({ symbol: '2337', fundamental: malformed,
    lastEvaluatedAt: '2026-08-01T00:00:00Z' }), /fundamental/u);
  for (const lastEvaluatedAt of [undefined, null, 'not-a-timestamp', '2026-08-01T08:00:00+08:00']) {
    assert.throws(() => serialize({ symbol: '2337', fundamental, lastEvaluatedAt }),
      /fundamental evaluation cutoff unavailable/u);
  }
  assert.throws(() => serialize({ symbol: '2337', fundamental: { ...fundamental, asOf: '2099-01-01T00:00:00Z' } }),
    /fundamental evaluation cutoff unavailable/u);
  const opaqueEvidenceRef = 'official-e\u0301vidence\nrevision';
  assert.deepEqual(serialize({ symbol: '2337', fundamental: { ...fundamental, evidenceRefs: [opaqueEvidenceRef] },
    lastEvaluatedAt: '2026-08-01T00:00:00Z' }).fundamental.evidenceRefs, [opaqueEvidenceRef],
  'accepted opaque evidence identifiers remain byte-preserving at the public projection boundary');
  const candidate = { stockId: 'stock-2337', symbol: '2337', name: '旺宏', canonicalSector: 'semiconductor',
    claimId: 'claim-2337', claimAsOf: '2026-06-01T08:00:00+08:00', sourcePriority: 70, materialEvidenceHash: 'a'.repeat(64) };
  const empty = runtime('auth-source-worker-cli.js').buildLegacyCandidateDecision({ candidate,
    facts: [], history: ohlcv(130), benchmark: ohlcv(130), sourceCutoff: '2030-01-01T00:00:00Z' });
  assert.deepEqual(empty.fundamental.evidenceRefs, ['claim-2337']);
  assert.equal(empty.fundamental.asOf, '2026-06-01T00:00:00Z');
  const row = (key, value, asOf, ref) => ['stock-2337', key, null, null, null, value, null, null, null, asOf, null, null, ref];
  const unrelated = Array.from({ length: 8 }, (_, index) => row('diluted_shares', 100 + index, '2026-07-01T00:00:00Z', `unrelated-${index}`));
  const factBacked = runtime('auth-source-worker-cli.js').buildLegacyCandidateDecision({ candidate,
    facts: [...unrelated, row('roe', 0.2, '2026-06-01T08:00:00+08:00', 'official-roe')],
    history: ohlcv(130), benchmark: ohlcv(130), sourceCutoff: '2030-01-01T00:00:00Z' });
  assert.deepEqual(factBacked.fundamental.evidenceRefs, ['official-roe']);
  assert.equal(factBacked.fundamental.asOf, '2026-06-01T00:00:00Z');
  const complete = [row('roe', .2, '2026-01-01T00:00:00Z', 'r1'), row('quarterly_revenue', 100, '2026-01-01T00:00:00Z', 'r2'),
    row('quarterly_operating_income', 20, '2026-01-01T00:00:00Z', 'r3'), row('quarterly_net_income', 10, '2026-01-01T00:00:00Z', 'r4'),
    row('operating_cash_flow', 20, '2026-01-01T00:00:00Z', 'r5'), row('capital_expenditure', 5, '2026-01-01T00:00:00Z', 'r6'),
    row('quarterly_ebitda', 30, '2026-01-01T00:00:00Z', 'r7'), row('total_debt', 20, '2026-01-01T00:00:00Z', 'r8'),
    row('cash_and_equivalents', 5, '2026-01-01T00:00:00Z', 'r9'), row('interest_expense', 2, '2026-01-01T00:00:00Z', 'r10')];
  const bounded = runtime('auth-source-worker-cli.js').buildLegacyCandidateDecision({ candidate, facts: complete,
    history: ohlcv(130), benchmark: ohlcv(130), sourceCutoff: '2030-01-01T00:00:00Z' });
  assert.equal(bounded.fundamental.evidenceRefs.length, 1);
  assert.match(bounded.fundamental.evidenceRefs[0], /^fundamental-input-set:[0-9a-f]{64}$/u);
  const priorAlgorithmMaterialHash = runtime('codec.js').sha256(runtime('codec.js').canonicalJson([
    candidate.materialEvidenceHash, [], ohlcv(130).at(-1), ohlcv(130).at(-1), empty.valuation,
    empty.technical, empty.factorAxes,
  ]));
  assert.notEqual(empty.materialChangeHash, priorAlgorithmMaterialHash,
    'the provenance algorithm transition must force a new immutable analysis revision');
  const sourceRevision = {
    sourceIdentityAuthorityId: '00000000-0000-4000-8000-000000000001', stableConnectorDocumentId: 'doc',
    canonicalUrlCandidate: null, publishedAt: '2026-08-01T11:00:00Z', collectedAt: '2026-08-01T10:00:00Z',
    adapterVersion: 'source-adapter-v3.3', acquisitionStatus: 'required_field_missing', rawFieldPayload: null,
    rawCodePointCount: 0, rawFieldPayloadAlgorithmVersion: 'raw-field-payload-v3.0', ingestionContentRevisionSha256: null,
    canonicalContentAlgorithmVersion: 'canonical-content-v3.0', ingestionCanonicalContentHashV3: null, supersedesRevisionId: null,
  };
  assert.equal(validateIngestionValuesV3('append_source_document_revision_v3', sourceRevision), false,
    'ingestion rejects publication timestamps after collection');
});

for (const fixture of fixtures) {
  test(`acceptance ${fixture.id}`, async () => {
    assertImplementedBehaviorBoundary(fixture);
    await checks[fixture.id]();
  });
}

test('V3.12 product-value recovery ranks partial evidence without fabricating a trade target', () => {
  const score = runtime('underreaction-score.js');
  const dislocated = score.computeUnderreactionResearchScore({
    symbol: '2337',
    discovery: { score: 82, trustworthy: true, reason: 'official_material_event' },
    fundamental: { score: 72, trustworthy: true, trend: 'stable', reason: 'revenue_and_margin_not_deteriorating' },
    priceDislocation: { score: 90, trustworthy: true, drawdown60Pct: -24, bias20Pct: -9, reason: 'large_drawdown' },
    valuation: { score: null, trustworthy: false, reason: 'official_history_unavailable' },
    timing: { score: 38, trustworthy: true, technicalState: 'reclaim_required', reason: 'below_support' },
  });
  assert.ok(Number.isFinite(dislocated.underreactionScore));
  assert.ok(dislocated.coverage >= 0.7);
  assert.equal(dislocated.researchDisposition, 'watch_reclaim');
  assert.equal(dislocated.formalTargetPrice, null);
  assert.equal(dislocated.tradeAction, 'valuation_review');
  assert.deepEqual(dislocated.missingAxes, ['valuation']);

  const extended = score.computeUnderreactionResearchScore({
    symbol: '2454',
    discovery: { score: 82, trustworthy: true, reason: 'official_material_event' },
    fundamental: { score: 72, trustworthy: true, trend: 'stable', reason: 'revenue_and_margin_not_deteriorating' },
    priceDislocation: { score: 25, trustworthy: true, drawdown60Pct: -2, bias20Pct: 12, reason: 'extended' },
    valuation: { score: null, trustworthy: false, reason: 'official_history_unavailable' },
    timing: { score: 15, trustworthy: true, technicalState: 'extended', reason: 'extended' },
  });
  assert.ok(dislocated.underreactionScore > extended.underreactionScore);
  assert.deepEqual(score.rankUnderreactionCandidates([extended, dislocated]).map((row) => row.symbol), ['2337', '2454']);

  const thin = score.computeUnderreactionResearchScore({
    symbol: '9999',
    discovery: { score: 80, trustworthy: true, reason: 'community_claim' },
  });
  assert.equal(thin.researchDisposition, 'watch_evidence');
  assert.equal(thin.underreactionScore, null);
  assert.equal(thin.tradeAction, 'valuation_review');
  const weakBelowSupport = score.computeUnderreactionResearchScore({ symbol:'8888',
    discovery:{ score:20,trustworthy:true },fundamental:{ score:20,trustworthy:true },
    priceDislocation:{ score:20,trustworthy:true },timing:{ score:20,trustworthy:true,technicalState:'reclaim_required' } });
  assert.equal(weakBelowSupport.researchDisposition,'avoid');
});

test('V3.12 official valuation parser rejects swapped or non-authoritative values', () => {
  const official = runtime('official-twse-valuation.js');
  const rows = official.parseTwseValuationRows([
    { Date: '1150807', Code: '2330', Name: '台積電', PEratio: '31.86', DividendYield: '0.93', PBratio: '10.43' },
  ], { collectedAt: '2026-08-08T10:20:00Z' });
  assert.deepEqual(rows[0], {
    symbol: '2330', name: '台積電', session: '2026-08-07', peRatio: 31.86, pbRatio: 10.43,
    dividendYield: 0.93, sourceRef: 'twse-openapi:BWIBBU_ALL:2026-08-07:2330',
    sourceUrl: 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL',
    collectedAt: '2026-08-08T10:20:00Z', authority: 'exchange_reported',
  });
  assert.equal(official.validateReportedValuation({ peRatio: 114, pbRatio: 30.32, sourceRef: 'legacy:yahoo' }).availability, 'unavailable');
  const current={...rows[0],stockId:'subject',exchange:'TWSE',sector:'semiconductor',
    tradingSessionAuthorityHash:'a'.repeat(64)};
  assert.equal(official.validateReportedValuation(rows[0]).availability, 'available');
  assert.equal(official.validateReportedValuation({...rows[0],exchange:'TPEX'}).availability,'unavailable');
  const historyUrl = 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260731&response=json';
  const history = official.parseTwseHistoricalValuationRows({ stat: 'OK',date: '20260731',
    data: [['2330','台積電','1,785.00','0.90',114,'32.80','10.74','115/1']] },
  { collectedAt:'2026-08-08T10:20:00Z',sourceUrl:historyUrl });
  assert.deepEqual([history[0].session,history[0].peRatio,history[0].pbRatio,history[0].authority],
    ['2026-07-31',32.8,10.74,'exchange_reported_history']);
  const authoritativeHistory=history.map((row)=>({...row,stockId:'subject',exchange:'TWSE',sector:'semiconductor',
    tradingSessionAuthorityHash:'a'.repeat(64)}));
  const older = [{ ...authoritativeHistory[0],session:'2026-05-29',peRatio:27,
    sourceRef:'twse-rwd:BWIBBU_d:2026-05-29:2330' },{ ...history[0],session:'2026-02-27',peRatio:25,
    stockId:'subject',exchange:'TWSE',sector:'semiconductor',tradingSessionAuthorityHash:'a'.repeat(64),
    sourceRef:'twse-rwd:BWIBBU_d:2026-02-27:2330' }];
  const axis = runtime('auth-source-worker-cli.js').valuationResearchAxis(current, { count:8,medianPe:35 }, [...authoritativeHistory,...older]);
  assert.equal(axis.trustworthy,true); assert.equal(axis.historySampleCount,4); assert.equal(axis.historyPeMedian,29.43);
  assert.equal(axis.sectorPe,35); assert.match(axis.reason,/sector_reference/u);
});

test('V3.12 official index history supplies at least 20 sessions without inventing dates', () => {
  const official = runtime('official-twse-valuation.js');
  const twse = official.parseTwseIndexHistory({ stat:'OK',data:[['115/07/01','46,234.70','47,293.10','46,234.70','47,018.99']] });
  const tpex = official.parseTpexIndexHistory({ tables:[{ data:[['2026/07/01','430.29','437.56','430.29','431.23','4.26']] }] });
  assert.deepEqual(twse,[{ session:'2026-07-01',close:47018.99 }]);
  assert.deepEqual(tpex,[{ session:'2026-07-01',close:431.23 }]);
  assert.deepEqual(official.parseTwseIndexHistory({ stat:'OK',data:[['115/02/30','1','2','1','2']] }),[]);
});

test('V3.12 official source failure degrades independently instead of erasing valid valuation data', async () => {
  const official=runtime('official-twse-valuation.js');
  const response=(payload)=>new Response(JSON.stringify(payload),{ status:200,headers:{ 'content-type':'application/json' } });
  const fetchImpl=async (url)=>{
    if (url===official.SOURCE_URL) return response([{ Date:'1150807',Code:'2330',Name:'台積電',PEratio:'31.86',PBratio:'10.43',DividendYield:'0.93' }]);
    if (url===official.TPEX_SOURCE_URL) throw new Error('fixture_tpex_down');
    return response([]);
  };
  const snapshot=await official.loadOfficialTwMarketSnapshot({ cutoff:'2026-08-09T00:00:00Z',
    candidates:[{symbol:'2330',exchange:'TWSE',canonicalSector:'semiconductor'}],fetchImpl });
  assert.equal(snapshot.schema,'official-tw-market-snapshot-v1.4');
  assert.equal(snapshot.valuations.length,1); assert.equal(snapshot.valuations[0].symbol,'2330');
  assert.ok(snapshot.sourceFailures.some((failure)=>failure.url===official.TPEX_SOURCE_URL
    &&failure.reason==='official_source_unavailable'));
});

test('V3.12 evidence snippets are local to the matched stock', () => {
  const worker = runtime('auth-source-worker-cli.js');
  const text = '景碩 3189 財報轉強，市場開始討論。\n其他新聞。\n欣興（3037）法說指出 ABF 載板稼動率回升。';
  const snippet = worker.extractMatchedEvidenceSnippet(text, { symbol: '3037', names: ['欣興'] });
  assert.match(snippet.text, /欣興|3037/u);
  assert.match(snippet.text, /ABF/u);
  assert.doesNotMatch(snippet.text, /^景碩/u);
  assert.equal(snippet.matchBasis, 'symbol_and_name');
});

test('V3.12 market analysis suppresses risk budget when components are missing', () => {
  const market = runtime('market-analysis.js');
  const incomplete = market.buildMarketAnalysis({ asOf: '2026-08-08T07:00:00Z', taiex: { state: 'uptrend',session:'2026-08-07' } });
  assert.equal(incomplete.completeness, 0.25);
  assert.equal(incomplete.riskBudget, null);
  assert.equal(incomplete.status, 'data_incomplete');
  const complete = market.buildMarketAnalysis({
    asOf: '2026-08-08T07:00:00Z', taiex: { state: 'pullback', drawdownPct: -8,session:'2026-08-07' },
    otc: { state: 'pullback', drawdownPct: -10,session:'2026-08-07' }, breadth: { aboveMa20Pct: 34,asOf:'2026-08-07' },
    foreignFlow: { net5d: -12000000000,session:'2026-08-07' },
  });
  assert.equal(complete.completeness, 1);
  assert.match(complete.summary, /加權|櫃買|廣度|外資/u);
});
