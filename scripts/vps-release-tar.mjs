import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, utimes } from 'node:fs/promises';
import path from 'node:path';

const BLOCK = 512;
const MANIFEST = '.stockinsider-release-manifest.json';
export const MAX_RELEASE_MANIFEST_BYTES = 16 * 1024 ** 2;
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);

function octal(buffer, field) {
  const value = buffer.toString('ascii').replace(/\0.*$/, '').trim();
  if (!/^[0-7]+$/.test(value)) throw new Error(`tar_${field}_invalid`);
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`tar_${field}_invalid`);
  return parsed;
}

function headerRecord(header) {
  const stored = octal(header.subarray(148, 156), 'checksum');
  let sum = 0;
  for (let index = 0; index < header.length; index++) sum += index >= 148 && index < 156 ? 32 : header[index];
  if (sum !== stored) throw new Error('tar_checksum_invalid');
  const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
  const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
  const relative = prefix ? `${prefix}/${name}` : name;
  if (!relative || relative.startsWith('/') || relative.includes('\\')
    || relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('tar_path_traversal_rejected');
  }
  const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
  if (!['0', '5'].includes(type)) throw new Error('tar_link_or_special_entry_rejected');
  return { path: relative, type, size: octal(header.subarray(124, 136), 'size'),
    mode: octal(header.subarray(100, 108), 'mode') & 0o777 };
}

