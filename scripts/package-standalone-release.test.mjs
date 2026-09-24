import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageStandaloneRelease } from './package-standalone-release.mjs';
import { verifyStandaloneRelease } from './verify-standalone-release.mjs';

async function fixture(t, bundledAssets = null) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-package-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRepository = path.join(root, 'source'), packagerRepository = path.join(root, 'packager');
  const destinationRoot = path.join(root, 'releases');
  await mkdir(path.join(sourceRepository, 'web', '.next', 'standalone'), { recursive: true });
  await mkdir(path.join(sourceRepository, 'web', '.next', 'static'), { recursive: true });
  await mkdir(path.join(sourceRepository, 'web', 'public'), { recursive: true });
  await mkdir(path.join(packagerRepository, 'scripts'), { recursive: true });
  await mkdir(path.join(packagerRepository, 'deployment', 'vps'), { recursive: true });
  await mkdir(destinationRoot);
  await writeFile(path.join(sourceRepository, 'web', '.next', 'standalone', 'server.js'), 'server');
  await writeFile(path.join(sourceRepository, 'web', '.next', 'static', 'asset.js'), 'asset');
  await writeFile(path.join(sourceRepository, 'web', 'public', 'logo.txt'), 'logo');
  if (bundledAssets?.sourceWritable) {
    await chmod(path.join(sourceRepository, 'web', '.next', 'static', 'asset.js'), 0o664);
  }
  if (bundledAssets !== null) {
    const bundledRoot = path.join(sourceRepository, 'web', '.next', 'standalone');
    await mkdir(path.join(bundledRoot, '.next', 'static'), { recursive: true });
    await mkdir(path.join(bundledRoot, 'public'), { recursive: true });
    await writeFile(path.join(bundledRoot, '.next', 'static', 'asset.js'), bundledAssets.static);
    await writeFile(path.join(bundledRoot, 'public', 'logo.txt'), bundledAssets.public);
  }
  for (const name of ['call_internal_api.mjs', 'call_internal_api_sequence.mjs',
    'internal-api-sequence-policy.mjs',
    'contabo-capacity-guard.mjs', 'contabo-host-resource-check.mjs',
    'contabo-deployment-inventory.mjs', 'contabo-cleanup-preflight.mjs',
    'sync-official-trading-calendar.mjs',
    'verify-standalone-release.mjs',
    'candidate_financial_parser_socket.py', 'candidate_financial_document_parser.py',
    'candidate_financial_fact_scope.py']) {
    await writeFile(path.join(packagerRepository, 'scripts', name), name);
  }
  await writeFile(path.join(packagerRepository, 'deployment', 'vps', 'policy.json'), '{}');
  for (const repository of [sourceRepository, packagerRepository]) {
    execFileSync('/usr/bin/git', ['init'], { cwd: repository });
    execFileSync('/usr/bin/git', ['add', '.'], { cwd: repository });
    execFileSync('/usr/bin/git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      'commit', '-m', 'fixture'], { cwd: repository });
  }
  const sourceCommit = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'],
    { cwd: sourceRepository, encoding: 'utf8' }).trim();
  const packagerCommit = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'],
    { cwd: packagerRepository, encoding: 'utf8' }).trim();
  return { sourceRepository, packagerRepository, destinationRoot, sourceCommit, packagerCommit };
}

test('packages only the standalone runtime and binds a full git identity', async (t) => {
  const config = await fixture(t);
  const result = await packageStandaloneRelease({ ...config, createdAt: '2026-09-11T00:00:00.000Z' });
  assert.equal(result.entrypoint, 'app/server.js');
  const receipt = JSON.parse(await readFile(path.join(result.releaseDirectory, 'release-manifest.json')));
  assert.equal(receipt.manifest.releaseId, config.sourceCommit);
  assert.equal(receipt.manifest.sourceCommit, config.sourceCommit);
  assert.equal(receipt.manifest.packagerCommit, config.packagerCommit);
  assert.ok(receipt.manifest.files.some(item => item.path === 'app/.next/static/asset.js'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'app/public/logo.txt'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'deployment/vps/policy.json'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'scripts/internal-api-sequence-policy.mjs'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'scripts/sync-official-trading-calendar.mjs'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'scripts/candidate_financial_parser_socket.py'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'scripts/candidate_financial_document_parser.py'));
  assert.ok(receipt.manifest.files.some(item => item.path === 'scripts/candidate_financial_fact_scope.py'));
  assert.equal((await verifyStandaloneRelease(result.releaseDirectory)).releaseVerified, true);
  await assert.rejects(packageStandaloneRelease(config));
});

test('release verification rejects a modified runtime file', async (t) => {
  const config = await fixture(t);
  const result = await packageStandaloneRelease(config);
  await writeFile(path.join(result.releaseDirectory, 'app', 'server.js'), 'tampered');
  await assert.rejects(verifyStandaloneRelease(result.releaseDirectory), /metadata_invalid|hash_mismatch/);
});

test('accepts identical bundled static and public assets, but rejects mismatches', async (t) => {
  const identical = await fixture(t, { static: 'asset', public: 'logo', sourceWritable: true });
  const packaged = await packageStandaloneRelease(identical);
  assert.equal((await verifyStandaloneRelease(packaged.releaseDirectory)).releaseVerified, true);
  const changedStatic = await fixture(t, { static: 'different', public: 'logo' });
  await assert.rejects(packageStandaloneRelease(changedStatic), /standalone_bundled_assets_mismatch/u);
  const changedPublic = await fixture(t, { static: 'asset', public: 'different' });
  await assert.rejects(packageStandaloneRelease(changedPublic), /standalone_bundled_assets_mismatch/u);
});

test('verification CLI cannot skip a release symlink invocation', async (t) => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-release-cli-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = path.join(root, 'verify-standalone-release.mjs');
  await symlink(fileURLToPath(new URL('./verify-standalone-release.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link, path.join(root, 'missing-release')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).releaseVerified, false);
});

test('packager CLI cannot skip a checkout symlink invocation', async (t) => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-package-cli-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = path.join(root, 'package-standalone-release.mjs');
  await symlink(fileURLToPath(new URL('./package-standalone-release.mjs', import.meta.url)), link);
  const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error, 'standalone_packaging_failed');
});

test('rejects incomplete builds, short commit ids and traced backup or env files', async (t) => {
  const config = await fixture(t);
  await assert.rejects(packageStandaloneRelease({ ...config, sourceCommit: 'abc1234' }), /full_source_git/);
  await writeFile(path.join(config.sourceRepository, 'web', '.next', 'standalone', '.env.local'), 'secret');
  await assert.rejects(packageStandaloneRelease(config), /forbidden/);
});

test('rejects mismatched source or packager identity and dirty tracked tooling', async (t) => {
  const config = await fixture(t);
  await assert.rejects(packageStandaloneRelease({ ...config, packagerCommit: 'b'.repeat(40) }),
    /packager_commit_mismatch/);
  await writeFile(path.join(config.packagerRepository, 'deployment', 'vps', 'policy.json'), '{"dirty":true}');
  await assert.rejects(packageStandaloneRelease(config), /packager_tracked_tree_dirty/);
});
