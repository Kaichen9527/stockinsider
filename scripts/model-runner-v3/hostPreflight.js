'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { assert, RunnerError } = require('./artifacts');
const { canonicalJson, parseJsonWithNoDuplicateKeys, sha256 } = require('./canonicalJson');

const PIN_FIXTURE_SHA256 = '3827556c3dbef5fdd342d1272845810ec0c9f57f7940200a1beff2bb22301049';
const PIN_FIXTURE_BYTES = 2138;
let stableAncestorIdentity = null;

function loadHostPins(filename) {
  let buffer;
  try {
    buffer = fs.readFileSync(filename);
  } catch {
    throw new RunnerError(5);
  }
  assert(buffer.length === PIN_FIXTURE_BYTES && buffer.at(-1) === 0x0a && buffer.at(-2) !== 0x0a, 5);
  const raw = buffer.subarray(0, -1).toString('utf8');
  assert(Buffer.from(raw, 'utf8').equals(buffer.subarray(0, -1)) && !raw.includes('\r') && sha256(raw) === PIN_FIXTURE_SHA256, 5);
  let fixture;
  try {
    fixture = parseJsonWithNoDuplicateKeys(raw);
  } catch {
    throw new RunnerError(5);
  }
  assert(canonicalJson(fixture) === raw && fixture.fixtureVersion === 'model-runner-host-pins-v3.6', 5);
  assert(fixture.platform === 'darwin' && fixture.architecture === 'arm64' && Array.isArray(fixture.executables), 5);
  const node = fixture.executables.find((entry) => entry.name === 'node');
  assert(node && typeof node.path === 'string' && typeof node.realpath === 'string' && node.version === 'v22.14.0', 5);
  return Object.freeze(fixture);
}

function modeString(stat) {
  return (stat.mode & 0o177777n).toString(8).padStart(6, '0');
}

