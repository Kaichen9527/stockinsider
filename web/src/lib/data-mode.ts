export type DataMode = 'live' | 'demo';

function normalizeMode(value: string | undefined): DataMode | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'live') return 'live';
  if (normalized === 'demo') return 'demo';
  return null;
}

export function resolveDataMode(): DataMode {
  const explicit = normalizeMode(process.env.DATA_MODE);
  if (explicit) return explicit;
  if (String(process.env.STOCKINSIDER_FORCE_DEMO || '').toLowerCase() === 'true') return 'demo';
  return 'live';
}

export function isDemoMode() {
  return resolveDataMode() === 'demo';
}
