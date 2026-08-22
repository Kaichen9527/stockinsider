import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/*
 * This program is a candidate-side trace launcher. The protected reviewer-owned
 * external harness is the only bootstrap authority; this file can revalidate a
 * clean subject only after that harness has selected the checkout and command.
 * Direct execution is developer feedback, never gate evidence.
 */
const requestedRoot = process.env.OPPORTUNITY_V3_GATE_ROOT ?? '';
assert.ok(path.isAbsolute(requestedRoot), 'pre-subject runner requires an absolute reviewed gate root');
const root = path.resolve(requestedRoot);
assert.equal(path.resolve(process.cwd()), root, 'pre-subject runner cwd must equal reviewed gate root');
const supportedTracks = new Set(['product_runtime', 'model_runner', 'evaluation_governance']);
const argv = process.argv.slice(2);
assert.deepEqual(argv.length, 2, 'acceptance gate runner requires exactly --track <track>');
assert.equal(argv[0], '--track', 'acceptance gate runner requires --track');
assert.ok(supportedTracks.has(argv[1]), 'acceptance gate runner track is closed');
const track = argv[1];

for (const key of [
  'NODE_OPTIONS', 'NODE_PATH', 'NODE_PENDING_DEPRECATION',
  'NODE_PRESERVE_SYMLINKS', 'NODE_PRESERVE_SYMLINKS_MAIN',
]) {
  assert.equal(process.env[key] ?? '', '', `pre-subject runner rejects inherited ${key}`);
}
for (const argument of process.execArgv) {
  assert.equal(/^(?:--require|--import|--loader|--experimental-loader)(?:=|$)/u.test(argument), false,
    `pre-subject runner rejects Node bootstrap ${argument}`);
}
assert.equal(process.version, 'v22.14.0', 'pre-subject runner requires the frozen Node 22 authority');
assert.match(process.env.OPPORTUNITY_V3_GATE_HARNESS_RELEASE_SHA256 ?? '', /^[0-9a-f]{64}$/u,
  'candidate trace launcher requires the protected harness release identity');

// The protected external worker stages a short-lived non-credential HOME exclusively
// for the candidate-side model-runner partition. Live host probes execute separately
// in the protected-base oracle after exact subject/base byte equality. Every non-model
// track retains the credential-free /tmp home.
const traceHome = track === 'model_runner' ? process.env.HOME ?? '' : '/tmp';
const traceTemp = track === 'model_runner' ? process.env.TMPDIR ?? '' : '/tmp';
assert.ok(path.isAbsolute(traceHome), 'trace HOME must be absolute');
assert.ok(path.isAbsolute(traceTemp), 'trace TMPDIR must be absolute');
if (track === 'model_runner') {
  assert.equal(path.resolve(traceHome), path.resolve(traceTemp), 'model trace must retain one staged HOME/TMPDIR');
  assert.equal(
    process.env.OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH,
    '1',
    'model trace must remain inside the non-credential candidate partition',
  );
}

function protectedPostgresEnvironment() {
  if (track !== 'product_runtime') return {};
  const directory = process.env.OPPORTUNITY_V3_POSTGRES_BIN ?? '';
  assert.match(directory, /^\/usr\/lib\/postgresql\/[0-9]+\/bin$/u,
    'product trace requires the protected PostgreSQL package bin');
  assert.equal(realpathSync(directory), directory, 'product trace PostgreSQL bin realpath');
  const directoryStat = lstatSync(directory);
  assert.equal(
    directoryStat.isDirectory() && !directoryStat.isSymbolicLink() && (directoryStat.mode & 0o002) === 0,
    true,
    'product trace PostgreSQL bin is non-world-writable',
  );
  for (const name of ['initdb', 'pg_ctl', 'psql']) {
    const executable = path.join(directory, name);
    const executableStat = lstatSync(executable);
    assert.equal(realpathSync(executable), executable, `product trace PostgreSQL ${name} realpath`);
    assert.equal(
      executableStat.isFile() && !executableStat.isSymbolicLink() && (executableStat.mode & 0o111) !== 0,
      true,
      `product trace PostgreSQL ${name} executable`,
    );
  }
  return {
    OPPORTUNITY_V3_POSTGRES_BIN: directory,
    PATH: `${directory}${path.delimiter}/usr/local/bin:/usr/bin:/bin`,
  };
}

