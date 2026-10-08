// Portable source contracts only. No host probe, model, keychain or activation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { canonical, digest } from './host-recovery-packet.mjs';
import { recoverySourceFacts } from './host-recovery-proposal.mjs';
import { draftRecoveryInstallPlan, FROZEN_CANDIDATE } from './host-recovery-install-plan.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { loadHostPins, PIN_FIXTURE_BYTES, PIN_FIXTURE_SHA256 } = require('../model-runner-v3/hostPreflight.js');
const { MODEL_RUNNER_IDENTITY, MODEL_RUNNER_IDENTITY_SHA256 } = require('../model-runner-v3/runner.js');
const { operationKey } = require('../model-runner-v3/transactionJournal.js');
const change = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const fixturePath = path.join(root, change, 'model-runner-host-pins-v3.json');
const historical = 'e94d21f9fe05dc436211a2458ea59adb52195e26';
const oldIdentity = 'a2bf72cabbab4afd3749c3b2c7dede71f97ce2182d2ea674d0f62e140c456c4f';
const read = p => readFileSync(path.join(root, p), 'utf8');
const git = (...args) => execFileSync('/usr/bin/git', ['--no-replace-objects', '-C', root, ...args]);

test('successor fixture and operation identity bind exact newly observed source', () => {
  const bytes = readFileSync(fixturePath), pins = loadHostPins(fixturePath);
  assert.equal(bytes.length, 2210); assert.equal(PIN_FIXTURE_BYTES, 2210);
  assert.equal(digest(bytes.subarray(0, -1)), PIN_FIXTURE_SHA256);
  assert.equal(PIN_FIXTURE_SHA256, 'fc76b082ae4fbe9284f888d94ac459547cfb50bfa180ad864e27952fecfd5022');
  const native = pins.executables.find(row => row.name === 'codex');
  assert.equal(native.version, 'codex-cli 0.162.0-alpha.2');
  assert.equal(native.sha256, 'cb4e4994627e770800a940b42969c77855a3fc09a6e60b02aa6319f670d6b6ab');
  assert.equal(pins.fixtureVersion, 'model-runner-host-pins-v3.24');
  assert.equal(Buffer.byteLength(canonical(MODEL_RUNNER_IDENTITY)), 898);
  assert.equal(digest(canonical(MODEL_RUNNER_IDENTITY)), MODEL_RUNNER_IDENTITY_SHA256);
  assert.equal(MODEL_RUNNER_IDENTITY_SHA256, 'fdc18db72738748139bc457503b7541c5ba0daee306b1fda1525e038493d6a03');
  assert.equal(Object.fromEntries(MODEL_RUNNER_IDENTITY).stateNamespace, 'model-runner-v3-sol61-astra-v2');
});
test('historical fixture, changed stat/hash/signature/version and noncanonical bytes fail before any host probe', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'native-successor-contract-'));
  const file = path.join(dir, 'pins.json');
  try {
    const old = git('show', `${historical}:${change}/model-runner-host-pins-v3.json`);
    const current = JSON.parse(readFileSync(fixturePath));
    const variants = [old, Buffer.from(JSON.stringify(current)), Buffer.concat([readFileSync(fixturePath), Buffer.from('\n')])];
    for (const modify of [p => p.executables[0].stat.inode = '199114789', p => p.executables[0].stat.gid = 80,
      p => p.executables[0].version = 'codex-cli 0.160.0', p => p.executables[0].sha256 = '0'.repeat(64),
      p => p.executables[0].signing.cdHashFullSha256 = '0'.repeat(64), p => p.codexBundle.stat.inode = '199114746',
      p => p.approvalAuthority = 'self-approved', p => p.fixtureVersion = 'model-runner-host-pins-v3.22']) {
      const mutated = structuredClone(current); modify(mutated); variants.push(Buffer.from(canonical(mutated) + '\n'));
    }
    for (const bytes of variants) { writeFileSync(file, bytes); assert.throws(() => loadHostPins(file), error => error.exit === 5); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('old operation reservations cannot collide and previous state namespaces remain ignored', () => {
  const fields = { checkpoint: 'model_runner_v3', manifestSha256: '1'.repeat(64), taskId: 'task', operation: 'make', inputHead: '2'.repeat(40), round: 1 };
  assert.notEqual(operationKey({ ...fields, modelRunnerIdentitySha256: oldIdentity }),
    operationKey({ ...fields, modelRunnerIdentitySha256: MODEL_RUNNER_IDENTITY_SHA256 }));
  for (const namespace of ['model-runner-v3-sol61-astra-v1', 'model-runner-v3-sol61-astra-v2'])
    assert.ok(read('.gitignore').includes(`.loop-engineering/runtime/${namespace}/`));
  assert.ok(read('scripts/model-runner-v3/journalStore.js').includes("'model-runner-v3-sol61-astra-v2'"));
});
test('frozen e94d installer remains frozen and rejects revised host facts', () => {
  assert.equal(FROZEN_CANDIDATE, historical);
  const facts = recoverySourceFacts(root, '169aad1b6cfa747f78ae3464b614f43c0749d806', historical);
  assert.equal(draftRecoveryInstallPlan(Buffer.from(canonical(facts) + '\n')).subject.candidate.commit, historical);
  facts.hostFixtureSha256 = digest(readFileSync(fixturePath));
  assert.throws(() => draftRecoveryInstallPlan(Buffer.from(canonical(facts) + '\n')), /exact frozen source facts/u);
  for (const name of ['host-recovery-packet.mjs', 'host-recovery-install-plan.mjs'])
    assert.ok(readFileSync(path.join(root, 'scripts/opportunity-v3', name)).equals(git('show', `73e0aed1b6303c0fc4470b85d751717d225d0fa4:scripts/opportunity-v3/${name}`)));
});
test('protected registration and adapter isolation remain byte-identical to historical preparation', () => {
  for (const p of ['.github/workflows/source-led-opportunity-external-gate.yml', 'scripts/opportunity-v3/protected-external-gate-worker.mjs',
    'scripts/model-runner-v3/codexAdapter.js', 'scripts/model-runner-v3/routing.js'])
    assert.ok(readFileSync(path.join(root, p)).equals(git('show', `${historical}:${p}`)), p);
});
test('acceptance amendment changes only exact pin literals and package command; product case set is preserved', () => {
  const old = JSON.parse(git('show', `${historical}:${change}/acceptance-tests.json`));
  const expected = JSON.parse(JSON.stringify(old).replaceAll('model-runner-host-pins-v3.22', 'model-runner-host-pins-v3.24')
    .replaceAll('2,201', '2,209').replaceAll('0c4f60b1db8aaf77b7be9fa1d81b3d2c719465736fc10b29d3d10640e2ef17f2', PIN_FIXTURE_SHA256));
  assert.deepEqual(JSON.parse(read(`${change}/acceptance-tests.json`)), expected);
});
