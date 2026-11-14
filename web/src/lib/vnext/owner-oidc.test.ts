import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { createOwnerOidcRuntime, type OwnerOidcConfig } from './owner-oidc.ts';

// Synthetic in-memory NONPRODUCTION RSA issuer only; no key files or services.
const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
const appOrigin = 'https://owner-app.invalid';
const providerOrigin = 'http://127.0.0.1:39991';
const ownerSubject = 'NONPRODUCTION_owner_subject';
const config: OwnerOidcConfig = { appOrigin, clientId: 'NONPRODUCTION_client', clientSecret: 'NONPRODUCTION_secret', ownerSubjects: [ownerSubject] };
const TX = '__Host-stockinsider-owner-transaction'; const SESSION = '__Host-stockinsider-owner-session';
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
function cookieFrom(response: Response, name: string) {
  const found = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`) && !value.includes('Max-Age=0'));
  return found?.split(';')[0] ?? '';
}
function request(path: string, method = 'GET', cookie = '', origin = appOrigin) {
  const headers = new Headers(); if (cookie) headers.set('Cookie', cookie);
  if (method === 'POST') headers.set('Origin', origin);
  return new Request(`${appOrigin}${path}`, { method, headers });
}
function noStore(response: Response) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.equal(response.headers.get('vary'), 'Authorization, Cookie');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}
function fixture(t: TestContext, options: { ttl?: number; claims?: Record<string, unknown>; alg?: string; wrongKey?: boolean; delay?: Promise<void>; providerStatus?: number; huge?: boolean; redirect?: boolean } = {}) {
  let current = Math.floor(Date.now() / 1000); let nonce = ''; let challenge = ''; let tokenCalls = 0; let jwksCalls = 0;
  const initial = current;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url === `${providerOrigin}/jwks`) { jwksCalls++; return Response.json({ keys: [{ ...key.publicKey.export({ format: 'jwk' }), kid: 'NONPRODUCTION_RSA', alg: 'RS256', use: 'sig' }] }); }
    assert.equal(url, `${providerOrigin}/token`); tokenCalls++;
    if (options.delay) await options.delay;
    if (options.redirect) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.invalid' } });
    if (options.huge) return new Response('x'.repeat(262145));
    if (options.providerStatus) return Response.json({ error: 'NONPRODUCTION_PROVIDER_ERROR' }, { status: options.providerStatus });
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), `${appOrigin}/api/owner/callback`);
    assert.equal(body.get('client_id'), config.clientId); assert.equal(body.get('client_secret'), config.clientSecret);
    assert.equal(createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url'), challenge);
    const claims = { iss: providerOrigin, aud: config.clientId, sub: ownerSubject, iat: initial, exp: initial + 3600, nonce, ...options.claims };
    const inputJwt = `${encode({ alg: options.alg ?? 'RS256', kid: 'NONPRODUCTION_RSA' })}.${encode(claims)}`;
    const signature = sign('RSA-SHA256', Buffer.from(inputJwt), options.wrongKey ? otherKey.privateKey : key.privateKey).toString('base64url');
    return Response.json({ access_token: 'NONPRODUCTION_ACCESS_SENTINEL', token_type: 'Bearer', expires_in: 3600, id_token: `${inputJwt}.${signature}` });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const runtime = createOwnerOidcRuntime(config, { providerOrigin, now: () => current, sessionTtlSeconds: options.ttl });
  async function begin() {
    const response = await runtime.login(request('/api/owner/login', 'POST')); assert.equal(response.status, 303); noStore(response);
    const target = new URL(response.headers.get('location')!);
    assert.equal(target.origin, providerOrigin); assert.equal(target.pathname, '/authorize');
    assert.equal(target.searchParams.get('scope'), 'openid'); assert.equal(target.searchParams.get('response_type'), 'code');
    assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    nonce = target.searchParams.get('nonce')!; challenge = target.searchParams.get('code_challenge')!;
    const tx = cookieFrom(response, TX); assert.ok(tx);
    return { response, tx, callbackPath: `/api/owner/callback?code=NONPRODUCTION_code&state=${target.searchParams.get('state')}` };
  }
  return { runtime, begin, advance: (seconds: number) => { current = initial + seconds; },
    setClaims: (claims: Record<string, unknown>) => { options.claims = claims; }, calls: () => ({ tokenCalls, jwksCalls }), initial };
}

test('T02 OIDC disabled/invalid production settings refuse without provider IO', async () => {
  let calls = 0; const original = globalThis.fetch; globalThis.fetch = (async () => { calls++; throw Error('unexpected'); }) as typeof fetch;
  try {
    for (const input of [undefined, null, { ...config, appOrigin: 'http://owner-app.invalid' }, { ...config, appOrigin: `${appOrigin}/callback` },
      { ...config, ownerSubjects: ['owner@example.invalid'] }, { ...config, clientSecret: '' }, { ...config, issuer: providerOrigin }]) {
      const runtime = createOwnerOidcRuntime(input as OwnerOidcConfig | null);
      for (const [path, handler] of [['login', runtime.login], ['session', runtime.session], ['research', runtime.research]] as const) {
        const response = await handler(request(`/api/owner/${path}`)); assert.equal(response.status, 503); noStore(response);
      }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('T02 OIDC real library code+PKCE+nonce+RS256 grant creates opaque secure cookie and private missing-data view', async t => {
  const f = fixture(t); const { tx, callbackPath, response: login } = await f.begin();
  assert.match(login.headers.getSetCookie()[0], /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=300$/u);
  const response = await f.runtime.callback(request(callbackPath, 'GET', tx)); assert.equal(response.status, 303); noStore(response);
  assert.equal(response.headers.get('location'), `${appOrigin}/private-research`);
  const session = cookieFrom(response, SESSION); assert.match(session, /=([A-Za-z0-9_-]{43})$/u);
  const status = await f.runtime.session(request('/api/owner/session', 'GET', session)); noStore(status);
  assert.deepEqual(await status.json(), { ok: true, configured: true, authenticated: true, expiresAt: new Date((f.initial + 300) * 1000).toISOString() });
  const research = await f.runtime.research(request('/api/owner/research', 'GET', session)); noStore(research);
  assert.deepEqual(await research.json(), { ok: true, research: { status: 'missing_data', rows: [], gaps: ['owner_research_reader_not_connected', 'platform_content_rights_not_verified'] } });
  assert.deepEqual(f.calls(), { tokenCalls: 1, jwksCalls: 1 });
});

test('T02 OIDC login/logout require POST and exact Origin with no host/return redirect authority', async t => {
  const f = fixture(t);
  for (const path of ['login', 'logout'] as const) {
    assert.equal((await f.runtime[path](request(`/api/owner/${path}`))).status, 405);
    assert.equal((await f.runtime[path](request(`/api/owner/${path}`, 'POST', '', 'https://evil.invalid'))).status, 403);
    assert.equal((await f.runtime[path](request(`/api/owner/${path}?returnTo=https://evil.invalid`, 'POST'))).status, 400);
    const cross = request(`/api/owner/${path}`, 'POST'); cross.headers.set('sec-fetch-site', 'cross-site');
    assert.equal((await f.runtime[path](cross)).status, 403);
  }
  const wrongHost = new Request('https://evil.invalid/api/owner/login', { method: 'POST', headers: { Origin: appOrigin } });
  assert.equal((await f.runtime.login(wrongHost)).status, 400);
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});

