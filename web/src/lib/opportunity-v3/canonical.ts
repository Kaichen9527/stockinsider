import { createHash } from 'crypto';

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
  if (Object.is(value, -0)) return '0';
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return canonicalNumber(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${members.join(',')}}`;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function canonicalResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(canonicalJson(body), {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function roundHalfAwayFromZero(value: number, digits = 2): number {
  if (!Number.isFinite(value)) throw new TypeError('non-finite');
  const scale = 10 ** digits;
  const scaled = value * scale;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / scale;
}

export function clampScore(value: number): number {
  return roundHalfAwayFromZero(Math.min(100, Math.max(0, value)), 2);
}

export function assertWholeSecondUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) throw new TypeError('invalid cutoff');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value.replace('Z', '.000Z')) {
    throw new TypeError('invalid cutoff');
  }
  return value;
}
