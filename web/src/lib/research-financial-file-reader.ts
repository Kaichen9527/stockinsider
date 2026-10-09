import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

export const FINANCIAL_READ_LIMITS = Object.freeze({ files: 8, perFile: 524288, aggregate: 1048576, projection: 160000, result: 262144, deadlineMs: 10000 });
export type FinancialFilePin = { path: string; bytes: number; sha256: string };
export class FinancialDeadline {
  readonly end: number;
  readonly controller = new AbortController();
  constructor() { this.end = performance.now() + FINANCIAL_READ_LIMITS.deadlineMs; }
  check() { if (this.controller.signal.aborted || performance.now() >= this.end) { this.controller.abort(); throw new Error('financial_deadline'); } }
  async wait<T>(work: PromiseLike<T>): Promise<T> {
    this.check(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([Promise.resolve(work), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { this.controller.abort(); reject(new Error('financial_deadline')); }, Math.max(1, this.end - performance.now()));
      })]);
      this.check(); return value;
    } finally { clearTimeout(timer); }
  }
}
function same(a: BigIntStats, b: BigIntStats) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
function regular(s: BigIntStats, expected: number) {
  if (!s.isFile() || s.size !== BigInt(expected) || s.nlink !== BigInt(1)) throw new Error('financial_file_invalid');
}
function directory(s: BigIntStats) {
  // A fixed repository tree may have root-owned ancestors, but writable or
  // symlink parents can replace the entire input namespace and are rejected.
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & BigInt(0o022)) !== BigInt(0)) throw new Error('financial_parent_invalid');
}
function validPin(p: FinancialFilePin) {
  if (!p || Object.keys(p).sort().join(',') !== 'bytes,path,sha256' || !/^docs\/research\/[a-zA-Z0-9_./-]+\.json$/u.test(p.path)
    || p.path.split('/').some(s => s === '.' || s === '..' || s === '') || !Number.isInteger(p.bytes) || p.bytes < 1
    || p.bytes > FINANCIAL_READ_LIMITS.perFile || !/^[a-f0-9]{64}$/u.test(p.sha256)) throw new Error('financial_pin_invalid');
}
/** Only the server supplies root/pins. Request data never becomes a path. */
export async function readPinnedFinancialFiles(root: string, pins: readonly FinancialFilePin[], deadline: FinancialDeadline,
  checkpoint: (name: string) => void | Promise<void> = () => {}) {
  if (!path.isAbsolute(root) || root === '/' || root !== path.resolve(root) || pins.length < 1 || pins.length > FINANCIAL_READ_LIMITS.files) throw new Error('financial_inventory_invalid');
  let total = 0; const names = new Set<string>();
  for (const p of pins) { validPin(p); total += p.bytes; if (names.has(p.path)) throw new Error('financial_inventory_invalid'); names.add(p.path); }
  if (total > FINANCIAL_READ_LIMITS.aggregate) throw new Error('financial_read_bound');
  const parents = new Map<string, BigIntStats>(), handles: Array<{ handle: FileHandle; filename: string; before: BigIntStats; pin: FinancialFilePin }> = [];
  const records = new Map<string, { pin: FinancialFilePin; value: unknown }>();
  try {
    for (const pin of pins) {
      deadline.check(); const filename = path.join(root, pin.path);
      let current = path.parse(filename).root;
      for (const segment of filename.slice(current.length).split(path.sep).slice(0,-1)) {
        current = path.join(current,segment);
        const stat = await deadline.wait(lstat(current,{bigint:true})); directory(stat);
        const prior = parents.get(current); if (prior && !same(prior,stat)) throw new Error('financial_parent_replaced'); parents.set(current,stat);
      }
      const leaf = await deadline.wait(lstat(filename,{bigint:true})); regular(leaf,pin.bytes);
      await deadline.wait(Promise.resolve(checkpoint('before_open:'+pin.path)));
      // O_NONBLOCK prevents FIFO replacement between lstat and descriptor open
      // from monopolizing a filesystem worker before fstat can reject it.
      const pending = open(filename,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      pending.then(h => { if (deadline.controller.signal.aborted) void h.close(); }, () => {});
      const handle = await deadline.wait(pending);
      const entry = {handle,filename,before:leaf,pin}; handles.push(entry);
      const before = await deadline.wait(handle.stat({bigint:true})); entry.before = before; regular(before,pin.bytes); if (!same(before,leaf)) throw new Error('financial_file_replaced');
      const raw = Buffer.alloc(pin.bytes+1); let offset = 0;
      try {
        while (offset < raw.length) {
          const read = await deadline.wait(handle.read(raw,offset,raw.length-offset,offset));
          if (!read.bytesRead) break; offset += read.bytesRead;
        }
        if (offset !== pin.bytes || createHash('sha256').update(raw.subarray(0,offset)).digest('hex') !== pin.sha256) throw new Error('financial_file_hash_or_length');
        const text = new TextDecoder('utf-8',{fatal:true}).decode(raw.subarray(0,offset));
        records.set(pin.path,{pin,value:JSON.parse(text)});
      } finally { raw.fill(0); }
      await deadline.wait(Promise.resolve(checkpoint('after_read:'+pin.path)));
    }
    const validate = async () => {
      deadline.check();
      for (const [name,before] of parents) { const after = await deadline.wait(lstat(name,{bigint:true})); directory(after); if (!same(before,after)) throw new Error('financial_parent_replaced'); }
      for (const item of handles) {
        const fd = await deadline.wait(item.handle.stat({bigint:true})), named = await deadline.wait(lstat(item.filename,{bigint:true}));
        regular(fd,item.pin.bytes); regular(named,item.pin.bytes);
        if (!same(item.before,fd) || !same(fd,named)) throw new Error('financial_file_replaced');
      }
    };
    await validate();
    return { records, validate, close: async () => { for (const h of handles) await h.handle.close(); } };
  } catch (error) { for (const h of handles) await h.handle.close().catch(() => {}); throw error; }
}
export function financialReaderExecutionIdentity() {
  return { limits:FINANCIAL_READ_LIMITS, functions:[FinancialDeadline.toString(),same.toString(),regular.toString(),directory.toString(),validPin.toString(),readPinnedFinancialFiles.toString()] };
}