async function ensureParent(root, relative) {
  const parent = path.dirname(relative);
  if (parent === '.') return;
  let current = root;
  for (const segment of parent.split('/')) {
    current = path.join(current, segment);
    await mkdir(current, { mode: 0o700 }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    const metadata = await lstat(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('restore_parent_not_directory');
  }
}

export function verifyReleaseTreeManifest(tree, expected) {
  if (tree?.schema !== 'stockinsider-vps-release-tree-v1' || tree.releasePath !== expected.releasePath
    || tree.fileCount !== tree.files?.length || !Number.isSafeInteger(tree.totalBytes)
    || !/^[0-9a-f]{64}$/.test(tree.treeSha256 || '')) throw new Error('release_tree_manifest_invalid');
  const paths = new Set(); let total = 0;
  for (const file of tree.files) {
    if (typeof file.path !== 'string' || file.path.startsWith('/') || file.path.includes('\\')
      || file.path.split('/').some(segment => !segment || segment === '.' || segment === '..')
      || paths.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || !Number.isSafeInteger(file.mode) || file.mode < 0 || file.mode > 0o777
      || !Number.isSafeInteger(file.mtimeMs) || file.mtimeMs < 0
      || !/^[0-9a-f]{64}$/.test(file.sha256 || '')) throw new Error('release_tree_file_invalid');
    paths.add(file.path); total += file.bytes;
    if (!Number.isSafeInteger(total)) throw new Error('release_tree_size_invalid');
  }
  if (total !== tree.totalBytes) throw new Error('release_tree_size_mismatch');
  const withoutDigest = { ...tree }; delete withoutDigest.treeSha256;
  if (createHash('sha256').update(canonical(withoutDigest)).digest('hex') !== tree.treeSha256
    || tree.treeSha256 !== expected.treeSha256 || canonical(tree) !== canonical(expected)) {
    throw new Error('release_tree_manifest_mismatch');
  }
}

export async function extractAndVerifyReleaseTar({ chunks, expectedTree, temporaryParent }) {
  if (!path.isAbsolute(temporaryParent || '')) throw new Error('absolute_temporary_parent_required');
  verifyReleaseTreeManifest(expectedTree, expectedTree);
  const expectedByPath = new Map(expectedTree.files.map(item => [item.path, item]));
  const actualTemporaryParent = await realpath(temporaryParent);
  const temporary = await mkdtemp(path.join(actualTemporaryParent, 'stockinsider-release-restore-'));
  let removed = false, activeHandle = null;
  try {
    let pending = Buffer.alloc(0), current = null, padding = 0, zeroBlocks = 0;
    let manifestBytes = Buffer.alloc(0);
    const extracted = [], seen = new Set();
    for await (const incoming of chunks) {
      if (!Buffer.isBuffer(incoming)) throw new Error('tar_binary_input_required');
      pending = Buffer.concat([pending, incoming]);
      while (true) {
        if (current) {
          if (pending.length === 0) break;
          const count = Math.min(current.remaining, pending.length);
          const piece = pending.subarray(0, count); pending = pending.subarray(count);
          current.hash.update(piece);
          if (current.path === MANIFEST) {
            if (manifestBytes.length + piece.length > MAX_RELEASE_MANIFEST_BYTES) throw new Error('release_manifest_too_large');
            manifestBytes = Buffer.concat([manifestBytes, piece]);
          } else await current.handle.write(piece);
          current.remaining -= count;
          if (current.remaining === 0) {
            if (current.handle) {
              await current.handle.sync(); await current.handle.close(); activeHandle = null;
              const expected = expectedByPath.get(current.path);
              await chmod(current.absolute, current.mode);
              await utimes(current.absolute, new Date(expected.mtimeMs), new Date(expected.mtimeMs));
              const metadata = await lstat(current.absolute);
              if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== expected.bytes
                || (metadata.mode & 0o777) !== expected.mode
                || Math.abs(metadata.mtimeMs - expected.mtimeMs) > 1) throw new Error('restored_file_metadata_mismatch');
            }
            if (current.path !== MANIFEST) extracted.push({ path: current.path, bytes: current.size,
              mode: current.mode, mtimeMs: expectedByPath.get(current.path).mtimeMs,
              sha256: current.hash.digest('hex') });
            padding = (BLOCK - (current.size % BLOCK)) % BLOCK;
            current = null;
          }
          continue;
        }
        if (padding) {
          if (pending.length < padding) break;
          if (pending.subarray(0, padding).some(byte => byte !== 0)) throw new Error('tar_padding_invalid');
          pending = pending.subarray(padding); padding = 0; continue;
        }
        if (pending.length < BLOCK) break;
        const header = pending.subarray(0, BLOCK); pending = pending.subarray(BLOCK);
        if (header.every(byte => byte === 0)) { zeroBlocks++; continue; }
        if (zeroBlocks >= 2) throw new Error('tar_content_after_end_rejected');
        zeroBlocks = 0;
        const record = headerRecord(header);
        if (seen.size === 0 && record.path !== MANIFEST) throw new Error('release_manifest_must_be_first');
        if (seen.has(record.path)) throw new Error('tar_duplicate_path_rejected');
        seen.add(record.path);
        const absolute = path.resolve(temporary, ...record.path.split('/'));
        if (!absolute.startsWith(temporary + path.sep)) throw new Error('tar_path_traversal_rejected');
        await ensureParent(temporary, record.path);
        if (record.type === '5') throw new Error('unexpected_directory_entry');
        if (record.path === MANIFEST) {
          if (record.size > MAX_RELEASE_MANIFEST_BYTES) throw new Error('release_manifest_too_large');
        } else {
          const expected = expectedByPath.get(record.path);
          if (!expected || record.size !== expected.bytes || record.mode !== expected.mode
            || seen.size > expectedTree.fileCount + 1) throw new Error('unexpected_release_entry');
        }
        const handle = record.path === MANIFEST ? null : await open(absolute, 'wx', 0o600);
        activeHandle = handle;
        current = { ...record, absolute, handle, remaining: record.size, hash: createHash('sha256') };
        if (record.size === 0) {
          if (handle) {
            await handle.sync(); await handle.close(); activeHandle = null;
            const expected = expectedByPath.get(record.path);
            await chmod(absolute, record.mode);
            await utimes(absolute, new Date(expected.mtimeMs), new Date(expected.mtimeMs));
            const metadata = await lstat(absolute);
            if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== expected.bytes
              || (metadata.mode & 0o777) !== expected.mode
              || Math.abs(metadata.mtimeMs - expected.mtimeMs) > 1) throw new Error('restored_file_metadata_mismatch');
          }
          if (record.path !== MANIFEST) extracted.push({ path: record.path, bytes: 0,
            mode: record.mode, mtimeMs: expectedByPath.get(record.path).mtimeMs,
            sha256: current.hash.digest('hex') });
          current = null;
        }
      }
    }
    if (current || padding || pending.some(byte => byte !== 0) || zeroBlocks < 2) throw new Error('tar_truncated');
    const embedded = JSON.parse(manifestBytes.toString('utf8'));
    verifyReleaseTreeManifest(embedded, expectedTree);
    extracted.sort((a, b) => a.path.localeCompare(b.path));
    const expectedFiles = embedded.files.map(({ path: filePath, bytes, mode, mtimeMs, sha256 }) =>
      ({ path: filePath, bytes, mode, mtimeMs, sha256 })).sort((a, b) => a.path.localeCompare(b.path));
    if (canonical(extracted) !== canonical(expectedFiles)
      || extracted.reduce((sum, item) => sum + item.bytes, 0) !== embedded.totalBytes) {
      throw new Error('restored_release_tree_mismatch');
    }
    return { releasePath: embedded.releasePath, treeSha256: embedded.treeSha256,
      fileCount: extracted.length, totalBytes: embedded.totalBytes, restoreVerified: true };
  } finally {
    await activeHandle?.close().catch(() => {});
    if (!temporary.startsWith(actualTemporaryParent + path.sep)
      || !path.basename(temporary).startsWith('stockinsider-release-restore-')) {
      throw new Error('temporary_restore_identity_invalid');
    }
    await rm(temporary, { recursive: true, force: false });
    removed = true;
    if (!removed) throw new Error('temporary_restore_cleanup_failed');
  }
}
