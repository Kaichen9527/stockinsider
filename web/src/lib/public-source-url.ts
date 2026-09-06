const SENSITIVE_QUERY_KEY = /(?:^|[_-])(access[_-]?token|token|api[_-]?key|apikey|auth(?:orization)?|bearer|credential|jwt|password|secret|signature|sig)(?:$|[_-])/iu;

function privateIpv4(hostname: string) {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/u.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function privateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host.startsWith('::ffff:')) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (privateIpv4(host)) return true;
  if (host === '::1' || host === '::' || /^f[cd][0-9a-f:]*$/iu.test(host) || /^fe[89ab][0-9a-f:]*$/iu.test(host)) return true;
  return false;
}

/**
 * Converts an evidence link into a browser-safe public URL. Audit identifiers
 * stay in the database; credentials, fragments and private-network targets
 * never enter Codex bundles or public pages.
 */
export function sanitizePublicSourceUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2_048) return null;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || privateHostname(url.hostname)) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
