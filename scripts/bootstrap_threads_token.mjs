import { createHash } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const suppliedLongToken = process.env.THREADS_LONG_LIVED_ACCESS_TOKEN || process.env.THREADS_ACCESS_TOKEN || '';
const shortToken = process.env.THREADS_SHORT_LIVED_ACCESS_TOKEN || '';
const appSecret = process.env.THREADS_APP_SECRET || '';

if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and service-role key are required');
if (!suppliedLongToken && (!shortToken || !appSecret)) {
  throw new Error('provide THREADS_LONG_LIVED_ACCESS_TOKEN or both THREADS_SHORT_LIVED_ACCESS_TOKEN and THREADS_APP_SECRET');
}

async function exchangeToken() {
  if (suppliedLongToken) return { accessToken: suppliedLongToken, expiresIn: 60 * 24 * 60 * 60 };
  const endpoint = new URL('https://graph.threads.net/access_token');
  endpoint.searchParams.set('grant_type', 'th_exchange_token');
  endpoint.searchParams.set('client_secret', appSecret);
  endpoint.searchParams.set('access_token', shortToken);
  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Threads token exchange failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Threads token exchange returned no token');
  return { accessToken: String(payload.access_token), expiresIn: Number(payload.expires_in || 60 * 24 * 60 * 60) };
}

async function supabaseRequest(path, init) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/u, '')}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${path} failed with HTTP ${response.status}`);
  return response;
}

const { accessToken, expiresIn } = await exchangeToken();
const refreshedAt = new Date().toISOString();
const expiresAt = new Date(Date.now() + Math.max(24 * 60 * 60, expiresIn) * 1000).toISOString();
const hash = createHash('sha256').update(accessToken).digest('hex');

await supabaseRequest('/rest/v1/rpc/refresh_threads_source_secret', {
  method: 'POST',
  body: JSON.stringify({
    p_secret: accessToken,
    p_token_hash: hash,
    p_refreshed_at: refreshedAt,
    p_expires_at: expiresAt,
  }),
});

console.log(JSON.stringify({ ok: true, credentialRef: 'SUPABASE_VAULT:threads_access_token', expiresAt }));
