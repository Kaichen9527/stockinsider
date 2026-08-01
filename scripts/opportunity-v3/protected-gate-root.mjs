import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const changeRelative = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
const registryRelative = `${changeRelative}/external-gate-release-registry-v1.json`;
const workflowPath = '.github/workflows/source-led-opportunity-external-gate.yml';
const checkRun = 'stockinsider-v3-gate-root';

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), 'canonical JSON finite number');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  assert.ok(value !== null && typeof value === 'object', 'canonical JSON value');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args) {
  return execFileSync('/usr/bin/git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function exactKeys(value, keys, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label} keys`);
}

function requiredKeys(value, keys, label) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} object`);
  for (const key of keys) assert.ok(Object.prototype.hasOwnProperty.call(value, key), `${label}.${key} required`);
}

function assertSha(value, label) {
  assert.match(value, /^[0-9a-f]{40}$/u, label);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert.ok(['--github-event', '--output', '--subject-commit'].includes(key) && typeof value === 'string', 'closed root arguments');
    assert.equal(values[key], undefined, `one ${key}`);
    values[key] = value;
  }
  for (const key of ['--github-event', '--output', '--subject-commit']) assert.equal(typeof values[key], 'string', `${key} required`);
  return values;
}

function assertCleanBaseRoot(baseCommitSha) {
  assert.equal(git(['rev-parse', 'HEAD']), baseCommitSha, 'protected root must execute the event base commit');
  assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '', 'protected root base checkout must be clean');
}

function validateEvent(event, subjectCommitSha, baseCommitSha) {
  // GitHub adds platform-owned fields to these objects over time. Bind every
  // security-relevant identity field exactly while accepting unrelated payload fields.
  requiredKeys(event, ['action', 'number', 'pull_request', 'repository'], 'GitHub pull-request event');
  assert.ok(['opened', 'ready_for_review', 'reopened', 'synchronize'].includes(event.action), 'closed pull-request action');
  requiredKeys(event.repository, ['full_name'], 'GitHub repository');
  assert.equal(event.repository.full_name, 'Kaichen9527/stockinsider', 'protected repository');
  requiredKeys(event.pull_request, ['base', 'head'], 'pull request');
  requiredKeys(event.pull_request.base, ['sha'], 'pull request base');
  requiredKeys(event.pull_request.head, ['sha'], 'pull request head');
  assert.equal(event.pull_request.base.sha, baseCommitSha, 'event base must equal protected checkout');
  assert.equal(event.pull_request.head.sha, subjectCommitSha, 'event head must equal attested subject');
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const subjectCommitSha = args['--subject-commit'];
  assertSha(subjectCommitSha, 'subject commit');
  assert.equal(git(['cat-file', '-t', subjectCommitSha]), 'commit', 'subject commit must be fetched before attestation');
  const baseCommitSha = git(['rev-parse', 'HEAD']);
  assertCleanBaseRoot(baseCommitSha);
  validateEvent(JSON.parse(readFileSync(args['--github-event'], 'utf8')), subjectCommitSha, baseCommitSha);
  const subjectTreeSha = git(['rev-parse', `${subjectCommitSha}^{tree}`]);
  const registryPath = path.join(root, registryRelative);
  const registryBytes = readFileSync(registryPath);
  const registry = JSON.parse(registryBytes);
  exactKeys(registry, ['issuer', 'protectedCheckRun', 'protectedWorkflowPath', 'releases', 'repository', 'schema'], 'release registry');
  assert.equal(registry.schema, 'stockinsider-external-gate-release-registry-v1', 'registry schema');
  assert.equal(registry.issuer, 'stockinsider-v3-gate-root', 'registry issuer');
  assert.equal(registry.repository, 'Kaichen9527/stockinsider', 'registry repository');
  assert.equal(registry.protectedWorkflowPath, workflowPath, 'registry workflow path');
  assert.equal(registry.protectedCheckRun, checkRun, 'registry check run');
  const ownRelativePath = 'scripts/opportunity-v3/protected-gate-root.mjs';
  const ownBytes = readFileSync(path.join(root, ownRelativePath));
  const release = registry.releases.find(({ bootstrapPath }) => bootstrapPath === ownRelativePath);
  assert.ok(release, 'registered bootstrap release');
  exactKeys(release, ['bootstrapPath', 'bootstrapSha256', 'id'], 'registered bootstrap release');
  assert.match(release.id, /^stockinsider-v3-gate-root-v[0-9]+$/u, 'registered release ID');
  assert.equal(release.bootstrapSha256, sha256(ownBytes), 'registered bootstrap bytes');
  const attestation = {
    baseCommitSha,
    checkRun,
    registryCommitSha: baseCommitSha,
    registryPath: registryRelative,
    registrySha256: sha256(registryBytes),
    registryTreeSha: git(['rev-parse', 'HEAD^{tree}']),
    releaseId: release.id,
    releaseSha256: release.bootstrapSha256,
    repository: registry.repository,
    schema: 'stockinsider-external-gate-attestation-v1',
    subjectCommitSha,
    subjectTreeSha,
    workflowPath,
  };
  writeFileSync(args['--output'], `${canonicalJson(attestation)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${canonicalJson({ authority: 'protected_base_workflow_bootstrap_only', attestationSha256: sha256(canonicalJson(attestation)), checkRun, subjectCommitSha })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`protected gate root failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
