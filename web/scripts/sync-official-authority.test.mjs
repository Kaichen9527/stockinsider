import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { OFFICIAL_AUTHORITY_FILES, syncOfficialAuthority } from './sync-official-authority.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const destination = (root) => path.join(root, 'web/src/lib/generated/official-authority');
async function isolated(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stockinsider-authority-bridge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'scripts/runtime'), { recursive: true });
  for (const file of OFFICIAL_AUTHORITY_FILES) await cp(path.join(repositoryRoot, 'scripts/runtime', file), path.join(root, 'scripts/runtime', file));
  return root;
}

test('official authority bridge generates exactly the canonical bytes from a clean source checkout', async (t) => {
  const root = await isolated(t);
  const result = await syncOfficialAuthority({ repositoryRoot: root });
  assert.equal(result.length, OFFICIAL_AUTHORITY_FILES.length);
  for (const entry of result) {
    const original = await readFile(path.join(root, 'scripts/runtime', entry.filename));
    const copied = await readFile(path.join(destination(root), entry.filename));
    assert.deepEqual(copied, original);
    assert.equal(entry.sha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(entry.bytes, original.length);
  }
  assert.deepEqual(await syncOfficialAuthority({ repositoryRoot: root, checkOnly: true }), result);
});

test('official authority retries preserve generated mtimes; a canonical source change updates its exact copy', async (t) => {
  const root = await isolated(t);
  await syncOfficialAuthority({ repositoryRoot: root });
  const target = path.join(destination(root), 'codec.js'); const first = await lstat(target);
  await syncOfficialAuthority({ repositoryRoot: root });
  assert.equal((await lstat(target)).mtimeMs, first.mtimeMs);
  const source = path.join(root, 'scripts/runtime/codec.js');
  const updated = Buffer.concat([await readFile(source), Buffer.from('\n// Source revision fixture.\n')]);
  await writeFile(source, updated);
  await assert.rejects(syncOfficialAuthority({ repositoryRoot: root, checkOnly: true }), /bridge_stale/u);
  await syncOfficialAuthority({ repositoryRoot: root });
  assert.deepEqual(await readFile(target), updated);
});

test('official authority generation rejects missing sources and undeclared loader dependencies before writing', async (t) => {
  const root = await isolated(t); const source = path.join(root, 'scripts/runtime/codec.js');
  await rm(source);
  await assert.rejects(syncOfficialAuthority({ repositoryRoot: root }), /ENOENT/u);
  await assert.rejects(lstat(destination(root)), /ENOENT/u);
  await cp(path.join(repositoryRoot, 'scripts/runtime/codec.js'), source);
  await writeFile(source, "'use strict';\nrequire('./unreviewed-dependency');\n");
  await assert.rejects(syncOfficialAuthority({ repositoryRoot: root }), /undeclared_dependency/u);
  await assert.rejects(lstat(destination(root)), /ENOENT/u);
  await writeFile(source, "'use strict';\nrequire(process.env.MODULE);\n");
  await assert.rejects(syncOfficialAuthority({ repositoryRoot: root }), /dynamic_dependency/u);
});

test('official authority build inputs cannot redirect generation through a symlink', async (t) => {
  const root = await isolated(t); const other = path.join(root, 'outside');
  await mkdir(other); await mkdir(path.join(root, 'web/src/lib'), { recursive: true });
  await symlink(other, path.join(root, 'web/src/lib/generated'));
  await assert.rejects(syncOfficialAuthority({ repositoryRoot: root }), /output_not_directory/u);
  await assert.rejects(lstat(path.join(other, 'official-authority')), /ENOENT/u);
});

test('official authority bridge lifecycle hooks retain web-scoped standalone packaging and generated-input ignores', async () => {
  const pkg = JSON.parse(await readFile(path.join(repositoryRoot, 'web/package.json'), 'utf8'));
  for (const hook of ['postinstall', 'predev', 'prebuild', 'prelint', 'pretypecheck']) assert.match(pkg.scripts[hook], /scripts\/sync-official-authority[.]mjs/u);
  assert.match(pkg.scripts.prebuild, /assert_canonical_vercel_project[.]mjs/u);
  const config = await readFile(path.join(repositoryRoot, 'web/next.config.ts'), 'utf8');
  assert.match(config, /output:\s*"standalone"/u);
  assert.match(config, /root:\s*(?:__dirname|process[.]cwd\(\))/u);
  assert.doesNotMatch(config, /path[.]resolve\(__dirname,\s*["']\.\.["']\)/u);
  assert.match(await readFile(path.join(repositoryRoot, 'web/.gitignore'), 'utf8'), /\/src\/lib\/generated\/official-authority\//u);
  const adapter = await readFile(path.join(repositoryRoot, 'web/src/lib/tw-entry-plan-authority.ts'), 'utf8');
  assert.doesNotMatch(adapter, /\.\.\/\.\.\/\.\.\/scripts\/runtime/u);
});
