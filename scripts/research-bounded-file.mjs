import { constants } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import path from 'node:path';

/** Final-component no-follow, nonblocking open followed by authoritative FD
 * validation. Read at most the original size plus one sentinel byte; reject
 * growth, truncation, in-place changes and path replacement before parsing. */
export async function readResearchBoundedFile(filename, {
  maximum, minimum = 0, privateMode = false,
  absoluteError, boundError, changedError,
}, { openFile = open, statPath = lstat } = {}) {
  if (!path.isAbsolute(filename || '')) throw new Error(absoluteError);
  if (!Number.isSafeInteger(maximum) || maximum < 0 || !Number.isSafeInteger(minimum)
    || minimum < 0 || minimum > maximum) throw new Error(boundError);
  const handle = await openFile(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < minimum
      || before.size > maximum || (privateMode && (before.mode & 0o077))) throw new Error(boundError);
    const bytes = Buffer.alloc(before.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const current = await statPath(filename);
    const same = value => value.isFile() && ['size', 'dev', 'ino', 'ctimeMs', 'mtimeMs', 'mode']
      .every(key => value[key] === before[key]);
    if (offset !== before.size || !same(after) || !same(current)) throw new Error(changedError);
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
