import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

type Lookup = typeof dns.lookup;

function unbracket(value: string) {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

export function isPublicNetworkAddress(value: string) {
  const address = unbracket(String(value || '').toLowerCase()).split('%')[0];
  const version = net.isIP(address);
  if (!version) return false;
  if (version === 4) {
    const octets = address.split('.').map(Number);
    return !(octets[0] === 0 || octets[0] === 10 || octets[0] === 127 || octets[0] >= 224
      || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && ((octets[1] === 0 && (octets[2] === 0 || octets[2] === 2)) || octets[1] === 168))
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19 || (octets[1] === 51 && octets[2] === 100)))
      || (octets[0] === 203 && octets[1] === 0 && octets[2] === 113));
  }
  if (address === '::' || address === '::1' || address.startsWith('fc') || address.startsWith('fd')
    || /^fe[89ab]/u.test(address) || address.startsWith('ff') || address.startsWith('2001:db8:')) return false;
  if (address.startsWith('::ffff:')) {
    const tail = address.slice(7);
    if (net.isIP(tail) === 4) return isPublicNetworkAddress(tail);
    const words = tail.split(':');
    if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/u.test(word))) {
      const high = Number.parseInt(words[0], 16); const low = Number.parseInt(words[1], 16);
      return isPublicNetworkAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
    }
    return false;
  }
  const first = Number.parseInt(address.split(':')[0], 16);
  return Number.isInteger(first) && first >= 0x2000 && first <= 0x3fff;
}

async function publicAddresses(hostname: string, lookup: Lookup) {
  const literal = unbracket(hostname);
  if (net.isIP(literal)) {
    if (!isPublicNetworkAddress(literal)) throw new Error('pinned_https_private_address_rejected');
    return [literal];
  }
  const resolved = await lookup(literal, { all: true, verbatim: true });
  const addresses = resolved.map((row) => row.address);
  if (addresses.length === 0 || !addresses.every(isPublicNetworkAddress)) throw new Error('pinned_https_private_address_rejected');
  return addresses;
}

/** HTTPS-only fetch that validates every DNS answer, then pins the socket to a
 * validated address. It deliberately rejects redirects and caps bytes while
 * streaming, before any response can be persisted. */
export async function fetchPinnedHttpsText(input: {
  url: URL;
  allowedOrigins: ReadonlySet<string>;
  headers?: Record<string, string>;
  maxBytes: number;
  timeoutMs: number;
  lookup?: Lookup;
}) {
  if (input.url.protocol !== 'https:' || input.url.username || input.url.password
    || !input.allowedOrigins.has(input.url.origin) || input.maxBytes < 1) throw new Error('pinned_https_url_rejected');
  const addresses = await publicAddresses(input.url.hostname, input.lookup || dns.lookup);
  return await new Promise<{ status: number; body: string; contentType: string }>((resolve, reject) => {
    const request = https.request(input.url, {
      method: 'GET', headers: input.headers, servername: unbracket(input.url.hostname),
      lookup: (_hostname, _options, callback) => callback(null, addresses[0], net.isIP(addresses[0]) as 4 | 6),
    }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) { response.resume(); reject(new Error('pinned_https_redirect_rejected')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > input.maxBytes) request.destroy(new Error('pinned_https_response_too_large'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (status < 200 || status >= 300) { reject(new Error(`pinned_https_http_${status}`)); return; }
        resolve({ status, body: Buffer.concat(chunks).toString('utf8'), contentType: String(response.headers['content-type'] || '') });
      });
    });
    request.setTimeout(input.timeoutMs, () => request.destroy(new Error('pinned_https_timeout')));
    request.on('error', reject);
    request.end();
  });
}
