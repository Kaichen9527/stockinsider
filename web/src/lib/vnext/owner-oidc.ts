/** Server-only owner login. Fixed production Google OIDC; no worker authority,
 * credential issuance, source access, refresh tokens or user-info lookup. */
import { randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { ownerPrivateResponse } from './private-owner-read.ts';

export type OwnerOidcConfig = Readonly<{
  appOrigin: string;
  clientId: string;
  clientSecret: string;
  ownerSubjects: readonly string[];
}>;
/** Explicit trusted test-server dependency, never an HTTP/env provider setting.
 * A loopback fixture uses /authorize, /token and /jwks, with real library checks. */
export type OwnerOidcTestDependencies = Readonly<{
  providerOrigin: string;
  now?: () => number;
  sessionTtlSeconds?: number;
}>;
const SESSION_COOKIE = '__Host-stockinsider-owner-session';
const TRANSACTION_COOKIE = '__Host-stockinsider-owner-transaction';
const ID = /^[A-Za-z0-9_-]{43}$/u;
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/u;
const CAPACITY = 128;
const TTL = 300;
const GOOGLE = Object.freeze({
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token',
  jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
});
type Transaction = { readonly state: string; readonly nonce: string; readonly verifier: string; readonly created: number; readonly expires: number; used: boolean; cancelled: boolean };
type Session = Readonly<{ created: number; expires: number }>;
const randomId = () => randomBytes(32).toString('base64url');
function cookie(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header || header.length > 8192) return null;
  const matches = header.split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return ID.test(value) ? value : null;
}
function origin(value: string, loopbackHttp = false): URL | null {
  try {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:') return url;
    return loopbackHttp && url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? url : null;
  } catch { return null; }
}
function safeConfig(value: OwnerOidcConfig | null) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).sort().join('|') !== 'appOrigin|clientId|clientSecret|ownerSubjects') return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of ['appOrigin', 'clientId', 'clientSecret', 'ownerSubjects']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    snapshot[key] = descriptor.value;
  }
  if (typeof snapshot.appOrigin !== 'string' || snapshot.appOrigin.length > 200 || !origin(snapshot.appOrigin) ||
      typeof snapshot.clientId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/u.test(snapshot.clientId) ||
      typeof snapshot.clientSecret !== 'string' || !/^[\x21-\x7e]{1,512}$/u.test(snapshot.clientSecret) ||
      !Array.isArray(snapshot.ownerSubjects) || Object.getPrototypeOf(snapshot.ownerSubjects) !== Array.prototype) return null;
  const array = snapshot.ownerSubjects;
  if (array.length < 1 || array.length > 20 || Reflect.ownKeys(array).length !== array.length + 1) return null;
  const subjects: string[] = [];
  for (let index = 0; index < array.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || !SUBJECT.test(descriptor.value)) return null;
    subjects.push(descriptor.value);
  }
  if (new Set(subjects).size !== subjects.length) return null;
  return { appOrigin: snapshot.appOrigin, clientId: snapshot.clientId, clientSecret: snapshot.clientSecret, subjects: new Set(subjects) };
}

