import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requiredRuntime = ['SUPABASE_URL', 'OPPORTUNITY_V3_SUPABASE_PROJECT_REF',
  'SUPABASE_SERVICE_ROLE_KEY', 'OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256'];
const deployment = process.env.SOURCE_LED_OPPORTUNITY_V3 ?? 'disabled';
const expectedHostPinSha256 = 'e7ce9c035f2af2de47e180bbaa50ff1a914c7098afc43112edf951a9162611d4';
const { loadHostPins, verifyCurrentNode } = createRequire(import.meta.url)('../model-runner-v3/hostPreflight.js');

function closedArguments(argv) {
  const options = { expectMode: null, requireHostPin: null, valid: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--expect-mode' && options.expectMode === null && typeof argv[index + 1] === 'string') {
      options.expectMode = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === '--require-host-pin' && options.requireHostPin === null && typeof argv[index + 1] === 'string') {
      options.requireHostPin = argv[index + 1];
      index += 1;
      continue;
    }
    options.valid = false;
  }
  return options;
}

const requested = closedArguments(process.argv.slice(2));

function command(name, args) {
  const result = spawnSync(name, args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function presence(name) {
  const value = process.env[name];
  return {
    name,
    configured: typeof value === 'string' && value.length > 0,
    sha256: typeof value === 'string' && value.length > 0
      ? createHash('sha256').update(value).digest('hex')
      : null,
  };
}

const fixture = path.join(
  root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json',
);
const fixtureBytes = fs.existsSync(fixture) ? fs.readFileSync(fixture) : null;
const fixtureCanonical = fixtureBytes &&
  fixtureBytes.at(-1) === 0x0a &&
  fixtureBytes.subarray(0, -1).includes(0x0a) === false
  ? fixtureBytes.subarray(0, -1)
  : null;
const fixtureSha256 = fixtureCanonical
  ? createHash('sha256').update(fixtureCanonical).digest('hex')
  : null;

function verifyPinnedHost() {
  try {
    const pins = loadHostPins(fixture);
    verifyCurrentNode(pins);
    return { status: 'pass', fixtureVersion: pins.fixtureVersion, verifier: 'model-runner-v3/hostPreflight.js' };
  } catch {
    return { status: 'fail', reason: 'host_preflight_rejected', verifier: 'model-runner-v3/hostPreflight.js' };
  }
}

const checks = {
  node: {
    status: process.version === 'v22.14.0' ? 'pass' : 'fail',
    actual: process.version,
    required: 'v22.14.0',
  },
  git: {
    status: command('/usr/bin/git', ['--version']) ? 'pass' : 'fail',
    version: command('/usr/bin/git', ['--version']),
  },
  hostPinFixture: {
    status: fixtureSha256 === expectedHostPinSha256 ? 'pass' : 'fail',
    sha256: fixtureSha256,
    expectedSha256: expectedHostPinSha256,
  },
  hostPreflight: verifyPinnedHost(),
  deployment: {
    status: ['disabled', 'drain', 'shadow'].includes(deployment) ? 'pass' : 'fail',
    state: deployment,
  },
  requested: {
    status: requested.valid &&
      (requested.expectMode === null || requested.expectMode === deployment) &&
      (requested.requireHostPin === null || requested.requireHostPin === 'model-runner-host-pins-v3.8')
      ? 'pass' : 'fail',
    expectMode: requested.expectMode,
    requireHostPin: requested.requireHostPin,
  },
  runtimeEnvironment: requiredRuntime.map(presence),
};
const localPass = checks.node.status === 'pass' &&
  checks.git.status === 'pass' &&
  checks.hostPinFixture.status === 'pass' &&
  checks.hostPreflight.status === 'pass' &&
  checks.deployment.status === 'pass' &&
  checks.requested.status === 'pass';
const runtimeConfigured = checks.runtimeEnvironment.every((row) => row.configured);

process.stdout.write(JSON.stringify({
  protocol: 'source-led-opportunity-v3-doctor-v1',
  status: localPass ? 'pass' : 'fail',
  localVerificationReady: localPass,
  shadowRuntimeConfigured: runtimeConfigured && deployment === 'shadow',
  productionMutationAuthorized: false,
  checks,
}) + '\n');
process.exitCode = localPass ? 0 : 1;
