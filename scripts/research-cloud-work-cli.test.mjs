import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { cloudArticleFixture } from './fixtures/research-cloud-article.ts';
import { cloudWorkCommand } from './research-cloud-work.mjs';
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
