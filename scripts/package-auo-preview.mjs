import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const outputIndex = process.argv.indexOf('--output');
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
assert.ok(output && path.isAbsolute(output), 'usage: node scripts/package-auo-preview.mjs --output <new-absolute-directory>');
assert.equal(existsSync(output), false, 'output directory must not already exist');

const prefix = '/preview/auo-2409-assets';
const build = spawnSync('npm', ['run', 'build'], {
  cwd: web,
  env: { ...process.env, NEXT_PUBLIC_ASSET_PREFIX: prefix },
  encoding: 'utf8',
  stdio: 'inherit',
});
assert.equal(build.status, 0, 'AUO preview production build failed');

const standalone = path.join(web, '.next/standalone');
const staticDirectory = path.join(web, '.next/static');
assert.ok(existsSync(path.join(standalone, 'server.js')), 'standalone server missing');
assert.ok(existsSync(staticDirectory), 'static chunks missing');

mkdirSync(output, { recursive: false });
cpSync(standalone, output, {
  recursive: true,
  filter: (source) => !path.basename(source).startsWith('.env'),
});
mkdirSync(path.join(output, '.next'), { recursive: true });
cpSync(staticDirectory, path.join(output, '.next/static'), { recursive: true });
cpSync(path.join(root, 'scripts/verify-auo-preview-artifact.mjs'), path.join(output, 'verify-auo-preview-artifact.mjs'));

const verify = spawnSync(process.execPath, ['verify-auo-preview-artifact.mjs'], {
  cwd: output,
  encoding: 'utf8',
});
assert.equal(verify.status, 0, verify.stderr || 'AUO preview artifact verification failed');
process.stdout.write(`${JSON.stringify({ output, prefix, status: 'packaged' })}\n`);
