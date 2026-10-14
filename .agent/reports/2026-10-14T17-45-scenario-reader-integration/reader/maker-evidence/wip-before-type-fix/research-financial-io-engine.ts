import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FINANCIAL_IO_LIMITS, FinancialIoOwner, type FinancialIoDeadline } from './research-financial-io-owner.ts';
export type FinancialIoPin = Readonly<{ path: string; bytes: number; sha256: string }>;
/** Trusted composition dependencies only. Never supplied by an HTTP/model body. */
export type FinancialIoDependencies = { lstat: typeof lstat; open: typeof open; checkpoint?: (name: string) => void | Promise<void> };
const nativeIo: FinancialIoDependencies = { lstat, open };
function same(a: BigIntStats, b: BigIntStats) { return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs; }
function regular(s: BigIntStats, bytes: number) { if (!s.isFile() || s.size !== BigInt(bytes) || s.nlink !== 1n) throw new Error('financial_file_invalid'); }
function directory(s: BigIntStats) { if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o022n) !== 0n) throw new Error('financial_parent_invalid'); }
export function checkFinancialIoInventory(root: string, pins: readonly FinancialIoPin[], maxFiles: number) {
  if (!path.isAbsolute(root) || root === '/' || root !== path.resolve(root) || pins.length < 1 || pins.length > maxFiles) throw new Error('financial_inventory_invalid');
  let total = 0; const names = new Set<string>();
  for (const p of pins) {
    if (!p || Object.keys(p).sort().join(',') !== 'bytes,path,sha256' || !/^docs\/research\/[a-zA-Z0-9_./-]+\.json$/u.test(p.path)
      || p.path.split('/').some(s => s === '.' || s === '..' || s === '') || !Number.isInteger(p.bytes) || p.bytes < 1
      || p.bytes > FINANCIAL_IO_LIMITS.perFile || !/^[a-f0-9]{64}$/u.test(p.sha256) || names.has(p.path)) throw new Error('financial_pin_invalid');
    names.add(p.path); total += p.bytes;
  }
  if (total > FINANCIAL_IO_LIMITS.aggregate) throw new Error('financial_read_bound');
}
/** Private engine session: all raw/FDs stay in ONE owner until confirmed cleanup.
 * Engine is not an accepted caller-path or arbitrary carrier encoding API. */
export async function acquireFinancialIo(root: string, pins: readonly FinancialIoPin[], deadline: FinancialIoDeadline, io: FinancialIoDependencies = nativeIo) {
  const owner = new FinancialIoOwner();
  const parents = new Map<string, BigIntStats>();
  const files: Array<{ handle: FileHandle; filename: string; before: BigIntStats; pin: FinancialIoPin; raw: Buffer }> = [];
  const checkpoint = async (name: string) => { if (io.checkpoint) await deadline.wait(owner.start(async () => { deadline.check(); await io.checkpoint!(name); })); };
  try {
    deadline.check();
    for (const pin of pins) {
      const filename = path.join(root, pin.path); let current = path.parse(filename).root;
      // Includes filesystem root itself, then every ancestor of the leaf.
      for (const segment of ['', ...filename.slice(current.length).split(path.sep).slice(0, -1)]) {
        if (segment) current = path.join(current, segment);
        const stat = await deadline.wait(owner.start(() => io.lstat(current, { bigint: true }))); directory(stat);
        const prior = parents.get(current); if (prior && !same(prior, stat)) throw new Error('financial_parent_replaced'); parents.set(current, stat);
      }
      const leaf = await deadline.wait(owner.start(() => io.lstat(filename, { bigint: true }))); regular(leaf, pin.bytes);
      await checkpoint('before_open:' + pin.path);
      const pending = owner.start(async () => { deadline.check(); return owner.opened(await io.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)); });
      const handle = await deadline.wait(pending);
      const before = await deadline.wait(owner.start(() => handle.stat({ bigint: true }))); regular(before, pin.bytes); if (!same(before, leaf)) throw new Error('financial_file_replaced');
      const raw = owner.buffer(pin.bytes + 1), entry = { handle, filename, before, pin, raw }; files.push(entry);
      let offset = 0;
      while (offset < raw.length) {
        const result = await deadline.wait(owner.start(() => handle.read(raw, offset, raw.length - offset, offset).finally(() => owner.wipeAfterRead(raw))));
        if (!result.bytesRead) break; offset += result.bytesRead;
      }
      if (offset !== pin.bytes || createHash('sha256').update(raw.subarray(0, offset)).digest('hex') !== pin.sha256) throw new Error('financial_file_hash_or_length');
      // Fatal UTF8 validation before any facade interprets raw JSON.
      new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, offset));
      await checkpoint('after_read:' + pin.path);
    }
    const validate = async () => {
      deadline.check();
      for (const [name, before] of parents) {
        const after = await deadline.wait(owner.start(() => io.lstat(name, { bigint: true }))); directory(after); if (!same(before, after)) throw new Error('financial_parent_replaced');
      }
      for (const f of files) {
        const fd = await deadline.wait(owner.start(() => f.handle.stat({ bigint: true }))), named = await deadline.wait(owner.start(() => io.lstat(f.filename, { bigint: true })));
        regular(fd, f.pin.bytes); regular(named, f.pin.bytes); if (!same(f.before, fd) || !same(fd, named)) throw new Error('financial_file_replaced');
      }
    };
    await validate();
    return { files, validate, owner };
  } catch (error) { await owner.cleanup(deadline, error); throw error; }
}
