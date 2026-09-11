import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { packageStandaloneRelease } from './package-standalone-release.mjs';
import { verifyStandaloneRelease } from './verify-standalone-release.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, 'repo'), destinationRoot = path.join(root, 'releases');
  await mkdir(path.join(repository, 'web', '.next', 'standalone'), { recursive: true });
  await mkdir(path.join(repository, 'web', '.next', 'static'), { recursive: true });
  await mkdir(path.join(repository, 'web', 'public'), { recursive: true });
  await mkdir(path.join(repository, 'scripts'), { recursive: true });
  await mkdir(path.join(repository, 'deployment', 'vps'), { recursive: true });
  await mkdir(destinationRoot);
  await writeFile(path.join(repository, 'web', '.next', 'standalone', 'server.js'), 'server');
  await writeFile(path.join(repository, 'web', '.next', 'static', 'asset.js'), 'asset');
  await writeFile(path.join(repository, 'web', 'public', 'logo.txt'), 'logo');
  for (const name of ['call_internal_api.mjs', 'call_internal_api_sequence.mjs',
    'contabo-capacity-guard.mjs', 'contabo-host-resource-check.mjs',
    'contabo-deployment-inventory.mjs', 'contabo-cleanup-preflight.mjs',
    'verify-standalone-release.mjs']) {
    await writeFile(path.join(repository, 'scripts', name), name);
  }
  await writeFile(path.join(repository, 'deployment', 'vps', 'policy.json'), '{}');
  return { repository, destinationRoot, releaseId: 'a'.repeat(40) };
}

test('packages only the standalone runtime and binds a full git identity', async (t) => {
  const config = await fixture(t);
  const result = await packageStandaloneRelease({ ...config, createdAt: '2026-09-11T00:00:00.000Z' });
  assert.equal(result.entrypoint, 'app/server.js');
  const receipt = JSON.parse(await readFile(path.join(result.releaseDirectory, 'release-manifest.json')));
  assert.equal(receipt.manifest.releaseId, config.releaseId);
  assert.ok(receipt.manifest.files.some(item => item.path === 'app/.next/static/asset.js'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'app/public/logo.txt'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'deployment/vps/policy.json'));
  assert.equal((await verifyStandaloneRelease(result.releaseDirectory)).releaseVerified, true);
  await assert.rejects(packageStandaloneRelease(config));
});

test('release verification rejects a modified runtime file', async (t) => {
  const config = await fixture(t);
  const result = await packageStandaloneRelease({ ...config, releaseId: 'c'.repeat(40) });
  await writeFile(path.join(result.releaseDirectory, 'app', 'server.js'), 'tampered');
  await assert.rejects(verifyStandaloneRelease(result.releaseDirectory), /metadata_invalid|hash_mismatch/);
});

test('rejects incomplete builds, short commit ids and traced backup or env files', async (t) => {
  const config = await fixture(t);
  await assert.rejects(packageStandaloneRelease({ ...config, releaseId: 'abc1234' }), /full_git/);
  await writeFile(path.join(config.repository, 'web', '.next', 'standalone', '.env.local'), 'secret');
  await assert.rejects(packageStandaloneRelease({ ...config, releaseId: 'b'.repeat(40) }), /forbidden/);
});
