import { OFFICIAL_INSIDER_DATASETS, fetchOfficialInsiderRows, type OfficialInsiderDataset } from './research-insider-official';
import { resolveStockInsiderDataPlaneConfiguration } from './data-plane-runtime';

export const INSIDER_SNAPSHOT_PARSER = 'insider-db-projection-v1';
export const INSIDER_SNAPSHOT_RIGHTS = 'official-insider-private-research-retain-v1';
export type InsiderSnapshotPin = { dataset: number; snapshotId: string };
export type InsiderSnapshotRequest = { runId: string; pins?: InsiderSnapshotPin[] };
export type InsiderSnapshotDocument = {
  documentUrl: string; title: string; summary: string; contentText: string;
  publishedAt: null; symbols: string[]; metadata: Record<string, unknown>;
};
type Member = InsiderSnapshotPin & {
  complete: boolean; offset: number; generation: number; totalRows: number;
  observedAt: string; attemptedAt: string; hash: string;
};
type Run = { runId: string; frozen: boolean; members: Member[] };
type Page = Member & { runId: string; nextOffset: number; documents: InsiderSnapshotDocument[]; excludedRows: number };
export type InsiderSnapshotProgress = {
  schema: 'insider_snapshot_progress_v1'; runId: string; pins: InsiderSnapshotPin[];
  members: Member[]; outcome: 'pages_remaining' | 'coverage_complete';
  originalSourceObservedAt: string; processingAttemptedAt: string; processingCompletedAt: string;
  lastLiveAcquisitionAt: string | null; liveAcquisitions: number[]; processedRows: number; recordsWritten: number; remainingRows: number;
};
export type InsiderSnapshotRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Dependencies = { rpc: InsiderSnapshotRpc; acquire: (dataset: OfficialInsiderDataset) => Promise<{
  raw: Buffer; rows: unknown[]; hash: string; attemptedAt: string; observedAt: string;
}>; persist: (documents: InsiderSnapshotDocument[]) => Promise<number>; now: () => number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RPCS = new Set(['insider_snapshot_run_v1', 'admit_insider_snapshot_v1', 'read_insider_snapshot_page_v1', 'commit_insider_snapshot_page_v1']);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('insider_rpc_shape');
  return value as Record<string, unknown>;
}
function integer(value: unknown, max: number): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max; }
function validClock(value: unknown): value is string { return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)); }
export function validateInsiderSnapshotRequest(value: unknown): InsiderSnapshotRequest {
  const r = object(value);
  if (Object.keys(r).some(key => !['runId', 'pins'].includes(key)) || typeof r.runId !== 'string' || !UUID.test(r.runId)) throw Error('insider_run_identity');
  if (r.pins !== undefined) {
    if (!Array.isArray(r.pins) || r.pins.length !== 5) throw Error('insider_pins_required');
    r.pins.forEach((value, index) => {
      const pin = object(value);
      if (Object.keys(pin).length !== 2 || pin.dataset !== index || typeof pin.snapshotId !== 'string' || !UUID.test(pin.snapshotId)) throw Error('insider_pins_invalid');
    });
  }
  return { runId: r.runId, ...(r.pins === undefined ? {} : { pins: r.pins as InsiderSnapshotPin[] }) };
}
function member(value: unknown): Member {
  const m = object(value);
  if (!integer(m.dataset, 4) || typeof m.snapshotId !== 'string' || !UUID.test(m.snapshotId)
    || typeof m.complete !== 'boolean' || !integer(m.offset, 50000) || !integer(m.generation, 100)
    || !integer(m.totalRows, 50000) || m.offset > m.totalRows || !validClock(m.observedAt) || !validClock(m.attemptedAt)
    || Date.parse(m.attemptedAt) > Date.parse(m.observedAt) || typeof m.hash !== 'string' || !/^[a-f0-9]{64}$/u.test(m.hash)
    || (m.complete && m.offset !== m.totalRows)) throw Error('insider_member_invalid');
  return { dataset: m.dataset, snapshotId: m.snapshotId, complete: m.complete, offset: m.offset,
    generation: m.generation, totalRows: m.totalRows, observedAt: m.observedAt, attemptedAt: m.attemptedAt, hash: m.hash } as Member;
}
function run(value: unknown, runId: string): Run {
  const r = object(value);
  if (r.runId !== runId || typeof r.frozen !== 'boolean' || !Array.isArray(r.members) || r.members.length > 5) throw Error('insider_run_binding');
  const members = r.members.map(member);
  if (new Set(members.map(m => m.dataset)).size !== members.length || members.some((m, i) => i > 0 && m.dataset <= members[i - 1].dataset) || r.frozen !== (members.length === 5)) throw Error('insider_run_binding');
  return { runId, frozen: r.frozen, members };
}
function page(value: unknown, runId: string, pin: InsiderSnapshotPin): Page {
  const p = object(value); member(value);
  if (p.runId !== runId || p.dataset !== pin.dataset || p.snapshotId !== pin.snapshotId || !integer(p.nextOffset, 50000)
    || p.nextOffset !== Math.min(Number(p.offset) + 500, Number(p.totalRows)) || !Array.isArray(p.documents)
    || p.documents.length > 500 || !integer(p.excludedRows, 500)
    || p.documents.length + p.excludedRows !== p.nextOffset - Number(p.offset)) throw Error('insider_page_binding');
  for (const value of p.documents) {
    const d = object(value);
    if (typeof d.documentUrl !== 'string' || d.documentUrl.length > 512 || typeof d.title !== 'string' || d.title.length > 200
      || typeof d.summary !== 'string' || d.summary.length > 500 || typeof d.contentText !== 'string'
      || Buffer.byteLength(d.contentText) > 500 || !/^[\x20-\x7e]+$/u.test(d.contentText)
      || d.publishedAt !== null || !Array.isArray(d.symbols) || d.symbols.length !== 1 || !/^[1-9]\d{3}$/u.test(String(d.symbols[0]))) throw Error('insider_document_projection_invalid');
    object(d.metadata);
  }
  return p as Page;
}
/** No automatic transport retry: uncertain mutation requires explicit same-run resume. */
export function createInsiderSnapshotRpc(transport: typeof fetch = fetch): InsiderSnapshotRpc {
  return async (name, args) => {
    if (!RPCS.has(name)) throw Error('insider_rpc_not_allowed');
    const body = JSON.stringify(args);
    if (Buffer.byteLength(body) > 16777216 + 4096) throw Error('insider_rpc_request_bound');
    const config = resolveStockInsiderDataPlaneConfiguration();
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('insider_rpc_deadline')); }, 30000); });
    const bounded = <T>(promise: Promise<T>) => Promise.race([promise, deadline]);
    try {
      const response = await bounded(transport(new URL(`rest/v1/rpc/${name}`, config.url), {
        method: 'POST', redirect: 'error', signal: controller.signal, body,
        headers: { ...config.headers, authorization: `Bearer ${config.bearer}`, apikey: config.bearer, 'content-type': 'application/json', accept: 'application/json' },
      }));
      const limit = 4 * 1024 * 1024;
      if (response.redirected || !response.body || Number(response.headers.get('content-length')) > limit) { void response.body?.cancel(); throw Error('insider_rpc_response_bound'); }
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) { const { done, value } = await bounded(reader.read()); if (done) break; bytes += value.length; if (bytes > limit) throw Error('insider_rpc_response_bound'); chunks.push(value); }
      } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      // Database errors can include source rows. Export only a fixed-format local error tag.
      if (!response.ok) throw Error(typeof decoded?.message === 'string' && /^insider_[a-z_]{1,80}$/u.test(decoded.message) ? decoded.message : `insider_rpc_http_${response.status}`);
      return decoded;
    } finally { if (timer) clearTimeout(timer); controller.abort(); }
  };
}
/** Exactly one page per member, with a durable complete run map before any page. */
export async function processInsiderSnapshotRun(input: InsiderSnapshotRequest, dependencies: Dependencies): Promise<InsiderSnapshotProgress> {
  const request = validateInsiderSnapshotRequest(input);
  const { rpc, acquire, persist, now } = dependencies;
  const processingAttemptedAt = new Date(now()).toISOString(); const liveAcquisitions: number[] = [];
  let lastLiveAcquisitionAt: string | null = null;
  let state = run(await rpc('insider_snapshot_run_v1', { p_run: request.runId }), request.runId);
  const pinsOf = (state: Run) => state.members.map(({ dataset, snapshotId }) => ({ dataset, snapshotId }));
  if (request.pins && (!state.frozen || JSON.stringify(request.pins) !== JSON.stringify(pinsOf(state)))) throw Error('insider_run_binding');
  for (let dataset = 0; dataset < 5; dataset++) {
    if (state.members.some(m => m.dataset === dataset)) continue;
    const response = await acquire(OFFICIAL_INSIDER_DATASETS[dataset]);
    state = run(await rpc('admit_insider_snapshot_v1', { p_run: request.runId, p_dataset: dataset,
      p_raw_base64: response.raw.toString('base64'), p_hash: response.hash, p_rows: response.rows.length,
      p_attempted: response.attemptedAt, p_observed: response.observedAt, p_parser: INSIDER_SNAPSHOT_PARSER, p_rights: INSIDER_SNAPSHOT_RIGHTS }), request.runId);
    liveAcquisitions.push(dataset);
    lastLiveAcquisitionAt = response.observedAt;
  }
  if (!state.frozen) throw Error('insider_run_not_frozen');
  const pins = pinsOf(state); let recordsWritten = 0; let processedRows = 0;
  for (let i = 0; i < state.members.length; i++) {
    const current = state.members[i]; if (current.complete) continue;
    const before = page(await rpc('read_insider_snapshot_page_v1', { p_run: request.runId, p_dataset: current.dataset, p_snapshot: current.snapshotId }), request.runId, current);
    if (before.complete) { state.members[i] = member(before); continue; }
    const written = await persist(before.documents);
    if (!integer(written, before.documents.length)) throw Error('insider_persist_count_invalid');
    const after = page(await rpc('commit_insider_snapshot_page_v1', { p_run: request.runId, p_dataset: current.dataset, p_snapshot: current.snapshotId,
      p_offset: before.offset, p_generation: before.generation, p_next: before.nextOffset }), request.runId, current);
    if (after.offset !== before.nextOffset || after.generation !== before.generation + 1) throw Error('insider_commit_progress_invalid');
    state.members[i] = member(after); recordsWritten += written; processedRows += before.nextOffset - before.offset;
  }
  const remainingRows = state.members.reduce((n, m) => n + m.totalRows - m.offset, 0);
  return { schema: 'insider_snapshot_progress_v1', runId: request.runId, pins, members: state.members,
    outcome: state.members.every(m => m.complete) ? 'coverage_complete' : 'pages_remaining',
    originalSourceObservedAt: new Date(Math.min(...state.members.map(m => Date.parse(m.observedAt)))).toISOString(),
    processingAttemptedAt, processingCompletedAt: new Date(now()).toISOString(), lastLiveAcquisitionAt, liveAcquisitions, processedRows, recordsWritten, remainingRows };
}
export function insiderSnapshotDependencies(persist: Dependencies['persist']): Dependencies {
  return { rpc: createInsiderSnapshotRpc(), acquire: fetchOfficialInsiderRows, persist, now: Date.now };
}
