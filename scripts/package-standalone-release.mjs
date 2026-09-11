import { constants } from 'node:fs';
import { cp, lstat, mkdir, open, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_COMPONENT = /^(?:backup|\.env(?:\..*)?)$/i;
const RELEASE_ID = /^[0-9a-f]{40}$/;

async function inspectTree(root) {
  const files = [];
  const pending = [''];
  while (pending.length) {
    const relativeDirectory = pending.pop();
    const absoluteDirectory = path.join(root, relativeDirectory);
    for (const name of (await readdir(absoluteDirectory)).sort()) {
      if (FORBIDDEN_COMPONENT.test(name)) throw new Error('forbidden_release_component');
      const relative = path.join(relativeDirectory, name);
      const absolute = path.join(root, relative);
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) throw new Error('release_symlink_rejected');
      if (metadata.isDirectory()) pending.push(relative);
      else if (metadata.isFile()) {
        const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
        files.push({ path: relative.split(path.sep).join('/'), bytes: metadata.size,
          mode: metadata.mode & 0o777, sha256: digest });
      } else throw new Error('release_special_file_rejected');
      if (files.length > 100_000) throw new Error('release_file_limit_exceeded');
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

async function findEntrypoint(root) {
  if ((await stat(path.join(root, 'server.js')).catch(() => null))?.isFile()) return 'server.js';
  const matches = [];
  const pending = [''];
  while (pending.length) {
    const relativeDirectory = pending.pop();
    for (const name of await readdir(path.join(root, relativeDirectory))) {
      const relative = path.join(relativeDirectory, name);
      const metadata = await lstat(path.join(root, relative));
      if (metadata.isDirectory() && name !== 'node_modules' && name !== '.next') pending.push(relative);
      else if (metadata.isFile() && name === 'server.js') matches.push(relative);
    }
  }
  if (matches.length !== 1) throw new Error('standalone_entrypoint_ambiguous');
  return matches[0];
}

export async function packageStandaloneRelease({ repository, destinationRoot, releaseId,
  createdAt = new Date().toISOString() }) {
  if (!RELEASE_ID.test(releaseId || '')) throw new Error('full_git_release_id_required');
  if (![repository, destinationRoot].every(value => typeof value === 'string' && path.isAbsolute(value))) {
    throw new Error('absolute_paths_required');
  }
  const source = await realpath(repository);
  const destinationParent = await realpath(destinationRoot);
  if (source === destinationParent || source.startsWith(destinationParent + path.sep)
    || destinationParent.startsWith(source + path.sep)) throw new Error('release_destination_must_be_external');
  const standalone = path.join(source, 'web', '.next', 'standalone');
  const staticDirectory = path.join(source, 'web', '.next', 'static');
  for (const required of [standalone, staticDirectory]) {
    if (!(await stat(required)).isDirectory()) throw new Error('standalone_build_missing');
  }
  const releaseDirectory = path.join(destinationParent, releaseId);
  await mkdir(releaseDirectory, { mode: 0o755 });
  try {
    const app = path.join(releaseDirectory, 'app');
    await cp(standalone, app, { recursive: true, dereference: true, errorOnExist: true, force: false });
    const entrypoint = await findEntrypoint(app);
    const entrypointDirectory = path.dirname(path.join(app, entrypoint));
    await mkdir(path.join(entrypointDirectory, '.next'), { recursive: true });
    await cp(staticDirectory, path.join(entrypointDirectory, '.next', 'static'),
      { recursive: true, dereference: true, errorOnExist: true, force: false });
    const publicDirectory = path.join(source, 'web', 'public');
    if ((await stat(publicDirectory).catch(() => null))?.isDirectory()) {
      await cp(publicDirectory, path.join(entrypointDirectory, 'public'),
        { recursive: true, dereference: true, errorOnExist: true, force: false });
    }
    const runtimeScripts = path.join(releaseDirectory, 'scripts');
    await mkdir(runtimeScripts);
    for (const name of ['call_internal_api.mjs', 'call_internal_api_sequence.mjs',
      'contabo-capacity-guard.mjs', 'contabo-host-resource-check.mjs',
      'contabo-deployment-inventory.mjs', 'contabo-cleanup-preflight.mjs',
      'verify-standalone-release.mjs']) {
      await cp(path.join(source, 'scripts', name), path.join(runtimeScripts, name),
        { dereference: true, errorOnExist: true, force: false });
    }
    await cp(path.join(source, 'deployment', 'vps'), path.join(releaseDirectory, 'deployment', 'vps'),
      { recursive: true, dereference: true, errorOnExist: true, force: false });
    const files = await inspectTree(releaseDirectory);
    const manifest = {
      schema: 'stockinsider-standalone-release-v1', releaseId, createdAt,
      entrypoint: path.relative(releaseDirectory, path.join(app, entrypoint)).split(path.sep).join('/'),
      fileCount: files.length, bytes: files.reduce((sum, item) => sum + item.bytes, 0), files,
    };
    const manifestSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    await writeFile(path.join(releaseDirectory, 'release-manifest.json'),
      JSON.stringify({ manifest, manifestSha256 }, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
    const directoryHandle = await open(releaseDirectory, constants.O_RDONLY);
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    return { releaseDirectory, manifestSha256, bytes: manifest.bytes, fileCount: manifest.fileCount,
      entrypoint: manifest.entrypoint };
  } catch (error) {
    // Never replace or remove an existing release. A failed, uniquely named
    // directory remains visible for operator quarantine and inspection.
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [repository, destinationRoot, releaseId, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('usage');
    console.log(JSON.stringify(await packageStandaloneRelease({ repository, destinationRoot, releaseId })));
  } catch (error) {
    console.error(JSON.stringify({ error: 'standalone_packaging_failed', reason: error.message }));
    process.exitCode = 1;
  }
}
