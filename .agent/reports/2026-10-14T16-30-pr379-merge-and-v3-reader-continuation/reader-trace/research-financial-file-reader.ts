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
// One process-owned financial reader at a time; unresolved cleanup retains the
// slot. This is a resource fence, not a model lease or durable budget admission.
const financialReadOwners = new Set<FinancialReadOwner>();
class FinancialReadOwner {
  pending = new Set<Promise<unknown>>();
  handles = new Map<FileHandle, { closed: boolean; closing?: Promise<void> }>();
  cleaning = false;
  cleanupFailed = false;
  constructor() {
    if (financialReadOwners.size) throw new Error('financial_cleanup_or_read_in_progress');
    financialReadOwners.add(this);
  }
  track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    work.then(() => { this.pending.delete(work); this.release(); }, () => { this.pending.delete(work); this.release(); });
    return work;
  }
  start<T>(work: () => Promise<T>): Promise<T> {
    // Register the ownership promise before issuing the filesystem open.
    return this.track(Promise.resolve().then(work));
  }
  closeHandle(handle: FileHandle) {
    const state = this.handles.get(handle)!;
    if (!state.closing) {
      // Always attach settlement handlers, including when the deadline expired.
      state.closing = Promise.resolve().then(() => handle.close()).then(() => { state.closed = true; }, error => { this.cleanupFailed = true; throw error; });
      this.track(state.closing);
    }
    return state.closing;
  }
  opened(handle: FileHandle) {
    this.handles.set(handle, { closed: false });
    if (this.cleaning) this.closeHandle(handle);
    return handle;
  }
  release() {
    if (this.cleaning && !this.cleanupFailed && !this.pending.size && [...this.handles.values()].every(s => s.closed)) financialReadOwners.delete(this);
  }
  status() {
    this.release();
    return { cleanupComplete: !financialReadOwners.has(this), recoveryRequired: financialReadOwners.has(this),
      pendingOperations: this.pending.size, unconfirmedHandles: [...this.handles.values()].filter(s => !s.closed).length,
      cleanupFailed: this.cleanupFailed, kernelIoCancellationConfirmed: false };
  }
  async cleanup(deadline: FinancialDeadline, primary?: unknown) {
    const hasPrimary = arguments.length > 1;
    this.cleaning = true;
    for (const handle of this.handles.keys()) this.closeHandle(handle);
    // Pending open may deliver a new handle; opened() closes it on settlement.
    const settled = async () => {
      while (this.pending.size) await Promise.allSettled([...this.pending]);
      this.release();
      if (!this.status().cleanupComplete) throw new Error('financial_cleanup_failed');
    };
    const work = settled();
    work.catch(() => {}); // observed even if wait() rejects before subscribing
    try { await deadline.wait(work); }
    catch (cleanupError) {
      const error = hasPrimary ? (primary !== null && (typeof primary === 'object' || typeof primary === 'function') ? primary : new Error('financial_primary_failure', { cause: primary })) : cleanupError;
      if (!error || (typeof error !== 'object' && typeof error !== 'function')) throw error;
      Object.assign(error, { financialCleanup: this.status() });
      throw error;
    }
    if (hasPrimary) throw primary;
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
  const owner = new FinancialReadOwner();
  const parents = new Map<string, BigIntStats>(), handles: Array<{ handle: FileHandle; filename: string; before: BigIntStats; pin: FinancialFilePin }> = [];
  const records = new Map<string, { pin: FinancialFilePin; value: unknown }>();
  try {
    for (const pin of pins) {
      deadline.check(); const filename = path.join(root, pin.path);
      let current = path.parse(filename).root;
      for (const segment of filename.slice(current.length).split(path.sep).slice(0,-1)) {
        current = path.join(current,segment);
        const stat = await deadline.wait(owner.track(lstat(current,{bigint:true}))); directory(stat);
        const prior = parents.get(current); if (prior && !same(prior,stat)) throw new Error('financial_parent_replaced'); parents.set(current,stat);
      }
      const leaf = await deadline.wait(owner.track(lstat(filename,{bigint:true}))); regular(leaf,pin.bytes);
      await deadline.wait(Promise.resolve(checkpoint('before_open:'+pin.path)));
      // O_NONBLOCK prevents FIFO replacement between lstat and descriptor open
      // from monopolizing a filesystem worker before fstat can reject it.
      const pending = owner.start(() => open(filename,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).then(h => owner.opened(h)));
      const handle = await deadline.wait(pending);
      const entry = {handle,filename,before:leaf,pin}; handles.push(entry);
      const before = await deadline.wait(owner.track(handle.stat({bigint:true}))); entry.before = before; regular(before,pin.bytes); if (!same(before,leaf)) throw new Error('financial_file_replaced');
      const raw = Buffer.alloc(pin.bytes+1); let offset = 0;
      try {
        while (offset < raw.length) {
          const read = await deadline.wait(owner.track(handle.read(raw,offset,raw.length-offset,offset).finally(() => {
            // A timed-out read may still write into this buffer later. Retain
            // wipe responsibility until its actual settlement, not just finally.
            if (deadline.controller.signal.aborted) raw.fill(0);
          })));
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
      for (const [name,before] of parents) { const after = await deadline.wait(owner.track(lstat(name,{bigint:true}))); directory(after); if (!same(before,after)) throw new Error('financial_parent_replaced'); }
      for (const item of handles) {
        const fd = await deadline.wait(owner.track(item.handle.stat({bigint:true}))), named = await deadline.wait(owner.track(lstat(item.filename,{bigint:true})));
        regular(fd,item.pin.bytes); regular(named,item.pin.bytes);
        if (!same(item.before,fd) || !same(fd,named)) throw new Error('financial_file_replaced');
      }
    };
    await validate();
    return { records, validate, close: () => owner.cleanup(deadline), fail: (error: unknown) => owner.cleanup(deadline,error) };
  } catch (error) { await owner.cleanup(deadline,error); throw error; }
}
export function financialReaderExecutionIdentity() {
  return { admission:{maxProcessOwnedReaders:1,retainUntilConfirmedCleanup:true},limits:FINANCIAL_READ_LIMITS, functions:[FinancialDeadline.toString(),FinancialReadOwner.toString(),same.toString(),regular.toString(),directory.toString(),validPin.toString(),readPinnedFinancialFiles.toString()] };
}
