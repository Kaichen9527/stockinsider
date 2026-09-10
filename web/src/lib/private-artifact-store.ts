import { constants } from 'node:fs';
import { lstat, mkdir, open, link, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const MAX_BYTES = 64 * 1024 * 1024;
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function assertHash(hash: string) {
  if (!/^[0-9a-f]{64}$/u.test(hash)) throw new Error('artifact_hash_invalid');
}
async function privateRoot(root: string) {
  if (!path.isAbsolute(root) || root === '/' || root !== path.resolve(root)) throw new Error('artifact_root_invalid');
  let current = path.parse(root).root;
  for (const segment of root.slice(current.length).split(path.sep)) {
    current = path.join(current, segment);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('artifact_path_invalid');
    // A sticky root-owned temporary parent is safe for our owned child. Other
    // writable/untrusted ancestors could rename the path after this check.
    if ((stat.uid !== 0 && stat.uid !== process.getuid!())
      || ((stat.mode & 0o022) !== 0 && !(stat.uid === 0 && (stat.mode & 0o1000) !== 0))) throw new Error('artifact_ancestor_untrusted');
  }
  const stat = await lstat(root);
  if (stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) throw new Error('artifact_root_not_private');
}

/** Hash-addressed private bytes only. Caller preserves original receipt/object
 * identity in the database; no public URL, download route or path input exists.
 */
export function privateArtifactStore(root: string) {
  async function location(hash: string, create: boolean) {
    assertHash(hash); await privateRoot(root);
    const directory = path.join(root, hash.slice(0, 2));
    if (create) {
      try { await mkdir(directory, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0) throw new Error('artifact_directory_invalid');
    return { directory, filename: path.join(directory, hash) };
  }
  async function read(hash: string): Promise<Buffer> {
    const { filename } = await location(hash, false);
    const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: Buffer | undefined;
    try {
      const stat = await handle.stat();
      // Atomic no-overwrite publication briefly has both pending and final
      // links. Both remain private; integrity is checked on the opened inode.
      if (!stat.isFile() || stat.nlink < 1 || stat.nlink > 2 || stat.uid !== process.getuid!() || (stat.mode & 0o077) !== 0
        || stat.size < 1 || stat.size > MAX_BYTES) throw new Error('artifact_file_invalid');
      // Bound allocation even if another privileged process grows the file
      // between stat and read; never use an unbounded readFile on private bytes.
      bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(bytes, offset, bytes.length-offset, offset);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      const tail = Buffer.alloc(1);
      const extra = await handle.read(tail, 0, 1, stat.size); tail.fill(0);
      if (offset !== stat.size || extra.bytesRead !== 0 || digest(bytes) !== hash) { bytes.fill(0); throw new Error('artifact_integrity_failed'); }
      return bytes;
    } catch (error) { bytes?.fill(0); throw error; }
    finally {
      try { await handle.close(); }
      catch (error) { bytes?.fill(0); throw error; }
    }
  }
  async function put(hash: string, bytes: Buffer) {
    assertHash(hash);
    if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_BYTES || digest(bytes) !== hash) throw new Error('artifact_input_invalid');
    // Snapshot caller memory before the first await; concurrent caller edits
    // must never publish bytes under the previously computed content hash.
    bytes = Buffer.from(bytes);
    try {
    const { directory, filename } = await location(hash, true);
    const temporary = path.join(directory, `.pending-${randomUUID()}`);
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let published = false;
    try {
      await handle.writeFile(bytes); await handle.sync(); await handle.close();
      try { await link(temporary, filename); published = true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally { await handle.close().catch(() => {}); await unlink(temporary); }
    const stored = await read(hash);
    try { if (!stored.equals(bytes)) throw new Error('artifact_integrity_failed'); }
    finally { stored.fill(0); }
    const dir = await open(directory, constants.O_RDONLY);
    try { await dir.sync(); } finally { await dir.close(); }
    return { hash, bytes: bytes.length, created: published };
    } finally { bytes.fill(0); }
  }
  return { read, put };
}