function hashFile(filename) {
  const digest = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let offset = 0;
    while (true) {
      const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
      if (bytes === 0) break;
      digest.update(buffer.subarray(0, bytes));
      offset += bytes;
    }
    return digest.digest('hex');
  } catch {
    throw new RunnerError(5);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function verifyStat(filename, expected, kind) {
  let resolved;
  let stat;
  try {
    resolved = fs.realpathSync(filename);
    stat = fs.lstatSync(filename, { bigint: true });
  } catch {
    throw new RunnerError(5);
  }
  assert(resolved === filename && (kind === 'file' ? stat.isFile() : stat.isDirectory()), 5);
  assert(stat.dev.toString() === expected.device && stat.ino.toString() === expected.inode, 5);
  assert(stat.size.toString() === expected.size && Number(stat.uid) === expected.uid && Number(stat.gid) === expected.gid, 5);
  assert(modeString(stat) === expected.mode && (stat.mode & 0o022n) === 0n, 5);
  return stat;
}

function ancestorIdentity(pathnames) {
  const identities = new Map();
  try {
    for (const pathname of pathnames) {
      let current = path.dirname(pathname);
      while (true) {
        const stat = fs.lstatSync(current, { bigint: true });
        assert(stat.isDirectory() && !stat.isSymbolicLink() && fs.realpathSync(current) === current, 5);
        identities.set(current, [
          stat.dev.toString(),
          stat.ino.toString(),
          Number(stat.uid),
          Number(stat.gid),
          modeString(stat),
        ].join(':'));
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(5);
  }
  return [...identities.entries()].sort(([left], [right]) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function assertAncestorIdentity(current, expected) {
  assert(canonicalJson(current) === canonicalJson(expected), 5);
  return true;
}

function checkedCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C' },
    shell: false,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert(result.status === 0 && result.signal === null, 5);
  return `${result.stdout || ''}${result.stderr || ''}`;
}

const appleGitSandboxCacheDenial = /^git: error: couldn't create cache file '\/var\/folders\/[A-Za-z0-9_/-]+\/T\/xcrun_db-[A-Za-z0-9]+' \(errno=Operation not permitted\)$/u;
const codexPathAliasSandboxWarning = /^WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted \(os error 1\)$/u;

function validatedVersionOutput(command, stdout, stderr) {
  assert(typeof stdout === 'string' && typeof stderr === 'string', 5);
  if (stderr === '') return stdout;
  const lines = stderr.endsWith('\n') ? stderr.slice(0, -1).split('\n') : [];
  const admittedAppleGitDenial = command === '/usr/bin/git'
    && lines.length >= 1 && lines.length <= 2
    && lines.every((line) => appleGitSandboxCacheDenial.test(line));
  const admittedCodexAliasWarning = command === '/Applications/ChatGPT.app/Contents/Resources/codex'
    && lines.length === 1 && codexPathAliasSandboxWarning.test(lines[0]);
  assert(admittedAppleGitDenial || admittedCodexAliasWarning, 5);
  return stdout;
}

function checkedVersion(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C' },
    shell: false,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert(result.status === 0 && result.signal === null, 5);
  return validatedVersionOutput(command, result.stdout || '', result.stderr || '');
}

function requiresGatekeeperAssessment(bundle, nonCredentialMode) {
  return bundle && nonCredentialMode !== '1';
}

function verifySignature(filename, expected, bundle = false) {
  const verbose = checkedCommand('/usr/bin/codesign', ['-d', '--verbose=4', filename]);
  assert(verbose.includes(`CandidateCDHashFull sha256=${expected.cdHashFullSha256}`), 5);
  const identifier = bundle ? expected.bundleIdentifier : expected.identifier;
  assert(verbose.includes(`Identifier=${identifier}`) && verbose.includes(`TeamIdentifier=${expected.teamIdentifier}`), 5);
  const requirement = checkedCommand('/usr/bin/codesign', ['-d', '-r-', filename]);
  assert(requirement.includes(`designated => ${expected.designatedRequirement}`), 5);
  checkedCommand('/usr/bin/codesign', ['--verify', '--deep', '--strict', filename]);
  if (requiresGatekeeperAssessment(bundle, process.env.OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH)) {
    const assessment = checkedCommand('/usr/sbin/spctl', ['-a', '-vv', filename]);
    assert(assessment.includes('accepted') && assessment.includes(`source=${expected.spctlSource}`), 5);
  }
}

function verifyCurrentNode(fixture) {
  assert(process.platform === fixture.platform && process.arch === fixture.architecture, 5);
  const expectedNames = ['codex', 'git', 'node'];
  assert(fixture.executables.length === expectedNames.length, 5);
  const ancestorPaths = [
    ...fixture.executables.map((entry) => entry.path),
    fixture.codexBundle.path,
  ];
  const beforeAncestors = ancestorIdentity(ancestorPaths);
  if (stableAncestorIdentity === null) stableAncestorIdentity = beforeAncestors;
  else assertAncestorIdentity(beforeAncestors, stableAncestorIdentity);
  for (const name of expectedNames) {
    const executable = fixture.executables.find((entry) => entry.name === name);
    assert(executable && executable.path === executable.realpath && path.isAbsolute(executable.path), 5);
    verifyStat(executable.path, executable.stat, 'file');
    assert(hashFile(executable.path) === executable.sha256, 5);
    const version = name === 'node'
      ? process.version
      : checkedVersion(executable.path, ['--version']).trim();
    assert(version === executable.version, 5);
    if (name === 'codex') verifySignature(executable.path, executable.signing);
  }
  const node = fixture.executables.find((entry) => entry.name === 'node');
  assert(process.execPath === node.path, 5);
  assert(fixture.codexBundle.path === '/Applications/ChatGPT.app', 5);
  verifyStat(fixture.codexBundle.path, fixture.codexBundle.stat, 'directory');
  verifySignature(fixture.codexBundle.path, fixture.codexBundle, true);
  const afterAncestors = ancestorIdentity(ancestorPaths);
  assertAncestorIdentity(afterAncestors, beforeAncestors);
  assertAncestorIdentity(afterAncestors, stableAncestorIdentity);
  return true;
}

module.exports = {
  PIN_FIXTURE_SHA256,
  PIN_FIXTURE_BYTES,
  loadHostPins,
  verifyCurrentNode,
  hashFile,
  modeString,
  ancestorIdentity,
  assertAncestorIdentity,
  validatedVersionOutput,
  requiresGatekeeperAssessment,
};
