import {createHash} from 'node:crypto';

export async function readLaunchOfficialReportBody(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('launch_official_report_body_unavailable');
  const pieces: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) throw Error('launch_official_report_body_bound');
      pieces.push(next.value);
    }
    return Buffer.concat(pieces, bytes);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export async function fetchLaunchOfficialReport(url: string, mime: string, maximum: number, fetchPage: typeof fetch) {
  const response = await fetchPage(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { accept: mime } });
  if (!response.ok || response.url !== url || response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== mime) {
    await response.body?.cancel().catch(() => {});
    throw Error('launch_official_report_origin');
  }
  const body = await readLaunchOfficialReportBody(response, maximum);
  return { url, body, sha256: createHash('sha256').update(body).digest('hex') };
}

export function decodeLaunchOfficialReceiptBody(value: unknown, sha256: unknown, maximum: number) {
  const base64Bound = 4 * Math.ceil(maximum / 3);
  if (typeof value !== 'string' || value.length > base64Bound || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  const body = Buffer.from(value, 'base64');
  if (body.length < 2 || body.length > maximum || body.toString('base64') !== value
    || createHash('sha256').update(body).digest('hex') !== sha256) return null;
  return body;
}
