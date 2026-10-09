import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { cloudArticleFixture } from './fixtures/research-cloud-article.ts';
import { cloudWorkCommand, readCloudPrivateJson } from './research-cloud-work.mjs';
import { createCloudResult, recomputeCloudArticle } from '../web/src/lib/research-cloud-work.ts';

test('controller prepare and receive share original packet; receipt does not publish and output cannot overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-cloud-cli-'));
  try {
    const work = cloudArticleFixture('a'.repeat(40), new Date().toISOString());
    const { workHash: _hash, schemaVersion: _schema, ...input } = work;
    const file = (name) => path.join(root, name);
    await fs.writeFile(file('input.json'), JSON.stringify(input));
    const prepared = await cloudWorkCommand(['prepare', '--input', file('input.json'), '--output', file('task.json')]);
    assert.equal(prepared.workHash, work.workHash); assert.equal(prepared.reservationCreated, false);
    const result = createCloudResult({ work, sourceCommit: work.sourceCommit,
      startedAt: work.issuedAt, completedAt: new Date().toISOString(), status: 'completed', output: recomputeCloudArticle(work, new Date().toISOString()) });
    await fs.writeFile(file('result.json'), JSON.stringify(result));
    const receipt = await cloudWorkCommand(['verify', '--task', file('task.json'), '--result', file('result.json'), '--output', file('receipt.json')]);
    assert.equal(receipt.authoritativePublication, false);
    assert.equal(receipt.requiresLiveReservationCheck, true);
    await assert.rejects(cloudWorkCommand(['verify', '--task', file('task.json'), '--result', file('result.json'), '--output', file('receipt.json')]), /EEXIST/);
    await assert.rejects(cloudWorkCommand(['prepare', '--input', 'relative.json', '--output', file('other.json')]), /absolute_file/);
    await assert.rejects(cloudWorkCommand(['run', '--task', file('task.json'), '--output', file('run.json'), '--workspace', root]), /workspace_source_mismatch/);
    const repository = path.resolve(new URL('..', import.meta.url).pathname);
    await assert.rejects(cloudWorkCommand(['run', '--task', file('task.json'), '--output', file('run.json'), '--workspace', repository]), /exact_clean_source_required/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('synthetic acceptance deadline remains within its Taipei budget day', () => {
  const work = cloudArticleFixture('a'.repeat(40), '2026-10-04T15:45:00Z');
  assert.equal(work.deadlineAt, '2026-10-04T15:59:59.999Z');
});

test('Cloud private input rejects actual FIFO before waiting and accepts ordinary JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-cloud-fifo-'));
  try {
    const fifo = path.join(root, 'fifo'); execFileSync('mkfifo', [fifo], { timeout: 2000 });
    const code = `import {readCloudPrivateJson} from ${JSON.stringify(new URL('./research-cloud-work.mjs', import.meta.url).href)};
      try { await readCloudPrivateJson(${JSON.stringify(fifo)}); process.exitCode=2; }
      catch(error) { console.error(error.message); process.exitCode=1; }`;
    const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', code],
      { timeout: 2000, maxBuffer: 65536, encoding: 'utf8', killSignal: 'SIGKILL' });
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.match(result.stderr, /cloud_file_bound_invalid/u);
    const file = path.join(root, 'valid'); await fs.writeFile(file, '{"symbol":"友達"}');
    assert.deepEqual(await readCloudPrivateJson(file), { symbol: '友達' });
    await fs.symlink(file, path.join(root, 'link'));
    await assert.rejects(readCloudPrivateJson(path.join(root, 'link')), /ELOOP/u);
    await assert.rejects(readCloudPrivateJson(root), /cloud_file_bound_invalid/u);
    await assert.rejects(readCloudPrivateJson('/dev/null'), /cloud_file_bound_invalid/u);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Cloud private input enforces exact four-million bytes and strict UTF8', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'si-cloud-bound-'));
  try {
    const file = path.join(root, 'input');
    const text = `{"padding":"${'x'.repeat(4_000_000 - 14)}"}`;
    assert.equal(Buffer.byteLength(text), 4_000_000);
    await fs.writeFile(file, text); assert.equal((await readCloudPrivateJson(file)).padding.length, 4_000_000 - 14);
    await fs.appendFile(file, ' '); await assert.rejects(readCloudPrivateJson(file), /cloud_file_bound_invalid/u);
    await fs.writeFile(file, Buffer.from([0x22, 0xff, 0x22]));
    await assert.rejects(readCloudPrivateJson(file), /encoding|UTF-8/u);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('Cloud private input closes and rejects growth, short read, same-size mutation and path replacement', async () => {
  for (const change of ['growth', 'short', 'clock', 'path']) {
    let closed = 0, stats = 0, reads = 0, allocated = 0;
    const info = { isFile: () => true, size: 2, dev: 1, ino: 1, ctimeMs: 100, mtimeMs: 100 };
    const handle = {
      async stat() { return ++stats === 1 ? info : { ...info,
        ...(change === 'growth' ? { size: 3 } : {}), ...(change === 'clock' ? { ctimeMs: 101 } : {}) }; },
      async read(buffer, offset, length) {
        allocated = Math.max(allocated, buffer.length);
        if (reads++) return { bytesRead: 0 };
        const bytes = Buffer.from(change === 'growth' ? '{}x' : change === 'short' ? '{' : '{}');
        assert.ok(bytes.length <= length); bytes.copy(buffer, offset); return { bytesRead: bytes.length };
      },
      async close() { closed++; },
    };
    await assert.rejects(readCloudPrivateJson('/synthetic-owned-input', { openFile: async () => handle,
      statPath: async () => ({ ...info, ...(change === 'path' ? { ino: 2 } : {}) }) }), /cloud_file_changed_during_read/u);
    assert.equal(closed, 1); assert.equal(allocated, 3);
  }
});
