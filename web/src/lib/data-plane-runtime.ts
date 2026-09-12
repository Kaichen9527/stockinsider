import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type RuntimeEnvironment = Record<string, string | undefined>;
type ReadCredential = (name: string) => Buffer;

export type StockInsiderDataPlaneConfiguration = Readonly<{
  mode: 'supabase' | 'contabo';
  url: string;
  bearer: string;
  headers: Readonly<Record<string, string>>;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RELEASE = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function visibleAscii(value: string, minimum: number, maximum: number) {
  return value.length >= minimum && value.length <= maximum && /^[\x21-\x7e]+$/u.test(value);
}

function systemdCredentialReader(environment: RuntimeEnvironment): ReadCredential {
  return (name) => {
    if (!/^[a-zA-Z0-9_.-]{1,128}$/u.test(name)) throw new Error('data_plane_credential_name_invalid');
    const directory = String(environment.CREDENTIALS_DIRECTORY || '');
    if (!directory.startsWith('/run/credentials/') || directory !== path.resolve(directory)) {
      throw new Error('data_plane_credentials_directory_invalid');
    }
    return readFileSync(path.join(directory, name));
  };
}

function parseContaboUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('contabo_postgrest_url_invalid'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
    || !/^\d{2,5}$/u.test(url.port) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('contabo_postgrest_must_be_loopback');
  }
  // The Supabase client always speaks the `/rest/v1` shape.  Port 3302 is the
  // dedicated loopback-only Nginx compatibility boundary which strips that
  // prefix before forwarding to raw PostgREST on 3301.  Accepting an arbitrary
  // loopback port here can silently select the raw endpoint and turn every
  // application query into a 404 during cutover.
  const port = Number(url.port);
  if (port !== 3302) throw new Error('contabo_postgrest_port_invalid');
  return url.toString();
}

function isControlledProjectionTest(
  environment: RuntimeEnvironment,
  url: URL,
  bearer: string,
) {
  return environment.NODE_TEST_CONTEXT === 'child-v8'
    && environment.LEGACY_RADAR_CORRECTNESS_PROJECTION === 'enabled'
    && url.protocol === 'http:'
    && url.hostname === '127.0.0.1'
    && /^\d{2,5}$/u.test(url.port)
    && Number(url.port) >= 1024
    && Number(url.port) <= 65535
    && url.username === ''
    && url.password === ''
    && url.pathname === '/'
    && url.search === ''
    && url.hash === ''
    && visibleAscii(bearer, 32, 4096);
}

/** Resolve a fail-closed server data plane. Supabase retains its exact hostname
 * guard; the successor is accepted only as a loopback PostgREST service whose
 * JWT is supplied by a systemd credential and pinned by a non-secret digest. */
export function resolveStockInsiderDataPlaneConfiguration(
  environment: RuntimeEnvironment = process.env,
  readCredential: ReadCredential = systemdCredentialReader(environment),
): StockInsiderDataPlaneConfiguration {
  const mode = environment.STOCKINSIDER_DATA_PLANE === 'contabo' ? 'contabo' : 'supabase';
  const release = String(environment.STOCKINSIDER_WRITER_RELEASE_ID || '');
  if (mode === 'supabase') {
    const projectRef = String(environment.OPPORTUNITY_V3_SUPABASE_PROJECT_REF || '');
    const url = String(environment.SUPABASE_URL || environment.NEXT_PUBLIC_SUPABASE_URL || '');
    const bearer = String(environment.SUPABASE_SERVICE_ROLE_KEY || environment.SUPABASE_SERVICE_KEY || '');
    const digest = String(environment.OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256 || '');
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('supabase_data_plane_invalid'); }
    const controlledProjectionTest = isControlledProjectionTest(environment, parsed, bearer);
    if (!controlledProjectionTest && (!/^[a-z0-9]{20}$/u.test(projectRef)
      || parsed.toString() !== `https://${projectRef}.supabase.co/`
      || !visibleAscii(bearer, 32, 4096) || !SHA256.test(digest)
      || createHash('sha256').update(bearer).digest('hex') !== digest)) {
      throw new Error('supabase_data_plane_invalid');
    }
    const headers: Record<string, string> = {};
    if (RELEASE.test(release)) headers['x-stockinsider-writer-release'] = release;
    return Object.freeze({ mode, url: parsed.toString(), bearer, headers: Object.freeze(headers) });
  }

  const backendId = String(environment.STOCKINSIDER_BACKEND_ID || '');
  const principalId = String(environment.OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID || '');
  const credentialName = String(environment.STOCKINSIDER_POSTGREST_JWT_CREDENTIAL || 'postgrest-service-role.jwt');
  const expectedDigest = String(environment.STOCKINSIDER_POSTGREST_JWT_SHA256 || '');
  if (!UUID.test(backendId) || !UUID.test(principalId) || !RELEASE.test(release) || !SHA256.test(expectedDigest)) {
    throw new Error('contabo_data_plane_identity_invalid');
  }
  const credential = readCredential(credentialName);
  try {
    const bearer = credential.toString('utf8').trim();
    if (!visibleAscii(bearer, 64, 4096) || bearer.split('.').length !== 3
      || createHash('sha256').update(bearer).digest('hex') !== expectedDigest) {
      throw new Error('contabo_postgrest_credential_invalid');
    }
    return Object.freeze({ mode, url: parseContaboUrl(String(environment.STOCKINSIDER_POSTGREST_URL || '')),
      bearer, headers: Object.freeze({
        'x-stockinsider-backend-id': backendId,
        'x-stockinsider-runner-principal': principalId,
        'x-stockinsider-writer-release': release,
      }) });
  } finally { credential.fill(0); }
}

let cached: SupabaseClient | null = null;
let cachedMode: 'supabase' | 'contabo' | null = null;

export function getStockInsiderDataPlaneClient(): SupabaseClient {
  if (cached) return cached;
  const configuration = resolveStockInsiderDataPlaneConfiguration();
  cachedMode = configuration.mode;
  cached = createClient(configuration.url, configuration.bearer, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: configuration.headers },
  });
  return cached;
}

export function stockInsiderDataPlaneMode() {
  return cachedMode ?? (process.env.STOCKINSIDER_DATA_PLANE === 'contabo' ? 'contabo' : 'supabase');
}

export function resetStockInsiderDataPlaneClientForTests() { cached = null; cachedMode = null; }
