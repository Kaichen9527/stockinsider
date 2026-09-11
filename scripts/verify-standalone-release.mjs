import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyStandaloneRelease(releaseDirectory) {
  if (!path.isAbsolute(releaseDirectory || '')) throw new Error('absolute_release_path_required');
  const root = await realpath(releaseDirectory);
  const receipt = JSON.parse(await readFile(path.join(root, 'release-manifest.json'), 'utf8'));
  if (receipt.manifest?.schema !== 'stockinsider-standalone-release-v2'
    || !/^[0-9a-f]{40}$/.test(receipt.manifest.sourceCommit || '')
    || !/^[0-9a-f]{40}$/.test(receipt.manifest.packagerCommit || '')
    || receipt.manifest.releaseId !== receipt.manifest.sourceCommit
    || createHash('sha256').update(JSON.stringify(receipt.manifest)).digest('hex') !== receipt.manifestSha256) {
    throw new Error('release_manifest_invalid');
  }
  if (path.basename(root) !== receipt.manifest.sourceCommit) throw new Error('release_directory_identity_mismatch');
  const actualPaths = [];
  const pending = [''];
  while (pending.length) {
    const relativeDirectory = pending.pop();
    for (const name of await readdir(path.join(root, relativeDirectory))) {
      const relative = path.join(relativeDirectory, name);
      if (relative === 'release-manifest.json') continue;
      const metadata = await lstat(path.join(root, relative));
      if (metadata.isSymbolicLink()) throw new Error('release_symlink_rejected');
      if (metadata.isDirectory()) pending.push(relative);
      else if (metadata.isFile()) actualPaths.push(relative.split(path.sep).join('/'));
      else throw new Error('release_special_file_rejected');
    }
  }
  const expectedPaths = (receipt.manifest.files || []).map(item => item.path).sort();
  actualPaths.sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error('release_member_set_mismatch');
  let total = 0;
  for (const expected of receipt.manifest.files || []) {
    if (typeof expected.path !== 'string' || path.isAbsolute(expected.path)
      || expected.path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error('release_member_path_invalid');
    }
    const absolute = path.join(root, ...expected.path.split('/'));
    const metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== expected.bytes
      || (metadata.mode & 0o777) !== expected.mode) throw new Error('release_member_metadata_invalid');
    const digest = createHash('sha256').update(await readFile(absolute)).digest('hex');
    if (digest !== expected.sha256) throw new Error('release_member_hash_mismatch');
    total += metadata.size;
  }
  if (total !== receipt.manifest.bytes || receipt.manifest.files.length !== receipt.manifest.fileCount) {
    throw new Error('release_aggregate_invalid');
  }
  const entrypoint = path.join(root, ...receipt.manifest.entrypoint.split('/'));
  if (!(await lstat(entrypoint)).isFile()) throw new Error('release_entrypoint_missing');
  return { releaseVerified: true, releaseId: receipt.manifest.releaseId,
    sourceCommit: receipt.manifest.sourceCommit, packagerCommit: receipt.manifest.packagerCommit,
    manifestSha256: receipt.manifestSha256, bytes: total, entrypoint: receipt.manifest.entrypoint };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await verifyStandaloneRelease(process.argv[2]))); }
  catch (error) { console.error(JSON.stringify({ releaseVerified: false, reason: error.message })); process.exitCode = 1; }
}
