'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REQUIRED_MAJOR = 22;
const args = process.argv.slice(2);

function majorVersion(binary) {
  const probe = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (probe.status !== 0) return null;
  const match = /^v(\d+)\./u.exec(probe.stdout.trim());
  return match ? Number(match[1]) : null;
}

function selectRuntime() {
  if (Number(process.versions.node.split('.')[0]) >= REQUIRED_MAJOR) return process.execPath;
  const candidates = [
    process.env.STOCKINSIDER_NODE22,
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
  ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  return candidates.find(
    (candidate) =>
      fs.existsSync(candidate) &&
      fs.realpathSync(candidate) !== fs.realpathSync(process.execPath) &&
      majorVersion(candidate) >= REQUIRED_MAJOR,
  );
}

const runtime = selectRuntime();
if (!runtime) {
  process.stderr.write(
    'Node.js 22 or newer is required. Set STOCKINSIDER_NODE22 to an absolute Node.js binary path.\n',
  );
  process.exit(2);
}

const result = spawnSync(runtime, args, { stdio: 'inherit', env: process.env });
if (result.error) {
  process.stderr.write('Unable to start the Node.js 22 runtime.\n');
  process.exit(2);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 2);
