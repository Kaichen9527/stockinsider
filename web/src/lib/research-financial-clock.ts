/** Full nanosecond instant, finite calendar; no historical/PIT inference. */
export function financialInstant(value: unknown): bigint {
  if (typeof value !== 'string') throw new Error('financial_clock_invalid');
  const p = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!p) throw new Error('financial_clock_invalid');
  const ms = Date.parse(`${p[1]}Z`), hours = Number(p[5] || 0), minutes = Number(p[6] || 0);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19) !== p[1] || hours > 23 || minutes > 59) throw new Error('financial_clock_invalid');
  const offset = (p[4] === '-' ? -1 : 1) * (hours * 60 + minutes);
  return BigInt(ms) * BigInt(1000000) + BigInt((p[2] || '').padEnd(9,'0')) - BigInt(offset) * BigInt(60000000000);
}
