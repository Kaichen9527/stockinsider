import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate as immediate } from 'node:timers/promises';
import { waitForProcessClose } from './test-support/process-close.mjs';

test('exit alone cannot make an empty JSON buffer complete', async () => {
  const child = new EventEmitter();
  let settled = false;
  const done = waitForProcessClose(child).then(code => { settled = true; return code; });
  child.emit('exit', 0, null);
  await immediate();
  assert.equal(settled, false);
  const output = '{"status":"conflict"}';
  child.emit('close', 0, null);
  assert.equal(await done, 0);
  assert.equal(JSON.parse(output).status, 'conflict');
});

test('nonzero close is not converted to success', async () => {
  const child = new EventEmitter();
  const done = waitForProcessClose(child);
  child.emit('close', 7, null);
  assert.equal(await done, 7);
});

test('signal termination remains null, not a successful exit', async () => {
  const child = new EventEmitter();
  const done = waitForProcessClose(child);
  child.emit('close', null, 'SIGTERM');
  assert.equal(await done, null);
});

test('spawn errors retain their identity and remove listeners', async () => {
  const child = new EventEmitter();
  const error = Object.assign(new Error('synthetic spawn failure'), { code: 'ENOENT' });
  const checked = assert.rejects(waitForProcessClose(child), candidate => candidate === error);
  child.emit('error', error);
  await checked;
  assert.equal(child.listenerCount('close'), 0);
});

test('real child close waits for inherited output after parent exit', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'process-close-regression-'));
  const release = path.join(directory, 'release');
  // The grandchild inherits stdout; a file handshake releases it only after
  // the test observes the direct child's exit. No timing-based lucky race.
  const descendant = `
    const fs = require('node:fs');
    const deadline = Date.now() + 5000;
    const timer = setInterval(() => {
      if (fs.existsSync(process.argv[1])) {
        clearInterval(timer);
        process.stdout.write(JSON.stringify({status:'conflict',name:'台積電'}));
      } else if (Date.now() > deadline) { clearInterval(timer); process.exitCode = 2; }
    }, 10);
  `;
  const parent = `
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, process.argv[1]],
      {stdio:['ignore',1,2]}).unref();
  `;
  const child = spawn(process.execPath, ['-e', parent, release], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.setEncoding('utf8');
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.resume();
  const done = waitForProcessClose(child);
  try {
    const [exitCode] = await once(child, 'exit');
    assert.equal(exitCode, 0);
    assert.equal(output, ''); // Reproduces the old exit-only reader's empty JSON.
    writeFileSync(release, 'release');
    assert.equal(await done, 0);
    assert.deepEqual(JSON.parse(output), { status: 'conflict', name: '台積電' });
  } finally {
    writeFileSync(release, 'release');
    child.kill();
    await done.catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
});

test('real missing executable rejects rather than waiting forever', async () => {
  const child = spawn(path.join(tmpdir(), 'stockinsider-no-such-executable', 'psql'), [], { stdio: 'pipe' });
  await assert.rejects(waitForProcessClose(child), { code: 'ENOENT' });
});