test('T02 OIDC canonical Host accepts internal TLS-proxy URL without trusting forwarded callback origins', async t => {
  const f = fixture(t);
  const internal = new Request('http://127.0.0.1:39992/api/owner/login', { method: 'POST',
    headers: { Host: new URL(appOrigin).host, Origin: appOrigin, 'X-Forwarded-Host': 'evil.invalid', 'X-Forwarded-Proto': 'http' } });
  const response = await f.runtime.login(internal); assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('redirect_uri'), `${appOrigin}/api/owner/callback`);
  const forged = new Request('http://127.0.0.1:39992/api/owner/login', { method: 'POST',
    headers: { Host: 'evil.invalid', Origin: appOrigin, 'X-Forwarded-Host': new URL(appOrigin).host, 'X-Forwarded-Proto': 'https' } });
  const denied = await f.runtime.login(forged); assert.equal(denied.status, 400); noStore(denied);
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});

test('T02 OIDC absent/worker/forged/duplicate-cookie sessions never authorize research', async t => {
  const f = fixture(t);
  for (const value of ['', `${SESSION}=${'x'.repeat(43)}`, `${SESSION}=${'x'.repeat(43)}; ${SESSION}=${'y'.repeat(43)}`]) {
    const response = await f.runtime.research(request('/api/owner/research', 'GET', value)); assert.equal(response.status, 401); noStore(response);
  }
  for (const token of ['NONPRODUCTION_operator', 'NONPRODUCTION_author', 'NONPRODUCTION_reviewer']) {
    const worker = request('/api/owner/research'); worker.headers.set('Authorization', `Bearer ${token}`);
    assert.equal((await f.runtime.research(worker)).status, 401);
  }
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});

