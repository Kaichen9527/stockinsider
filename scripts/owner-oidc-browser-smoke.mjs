/** Real local Next HTTP + Chromium/OIDC transport with NONPRODUCTION identity.
 * No production identity, private content, database, provider job or deployment.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, generateKeyPairSync, createHash, sign } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('../web/node_modules/playwright');
const root = process.cwd();
for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
  assert.ok(!fs.lstatSync(path.join(root, 'web', name), { throwIfNoEntry: false }), 'isolated Next requires absent environment files');
}
const built = process.env.OWNER_OIDC_BUILD_SOURCE_SHA;
assert.match(built || '', /^[a-f0-9]{40}$/u);
assert.equal(process.version, 'v22.14.0');
const current = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const webTree = execFileSync('git', ['rev-parse', `${built}:web`], { encoding: 'utf8' }).trim();
assert.equal(webTree, execFileSync('git', ['rev-parse', 'HEAD:web'], { encoding: 'utf8' }).trim());
execFileSync('git', ['diff', '--quiet', '--', 'web']);
const out = path.resolve(process.env.OWNER_OIDC_SMOKE_OUTPUT || 'work/owner-oidc-browser/result');
assert.ok(!fs.existsSync(out), 'fresh output required');
fs.mkdirSync(out, { recursive: true, mode: 0o700 });
for (const directory of [root, '/tmp']) {
  const stat = fs.statfsSync(directory, { bigint: true });
  assert.ok(stat.bavail * stat.bsize >= 8589934592n + 268435456n);
}
const APP = 'https://127.0.0.1:34441', DISABLED = 'https://127.0.0.1:34444';
const ISSUER = 'http://127.0.0.1:34443';
const CLIENT = 'NONPRODUCTION-owner-client', SECRET = 'NONPRODUCTION-owner-secret';
const OWNER = 'NONPRODUCTION_owner_subject_0001';
const sessionName = '__Host-stockinsider-owner-session';
const transactionName = '__Host-stockinsider-owner-transaction';
const receipts = [], failures = [], children = [], servers = [];
const navigation = [];
const sensitive = new Set([SECRET, OWNER, 'NONPRODUCTION-unused-access']);
let cleanupVerified = false, summary = null, primaryFailure = null;
let activePage, failureLocation = null, failureCookiePresence = null;
const cleanupFailures = [];
let browser, scenario = 'owner';
const codes = new Map();
const counts = { authorize: 0, token: 0, jwks: 0, pkce: 0 };
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'NONPRODUCTION-RS256', alg: 'RS256', use: 'sig' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(claims, badSignature = false) {
  const body = `${encode({ alg: 'RS256', typ: 'JWT', kid: jwk.kid })}.${encode(claims)}`;
  const signature = sign('RSA-SHA256', Buffer.from(body), privateKey);
  if (badSignature) signature[0] ^= 1;
  return `${body}.${signature.toString('base64url')}`;
}
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(value)); }
function noStore(response, html = false) {
  const headers = typeof response.headers === 'function' ? response.headers() : Object.fromEntries(response.headers);
  assert.ok(headers['cache-control']?.includes('private') && headers['cache-control']?.includes('no-store'));
  assert.equal(headers['surrogate-control'], 'no-store');
  assert.equal(headers['referrer-policy'], html ? 'same-origin' : 'no-referrer');
  if (html) assert.ok(headers['x-robots-tag']?.includes('noindex'));
  else assert.ok(headers.vary?.toLowerCase().includes('cookie') && headers.vary?.toLowerCase().includes('authorization'));
}
function record(name) { receipts.push(name); }
function syntheticEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|OPPORTUNITY_V3_|STOCKINSIDER_|INTERNAL_|CRON_|OPENAI_|ANTHROPIC_|RESEARCH_)/u.test(key)) delete env[key];
  return { ...env, PATH: '/workspace/.tools/node22/node_modules/node/bin:' + env.PATH,
    NEXT_TELEMETRY_DISABLED: '1', STOCKINSIDER_OWNER_OIDC_ENABLED: 'false' };
}
async function startNext(port, preload) {
  const log = fs.openSync(path.join(out, `next-${port}.private.log`), 'wx', 0o600);
  const args = ['--experimental-strip-types', ...(preload ? ['--import', preload] : []),
    'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)];
  const child = spawn(process.execPath, args, { cwd: path.join(root, 'web'), env: syntheticEnvironment(), stdio: ['ignore', log, log] });
  fs.closeSync(log); children.push(child);
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw Error('local_next_exited');
    try { const response = await fetch(`http://127.0.0.1:${port}/private-research`); if (response.status === 200) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('local_next_not_ready');
}
async function front(port, upstream, tls) {
  const server = https.createServer(tls, (req, res) => {
    const proxy = http.request({ host: '127.0.0.1', port: upstream, method: req.method, path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${port}`, 'x-forwarded-proto': 'https' } }, incoming => {
      res.writeHead(incoming.statusCode || 502, incoming.headers); incoming.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502).end(); }); req.pipe(proxy);
  });
  server.listen(port, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
}
async function checkApi(context, url, expected, options = {}) {
  const response = await context.request.get(url, options); assert.equal(response.status(), expected);
  noStore(response);
  return response;
}
async function state(page, value) {
  await page.getByTestId('owner-private-state').waitFor();
  await page.waitForFunction(expected => document.querySelector('[data-testid="owner-private-state"]')?.getAttribute('data-state') === expected, value);
}
try {
  const identity = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', ISSUER);
      if (url.pathname === '/jwks' && req.method === 'GET') { counts.jwks++; return json(res, 200, { keys: [jwk] }); }
      if (url.pathname === '/authorize' && req.method === 'GET') {
        counts.authorize++;
        const p = url.searchParams;
        assert.equal(p.get('client_id'), CLIENT); assert.equal(p.get('redirect_uri'), APP + '/api/owner/callback');
        assert.equal(p.get('response_type'), 'code'); assert.equal(p.get('scope'), 'openid');
        assert.equal(p.get('code_challenge_method'), 'S256'); assert.ok(p.get('nonce') && p.get('state') && p.get('code_challenge'));
        const code = randomBytes(24).toString('base64url');
        sensitive.add(code);
        codes.set(code, { nonce: p.get('nonce'), challenge: p.get('code_challenge'), scenario });
        const target = new URL(p.get('redirect_uri')); target.searchParams.set('code', code);
        target.searchParams.set('state', p.get('state')); target.searchParams.set('iss', ISSUER);
        res.writeHead(303, { location: target.href, 'cache-control': 'no-store' }).end(); return;
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        counts.token++; let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) throw Error('fixture_token_body_bound'); }
        const p = new URLSearchParams(body), grant = codes.get(p.get('code'));
        if (!grant) return json(res, 400, { error: 'invalid_grant' }); codes.delete(p.get('code'));
        assert.equal(p.get('client_id'), CLIENT); assert.equal(p.get('client_secret'), SECRET);
        assert.equal(p.get('grant_type'), 'authorization_code'); assert.equal(p.get('redirect_uri'), APP + '/api/owner/callback');
        const challenge = createHash('sha256').update(p.get('code_verifier') || '').digest('base64url');
        if (challenge !== grant.challenge) return json(res, 400, { error: 'invalid_grant' }); counts.pkce++;
        const now = Math.floor(Date.now() / 1000);
        const claims = { iss: ISSUER, aud: CLIENT, sub: grant.scenario === 'nonowner' ? 'NONPRODUCTION_wrong_owner' : OWNER,
          iat: now - 1, exp: now + 120, nonce: grant.nonce };
        if (grant.scenario === 'expired') { claims.iat = now - 120; claims.exp = now - 60; }
        if (grant.scenario === 'nonce') claims.nonce = 'NONPRODUCTION_wrong_nonce';
        if (grant.scenario === 'issuer') claims.iss = 'https://wrong-issuer.invalid';
        if (grant.scenario === 'audience') claims.aud = 'NONPRODUCTION_wrong_audience';
        const token = jwt(claims, grant.scenario === 'signature'); sensitive.add(token);
        return json(res, 200, { access_token: 'NONPRODUCTION-unused-access', token_type: 'Bearer', expires_in: 120, id_token: token });
      }
      res.writeHead(404).end();
    } catch { failures.push('fixture_identity_protocol_error'); json(res, 400, { error: 'fixture_request_invalid' }); }
  });
  identity.listen(34443, '127.0.0.1'); await once(identity, 'listening'); servers.push(identity);
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=NONPRODUCTION-local-oidc', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', path.join(out, 'fixture-tls.private.key'), '-out', path.join(out, 'fixture-tls.crt')], { stdio: 'ignore' });
  fs.chmodSync(path.join(out, 'fixture-tls.private.key'), 0o600);
  const tls = { key: fs.readFileSync(path.join(out, 'fixture-tls.private.key')), cert: fs.readFileSync(path.join(out, 'fixture-tls.crt')) };
  const bootstrap = path.join(out, 'trusted-bootstrap.mjs');
  fs.writeFileSync(bootstrap, `import {createOwnerOidcRuntime,installOwnerOidcRuntimeForTests} from ${JSON.stringify(pathToFileURL(path.join(root, 'web/src/lib/vnext/owner-oidc.ts')).href)};\nconst originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(u.origin!==${JSON.stringify(ISSUER)})throw Error('nonproduction_outbound_refused');return originalFetch(input,init);};\ninstallOwnerOidcRuntimeForTests(createOwnerOidcRuntime(${JSON.stringify({ appOrigin: APP, clientId: CLIENT, clientSecret: SECRET, ownerSubjects: [OWNER] })},${JSON.stringify({ providerOrigin: ISSUER, sessionTtlSeconds: 5 })}));\n`, { mode: 0o600, flag: 'wx' });
  await startNext(34442, bootstrap); await startNext(34445);
  await front(34441, 34442, tls); await front(34444, 34445, tls);
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
    await context.route('**/*', route => [APP + '/', DISABLED + '/', ISSUER + '/'].some(prefix => route.request().url().startsWith(prefix)) ? route.continue() : route.abort());
    const page = await context.newPage();
    activePage = page;
    page.on('response', response => {
      const url = new URL(response.url());
      if (response.request().isNavigationRequest()) navigation.push({ origin: url.origin === ISSUER ? 'local_idp' : url.origin === APP ? 'enabled_app' : 'disabled_app', path: url.pathname, status: response.status() });
    });
    noStore(await page.goto(APP + '/private-research'), true); await state(page, 'signed_out');
    await checkApi(context, APP + '/api/owner/research', 401); record(viewport.name + ':unauthenticated-http');
    const csrf = await context.request.post(APP + '/api/owner/login', { headers: { Origin: 'https://attacker.invalid' }, maxRedirects: 0 });
    assert.equal(csrf.status(), 403); noStore(csrf); record(viewport.name + ':csrf-rejected');
    scenario = 'owner'; await page.getByTestId('owner-login-submit').click(); await state(page, 'authenticated');
    const cookies = await context.cookies(APP); const sessionCookie = cookies.find(value => value.name === sessionName);
    assert.ok(sessionCookie?.httpOnly && sessionCookie.secure && sessionCookie.sameSite === 'Lax' && sessionCookie.path === '/');
    assert.ok(!cookies.some(value => value.name === transactionName));
    const savedSession = sessionCookie.value;
    sensitive.add(savedSession);
    const status = await checkApi(context, APP + '/api/owner/session', 200); assert.equal((await status.json()).authenticated, true);
    const privateResult = await checkApi(context, APP + '/api/owner/research', 200);
    assert.equal((await privateResult.json()).research.status, 'missing_data');
    const privateHtml = await page.content(); for (const value of sensitive) assert.ok(!privateHtml.includes(value));
    await page.screenshot({ path: path.join(out, `${viewport.name}-owner.png`), fullPage: true }); record(viewport.name + ':oidc-owner-secure-cookie-private-empty-state');
    const html = await context.request.get(APP + '/'); assert.equal(html.status(), 200);
    const publicHtml = await html.text(); for (const value of sensitive) assert.ok(!publicHtml.includes(value));
    assert.ok(publicHtml.includes('/private-research'));
    record(viewport.name + ':public-html-excludes-owner');
    const publicApi = await context.request.get(APP + '/api/radar/daily');
    assert.ok([200, 503].includes(publicApi.status()), 'public reader responds independently of owner login');
    const publicPayload = await publicApi.text(); for (const value of sensitive) assert.ok(!publicPayload.includes(value));
    record(viewport.name + ':public-api-excludes-owner');
    const logoutCsrf = await context.request.post(APP + '/api/owner/logout', { headers: { Origin: 'https://attacker.invalid' }, maxRedirects: 0 });
    assert.equal(logoutCsrf.status(), 403); noStore(logoutCsrf); record(viewport.name + ':logout-csrf-rejected');
    const loggedOut = page.waitForResponse(response => new URL(response.url()).pathname === '/api/owner/logout' && response.request().method() === 'POST');
    await page.getByTestId('owner-logout-submit').click(); await state(page, 'signed_out');
    const logoutResponse = await loggedOut; assert.equal(logoutResponse.status(), 303); noStore(logoutResponse);
    const replay = await context.request.get(APP + '/api/owner/session', { headers: { Cookie: `${sessionName}=${savedSession}` } });
    assert.equal(replay.status(), 401); record(viewport.name + ':logout-revokes-server-session');
    for (const mode of ['nonowner', 'expired', 'nonce', 'issuer', 'audience', 'signature']) {
      scenario = mode; await page.goto(APP + '/private-research'); await state(page, 'signed_out');
      const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/owner/callback' && response.request().isNavigationRequest());
      await page.getByTestId('owner-login-submit').click(); await page.waitForURL(url => url.pathname === '/api/owner/callback');
      const rejectionResponse = await rejected; assert.equal(rejectionResponse.status(), 401); noStore(rejectionResponse);
      assert.equal((await context.request.get(APP + '/api/owner/session')).status(), 401);
      record(viewport.name + ':' + mode + '-rejected');
    }
    scenario = 'owner'; await page.goto(APP + '/private-research'); await state(page, 'signed_out');
    await page.getByTestId('owner-login-submit').click(); await state(page, 'authenticated');
    await state(page, 'signed_out'); // Real short-lived fixture session expiry, no clock change.
    await checkApi(context, APP + '/api/owner/research', 401); record(viewport.name + ':session-real-time-expiry');
    const before = { ...counts };
    noStore(await page.goto(DISABLED + '/private-research'), true); await state(page, 'unconfigured');
    await checkApi(context, DISABLED + '/api/owner/session', 503);
    assert.deepEqual(counts, before); assert.equal(await page.getByTestId('owner-login-submit').count(), 0);
    await page.screenshot({ path: path.join(out, `${viewport.name}-disabled.png`), fullPage: true }); record(viewport.name + ':disabled-zero-provider-io');
    await context.close();
  }
  // Actual HTTP callback binding/replay: no browser-cookie shortcut creates a session.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  scenario = 'owner';
  const login = await context.request.post(APP + '/api/owner/login', { headers: { Origin: APP }, maxRedirects: 0 });
  assert.equal(login.status(), 303); noStore(login); const authorize = login.headers().location;
  const issued = await context.request.get(authorize, { maxRedirects: 0 }); assert.equal(issued.status(), 303);
  const callback = issued.headers().location;
  const bad = new URL(callback); bad.searchParams.set('state', 'NONPRODUCTION-wrong-state');
  const before = counts.token;
  const deniedState = await context.request.get(bad.href, { maxRedirects: 0 });
  assert.equal(deniedState.status(), 401); noStore(deniedState);
  assert.equal(counts.token, before); record('http:state-mismatch-zero-token-exchange');
  assert.equal((await context.request.get(callback, { maxRedirects: 0 })).status(), 401); record('http:consumed-transaction-no-replay');
  await context.close();
  const oneUse = await browser.newContext({ ignoreHTTPSErrors: true });
  const start = await oneUse.request.post(APP + '/api/owner/login', { headers: { Origin: APP }, maxRedirects: 0 });
  const tx = (await oneUse.cookies(APP)).find(value => value.name === transactionName); assert.ok(tx);
  const auth = await oneUse.request.get(start.headers().location, { maxRedirects: 0 });
  const successUrl = auth.headers().location;
  const accepted = await oneUse.request.get(successUrl, { maxRedirects: 0 });
  assert.equal(accepted.status(), 303); noStore(accepted);
  const tokenCount = counts.token;
  assert.equal((await oneUse.request.get(successUrl, { headers: { Cookie: `${transactionName}=${tx.value}` }, maxRedirects: 0 })).status(), 401);
  assert.equal(counts.token, tokenCount); record('http:successful-callback-cannot-redeem-twice');
  await oneUse.close();
  assert.ok(counts.jwks > 0 && counts.pkce > 0); assert.deepEqual(failures, []);
  const screenshots = fs.readdirSync(out).filter(name => name.endsWith('.png')).map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(path.join(out, name))).digest('hex') }));
  summary = { schema: 'stockinsider-owner-oidc-local-browser-v1', buildSource: built,
    harnessCommit: current, runtimeWebTree: webTree, status: 'PASS', cases: receipts.length, receipts, counts, screenshots,
    identity: 'NONPRODUCTION_LOCAL_CONTROLLED_OIDC_ONLY', secureCookieOnTls: true, productionTlsVerificationDisabled: false,
    actualGoogleOwnerOrPrivateContent: false, databaseOrPaidProviderCalls: 0, productionActions: 0 };
} catch (error) {
  primaryFailure = error;
  try {
    if (activePage) {
      const url = new URL(activePage.url()); failureLocation = { origin: url.origin === ISSUER ? 'local_idp' : url.origin === APP ? 'enabled_app' : 'disabled_app', path: url.pathname };
      const cookies = await activePage.context().cookies(APP);
      failureCookiePresence = { transaction: cookies.some(value => value.name === transactionName), session: cookies.some(value => value.name === sessionName) };
    }
  } catch { /* No raw URL, cookie or token is retained in diagnostics. */ }
}
finally {
  try { if (browser) await browser.close(); } catch { cleanupFailures.push('owned_browser_close_failed'); }
  for (const child of children) {
    try {
      if (child.exitCode === null && child.signalCode === null) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            const killed = setTimeout(() => reject(Error('owned_next_cleanup_timeout')), 3000);
            child.once('exit', () => { clearTimeout(killed); resolve(); });
          }, 10000);
          child.once('exit', () => { clearTimeout(timer); resolve(); });
          child.kill('SIGTERM');
        });
      }
    } catch { cleanupFailures.push('owned_next_close_failed'); }
  }
  for (const server of servers) {
    try {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('owned_listener_cleanup_timeout')), 3000);
        server.close(() => { clearTimeout(timer); resolve(); });
      });
    } catch { cleanupFailures.push('owned_listener_close_failed'); }
  }
  cleanupVerified = cleanupFailures.length === 0;
}
if (primaryFailure || !cleanupVerified) {
  fs.writeFileSync(path.join(out, 'failure-receipt.json'), JSON.stringify({ status: 'FAIL', completedCases: receipts,
    ownedProcessesStopped: cleanupVerified, cleanupFailures, primaryFailure: !!primaryFailure, counts, navigation,
    failureLocation, failureCookiePresence }, null, 2) + '\n', { mode: 0o600 });
  throw primaryFailure || Error('owned_fixture_cleanup_failed');
}
assert.ok(summary && cleanupVerified);
fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify({ ...summary, ownedProcessesStopped: cleanupVerified }, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ status: 'PASS', cases: receipts.length, counts, ownedProcessesStopped: true }));
