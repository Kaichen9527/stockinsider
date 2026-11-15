import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { openInvestAnchorsGmail } from './investanchors-gmail.ts';
import { planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';

const day = '2026-11-12';
const address = 'controlled@example.invalid';
const config = {
  clientId: 'fixture-id', clientSecret: 'fixture-client-secret', refreshToken: 'fixture-refresh-token',
  mailboxSha256: createHash('sha256').update(address).digest('hex'),
};
const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const q = planInvestAnchorsMailboxDay(day).q;
function fixture(mode = 'normal') {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal);
    if (mode === 'provider_error') throw Error('network reports fixture-client-secret');
    const success = (body: unknown, status = 200, responseUrl = url) => {
      const response = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });
      Object.defineProperty(response, 'url', { value: responseUrl });
      return response;
    };
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(init.method, 'POST');
      assert.equal(new URLSearchParams(String(init.body)).get('grant_type'), 'refresh_token');
      return success({ token_type: 'Bearer', access_token: 'fixture-token', expires_in: 3600,
        ...(mode === 'no_scope' ? {} : { scope: mode === 'too_wide' ? scope + ' https://www.googleapis.com/auth/gmail.modify' : scope }) },
      mode === 'expired_grant' ? 400 : 200, mode === 'redirect' ? 'https://evil.invalid/' : url);
    }
    assert.equal(init.method, 'GET');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-token');
    assert.equal(init.body, undefined);
    assert.ok(url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/'));
    if (url.includes('/profile?')) return success({ emailAddress: mode === 'different_mailbox' ? 'other@example.invalid' : address.toUpperCase() });
    if (url.includes('/messages?')) {
      if (mode === 'oversized') return success({ padding: 'x'.repeat(70_000) });
      return success({ messages: [{ id: 'owned_id' }], nextPageToken: 'owned_page' });
    }
    assert.ok(url.endsWith('/messages/owned_id?format=full'));
    return success({ id: 'owned_id', internalDate: String(planInvestAnchorsMailboxDay(day).startMs), payload: { mimeType: 'text/plain' } });
  };
  return { requests, fetcher };
}

test('refresh, mailbox identity, and listed Gmail IDs bind the read-only transport', async () => {
  const f = fixture();
  const mailbox = await openInvestAnchorsGmail(config, day, f.fetcher);
  assert.equal(f.requests.length, 2);
  await assert.rejects(() => mailbox.get({ id: 'owned_id', format: 'full' }), /message_scope/u);
  await assert.rejects(() => mailbox.list({ q: 'in:anywhere', maxResults: 50 }), /list_scope/u);
  await assert.rejects(() => mailbox.list({ q, maxResults: 50, pageToken: 'arbitrary_page' }), /list_scope/u);
  assert.equal(f.requests.length, 2);
  await mailbox.list({ q, maxResults: 50 });
  const address = new URL(f.requests[2].url);
  assert.equal(address.searchParams.get('q'), q);
  assert.equal(address.searchParams.get('fields'), 'messages/id,nextPageToken,resultSizeEstimate');
  await mailbox.list({ q, maxResults: 50, pageToken: 'owned_page' });
  await assert.rejects(() => mailbox.get({ id: 'unknown_id', format: 'full' }), /message_scope/u);
  assert.deepEqual(await mailbox.get({ id: 'owned_id', format: 'full' }), {
    id: 'owned_id', internalDate: String(planInvestAnchorsMailboxDay(day).startMs), payload: { mimeType: 'text/plain' },
  });
  assert.equal(f.requests.some(request => /fixture-token|fixture-client-secret|fixture-refresh-token/u.test(request.url)), false);
});

test('credentials, extra scopes, redirects, and the wrong mailbox stop before mail listing', async () => {
  for (const [mode, reason, calls] of [
    ['too_wide', 'readonly_grant_required', 1], ['no_scope', 'readonly_grant_required', 1],
    ['expired_grant', 'authorization_required', 1], ['redirect', 'unavailable', 1],
    ['provider_error', 'unavailable', 1], ['different_mailbox', 'mailbox_mismatch', 2],
  ] as const) {
    const f = fixture(mode);
    await assert.rejects(() => openInvestAnchorsGmail(config, day, f.fetcher), {
      message: 'investanchors_gmail_' + reason,
    });
    assert.equal(f.requests.length, calls);
    assert.equal(f.requests.some(request => request.url.includes('/messages')), false);
  }
});
test('Gmail responses are byte bounded before parsing or retaining any notice', async () => {
  const f = fixture('oversized');
  const mailbox = await openInvestAnchorsGmail(config, day, f.fetcher);
  await assert.rejects(() => mailbox.list({ q, maxResults: 50 }), /response_invalid/u);
});