export function createOwnerOidcRuntime(input: OwnerOidcConfig | null = null, test?: OwnerOidcTestDependencies) {
  let config: ReturnType<typeof safeConfig> = null;
  let client: oidc.Configuration | null = null;
  let server = GOOGLE as Readonly<{ issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }>;
  let ttl = TTL;
  try {
    config = safeConfig(input);
    if (test) {
      const fixture = origin(test.providerOrigin, true);
      if (!fixture || fixture.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(fixture.hostname)) throw Error('invalid_test_provider');
      server = { issuer: fixture.origin, authorization_endpoint: `${fixture.origin}/authorize`, token_endpoint: `${fixture.origin}/token`, jwks_uri: `${fixture.origin}/jwks` };
      ttl = test.sessionTtlSeconds ?? TTL;
      if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > TTL) throw Error('invalid_test_ttl');
    }
    if (config) {
      client = new oidc.Configuration({ ...server, response_types_supported: ['code'], id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'] }, config.clientId,
      { client_secret: config.clientSecret, id_token_signed_response_alg: 'RS256', [oidc.clockTolerance]: 0 }, oidc.ClientSecretPost(config.clientSecret));
      if (test) oidc.allowInsecureRequests(client);
      oidc.enableNonRepudiationChecks(client);
      client.timeout = 5;
      client[oidc.customFetch] = async (url, options) => {
        if (url !== server.token_endpoint && url !== server.jwks_uri) throw Error('owner_provider_endpoint_refused');
        const body = options.body;
        if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof URLSearchParams)) throw Error('owner_provider_body_refused');
        const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
        const response = await fetch(url, { method: options.method, headers: options.headers, body, signal, redirect: 'error', cache: 'no-store' });
        if (response.status >= 300 && response.status < 400) throw Error('owner_provider_redirect_refused');
        const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        if (reader) {
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 262144) { await reader.cancel(); throw Error('owner_provider_response_bound'); }
            chunks.push(chunk.value);
          }
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return new Response(bytes, { status: response.status, headers: response.headers });
      };
    }
  } catch { config = null; client = null; }
  const transactions = new Map<string, Transaction>();
  const sessions = new Map<string, Session>();
  const verifiedSessions = new WeakSet<object>();
  function now(): number | null {
    try { const value = test?.now ? test.now() : Math.floor(Date.now() / 1000); return Number.isSafeInteger(value) && value >= 0 ? value : null; }
    catch { return null; }
  }
  function prune(current: number) {
    for (const [key, value] of transactions) if (current < value.created || current >= value.expires) { value.cancelled = true; transactions.delete(key); }
    for (const [key, value] of sessions) if (current < value.created || current >= value.expires) sessions.delete(key);
  }
  function response(status: number, body: unknown, cookies: string[] = [], redirect?: string) {
    const result = ownerPrivateResponse(status, body);
    for (const value of cookies) result.headers.append('Set-Cookie', value);
    if (redirect) result.headers.set('Location', redirect);
    return result;
  }
  const clearTransaction = () => cookie(TRANSACTION_COOKIE, '', 0);
  const clearSession = () => cookie(SESSION_COOKIE, '', 0);
  function preflight(request: Request, path: string, method: string, csrf = false): Response | null {
    if (!config || !client) return response(503, { ok: false, configured: false, authenticated: false, error: 'owner_login_unconfigured' });
    if (request.method !== method) return response(405, { ok: false, error: 'owner_method_not_allowed' });
    try {
      const url = new URL(request.url);
      // The TLS proxy may forward HTTP internally; only the configured host is
      // accepted. No Forwarded/X-Forwarded-* value supplies callback authority.
      const incomingHost = request.headers.get('host') ?? url.host;
      if (incomingHost !== new URL(config.appOrigin).host || url.pathname !== path || url.hash ||
          (path !== '/api/owner/callback' && url.search)) return response(400, { ok: false, error: 'owner_request_invalid' });
      if (csrf && (request.headers.get('origin') !== config.appOrigin ||
          (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin'))) {
        return response(403, { ok: false, error: 'owner_origin_refused' });
      }
      if (request.headers.has('authorization') || request.headers.has('x-internal-key')) return response(401, { ok: false, error: 'owner_login_required' });
    } catch { return response(400, { ok: false, error: 'owner_request_invalid' }); }
    return null;
  }
  function session(request: Request): Session | null {
    const current = now(); if (current === null) return null; prune(current);
    const id = readCookie(request, SESSION_COOKIE); const value = id ? sessions.get(id) : null;
    return value && verifiedSessions.has(value) && current >= value.created && current < value.expires ? value : null;
  }
  async function login(request: Request) {
    const failed = preflight(request, '/api/owner/login', 'POST', true); if (failed) return failed;
    const current = now(); if (current === null) return response(503, { ok: false, error: 'owner_login_unavailable' });
    prune(current);
    const previous = readCookie(request, TRANSACTION_COOKIE);
    if (previous) { const old = transactions.get(previous); if (old) old.cancelled = true; transactions.delete(previous); }
    if (transactions.size >= CAPACITY) return response(503, { ok: false, error: 'owner_login_busy' });
    try {
      const id = randomId(); const state = oidc.randomState(); const nonce = oidc.randomNonce(); const verifier = oidc.randomPKCECodeVerifier();
      const challenge = await oidc.calculatePKCECodeChallenge(verifier);
      const after = now(); if (after === null || after < current || after >= current + TTL) throw Error('owner_clock_invalid');
      prune(after);
      if (transactions.size >= CAPACITY) return response(503, { ok: false, error: 'owner_login_busy' }, [clearTransaction()]);
      const target = oidc.buildAuthorizationUrl(client!, { scope: 'openid', response_type: 'code', redirect_uri: `${config!.appOrigin}/api/owner/callback`,
        state, nonce, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
      transactions.set(id, Object.seal({ state, nonce, verifier, created: current, expires: current + TTL, used: false, cancelled: false }));
      return response(303, { ok: true }, [cookie(TRANSACTION_COOKIE, id, TTL)], target.href);
    } catch { return response(503, { ok: false, error: 'owner_login_unavailable' }, [clearTransaction()]); }
  }
  async function callback(request: Request) {
    const failed = preflight(request, '/api/owner/callback', 'GET'); if (failed) return failed;
    const id = readCookie(request, TRANSACTION_COOKIE); const tx = id ? transactions.get(id) : null;
    const denial = () => response(401, { ok: false, error: 'owner_login_denied' }, [clearTransaction(), clearSession()]);
    if (tx?.used) { tx.cancelled = true; if (id) transactions.delete(id); return denial(); }
    if (tx) tx.used = true; // Consume before any validation/exchange; retained only as a logout cancellation fence.
    const current = now();
    if (!tx || current === null || current < tx.created || current >= tx.expires) {
      if (tx) tx.cancelled = true; if (id) transactions.delete(id); return denial();
    }
    try {
      const incoming = new URL(request.url); const params = incoming.searchParams;
      const allowed = new Set(['code', 'state', 'iss', 'scope', 'authuser', 'prompt', 'hd', 'error', 'error_description', 'error_uri']);
      for (const [key, value] of params) if (!allowed.has(key) || params.getAll(key).length !== 1 || value.length > 2048) return denial();
      if (!params.get('code') || params.get('state') !== tx.state || params.has('error') ||
          (params.has('iss') && params.get('iss') !== server.issuer)) return denial();
      const oldSession = readCookie(request, SESSION_COOKIE); if (oldSession) sessions.delete(oldSession);
      const canonical = new URL(`${config!.appOrigin}/api/owner/callback`); canonical.search = incoming.search;
      const tokens = await oidc.authorizationCodeGrant(client!, canonical,
        { expectedState: tx.state, expectedNonce: tx.nonce, pkceCodeVerifier: tx.verifier, idTokenExpected: true });
      const claims = tokens.claims(); const after = now();
      if (tx.cancelled || !claims || after === null || after < current || after >= tx.expires || claims.iss !== server.issuer ||
          claims.aud !== config!.clientId || (claims.azp !== undefined && claims.azp !== config!.clientId) ||
          typeof claims.sub !== 'string' || !config!.subjects.has(claims.sub) ||
          !Number.isSafeInteger(claims.iat) || claims.iat > after || !Number.isSafeInteger(claims.exp) || claims.exp <= after) return denial();
      prune(after); if (sessions.size >= CAPACITY) return response(503, { ok: false, error: 'owner_login_busy' }, [clearTransaction(), clearSession()]);
      const sessionId = randomId(); const expires = Math.min(after + ttl, claims.exp);
      const verified = Object.freeze({ created: after, expires }); verifiedSessions.add(verified); sessions.set(sessionId, verified);
      return response(303, { ok: true }, [clearTransaction(), cookie(SESSION_COOKIE, sessionId, expires - after)], `${config!.appOrigin}/private-research`);
    } catch { return denial(); }
    finally { if (id) transactions.delete(id); }
  }
  async function logout(request: Request) {
    const failed = preflight(request, '/api/owner/logout', 'POST', true); if (failed) return failed;
    const id = readCookie(request, SESSION_COOKIE); if (id) sessions.delete(id);
    const tx = readCookie(request, TRANSACTION_COOKIE);
    if (tx) { const pending = transactions.get(tx); if (pending) pending.cancelled = true; transactions.delete(tx); }
    return response(303, { ok: true, authenticated: false }, [clearSession(), clearTransaction()], `${config!.appOrigin}/private-research`);
  }
  async function sessionStatus(request: Request) {
    const failed = preflight(request, '/api/owner/session', 'GET'); if (failed) return failed;
    const value = session(request);
    return value ? response(200, { ok: true, configured: true, authenticated: true, expiresAt: new Date(value.expires * 1000).toISOString() })
      : response(401, { ok: false, configured: true, authenticated: false, error: 'owner_login_required' }, [clearSession()]);
  }
  async function research(request: Request) {
    const failed = preflight(request, '/api/owner/research', 'GET'); if (failed) return failed;
    if (!session(request)) return response(401, { ok: false, error: 'owner_login_required' }, [clearSession()]);
    // Existing inspected readers require worker/service/public authority, not
    // owner-content permission. Until a real rights-qualified reader exists,
    // report the genuine data gap without DB/source/model IO or invented rows.
    return response(200, { ok: true, research: { status: 'missing_data', rows: [],
      gaps: ['owner_research_reader_not_connected', 'platform_content_rights_not_verified'] } });
  }
  return Object.freeze({ login, callback, logout, session: sessionStatus, research });
}
export type OwnerOidcRuntime = ReturnType<typeof createOwnerOidcRuntime>;
const RUNTIME = Symbol.for('stockinsider.owner-oidc.runtime.v1');
const globalRuntime = globalThis as typeof globalThis & { [RUNTIME]?: OwnerOidcRuntime };

/** Trusted process bootstrap only. No HTTP installation/configuration endpoint.
 * Production never selects a test provider from environment or request input. */
export function installOwnerOidcRuntimeForTests(runtime: OwnerOidcRuntime) {
  if (globalRuntime[RUNTIME]) throw Error('owner_runtime_already_initialized');
  globalRuntime[RUNTIME] = runtime;
}
export function getOwnerOidcRuntime(): OwnerOidcRuntime {
  if (globalRuntime[RUNTIME]) return globalRuntime[RUNTIME];
  let config: OwnerOidcConfig | null = null;
  // Dedicated settings only; nothing else is read until explicit enablement.
  if (process.env.STOCKINSIDER_OWNER_OIDC_ENABLED === 'true') {
    try {
      config = { appOrigin: process.env.STOCKINSIDER_OWNER_OIDC_APP_ORIGIN ?? '',
        clientId: process.env.STOCKINSIDER_OWNER_OIDC_CLIENT_ID ?? '', clientSecret: process.env.STOCKINSIDER_OWNER_OIDC_CLIENT_SECRET ?? '',
        ownerSubjects: JSON.parse(process.env.STOCKINSIDER_OWNER_OIDC_OWNER_SUBJECTS ?? 'null') };
    } catch { config = null; }
  }
  const runtime = createOwnerOidcRuntime(config); globalRuntime[RUNTIME] = runtime; return runtime;
}