test('T02 OIDC callback missing/mismatched/duplicated state or code consumes transaction before zero-IO denial', async t => {
  const f = fixture(t);
  for (const mutate of [(path: string) => path.replace(/state=[^&]+/u, 'state=wrong'), (path: string) => path + '&code=second',
    (path: string) => path + '&state=second', (path: string) => path + '&issuer=https://evil.invalid',
    (path: string) => path + '&iss=https://evil.invalid']) {
    const { tx, callbackPath } = await f.begin();
    const response = await f.runtime.callback(request(mutate(callbackPath), 'GET', tx)); assert.equal(response.status, 401); noStore(response);
    assert.equal((await f.runtime.callback(request(callbackPath, 'GET', tx))).status, 401);
  }
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});

test('T02 OIDC callback without matching browser transaction cookie and expired transaction has zero exchange', async t => {
  const f = fixture(t); const { tx, callbackPath } = await f.begin();
  assert.equal((await f.runtime.callback(request(callbackPath))).status, 401);
  f.advance(300); assert.equal((await f.runtime.callback(request(callbackPath, 'GET', tx))).status, 401);
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});

test('T02 OIDC nonowner/issuer/audience/nonce/algorithm/signature/expiry failures never create owner session', async t => {
  for (const options of [{ claims: { sub: 'NONPRODUCTION_nonowner' } }, { claims: { iss: 'https://evil.invalid' } },
    { claims: { aud: 'other-client' } }, { claims: { nonce: 'wrong-nonce' } }, { alg: 'HS256' }, { wrongKey: true },
    { claims: { exp: Math.floor(Date.now() / 1000) - 1 } }, { claims: { iat: Math.floor(Date.now() / 1000) + 100 } }]) {
    await t.test(JSON.stringify(Object.keys(options)), async child => {
      const f = fixture(child, options); const { tx, callbackPath } = await f.begin();
      const response = await f.runtime.callback(request(callbackPath, 'GET', tx)); assert.equal(response.status, 401); noStore(response);
      assert.equal(cookieFrom(response, SESSION), '');
      assert.deepEqual(await response.json(), { ok: false, error: 'owner_login_denied' });
    });
  }
});

test('T02 OIDC callback replay does not exchange again or disclose tokens/identity', async t => {
  const f = fixture(t); const { tx, callbackPath } = await f.begin();
  const first = await f.runtime.callback(request(callbackPath, 'GET', tx)); assert.equal(first.status, 303);
  const replay = await f.runtime.callback(request(callbackPath, 'GET', tx)); assert.equal(replay.status, 401); noStore(replay);
  assert.deepEqual(await replay.json(), { ok: false, error: 'owner_login_denied' });
  assert.deepEqual(f.calls(), { tokenCalls: 1, jwksCalls: 1 });
});

test('T02 OIDC logout revokes copied server session and clears both cookies with secure attributes', async t => {
  const f = fixture(t); const { tx, callbackPath } = await f.begin();
  const signedIn = await f.runtime.callback(request(callbackPath, 'GET', tx)); const copied = cookieFrom(signedIn, SESSION);
  const response = await f.runtime.logout(request('/api/owner/logout', 'POST', copied)); assert.equal(response.status, 303); noStore(response);
  assert.equal(response.headers.getSetCookie().length, 2);
  for (const value of response.headers.getSetCookie()) assert.match(value, /; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/u);
  assert.equal((await f.runtime.research(request('/api/owner/research', 'GET', copied))).status, 401);
});

