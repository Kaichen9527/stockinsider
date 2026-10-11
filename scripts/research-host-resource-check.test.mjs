import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_STORAGE_ROOTS, inspectResearchStorage } from './research-host-resource-check.mjs';

const missing = () => Object.assign(new Error('missing root'), { code: 'ENOENT' });
test('observer measures every fixed root; only absent logs may count as zero', async () => {
  const calls = [];
  const observation = await inspectResearchStorage({
    resolvePath: async root => { if (root === '/var/log/stockinsider') throw missing(); return root; },
    measure: async (command, args, limits) => {
      calls.push(args.at(-1));
      assert.equal(command, '/usr/bin/du');
      assert.deepEqual(args.slice(0, 4), ['-sx', '-B1', '--', args.at(-1)]);
      assert.ok(limits.timeout > 0);
      return { stdout: `4096\t${args.at(-1)}\n` };
    },
  });
  assert.deepEqual(calls, APP_STORAGE_ROOTS.slice(0, -1));
  assert.equal(observation.roots.length, APP_STORAGE_ROOTS.length);
  assert.equal(observation.roots.at(-1).usedBytes, 0);
  await assert.rejects(inspectResearchStorage({ resolvePath: async () => { throw missing(); } }), /missing root/);
  await assert.rejects(inspectResearchStorage({ resolvePath: async root => root,
    measure: async () => { throw new Error('permission denied'); } }), /permission denied/);
  await assert.rejects(inspectResearchStorage({ resolvePath: async root => root,
    measure: async () => ({ stdout: 'not-a-size' }) }), /measurement_invalid/);
});

test('resource CLI cannot skip checks through current symlink invocation', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'research-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const link = path.join(dir, 'current.mjs');
  await symlink(fileURLToPath(new URL('./research-host-resource-check.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, 'relative-budget.json'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { allowed: false, reason: 'absolute_budget_path_required' });
});

test('heavy wrapper blocks the actual command when the research guard fails', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'research-wrapper-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'app'), lock = path.join(dir, 'locks'), bin = path.join(dir, 'bin');
  await mkdir(path.join(root, 'current/deployment/vps/operations'), { recursive: true });
  await mkdir(lock); await mkdir(bin);
  // Relocate only fixed system paths. The same shell control flow is exercised
  // without creating root-owned /opt or /run paths on the developer's machine.
  const original = await readFile(new URL('../deployment/vps/run-heavy-operation.sh', import.meta.url), 'utf8');
  const wrapper = original.replaceAll('/opt/stockinsider', root).replaceAll('/run/lock', lock)
    .replaceAll('/usr/bin/node', path.join(bin, 'node'));
  await writeFile(path.join(dir, 'wrapper.sh'), wrapper);
  await writeFile(path.join(bin, 'flock'), '#!/bin/sh\nexit 0\n');
  const marker = path.join(dir, 'executed');
  const command = path.join(root, 'current/deployment/vps/operations/test-run');
  await writeFile(command, `#!/bin/sh\ntouch '${marker}'\n`);
  await chmod(command, 0o700); await chmod(path.join(bin, 'flock'), 0o700);
  const budget = path.join(dir, 'budget.json'); await writeFile(budget, '{}');
  for (const operation of ['research', 'backtest']) {
    await writeFile(path.join(bin, 'node'), '#!/bin/sh\ncase "$1" in */research-host-resource-check.mjs) exit 42;; *) exit 99;; esac\n');
    await chmod(path.join(bin, 'node'), 0o700);
    const result = spawnSync('/bin/bash', [path.join(dir, 'wrapper.sh'), operation, budget, '--', command],
      { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(result.status, 42, result.stderr);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  }
});