const postgresEnvironment = protectedPostgresEnvironment();

const traceEnvironment = {
  PATH: track === 'model_runner'
    ? '/usr/bin:/bin'
    : postgresEnvironment.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  HOME: traceHome,
  TMPDIR: traceTemp,
  LC_ALL: 'C',
  LANG: 'C',
  TZ: 'Asia/Taipei',
  ...postgresEnvironment,
  ...(track === 'model_runner' ? { OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH: '1' } : {}),
};

function git(args, options = {}) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: traceEnvironment,
    ...options,
  });
  assert.equal(result.error, undefined, `git ${args.join(' ')} must start`);
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${(result.stderr ?? '').trim()}`);
  return (result.stdout ?? '').trim();
}

function gitStatus(args) {
  const result = spawnSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: traceEnvironment,
  });
  assert.equal(result.error, undefined, `git ${args.join(' ')} must start`);
  return result.status;
}

assert.equal(git(['rev-parse', '--is-inside-work-tree']), 'true', 'gate root must be a Git worktree');
assert.equal(gitStatus(['symbolic-ref', '--quiet', 'HEAD']), 1, 'gate root must be detached at the reviewed commit');
const commitSha = git(['rev-parse', 'HEAD']);
assert.match(commitSha, /^[0-9a-f]{40}$/u, 'reviewed commit SHA');
const treeSha = git(['rev-parse', 'HEAD^{tree}']);
assert.match(treeSha, /^[0-9a-f]{40}$/u, 'reviewed tree SHA');
assert.equal(git(['status', '--porcelain=v1', '--untracked-files=all']), '', 'gate root must be clean before subject launch');
assert.equal(gitStatus(['diff', '--no-ext-diff', '--quiet', 'HEAD', '--']), 0, 'working tree differs from reviewed HEAD');
assert.equal(gitStatus(['diff', '--cached', '--no-ext-diff', '--quiet', 'HEAD', '--']), 0, 'index differs from reviewed HEAD');

const authorityPaths = [
  'scripts/opportunity-v3/acceptance-gate-runner.mjs',
  'scripts/opportunity-v3/acceptance-traceability.test.mjs',
];
for (const repositoryPath of authorityPaths) {
  const gitBlob = git(['rev-parse', `HEAD:${repositoryPath}`]);
  const workingBlob = createHash('sha1').update(`blob ${Buffer.byteLength(readFileSync(path.join(root, repositoryPath)))}\0`)
    .update(readFileSync(path.join(root, repositoryPath))).digest('hex');
  assert.equal(workingBlob, gitBlob, `${repositoryPath} must equal its reviewed Git blob`);
}

const subjectArgs = [
  '--experimental-strip-types',
  '--test',
  '--test-concurrency=1',
  'scripts/opportunity-v3/acceptance-traceability.test.mjs',
];
const result = spawnSync(process.execPath, subjectArgs, {
  cwd: root,
  env: {
    ...traceEnvironment,
    PLAYWRIGHT_BROWSERS_PATH: '0',
    OPPORTUNITY_V3_ACCEPTANCE_TRACK: track,
    OPPORTUNITY_V3_REVIEWED_TREE: treeSha,
    OPPORTUNITY_V3_GATE_RUNNER: 'protected-external-harness-v1',
    OPPORTUNITY_V3_GATE_RUNNER_COMMIT: commitSha,
    OPPORTUNITY_V3_GATE_HARNESS_RELEASE_SHA256: process.env.OPPORTUNITY_V3_GATE_HARNESS_RELEASE_SHA256 ?? '',
  },
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 2);
