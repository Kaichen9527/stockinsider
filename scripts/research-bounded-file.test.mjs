import assert from 'node:assert/strict';
import test from 'node:test';
import { constants } from 'node:fs';
import { mkdtemp, writeFile, appendFile, open, rename, symlink, rm, readdir, chmod } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readResearchBoundedFile } from './research-bounded-file.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const policy = { maximum: 32, absoluteError: 'absolute_required', boundError: 'file_bound', changedError: 'file_changed' };
async function fixture(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'si-bounded-read-'));
  try { await fn(dir, path.join(dir, 'input')); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('bounded regular bytes preserve exact boundary, reject oversized/directory/symlink/private mode', async () => fixture(async (dir, file) => {
  await writeFile(file, 'x'.repeat(32), { mode: 0o600 });
  assert.equal((await readResearchBoundedFile(file, policy)).length, 32);
  await appendFile(file, 'x'); await assert.rejects(readResearchBoundedFile(file, policy), /file_bound/);
  await assert.rejects(readResearchBoundedFile(dir, policy), /file_bound/);
  await symlink(file, path.join(dir, 'link'));
  await assert.rejects(readResearchBoundedFile(path.join(dir, 'link'), policy), /ELOOP/);
  await assert.rejects(readResearchBoundedFile('relative', policy), /absolute_required/);
  await writeFile(path.join(dir, 'public'), '{}', { mode: 0o644 });
  // Creation modes are filtered by umask; enforce the intended negative fixture.
  await chmod(path.join(dir, 'public'), 0o644);
  await assert.rejects(readResearchBoundedFile(path.join(dir, 'public'), { ...policy, privateMode: true }), /file_bound/);
}));
for (const change of ['grow', 'shrink', 'replace', 'replace-with-symlink', 'rewrite']) {
  test(`actual ${change} between fstat and read rejects; allocation and reads stay size plus one`, async () => fixture(async (dir, file) => {
    await writeFile(file, 'original'); let reads = 0; let closed = false;
    await assert.rejects(readResearchBoundedFile(file, policy, { openFile: async (name, flags) => {
      assert.ok(flags & constants.O_NOFOLLOW); assert.ok(flags & constants.O_NONBLOCK);
      const fd = await open(name, flags); let changed = false;
      return { stat: () => fd.stat(), close: async () => { closed = true; await fd.close(); }, read: async (buffer, offset, length, position) => {
        assert.equal(buffer.length, 9);
        if (!changed) {
          changed = true;
          if (change === 'grow') await appendFile(file, 'x'.repeat(128));
          if (change === 'shrink') await writeFile(file, 'x');
          if (change === 'rewrite') await writeFile(file, 'modified');
          if (change.startsWith('replace')) {
            await rename(file, path.join(dir, 'old'));
            if (change === 'replace') await writeFile(file, 'original');
            else await symlink(path.join(dir, 'old'), file);
          }
        }
        const result = await fd.read(buffer, offset, length, position); reads += result.bytesRead; return result;
      } };
    } }), /file_changed/);
    assert.ok(reads <= 9); assert.equal(closed, true);
  }));
}

const key = 'synthetic-file-boundary-key';
const cases = [
  { name: 'source', module: 'research-source-controller.mjs', fn: 'sourceControllerCommand',
    args: (file, dir) => ['--input', file, '--output', path.join(dir, 'output')], deps: '{}', error: 'source_controller_input_file_bound' },
  { name: 'cloud', module: 'research-cloud-controller.mjs', fn: 'cloudControllerCommand',
    args: (file, dir) => ['reserve', '--origin', 'http://127.0.0.1:5555/', '--input', file, '--output', path.join(dir, 'output'), '--journal', path.join(dir, 'journal')],
    deps: `{env:{RESEARCH_TEST_KEY:${JSON.stringify(key)}}}`, error: 'cloud_controller_input_bound' },
  { name: 'priority', module: 'research-source-priority-consumer.mjs', fn: 'sourcePriorityCommand',
    args: (file, dir) => ['--controller', file, '--assessments', path.join(dir, 'assessments'), '--origin', 'http://127.0.0.1:5555/', '--journal', path.join(dir, 'journal')],
    deps: `{env:{INTERNAL_API_KEY:${JSON.stringify(key)}}}`, error: 'source_priority_file_bound' },
  { name: 'deep-recovery', module: 'research-deep-controller.mjs', fn: 'deepControllerCommand',
    args: (file, dir) => ['recover', '--origin', 'http://127.0.0.1:5555/', '--owner', 'synthetic-owner', '--output', path.join(dir, 'output'), '--journal', path.join(dir, 'journal'), '--request-journal', file],
    deps: `{env:{INTERNAL_API_KEY:${JSON.stringify(key)}},source:()=>({commit:'a'.repeat(40),dirty:false})}`, error: 'deep_controller_recovery_journal_invalid' },
];
for (const item of cases) {
  test(`${item.name} actual FIFO rejects before HTTP, output or journal; no FIFO writer`, async () => fixture(async (dir, file) => {
    execFileSync('mkfifo', [file]);
    const module = new URL(`./${item.module}`, import.meta.url).href;
    const code = `import assert from 'node:assert/strict'; import {${item.fn}} from ${JSON.stringify(module)};
      let calls=0; const dependencies={...${item.deps},reader:async()=>{calls++;throw Error('forbidden_read');},post:async()=>{calls++;throw Error('forbidden_post');}};
      await assert.rejects(${item.fn}(${JSON.stringify(item.args(file, dir))},dependencies),{message:${JSON.stringify(item.error)}});
      assert.equal(calls,0);`;
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code], { cwd: root, timeout: 2500, encoding: 'utf8', env: { PATH: process.env.PATH } });
    assert.equal(child.error, undefined, 'must reject without waiting for a FIFO writer');
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(await readdir(dir), ['input']);
  }));
}
test('discovery CLI actual FIFO rejects before network or output; security-scope uses same reader', async () => fixture(async (dir, file) => {
  execFileSync('mkfifo', [file]);
  for (const args of [
    [file, file, file, path.join(dir, 'output')],
    ['--security-scope', file, ...await (async () => {
      for (const name of ['relay', 'social', 'classification']) await writeFile(path.join(dir, name), '{}');
      return ['relay', 'social', 'classification', 'output'].map(name => path.join(dir, name));
    })()],
  ]) {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', path.join(root, 'scripts/research-discovery-relay-prepare.mjs'), ...args], {
      cwd: root, timeout: 2500, encoding: 'utf8', env: { PATH: process.env.PATH },
    });
    assert.equal(child.error, undefined); assert.equal(child.status, 1, child.stderr);
    assert.equal(JSON.parse(child.stderr.trim().split('\n').at(-1)).error, 'discovery_relay_file_bound');
    assert.ok(!(await readdir(dir)).includes('output'));
  }
}));
