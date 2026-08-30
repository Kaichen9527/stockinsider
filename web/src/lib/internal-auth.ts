import { timingSafeEqual } from 'node:crypto';

export type InternalAuthResult =
  | { ok: true; authSource: 'internal_api_key' | 'cron_secret' }
  | { ok: false; status: number; error: string };

function secureTokenEquals(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function requireInternalAuth(req: Request): InternalAuthResult {
  const expected = ([
    { source: 'internal_api_key' as const, value: process.env.INTERNAL_API_KEY },
    { source: 'cron_secret' as const, value: process.env.CRON_SECRET },
  ]).filter((row): row is { source: 'internal_api_key' | 'cron_secret'; value: string } => Boolean(row.value));
  if (expected.length === 0) {
    return { ok: false, status: 500, error: 'INTERNAL_API_KEY/CRON_SECRET not configured' };
  }

  const header = req.headers.get('authorization') || req.headers.get('x-internal-key') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const match = token ? expected.find(({ value }) => secureTokenEquals(token, value)) : null;
  if (!match) {
    return { ok: false, status: 401, error: 'unauthorized internal request' };
  }

  return { ok: true, authSource: match.source };
}

export function requireExactInternalBearer(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  const authorization = request.headers.get('authorization');
  return Boolean(expected && authorization?.startsWith('Bearer ')
    && secureTokenEquals(authorization.slice(7), expected) && !request.headers.has('x-internal-key')
    && requireInternalAuth(request).ok);
}
