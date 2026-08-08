import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptRelative = 'scripts/opportunity-v3/shadow-activation-gate.mjs';
const pinnedNodePath = '/usr/local/bin/node';
const controlledPath = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin';
const hostPinPath = path.join(
  root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json',
);
const migrationPath = path.join(root, 'migrations/20260724_source_led_opportunity_engine_v3.sql');
const configPath = path.join(root, 'config/runtime/auth-source-dag.json');
const plistPath = path.join(root, 'scripts/com.stockinsider.auth-source-worker.plist');
const legacyLockPath = path.join(
  root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/legacy-baseline-lock.json',
);
const allowedOperations = new Set([
  'migration-rehearsal',
  'runtime-installation-rehearsal',
  'runtime-doctor',
  'disabled-web-smoke',
  'rollback-lock-verification',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertClosedParentEnvironment() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.SOURCE_LED_OPPORTUNITY_V3, 'disabled');
  assert.equal(process.env.TZ, 'UTC');
  const platformInjected = new Set(['__CF_USER_TEXT_ENCODING']);
  const expected = new Set(['NODE_ENV', 'SOURCE_LED_OPPORTUNITY_V3', 'TZ']);
  for (const key of Object.keys(process.env)) {
    assert.ok(expected.has(key) || platformInjected.has(key), `ambient environment is forbidden: ${key}`);
  }
}

function git(args, options = {}) {
  return execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
    ...options,
  }).trim();
}

function assertNoSymlinkAncestry(absoluteRoot) {
  let cursor = path.parse(absoluteRoot).root;
  for (const segment of absoluteRoot.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = lstatSync(cursor);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `checkout ancestry must be real directories: ${cursor}`);
  }
}

function assertPinnedNode() {
  const fixture = JSON.parse(readFileSync(hostPinPath, 'utf8'));
  const pin = fixture.executables.find(({ name }) => name === 'node');
  const stat = lstatSync(pinnedNodePath, { bigint: true });
  assert.equal(pin.path, pinnedNodePath);
  assert.equal(realpathSync(pinnedNodePath), pin.realpath);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.dev.toString(), pin.stat.device);
  assert.equal(stat.ino.toString(), pin.stat.inode);
  assert.equal(stat.size.toString(), pin.stat.size);
  assert.equal(Number(stat.uid), pin.stat.uid);
  assert.equal(Number(stat.gid), pin.stat.gid);
  assert.equal((stat.mode & 0o177777n).toString(8).padStart(6, '0'), pin.stat.mode);
  assert.equal(stat.mode & 0o022n, 0n);
  assert.equal(sha256(readFileSync(pinnedNodePath)), pin.sha256);
  assert.equal(execFileSync(pinnedNodePath, ['--version'], {
    encoding: 'utf8', env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
  }).trim(), pin.version);
}

function assertTrackedScript(commitSha) {
  const row = git(['ls-tree', '-z', commitSha, '--', scriptRelative]);
  const match = row.match(/^(100644) blob ([0-9a-f]{40})\t([^\u0000]+)\u0000?$/u);
  assert.ok(match, 'shadow gate script must be one tracked regular blob');
  assert.equal(match[3], scriptRelative);
  const absolute = path.join(root, scriptRelative);
  const stat = lstatSync(absolute);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'shadow gate script must remain a regular file');
  assert.equal(git(['hash-object', '--', absolute]), match[2], 'working script bytes must match subject blob');
  assert.equal(readFileSync(absolute).compare(execFileSync('/usr/bin/git', ['cat-file', 'blob', match[2]], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
  })), 0, 'working script bytes must equal tracked blob bytes');
  return match[2];
}

function captureVerifiedCheckout() {
  assert.equal(git(['rev-parse', '--show-toplevel']), root);
  assert.equal(realpathSync(root), root, 'checkout lexical and physical roots must match');
  assertNoSymlinkAncestry(root);
  const symbolic = spawnSync('/usr/bin/git', ['symbolic-ref', '-q', 'HEAD'], {
    cwd: root, encoding: 'utf8', env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
  });
  assert.notEqual(symbolic.status, 0, 'shadow gate requires a detached subject checkout');
  const commitSha = git(['rev-parse', 'HEAD']);
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '');
  const scriptBlobOid = assertTrackedScript(commitSha);
  assertPinnedNode();
  return {
    commitSha,
    treeSha,
    scriptBlobOid,
  };
}

function recheckVerifiedCheckout(subject) {
  assert.equal(git(['rev-parse', '--show-toplevel']), root);
  assert.equal(realpathSync(root), root);
  assertNoSymlinkAncestry(root);
  assert.equal(git(['rev-parse', 'HEAD']), subject.commitSha);
  assert.equal(git(['rev-parse', 'HEAD^{tree}']), subject.treeSha);
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '');
  assert.equal(assertTrackedScript(subject.commitSha), subject.scriptBlobOid);
  assertPinnedNode();
}

function runNode(args, subject) {
  recheckVerifiedCheckout(subject);
  const temporaryHome = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-shadow-child-'));
  try {
    const result = spawnSync(pinnedNodePath, args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        HOME: temporaryHome,
        NODE_ENV: 'test',
        PATH: controlledPath,
        SOURCE_LED_OPPORTUNITY_V3: 'disabled',
        TMPDIR: temporaryHome,
        TZ: 'UTC',
        npm_config_cache: path.join(temporaryHome, 'npm-cache'),
      },
    });
    assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
    return {
      stderrSha256: sha256(result.stderr ?? ''),
      stdoutSha256: sha256(result.stdout ?? ''),
    };
  } finally {
    rmSync(temporaryHome, { recursive: true, force: true });
    recheckVerifiedCheckout(subject);
  }
}

