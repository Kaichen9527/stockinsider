import { inflateRawSync } from 'zlib';

export const GDELT_RETIRED_HOSTS = [
  'news.google.com',
  'youtube.com',
  'youtu.be',
  'udn.com',
  'money.udn.com',
  'anue.com',
  'news.cnyes.com',
  'mobile01.com',
] as const;

export function parseGdeltSeenDate(value: unknown): string | null {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u);
  if (!match) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

export function isRetiredNewsHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./u, '');
    return GDELT_RETIRED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  } catch {
    return true;
  }
}

export function decodeSingleFileZip(input: Buffer): string {
  let end = -1;
  for (let offset = input.length - 22; offset >= Math.max(0, input.length - 65_557); offset -= 1) {
    if (input.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error('gdelt_zip_end_record_missing');
  const entryCount = input.readUInt16LE(end + 10);
  if (entryCount !== 1) throw new Error(`gdelt_zip_entry_count_invalid:${entryCount}`);
  const centralOffset = input.readUInt32LE(end + 16);
  if (input.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error('gdelt_zip_central_record_missing');
  const method = input.readUInt16LE(centralOffset + 10);
  const compressedSize = input.readUInt32LE(centralOffset + 20);
  const localOffset = input.readUInt32LE(centralOffset + 42);
  if (input.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('gdelt_zip_local_record_missing');
  const nameLength = input.readUInt16LE(localOffset + 26);
  const extraLength = input.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLength + extraLength;
  if (dataStart + compressedSize > input.length) throw new Error('gdelt_zip_payload_truncated');
  const compressed = input.subarray(dataStart, dataStart + compressedSize);
  if (method === 0) return compressed.toString('utf8');
  if (method === 8) return inflateRawSync(compressed).toString('utf8');
  throw new Error(`gdelt_zip_method_unsupported:${method}`);
}

export function selectLatestGdeltGkgUrl(lastUpdateText: string): string {
  const lines = lastUpdateText.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const row = lines.map((line) => line.split(/\s+/u)).find((parts) => /\.gkg\.csv\.zip$/u.test(parts.at(-1) || ''));
  const rawUrl = row?.at(-1) || '';
  if (!/^https?:\/\/data\.gdeltproject\.org\/gdeltv2\/\d{14}\.gkg\.csv\.zip$/u.test(rawUrl)) throw new Error('gdelt_lastupdate_gkg_missing');
  return rawUrl.replace(/^http:\/\//u, 'https://');
}

export function gdeltGkgUrlsAfter(cursorUrl: string | null, latestUrl: string, maxArchives = 32): string[] {
  const timestampFrom = (value: string | null) => value?.match(/\/(\d{14})\.gkg\.csv\.zip$/u)?.[1] || null;
  const parseTimestamp = (value: string) => {
    const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])) : Number.NaN;
  };
  const formatTimestamp = (millis: number) => {
    const date = new Date(millis);
    const p = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
  };
  const latestTimestamp = timestampFrom(latestUrl);
  if (!latestTimestamp) throw new Error('gdelt_latest_cursor_invalid');
  const latestMillis = parseTimestamp(latestTimestamp);
  const cursorTimestamp = timestampFrom(cursorUrl);
  const cursorMillis = cursorTimestamp ? parseTimestamp(cursorTimestamp) : Number.NaN;
  if (!Number.isFinite(cursorMillis) || cursorMillis >= latestMillis) return cursorMillis === latestMillis ? [] : [latestUrl];
  const urls: string[] = [];
  for (let next = cursorMillis + 15 * 60_000; next <= latestMillis; next += 15 * 60_000) {
    urls.push(`https://data.gdeltproject.org/gdeltv2/${formatTimestamp(next)}.gkg.csv.zip`);
  }
  return urls.slice(0, Math.max(1, maxArchives));
}

export function gdeltTransportReason(error: unknown) {
  const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  if (/ENOTFOUND|EAI_AGAIN|dns/iu.test(message)) return `gdelt_dns_failed:${message}`;
  if (/CERT|TLS|SSL|ECONNRESET/iu.test(message)) return `gdelt_tls_failed:${message}`;
  if (/time(?:d\s*)?out|aborted/iu.test(message)) return `gdelt_timeout:${message}`;
  return `gdelt_transport_failed:${message}`;
}

export function gdeltSearchableText(columns: string[]): string {
  // GKG 2.1: source name, Themes/V2Themes, Persons/V2Persons,
  // Organizations/V2Organizations, AllNames and Extras. Record ID and the
  // publication date are deliberately excluded from symbol matching.
  return [columns[3], columns[7], columns[8], columns[11], columns[12], columns[13], columns[14], columns[22], columns[26]]
    .filter(Boolean)
    .join(' ');
}

export function matchGdeltStockSymbols(
  searchable: string,
  stocks: Array<{ symbol: string; name: string }>,
): string[] {
  return stocks.filter((stock) => {
    const symbolMatch = new RegExp(`(^|[^\\d])${stock.symbol}([^\\d]|$)`, 'u').test(searchable)
      && !new RegExp(`${stock.symbol}\\s*年`, 'u').test(searchable);
    return symbolMatch || searchable.includes(stock.name);
  }).map((stock) => stock.symbol);
}
