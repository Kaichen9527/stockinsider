export function publicCitation(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)) return null;
    const host = url.hostname.toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/u.test(host) || /(?:^|\.)(?:localhost|local|internal|test)$/u.test(host)) return null;
    if (/investanchors/iu.test(host) && /paid|member|premium|subscription/iu.test(url.pathname + url.search)) return null;
    return url.toString();
  } catch { return null; }
}
