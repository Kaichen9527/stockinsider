import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      SOURCE_LED_OPPORTUNITY_V3: 'disabled',
      TZ: 'UTC',
    },
  });
  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join('\n'));
  return {
    stderrSha256: sha256(result.stderr ?? ''),
    stdoutSha256: sha256(result.stdout ?? ''),
  };
}

function assertVerifiedCheckout() {
  const git = (args) => execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
  }).trim();
  assert.equal(git(['rev-parse', '--show-toplevel']), root);
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '');
  return {
    commitSha: git(['rev-parse', 'HEAD']),
    treeSha: git(['rev-parse', 'HEAD^{tree}']),
  };
}

function migrationRehearsal() {
  const bytes = readFileSync(migrationPath);
  const text = bytes.toString('utf8');
  assert.doesNotMatch(text, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  const testEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'scripts/opportunity-v3/migration-contract.test.mjs',
  ]);
  return {
    additiveOnly: true,
    migrationBytes: bytes.length,
    migrationSha256: sha256(bytes),
    ...testEvidence,
  };
}

function runtimeInstallationRehearsal() {
  const testEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'scripts/opportunity-v3/product-correctness.test.mjs',
  ]);
  const installer = readFileSync(path.join(root, 'scripts/runtime/reviewed-runtime-installer-cli.js'));
  const installation = readFileSync(path.join(root, 'scripts/runtime/auth-source-worker-installation.js'));
  return {
    installationSha256: sha256(installation),
    installerSha256: sha256(installer),
    ...testEvidence,
  };
}

function runtimeDoctor() {
  return runNode([
    '--experimental-strip-types',
    'scripts/opportunity-v3/doctor.mjs',
    '--expect-mode',
    'disabled',
    '--require-host-pin',
    'model-runner-host-pins-v3.6',
  ]);
}

function disabledWebSmoke() {
  const route = readFileSync(path.join(root, 'web/src/app/api/opportunity-v3/route.ts'), 'utf8');
  const deployment = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/deployment.ts'), 'utf8');
  const guardOffset = route.indexOf("requireV3Deployment('/api/opportunity-v3', 'GET')");
  const queryOffset = route.indexOf('loadOpportunityEngineV3(cutoff)');
  assert.ok(guardOffset >= 0 && queryOffset > guardOffset, 'deployment guard must precede V3 projection query');
  assert.match(deployment, /const DISABLED_BODY = \{ code: 'v3_disabled', error: 'v3_request_rejected' \} as const;/u);
  assert.match(deployment, /return canonicalResponse\(DISABLED_BODY, 404\);/u);
  const testEvidence = runNode([
    '--experimental-strip-types',
    '--test',
    'web/src/lib/opportunity-v3/legacy-v1-v2-regression.test.ts',
  ]);
  return {
    disabledBodySha256: sha256('{"code":"v3_disabled","error":"v3_request_rejected"}'),
    routeSha256: sha256(route),
    ...testEvidence,
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
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.SOURCE_LED_OPPORTUNITY_V3, 'disabled');
  assert.equal(process.env.TZ, 'UTC');
  const subject = assertVerifiedCheckout();
  const evidence = operation === 'migration-rehearsal'
    ? migrationRehearsal()
    : operation === 'runtime-installation-rehearsal'
      ? runtimeInstallationRehearsal()
      : operation === 'runtime-doctor'
        ? runtimeDoctor()
        : operation === 'disabled-web-smoke'
          ? disabledWebSmoke()
          : rollbackLockVerification();
  process.stdout.write(`${JSON.stringify({
    schema: 'stockinsider-shadow-activation-operation-v1',
    operation,
    status: 'pass',
    ...subject,
    evidence,
  })}\n`);
} catch (error) {
  process.stderr.write(`shadow activation operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
