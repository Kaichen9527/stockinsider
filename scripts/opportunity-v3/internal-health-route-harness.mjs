import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { assessTrackedRuntimeHealth, runtimeObservationMatchesProducer } from '../../web/src/lib/opportunity-v3/runtime-health.ts';

const require = createRequire(import.meta.url);
const ts = require('../../web/node_modules/typescript');
const source = readFileSync(new URL('../../web/src/app/api/internal/health-check/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

export async function executeHealthRouteFailureBoundary() {
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/supabase-server': { getSupabaseServerClient: () => { throw new Error('database unavailable'); } },
    '@/lib/data-mode': { resolveDataMode: () => 'live' },
    '@/lib/source-policy': { SOURCE_CONNECTOR_KEYS: [], sourceExecutionPolicy: () => ({
      disposition: 'retired', licenseBasis: 'test', terminalReason: 'retired',
    }) },
    '@/lib/opportunity-v3/runtime-health': { assessTrackedRuntimeHealth, runtimeObservationMatchesProducer },
    '@/lib/opportunity-v3/canonical': { sha256Canonical: () => '0'.repeat(64) },
    '@/lib/internal-auth': { requireInternalAuth: () => ({ ok: true }) },
    '@/lib/opportunity-v3/projection-freshness': { assessProjectionFreshness: () => ({ status: 'unavailable' }) },
    '@/lib/opportunity-v3/reviewed-release-identity': { resolveReviewedConsumerCommitSha: () => 'a'.repeat(40) },
    '@/lib/opportunity-v3/effective-health': { deriveEffectiveProjectionHealth: (value) => value },
    '@/lib/source-health': { activeSourceHealthFailures: () => [] },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (id) => id.startsWith('node:') ? require(id) : modules[id],
    Response,
    Date,
    process: { env: {} },
  });
  const response = await exports.GET(new Request('http://localhost/api/internal/health-check'));
  return { response, body: await response.json() };
}
