import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 5_000_000;
const RANGE_CHUNK_BYTES = 200_000;
const MAX_OUTPUT_BYTES = RANGE_CHUNK_BYTES + 1_000;
const STATUS_MARKER = '\n__STOCKINSIDER_STATUS__:';
const STATUS_MARKER_BUFFER = Buffer.from(STATUS_MARKER);
const ALLOWED_HOSTS = new Set(['www.tpex.org.tw']);

export function parseBoundedOfficialCurlOutput(output: string) {
  const marker = output.lastIndexOf(STATUS_MARKER);
  if (marker < 0) throw new Error('official_curl_status_missing');
  const statusText = output.slice(marker + STATUS_MARKER.length);
  if (!/^\d{3}$/u.test(statusText)) throw new Error('official_curl_status_invalid');
  const body = output.slice(0, marker);
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) throw new Error('response_too_large');
  return { body, status: Number(statusText) };
}

function parseBoundedOfficialCurlBuffer(output: Buffer) {
  const marker = output.lastIndexOf(STATUS_MARKER_BUFFER);
  if (marker < 0) throw new Error('official_curl_status_missing');
  const statusText = output.subarray(marker + STATUS_MARKER_BUFFER.length).toString('ascii');
  if (!/^\d{3}$/u.test(statusText)) throw new Error('official_curl_status_invalid');
  const body = output.subarray(0, marker);
  if (body.byteLength > RANGE_CHUNK_BYTES) throw new Error('response_too_large');
  return { body, status: Number(statusText) };
}

/**
 * TPEx's edge currently resets Node/undici response streams from the Contabo
 * address while the same official endpoint completes with the host curl TLS
 * stack.  This transport is GET-only, HTTPS-only, host-closed, body-bounded,
 * and refuses credentials so no provider token can enter argv or journals.
 */
export async function boundedOfficialCurlFetch(input: string, init: RequestInit = {}) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error('official_curl_url_not_allowed');
  }
  if (init.method && init.method.toUpperCase() !== 'GET') throw new Error('official_curl_method_not_allowed');
  const headers = new Headers(init.headers);
  if (headers.has('authorization') || headers.has('cookie')) throw new Error('official_curl_credentials_not_allowed');
  if (init.body) throw new Error('official_curl_body_not_allowed');
  try {
    const chunks: Buffer[] = [];
    let offset = 0;
    let responseStatus = 200;
    while (offset < MAX_BODY_BYTES) {
      if (init.signal?.aborted) throw new DOMException('request aborted', 'AbortError');
      const end = Math.min(offset + RANGE_CHUNK_BYTES - 1, MAX_BODY_BYTES - 1);
      const result = await execFileAsync('/usr/bin/curl', [
        '--silent', '--show-error', '--location', '--http1.1',
        '--proto', '=https', '--proto-redir', '=https',
        '--connect-timeout', '5', '--max-time', '8', '--max-filesize', String(RANGE_CHUNK_BYTES),
        '--range', `${offset}-${end}`,
        '--header', 'Accept: application/json',
        '--header', 'User-Agent: StockInsider/taiwan-data-provider-v1',
        '--write-out', `${STATUS_MARKER}%{http_code}`,
        url.toString(),
      ], { encoding: 'buffer', maxBuffer: MAX_OUTPUT_BYTES, timeout: 10_000 });
      const parsed = parseBoundedOfficialCurlBuffer(Buffer.from(result.stdout));
      responseStatus = parsed.status;
      if (responseStatus === 416 && chunks.length > 0) break;
      if (responseStatus !== 200 && responseStatus !== 206) {
        return new Response(parsed.body.toString('utf8'), {
          status: responseStatus,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      if (offset + parsed.body.byteLength > MAX_BODY_BYTES) throw new Error('response_too_large');
      chunks.push(parsed.body);
      offset += parsed.body.byteLength;
      if (responseStatus === 200 || parsed.body.byteLength < RANGE_CHUNK_BYTES) break;
      if (parsed.body.byteLength === 0) throw new Error('official_curl_range_empty');
    }
    if (offset >= MAX_BODY_BYTES && chunks.at(-1)?.byteLength === RANGE_CHUNK_BYTES) {
      throw new Error('response_too_large');
    }
    return new Response(Buffer.concat(chunks).toString('utf8'), {
      status: responseStatus === 206 ? 200 : responseStatus,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (error) {
    const row = error as Error & { code?: string | number };
    if (row.code === 63 || /maxBuffer|stdout maxBuffer length exceeded/iu.test(row.message)) {
      throw new Error('response_too_large');
    }
    throw error;
  }
}
