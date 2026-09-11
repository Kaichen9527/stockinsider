import { lstat, mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Local-only recovery key. FileVault is a separate deployment prerequisite.
// Never log the returned Buffer or place this directory inside the backup tree.
export async function loadLocalBackupKey(directory, { create = false } = {}) {
  if (!path.isAbsolute(directory)) throw new Error('key_path_invalid');
  let current = path.parse(directory).root;
  for (const segment of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (create) await mkdir(current, { mode: 0o700 }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('key_directory_invalid');
  }
  const dir = await lstat(directory);
  if (dir.uid !== process.getuid() || (dir.mode & 0o777) !== 0o700) throw new Error('key_directory_permissions');
  const filename = path.join(directory, 'aes256-v1.key');
  if (create) {
    let file;
    const bytes = randomBytes(32);
    try {
      file = await open(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      await file.writeFile(bytes);
      await file.sync();
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally {
      bytes.fill(0);
      await file?.close();
    }
  }
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600
      || info.nlink !== 1 || info.size !== 32) throw new Error('key_file_invalid');
    return await file.readFile();
  } finally { await file.close(); }
}
