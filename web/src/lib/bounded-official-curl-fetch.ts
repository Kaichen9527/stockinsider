import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_BODY_BYTES = 5_000_000;
const MAX_OUTPUT_BYTES = MAX_BODY_BYTES + 1_000;
const STATUS_MARKER = '\n__STOCKINSIDER_STATUS__:';
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
    const result = await execFileAsync('/usr/bin/curl', [
      '--silent', '--show-error', '--location', '--http1.1',
      '--proto', '=https', '--proto-redir', '=https',
      '--connect-timeout', '5', '--max-time', '8', '--max-filesize', String(MAX_BODY_BYTES),
      '--header', 'Accept: application/json',
      '--header', 'User-Agent: StockInsider/taiwan-data-provider-v1',
      '--write-out', `${STATUS_MARKER}%{http_code}`,
      url.toString(),
    ], { encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES, timeout: 10_000 });
    const parsed = parseBoundedOfficialCurlOutput(result.stdout);
    return new Response(parsed.body, {
      status: parsed.status,
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