test('T02 OIDC logout cancels pending transaction and cannot resurrect session during token exchange', async t => {
  let release!: () => void; const delay = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(t, { delay }); const { tx, callbackPath } = await f.begin();
  const pending = f.runtime.callback(request(callbackPath, 'GET', tx));
  // Grant reaches custom transport synchronously up to its first await.
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.calls().tokenCalls, 1);
  const logout = await f.runtime.logout(request('/api/owner/logout', 'POST', tx)); assert.equal(logout.status, 303);
  release(); const response = await pending; assert.equal(response.status, 401); assert.equal(cookieFrom(response, SESSION), '');
  assert.equal((await f.runtime.callback(request(callbackPath, 'GET', tx))).status, 401);
});

test('T02 OIDC session expiry and clock rollback deny copied cookies, bounded by ID token expiry', async t => {
  const f = fixture(t, { ttl: 2 }); const { tx, callbackPath } = await f.begin();
  const signedIn = await f.runtime.callback(request(callbackPath, 'GET', tx)); const copied = cookieFrom(signedIn, SESSION);
  assert.match(signedIn.headers.getSetCookie().find(value => value.startsWith(`${SESSION}=`))!, /Max-Age=2$/u);
  f.advance(2); assert.equal((await f.runtime.research(request('/api/owner/research', 'GET', copied))).status, 401);
  f.advance(-1); assert.equal((await f.runtime.session(request('/api/owner/session', 'GET', copied))).status, 401);
});

test('T02 OIDC new login replaces old session and failed nonowner login revokes prior owner session', async t => {
  const f = fixture(t); const first = await f.begin();
  const signedIn = await f.runtime.callback(request(first.callbackPath, 'GET', first.tx)); const old = cookieFrom(signedIn, SESSION);
  const second = await f.begin(); const rotated = await f.runtime.callback(request(second.callbackPath, 'GET', `${second.tx}; ${old}`));
  assert.equal(rotated.status, 303); assert.notEqual(cookieFrom(rotated, SESSION), old);
  assert.equal((await f.runtime.research(request('/api/owner/research', 'GET', old))).status, 401);
  const current = cookieFrom(rotated, SESSION); f.setClaims({ sub: 'NONPRODUCTION_nonowner' });
  const third = await f.begin(); const denied = await f.runtime.callback(request(third.callbackPath, 'GET', `${third.tx}; ${current}`));
  assert.equal(denied.status, 401); assert.equal(cookieFrom(denied, SESSION), '');
  assert.equal((await f.runtime.research(request('/api/owner/research', 'GET', current))).status, 401);
});

test('T02 OIDC provider failures/redirects/oversized responses are bounded sanitized denials', async t => {
  for (const options of [{ providerStatus: 500 }, { redirect: true }, { huge: true }]) {
    await t.test(JSON.stringify(options), async child => {
      const f = fixture(child, options); const { tx, callbackPath } = await f.begin();
      const response = await f.runtime.callback(request(callbackPath, 'GET', tx)); assert.equal(response.status, 401); noStore(response);
      assert.deepEqual(await response.json(), { ok: false, error: 'owner_login_denied' });
    });
  }
});

test('T02 OIDC trust config is snapshotted and test provider cannot select nonloopback issuer', async t => {
  const f = fixture(t); const mutable = { ...config, ownerSubjects: [...config.ownerSubjects] };
  const runtime = createOwnerOidcRuntime(mutable, { providerOrigin }); mutable.ownerSubjects.push('NONPRODUCTION_nonowner'); mutable.appOrigin = 'https://evil.invalid';
  const response = await runtime.login(request('/api/owner/login', 'POST')); assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get('location')!).searchParams.get('redirect_uri'), `${appOrigin}/api/owner/callback`);
  const disabled = createOwnerOidcRuntime(config, { providerOrigin: 'http://untrusted.invalid' });
  assert.equal((await disabled.login(request('/api/owner/login', 'POST'))).status, 503);
  assert.deepEqual(f.calls(), { tokenCalls: 0, jwksCalls: 0 });
});
