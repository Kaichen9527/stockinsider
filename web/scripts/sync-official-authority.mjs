import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// These remain the worker's canonical implementations. Next's web-scoped
// bundler consumes deterministic build inputs, never handwritten copies of
// financial validators or files loaded from outside the standalone artifact.
export const OFFICIAL_AUTHORITY_FILES = Object.freeze([
  'codec.js', 'official-market-authority-v314.js', 'official-calendar-v314.js',
]);
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function regularFile(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('official_authority_source_not_regular');
  const bytes = await readFile(filename);
  if (bytes.length === 0 || bytes.length > 256_000) throw new Error('official_authority_source_size');
  return bytes;
}

function validateDependencies(bytes, name) {
  const source = bytes.toString('utf8');
  const dependencies = [...source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/gu)].map((match) => match[2]);
  for (const dependency of dependencies) {
    const allowed = ['crypto', 'node:crypto'].includes(dependency)
      || OFFICIAL_AUTHORITY_FILES.some((filename) => dependency === `./${filename}` || dependency === `./${filename.slice(0, -3)}`);
    if (!allowed) throw new Error(`official_authority_undeclared_dependency:${name}:${dependency}`);
  }
  // Reject a new dynamic loader rather than silently ship an incomplete
  // closure. The current audited CommonJS files only use literal requires.
  const withoutLiterals = source.replace(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/gu, '');
  if (/\brequire\s*\(|\bimport\s*(?:\(|[{*]|[A-Za-z_$])/u.test(withoutLiterals)) throw new Error(`official_authority_dynamic_dependency:${name}`);
}

async function ensureOutputDirectory(repositoryRoot, checkOnly) {
  let cursor = repositoryRoot;
  for (const component of ['web', 'src', 'lib', 'generated', 'official-authority']) {
    cursor = path.join(cursor, component);
    let stat;
    try { stat = await lstat(cursor); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (checkOnly) throw new Error('official_authority_bridge_missing');
      await mkdir(cursor); stat = await lstat(cursor);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('official_authority_output_not_directory');
  }
  return cursor;
}

export async function syncOfficialAuthority({ repositoryRoot = defaultRoot, checkOnly = false } = {}) {
  const root = path.resolve(repositoryRoot);
  // Complete source/dependency checks before writing any generated input.
  const sources = await Promise.all(OFFICIAL_AUTHORITY_FILES.map(async (filename) => {
    const bytes = await regularFile(path.join(root, 'scripts/runtime', filename));
    validateDependencies(bytes, filename);
    return { filename, bytes, sha256: hash(bytes) };
  }));
  const destination = await ensureOutputDirectory(root, checkOnly);
  for (const source of sources) {
    const target = path.join(destination, source.filename);
    let previous = null;
    try { previous = await regularFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous?.equals(source.bytes)) continue;
    if (checkOnly) throw new Error(`official_authority_bridge_stale:${source.filename}`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, source.bytes, { flag: 'wx' });
    await rename(temporary, target);
  }
  return sources.map(({ filename, sha256, bytes }) => ({ filename, sha256, bytes: bytes.length }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await syncOfficialAuthority({ checkOnly: process.argv.includes('--check') });
  process.stdout.write(`Official authority build bridge verified (${files.length} canonical modules).\n`);
}
