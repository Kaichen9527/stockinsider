#!/usr/bin/env node
// Installs one authenticated private artifact from SSH stdin into the immutable
// hash-addressed Contabo store. The logical Supabase path is never trusted.
import { createHash, randomUUID } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chmod, chown, link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';

const [expectedHash, expectedBytesText] = process.argv.slice(2);
const root = '/var/lib/stockinsider/artifacts';
const expectedBytes = Number(expectedBytesText);
const hashPattern = /^[0-9a-f]{64}$/u;
let temporary;

async function verify(filename) {
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.isSymbolicLink?.() || info.size !== expectedBytes
      || (info.mode & 0o077) !== 0) throw new Error('private_artifact_target_invalid');
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < expectedBytes) {
      const read = await handle.read(buffer, 0, Math.min(buffer.length, expectedBytes - offset), offset);
      if (!read.bytesRead) break;
      hash.update(buffer.subarray(0, read.bytesRead)); offset += read.bytesRead;
    }
    buffer.fill(0);
    if (offset !== expectedBytes || hash.digest('hex') !== expectedHash) throw new Error('private_artifact_hash_mismatch');
  } finally { await handle.close(); }
}

try {
  if (process.getuid?.() !== 0 || !hashPattern.test(expectedHash || '')
    || !Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > 64 * 1024 * 1024) {
    throw new Error('private_artifact_receive_arguments_invalid');
  }
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || (rootInfo.mode & 0o077) !== 0) {
    throw new Error('private_artifact_root_invalid');
  }
  const account = execFileSync('getent', ['passwd', 'stockinsider'], { encoding: 'utf8' }).trim().split(':');
  const uid = Number(account[2]); const gid = Number(account[3]);
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || rootInfo.uid !== uid) {
    throw new Error('private_artifact_root_owner_invalid');
  }
  const directory = path.join(root, expectedHash.slice(0, 2));
  await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  await chown(directory, uid, gid); await chmod(directory, 0o700);
  const target = path.join(directory, expectedHash);
  temporary = path.join(directory, `.restore-${randomUUID()}`);
  const output = createWriteStream(temporary, { flags: constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    mode: 0o600 });
  let bytes = 0;
  const hash = createHash('sha256');
  const meter = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length;
    if (bytes > expectedBytes) return callback(new Error('private_artifact_input_too_large'));
    hash.update(chunk); callback(null, chunk);
  } });
  await pipeline(process.stdin, meter, output);
  if (bytes !== expectedBytes || hash.digest('hex') !== expectedHash) throw new Error('private_artifact_input_mismatch');
  await chown(temporary, uid, gid); await chmod(temporary, 0o600);
  let created = false;
  try { await link(temporary, target); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  await verify(target);
  console.log(JSON.stringify({ schema: 'stockinsider-contabo-private-artifact-receipt-v1',
    installed: true, created, bytes: expectedBytes }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'private_artifact_receive_failed',
    installed: false }));
  process.exitCode = 1;
} finally {
  if (temporary) await unlink(temporary).catch(() => {});
}
