import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_STANDALONE_MANIFEST_BYTES = 16 * 1024 ** 2;
export const MAX_STANDALONE_FILES = 100_000;
export const MAX_STANDALONE_TREE_MEMBERS = 200_000;
const FORBIDDEN_COMPONENT = /^(?:backup|\.env(?:\..*)?)$/i;
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(' ') === keys.split(' ').sort().join(' ');
const relativePath = value => typeof value === 'string' && value.length > 0
  && !path.posix.isAbsolute(value) && !/^[a-z]:/i.test(value) && !/[\\\x00-\x1f\x7f]/u.test(value)
  && !value.split('/').some(segment => !segment || segment === '.' || segment === '..'
    || FORBIDDEN_COMPONENT.test(segment));

function validateManifest(receipt) {
  const manifest = receipt?.manifest;
  if (!exact(receipt, 'manifest manifestSha256') || !sha256(receipt.manifestSha256)
    || !exact(manifest, 'schema releaseId sourceCommit packagerCommit createdAt entrypoint fileCount bytes files')
    || manifest.schema !== 'stockinsider-standalone-release-v2'
    || !/^[0-9a-f]{40}$/.test(manifest.sourceCommit || '')
    || !/^[0-9a-f]{40}$/.test(manifest.packagerCommit || '')
    || manifest.releaseId !== manifest.sourceCommit || typeof manifest.createdAt !== 'string'
    || !Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > MAX_STANDALONE_FILES
    || !Number.isSafeInteger(manifest.fileCount) || manifest.fileCount !== manifest.files.length
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 0
    || createHash('sha256').update(JSON.stringify(manifest)).digest('hex') !== receipt.manifestSha256) {
    throw new Error('release_manifest_invalid');
  }
  const paths = new Set(); let total = 0;
  for (const file of manifest.files) {
    if (!exact(file, 'path bytes mode sha256') || !relativePath(file.path) || file.path === 'release-manifest.json'
      || paths.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !Number.isSafeInteger(file.mode) || file.mode < 0 || file.mode > 0o777 || !sha256(file.sha256)) {
      throw new Error('release_member_path_or_metadata_invalid');
    }
    paths.add(file.path); total += file.bytes;
    if (!Number.isSafeInteger(total)) throw new Error('release_aggregate_invalid');
  }
  if (total !== manifest.bytes) throw new Error('release_aggregate_invalid');
  const entry = manifest.entrypoint;
  if (!relativePath(entry) || !paths.has(entry) || !entry.startsWith('app/')
    || entry.split('/').at(-1) !== 'server.js'
    || entry.split('/').some(segment => segment === 'node_modules' || segment === '.next')) {
    throw new Error('release_entrypoint_invalid');
  }
  return manifest;
}

// No-follow protects the final component. Trusted immutable release ancestors
// remain required: this is not an openat/dirfd directory-swap race guarantee.
async function inspectRegularFile(filename, { limit, expected = null, capture = false, error }) {
  let handle;
  try {
    handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > limit || (before.mode & 0o7000) !== 0
      || expected && (before.size !== expected.bytes || (before.mode & 0o7777) !== expected.mode)) throw new Error(error);
    const digest = createHash('sha256'), chunks = []; let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      bytes += chunk.length;
      if (bytes > limit) throw new Error(error);
      digest.update(chunk); if (capture) chunks.push(chunk);
    }
    const after = await handle.stat();
    if (bytes !== before.size || ['dev', 'ino', 'size', 'mode', 'nlink', 'mtimeMs', 'ctimeMs']
      .some(key => before[key] !== after[key])) throw new Error(error);
    return { sha256: digest.digest('hex'), contents: capture ? Buffer.concat(chunks) : null };
  } catch { throw new Error(error); }
  finally { await handle?.close(); }
}

export async function verifyStandaloneRelease(releaseDirectory) {
  if (!path.isAbsolute(releaseDirectory || '')) throw new Error('absolute_release_path_required');
  const root = await realpath(releaseDirectory);
  const manifestFile = await inspectRegularFile(path.join(root, 'release-manifest.json'), {
    limit: MAX_STANDALONE_MANIFEST_BYTES, capture: true, error: 'release_manifest_file_invalid' });
  let receipt;
  try { receipt = JSON.parse(manifestFile.contents.toString('utf8')); }
  catch { throw new Error('release_manifest_invalid'); }
  validateManifest(receipt);
  if (path.basename(root) !== receipt.manifest.sourceCommit) throw new Error('release_directory_identity_mismatch');
  const actualPaths = [];
  const pending = ['']; let members = 0;
  while (pending.length) {
    const relativeDirectory = pending.pop();
    for await (const member of await opendir(path.join(root, relativeDirectory))) {
      const name = member.name;
      const relative = path.join(relativeDirectory, name);
      if (relative === 'release-manifest.json') continue;
      if (++members > MAX_STANDALONE_TREE_MEMBERS) throw new Error('release_tree_member_limit_exceeded');
      if (!relativePath(relative.split(path.sep).join('/'))) throw new Error('release_member_path_or_metadata_invalid');
      const metadata = await lstat(path.join(root, relative));
      if (metadata.isSymbolicLink()) throw new Error('release_symlink_rejected');
      if (metadata.isDirectory()) pending.push(relative);
      else if (metadata.isFile()) {
        actualPaths.push(relative.split(path.sep).join('/'));
        if (actualPaths.length > MAX_STANDALONE_FILES) throw new Error('release_file_limit_exceeded');
      }
      else throw new Error('release_special_file_rejected');
    }
  }
  const expectedPaths = (receipt.manifest.files || []).map(item => item.path).sort();
  actualPaths.sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) throw new Error('release_member_set_mismatch');
  let total = 0;
  for (const expected of receipt.manifest.files || []) {
    const absolute = path.join(root, ...expected.path.split('/'));
    const file = await inspectRegularFile(absolute, { limit: expected.bytes, expected,
      error: 'release_member_metadata_invalid' });
    if (file.sha256 !== expected.sha256) throw new Error('release_member_hash_mismatch');
    total += expected.bytes;
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

// Systemd invokes the verifier through the `current` release symlink. Compare
// physical paths so an unresolved spelling cannot silently skip verification.
if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => null)
  === await realpath(fileURLToPath(import.meta.url))) {
  try { console.log(JSON.stringify(await verifyStandaloneRelease(process.argv[2]))); }
  catch (error) {
    const reason = /^(?:absolute_release_path_required|release_[a-z0-9_]+)$/.test(error?.message || '')
      ? error.message : 'release_verification_failed';
    console.error(JSON.stringify({ releaseVerified: false, reason })); process.exitCode = 1;
  }
}
