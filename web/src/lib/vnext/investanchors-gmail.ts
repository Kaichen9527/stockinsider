import { createHash } from 'node:crypto';
import { planInvestAnchorsMailboxDay, collectInvestAnchorsNotices } from './investanchors-notice-receiver.ts';

const googleToken = 'https://oauth2.googleapis.com/token';
const gmail = 'https://gmail.googleapis.com/gmail/v1/users/me';
const readonlyScope = 'https://www.googleapis.com/auth/gmail.readonly';
const requestLimit = 100_000;
type Mailbox = Parameters<typeof collectInvestAnchorsNotices>[2];
type Row = Record<string, unknown>;
export type InvestAnchorsGmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  mailboxSha256: string;
};

const object = (value: unknown): Row | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const safeBearer = /^[a-z0-9._~+/-]+={0,2}$/iu;
const messageId = /^[a-z0-9_-]{1,128}$/iu;
const pageKey = /^[!-~]{1,512}$/u;

export async function openInvestAnchorsGmail(
  configuration: InvestAnchorsGmailConfig,
  day: string,
  fetchData: typeof fetch = fetch,
): Promise<Mailbox> {
  if (!/^[a-f0-9]{64}$/u.test(configuration.mailboxSha256)
    || [configuration.clientId, configuration.clientSecret, configuration.refreshToken].some(
      value => !value || value.length > 4096 || !/^[!-~]+$/u.test(value),
    )) throw Error('investanchors_gmail_configuration_invalid');
  const query = planInvestAnchorsMailboxDay(day).q;
  const deadline = AbortSignal.timeout(requestLimit);
  async function json(url: string, init: RequestInit, maxBytes: number) {
    let result: Response;
    try {
      result = await fetchData(url, {
        ...init, cache: 'no-store', redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(7_000)]),
      });
    } catch {
      throw Error('investanchors_gmail_unavailable');
    }
    if (result.redirected || result.url !== url
      || !/^application\/json(?:\s*;[^\r\n]*)?$/iu.test(result.headers.get('content-type') ?? '')) {
      await result.body?.cancel().catch(() => {});
      throw Error('investanchors_gmail_unavailable');
    }
    if (result.status === 200) return readJson(result, maxBytes);

    const oauth = url === googleToken;
    if (!oauth && result.status === 401) {
      await result.body?.cancel().catch(() => {});
      throw Error('investanchors_gmail_access_rejected');
    }
    if (oauth && (result.status === 400 || result.status === 401)) {
      const payload = await readJson(result, 8192);
      if (payload?.error === 'invalid_grant') throw Error('investanchors_gmail_authorization_required');
      if (payload?.error === 'invalid_client') throw Error('investanchors_gmail_client_rejected');
    } else if (!oauth && result.status === 403) {
      const payload = await readJson(result, 8192);
      const errors = object(payload?.error)?.errors;
      if (Array.isArray(errors)) {
        if (errors.some(entry => object(entry)?.reason === 'domainPolicy')) {
          throw Error('investanchors_gmail_domain_policy');
        }
        if (errors.some(entry => object(entry)?.reason === 'insufficientPermissions')) {
          throw Error('investanchors_gmail_readonly_grant_required');
        }
      }
    } else {
      await result.body?.cancel().catch(() => {});
    }
    throw Error('investanchors_gmail_unavailable');
  }

  async function readJson(result: Response, maxBytes: number) {
    const reader = result.body?.getReader();
    if (!reader) throw Error('investanchors_gmail_unavailable');
    try {
      let length = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > maxBytes) { await reader.cancel(); throw Error('investanchors_gmail_response_bound'); }
        chunks.push(part.value);
      }
      return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length))));
    } catch {
      throw Error('investanchors_gmail_response_invalid');
    } finally {
      reader.releaseLock();
    }
  }

  const token = await json(googleToken, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret,
      refresh_token: configuration.refreshToken, grant_type: 'refresh_token' }),
  }, 32_768);
  if (token?.scope !== readonlyScope || token.token_type !== 'Bearer' || typeof token.access_token !== 'string'
    || token.access_token.length > 4096 || !safeBearer.test(token.access_token)
    || !Number.isSafeInteger(token.expires_in) || Number(token.expires_in) * 1000 <= requestLimit) {
    throw Error('investanchors_gmail_readonly_grant_required');
  }

  const accessToken = token.access_token;
  const get = (url: string, max: number) => json(url, {
    method: 'GET', headers: { authorization: 'Bearer ' + accessToken, accept: 'application/json' },
  }, max);
  const profile = await get(gmail + '/profile?fields=emailAddress', 8192);
  if (typeof profile?.emailAddress !== 'string' || profile.emailAddress.length > 254
    || createHash('sha256').update(profile.emailAddress.trim().toLowerCase()).digest('hex') !== configuration.mailboxSha256) {
    throw Error('investanchors_gmail_mailbox_mismatch');
  }

  const listed = new Set<string>(), pageTokens = new Set<string>();
  return {
    now: () => new Date().toISOString(),
    async list({ q, maxResults, pageToken }) {
      if (q !== query || maxResults !== 50 || pageToken !== undefined && !pageTokens.has(pageToken)) {
        throw Error('investanchors_gmail_list_scope');
      }
      const url = new URL(gmail + '/messages');
      url.searchParams.set('q', query);
      url.searchParams.set('maxResults', String(maxResults));
      url.searchParams.set('fields', 'messages/id,nextPageToken,resultSizeEstimate');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const result = await get(url.href, 65_536);
      if (Array.isArray(result?.messages) && result.messages.length <= 50) {
        for (const value of result.messages) {
          const id = object(value)?.id;
          if (typeof id === 'string' && messageId.test(id)) listed.add(id);
        }
      }
      if (typeof result?.nextPageToken === 'string' && pageKey.test(result.nextPageToken)) pageTokens.add(result.nextPageToken);
      return result;
    },
    async get({ id, format }) {
      if (format !== 'full' || !messageId.test(id) || !listed.has(id)) throw Error('investanchors_gmail_message_scope');
      return get(gmail + '/messages/' + encodeURIComponent(id) + '?format=full', 524_288);
    },
  };
}
