import { performance } from 'node:perf_hooks';
import type { FileHandle } from 'node:fs/promises';

/** NEW candidate execution closure; not legacy 77b1 or a DB/model lease. */
export const FINANCIAL_IO_LIMITS = Object.freeze({ legacyFiles: 8, perFile: 524288, aggregate: 1048576, projection: 160000, material: 262144, deadlineMs: 10000 });
export class FinancialIoDeadline {
  readonly end = performance.now() + FINANCIAL_IO_LIMITS.deadlineMs;
  readonly controller = new AbortController();
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
// Nonconfigurable realm registry: query-imported/bundled copies cannot create a
// second slot. Different engine generations fail closed rather than overwrite.
// Separate processes/realms require a later cutover/supervisor; not live enabled.
const key = Symbol.for('stockinsider.new-financial-io-owner.v1');
const identity = 'oct14-new-financial-io-owner-v1';
type Slot = { identity: string; owner: FinancialIoOwner | null };
const globalRecord = globalThis as unknown as Record<symbol, Slot>;
let slot = globalRecord[key];
if (!slot) { slot = Object.seal({ identity, owner: null }); Object.defineProperty(globalThis, key, { value: slot, writable: false, configurable: false }); }
if (slot.identity !== identity) throw new Error('financial_owner_generation_conflict');
export function financialIoStatus() { return slot.owner?.status() ?? { cleanupComplete: true, recoveryRequired: false, pendingOperations: 0, unconfirmedHandles: 0, ownedBuffers: 0, cleanupFailed: false, kernelIoCancellationConfirmed: false }; }
export class FinancialIoOwner {
  private pending = new Set<Promise<unknown>>();
  private handles = new Map<FileHandle, { closed: boolean; closing?: Promise<void> }>();
  private buffers = new Set<Buffer>();
  private cleaning = false;
  private cleanupFailed = false;
  constructor() { if (slot.owner) throw new Error('financial_cleanup_or_read_in_progress'); slot.owner = this; }
  track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work);
    work.then(() => { this.pending.delete(work); this.release(); }, () => { this.pending.delete(work); this.release(); });
    return work;
  }
  start<T>(work: () => Promise<T>): Promise<T> { return this.track(Promise.resolve().then(work)); }
  buffer(bytes: number) { const raw = Buffer.alloc(bytes); this.buffers.add(raw); return raw; }
  wipeAfterRead(raw: Buffer) { if (this.cleaning) raw.fill(0); }
  opened(handle: FileHandle) { this.handles.set(handle, { closed: false }); if (this.cleaning) this.closeHandle(handle); return handle; }
  private closeHandle(handle: FileHandle) {
    const state = this.handles.get(handle)!;
    if (!state.closing) {
      state.closing = Promise.resolve().then(() => handle.close()).then(() => { state.closed = true; }, error => { this.cleanupFailed = true; throw error; });
      this.track(state.closing); // Both rejection and late settlement always observed.
    }
    return state.closing;
  }
  private release() {
    if (this.cleaning && !this.cleanupFailed && !this.pending.size && [...this.handles.values()].every(s => s.closed)) {
      for (const raw of this.buffers) raw.fill(0); this.buffers.clear();
      if (slot.owner === this) slot.owner = null;
    }
  }
  status() {
    return { cleanupComplete: slot.owner !== this, recoveryRequired: slot.owner === this, pendingOperations: this.pending.size,
      unconfirmedHandles: [...this.handles.values()].filter(s => !s.closed).length, ownedBuffers: this.buffers.size,
      cleanupFailed: this.cleanupFailed, kernelIoCancellationConfirmed: false };
  }
  async cleanup(deadline: FinancialIoDeadline, ...failure: [] | [unknown]) {
    this.cleaning = true;
    for (const raw of this.buffers) raw.fill(0);
    for (const h of this.handles.keys()) this.closeHandle(h);
    const work = (async () => { while (this.pending.size) await Promise.allSettled([...this.pending]); this.release(); if (!this.status().cleanupComplete) throw new Error('financial_cleanup_failed'); })();
    work.catch(() => {});
    try { await deadline.wait(work); }
    catch (cleanupError) {
      const primary = failure.length ? failure[0] : cleanupError;
      const error = primary instanceof Error ? primary : new Error('financial_primary_failure', { cause: primary });
      Object.assign(error, { financialCleanup: this.status() }); throw error;
    }
    if (failure.length) throw failure[0];
  }
}
