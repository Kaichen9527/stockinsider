import { LISTED_ROSTER_SOURCES, projectLaunchIndustryRows } from './launch-listed-roster-replay.ts';

type Row = Record<string, unknown>;
type Writer = { rpc(name: string, args: Row): PromiseLike<{ data: unknown; error: unknown }> };
export type LaunchIndustryCapture =
  | { status: 'processed'; written: number; replayed: number; deferred: number }
  | { status: 'unavailable' };

const rpc = 'vnext_launch_industry_capture_command_v1';

function record(value: unknown): value is Row {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function captureBody(source: typeof LISTED_ROSTER_SOURCES[number], fetchPage: typeof fetch) {
  const response = await fetchPage(source.url, {
    redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000), headers: { accept: 'text/csv' },
  });
  const reader = response.body?.getReader();
  if (!reader) throw Error('launch_industry_source_unavailable');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    if (response.status !== 200 || response.redirected || response.url !== source.url
      || !/^text\/csv(?:\s*;[^\r\n]*)?$/iu.test(response.headers.get('content-type') ?? '')) {
      throw Error('launch_industry_source_unavailable');
    }
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > source.maxBytes) throw Error('launch_industry_source_size');
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, length);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function captureLaunchIndustries(
  writer: Writer, principal: string, lease: string, session: string,
  fetchPage: typeof fetch = fetch, now = () => new Date().toISOString(),
): Promise<LaunchIndustryCapture> {
  const identity = { p_principal: principal, p_lease_owner: lease, p_session: session };
  const scope = await writer.rpc(rpc, identity);
  if (scope.error || !record(scope.data) || typeof scope.data.poolRevision !== 'string'
    || !/^[0-9a-f]{64}$/u.test(scope.data.poolRevision)
    || !Array.isArray(scope.data.symbols) || scope.data.symbols.length > 20
    || !scope.data.symbols.every(symbol => typeof symbol === 'string' && /^[1-9][0-9]{3}$/u.test(symbol))
    || new Set(scope.data.symbols).size !== scope.data.symbols.length) {
    throw Error('launch_industry_scope_unavailable');
  }
  if (!scope.data.symbols.length) return { status: 'processed', written: 0, replayed: 0, deferred: 0 };

  const [twse, tpex] = await Promise.all([
    captureBody(LISTED_ROSTER_SOURCES[0], fetchPage),
    captureBody(LISTED_ROSTER_SOURCES[1], fetchPage),
  ]);
  const observedAt = now();
  const capture = projectLaunchIndustryRows({ TWSE: twse, TPEX: tpex }, scope.data.symbols, observedAt);
  const result = await writer.rpc(rpc, {
    ...identity, p_capture: { ...capture, observedAt, poolRevision: scope.data.poolRevision },
  });
  const data = result.data;
  if (result.error || !record(data)
    || ![data.written, data.replayed, data.deferred].every(count => Number.isSafeInteger(count) && Number(count) >= 0)
    || Number(data.written) + Number(data.replayed) + Number(data.deferred) !== scope.data.symbols.length) {
    throw Error('launch_industry_write_unconfirmed');
  }
  return { status: 'processed', written: Number(data.written), replayed: Number(data.replayed), deferred: Number(data.deferred) };
}
