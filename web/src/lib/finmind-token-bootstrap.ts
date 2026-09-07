import { createHash } from 'node:crypto';

const FINMIND_CANARY_URL = 'https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=2330';
const MAX_RESPONSE_BYTES = 512 * 1024;

export function normalizeFinMindToken(value: unknown) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length >= 16 && token.length <= 4096 && !/\s/u.test(token) ? token : null;
}

export async function verifyFinMindToken(token: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(FINMIND_CANARY_URL, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'user-agent': 'StockInsider/6.0' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const announcedLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(announcedLength) && announcedLength > MAX_RESPONSE_BYTES) throw new Error('finmind_canary_response_too_large');
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('finmind_canary_response_too_large');
  if (response.status === 401 || response.status === 403) throw new Error(`finmind_canary_auth_failed_${response.status}`);
  if (!response.ok) throw new Error(`finmind_canary_http_${response.status}`);
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw new Error('finmind_canary_invalid_json'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('finmind_canary_invalid_schema');
  const row = payload as Record<string, unknown>;
  if (Number(row.status) !== 200 || !Array.isArray(row.data)
    || !row.data.some((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).stock_id || '') === '2330')) {
    throw new Error(`finmind_canary_invalid_payload_${String(row.status || 'missing')}`);
  }
  return { tokenHash: createHash('sha256').update(token).digest('hex'), rowCount: row.data.length };
}
