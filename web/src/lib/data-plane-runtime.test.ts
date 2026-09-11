import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { resolveStockInsiderDataPlaneConfiguration } from './data-plane-runtime.ts';

const release = 'a'.repeat(40);
const backendId = 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875002';
const principalId = 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001';
const jwt = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.${'s'.repeat(43)}`;

test('accepts only a pinned loopback Contabo PostgREST identity and clears credential bytes', () => {
  const credential = Buffer.from(`${jwt}\n`);
  const result = resolveStockInsiderDataPlaneConfiguration({
    STOCKINSIDER_DATA_PLANE: 'contabo',
    STOCKINSIDER_POSTGREST_URL: 'http://127.0.0.1:3301/',
    STOCKINSIDER_BACKEND_ID: backendId,
    OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID: principalId,
    STOCKINSIDER_WRITER_RELEASE_ID: release,
    STOCKINSIDER_POSTGREST_JWT_SHA256: createHash('sha256').update(jwt).digest('hex'),
  }, () => credential);
  assert.equal(result.mode, 'contabo');
  assert.equal(result.url, 'http://127.0.0.1:3301/');
  assert.equal(result.headers['x-stockinsider-backend-id'], backendId);
  assert.equal(result.headers['x-stockinsider-runner-principal'], principalId);
  assert.ok(credential.every((byte) => byte === 0));
});

test('rejects remote, unpinned, missing-release and malformed Contabo data planes', () => {
  const base = {
    STOCKINSIDER_DATA_PLANE: 'contabo', STOCKINSIDER_POSTGREST_URL: 'http://127.0.0.1:3301/',
    STOCKINSIDER_BACKEND_ID: backendId, OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID: principalId,
    STOCKINSIDER_WRITER_RELEASE_ID: release,
    STOCKINSIDER_POSTGREST_JWT_SHA256: createHash('sha256').update(jwt).digest('hex'),
  };
  for (const patch of [
    { STOCKINSIDER_POSTGREST_URL: 'https://database.example.com/' },
    { STOCKINSIDER_POSTGREST_URL: 'http://localhost:3301/' },
    { STOCKINSIDER_WRITER_RELEASE_ID: 'short' },
    { STOCKINSIDER_POSTGREST_JWT_SHA256: '0'.repeat(64) },
  ]) assert.throws(() => resolveStockInsiderDataPlaneConfiguration({ ...base, ...patch }, () => Buffer.from(jwt)));
});

test('preserves the exact Supabase project-host and service-key digest guard', () => {
  const key = 'service-role-' + 'x'.repeat(32);
  const projectRef = 'abcdefghijklmnopqrst';
  const result = resolveStockInsiderDataPlaneConfiguration({
    SUPABASE_URL: `https://${projectRef}.supabase.co`, OPPORTUNITY_V3_SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_SERVICE_ROLE_KEY: key,
    OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256: createHash('sha256').update(key).digest('hex'),
  }, () => { throw new Error('not used'); });
  assert.equal(result.mode, 'supabase');
  assert.throws(() => resolveStockInsiderDataPlaneConfiguration({
    SUPABASE_URL: 'https://attacker.example', OPPORTUNITY_V3_SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_SERVICE_ROLE_KEY: key,
    OPPORTUNITY_V3_SERVICE_ROLE_KEY_SHA256: createHash('sha256').update(key).digest('hex'),
  }, () => { throw new Error('not used'); }), /supabase_data_plane_invalid/u);
});

test('permits only the node test runner controlled loopback projection fixture', () => {
  const fixture = {
    SUPABASE_URL: 'http://127.0.0.1:3301/',
    SUPABASE_SERVICE_ROLE_KEY: 'controlled-projection-' + 'x'.repeat(32),
    LEGACY_RADAR_CORRECTNESS_PROJECTION: 'enabled',
  };
  assert.throws(() => resolveStockInsiderDataPlaneConfiguration(fixture), /supabase_data_plane_invalid/u);
  const result = resolveStockInsiderDataPlaneConfiguration({ ...fixture, NODE_TEST_CONTEXT: 'child-v8' });
  assert.equal(result.url, fixture.SUPABASE_URL);
  for (const patch of [
    { SUPABASE_URL: 'http://localhost:3301/' },
    { SUPABASE_URL: 'https://127.0.0.1:3301/' },
    { LEGACY_RADAR_CORRECTNESS_PROJECTION: 'disabled' },
    { NODE_TEST_CONTEXT: 'child' },
  ]) assert.throws(() => resolveStockInsiderDataPlaneConfiguration({
    ...fixture, NODE_TEST_CONTEXT: 'child-v8', ...patch,
  }), /supabase_data_plane_invalid/u);
});