function migrationRehearsal(subject) {
  const bytes = readFileSync(migrationPath);
  const text = bytes.toString('utf8');
  assert.doesNotMatch(text, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  const testEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'scripts/opportunity-v3/migration-contract.test.mjs',
  ], subject);
  return {
    additiveOnly: true,
    migrationBytes: bytes.length,
    migrationSha256: sha256(bytes),
    ...testEvidence,
  };
}

function runtimeInstallationRehearsal(subject) {
  const testEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'scripts/opportunity-v3/product-correctness.test.mjs',
  ], subject);
  const installer = readFileSync(path.join(root, 'scripts/runtime/reviewed-runtime-installer-cli.js'));
  const installation = readFileSync(path.join(root, 'scripts/runtime/auth-source-worker-installation.js'));
  return {
    installationSha256: sha256(installation),
    installerSha256: sha256(installer),
    ...testEvidence,
  };
}

function runtimeDoctor(subject) {
  return runNode([
    '--experimental-strip-types',
    'scripts/opportunity-v3/doctor.mjs',
    '--expect-mode',
    'disabled',
    '--require-host-pin',
    'model-runner-host-pins-v3.6',
  ], subject);
}

function disabledWebSmoke(subject) {
  const route = readFileSync(path.join(root, 'web/src/app/api/opportunity-v3/route.ts'), 'utf8');
  const deployment = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/deployment.ts'), 'utf8');
  const guardOffset = route.indexOf("requireV3Deployment('/api/opportunity-v3', 'GET')");
  const queryOffset = route.indexOf('loadOpportunityEngineV3(cutoff)');
  assert.ok(guardOffset >= 0 && queryOffset > guardOffset, 'deployment guard must precede V3 projection query');
  assert.match(deployment, /const DISABLED_BODY = \{ code: 'v3_disabled', error: 'v3_request_rejected' \} as const;/u);
  assert.match(deployment, /return canonicalResponse\(DISABLED_BODY, 404\);/u);
  const regressionEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'web/src/lib/opportunity-v3/legacy-v1-v2-regression.test.ts',
  ], subject);
  const browserEvidence = runNode([
    'web/node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    'web/playwright.v3-correctness.config.ts',
  ], subject);
  return {
    browserStderrSha256: browserEvidence.stderrSha256,
    browserStdoutSha256: browserEvidence.stdoutSha256,
    disabledBodySha256: sha256('{"code":"v3_disabled","error":"v3_request_rejected"}'),
    routeSha256: sha256(route),
    ...regressionEvidence,
  };
}

function rollbackLockVerification() {
  const configBytes = readFileSync(configPath);
  const config = JSON.parse(configBytes);
  const plistBytes = readFileSync(plistPath);
  const plist = plistBytes.toString('utf8');
  const legacyLockBytes = readFileSync(legacyLockPath);
  const legacyLock = JSON.parse(legacyLockBytes);
  assert.equal(config.ownerLabel, 'com.stockinsider.auth-source-worker');
  assert.equal(config.runtimeMode, 'legacy_correctness');
  assert.equal(config.stages.length, 6);
  assert.deepEqual(config.stages.map(({ ordinal }) => ordinal), [0, 1, 2, 3, 4, 5]);
  assert.equal(config.legacySeedSymbols.length, 30);
  assert.equal(sha256(configBytes), '1ead338d6a56194a51c64ac2adbf36551a410c327ce08ba18f9224e34471c3c2');
  assert.equal((plist.match(/<key>Label<\/key>/gu) ?? []).length, 1);
  assert.match(plist, /<string>com\.stockinsider\.auth-source-worker<\/string>/u);
  assert.match(plist, /STOCKINSIDER_REVIEWED_COMMIT_SHA=__REVIEWED_COMMIT_SHA__/u);
  assert.match(plist, /STOCKINSIDER_DATABASE_URL_REF=keychain:stockinsider-runtime:database-url/u);
  assert.equal(legacyLock.promotionAllowed, false);
  assert.equal(legacyLock.runDateCount, 0);
  assert.equal(legacyLock.liveMaturedCohortCount, 0);
  return {
    configSha256: sha256(configBytes),
    legacyLockSha256: sha256(legacyLockBytes),
    plistSha256: sha256(plistBytes),
  };
}

const operation = process.argv[2];
try {
  assert.equal(process.argv.length, 3, 'one closed shadow activation operation is required');
  assert.ok(allowedOperations.has(operation), 'unknown shadow activation operation');
  assertClosedParentEnvironment();
  const subject = captureVerifiedCheckout();
  const evidence = operation === 'migration-rehearsal'
    ? migrationRehearsal(subject)
    : operation === 'runtime-installation-rehearsal'
      ? runtimeInstallationRehearsal(subject)
      : operation === 'runtime-doctor'
        ? runtimeDoctor(subject)
        : operation === 'disabled-web-smoke'
          ? disabledWebSmoke(subject)
          : rollbackLockVerification();
  recheckVerifiedCheckout(subject);
  process.stdout.write(`${JSON.stringify({
    schema: 'stockinsider-shadow-activation-operation-v1',
    operation,
    status: 'pass',
    commitSha: subject.commitSha,
    treeSha: subject.treeSha,
    evidence,
  })}\n`);
} catch (error) {
  process.stderr.write(`shadow activation operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
