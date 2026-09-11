import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { putSourceAuditArtifact } from './source-audit-artifact.ts';

test('Contabo source diagnostics use the private hash store and receipt RPC', async () => {
  const previousMode = process.env.STOCKINSIDER_DATA_PLANE;
  const previousRoot = process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'source-audit-artifact-'));
  const root = path.join(await realpath(temporary), 'private');
  await mkdir(root, { mode: 0o700 });
  const bytes = Buffer.from('bounded diagnostic attachment');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const calls: Array<Record<string, unknown>> = [];
  const client = { rpc: async (_name: string, input: Record<string, unknown>) => {
    calls.push(input); return { data: {}, error: null };
  } } as never;
  try {
    process.env.STOCKINSIDER_DATA_PLANE = 'contabo';
    process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT = root;
    const result = await putSourceAuditArtifact({ client, bucket: 'ignored', objectKey: 'telegram/audit.html',
      bytes, contentType: 'text/html; charset=utf-8' });
    assert.equal(result.path, `sha256:${hash}`);
    assert.equal(result.storage, 'private_hash_store_v1');
    assert.equal(calls[0]?.p_purpose, 'diagnostic_attachment');
    assert.equal(calls[0]?.p_artifact_hash, hash);
  } finally {
    if (previousMode === undefined) delete process.env.STOCKINSIDER_DATA_PLANE;
    else process.env.STOCKINSIDER_DATA_PLANE = previousMode;
    if (previousRoot === undefined) delete process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;
    else process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT = previousRoot;
    await rm(temporary, { recursive: true, force: true });
  }
});
