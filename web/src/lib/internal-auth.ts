export function requireInternalAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.INTERNAL_API_KEY || process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: 'INTERNAL_API_KEY/CRON_SECRET not configured' };
  }

  const header = req.headers.get('authorization') || req.headers.get('x-internal-key') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (!token || token !== expected) {
    return { ok: false, status: 401, error: 'unauthorized internal request' };
  }

  return { ok: true };
}
