import { spawnSync } from 'node:child_process';

const domain = process.argv[2] ?? 'all';
const allowed = new Set(['all', 'source-funnel', 'market-context', 'valuation', 'action', 'traceability']);
if (!allowed.has(domain)) {
  console.error(`unknown V3 audit domain: ${domain}`);
  process.exit(2);
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--base-url'].includes(key) || typeof value !== 'string' || !value || value.startsWith('--')) {
      console.error('invalid V3 audit arguments');
      process.exit(2);
    }
    flags[key] = value;
  }
  return flags;
}

async function auditHttpSurface(baseUrl) {
  let origin;
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    origin = url.origin;
  } catch {
    console.error('invalid --base-url');
    process.exit(2);
  }

  const probes = [
    { method: 'GET', path: '/api/opportunity-v3', statuses: new Set([200]) },
    { method: 'POST', path: '/api/opportunity-v3', statuses: new Set([405]), allow: 'GET' },
    { method: 'GET', path: '/api/opportunity-v3/not-a-run/not-a-symbol', statuses: new Set([404, 422, 503]) },
  ];
  const evidence = [];
  for (const probe of probes) {
    const response = await fetch(origin + probe.path, {
      method: probe.method,
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const cacheControl = response.headers.get('cache-control') ?? '';
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Error(`${probe.method} ${probe.path} returned non-JSON status ${response.status}`);
    }
    if (!probe.statuses.has(response.status)) {
      throw new Error(`${probe.method} ${probe.path} returned unexpected status ${response.status}`);
    }
    if (!contentType.toLowerCase().startsWith('application/json')) {
      throw new Error(`${probe.method} ${probe.path} returned unexpected content type`);
    }
    if (!/private/i.test(cacheControl) || !/no-store/i.test(cacheControl)) {
      throw new Error(`${probe.method} ${probe.path} omitted private no-store`);
    }
    if (probe.allow && response.headers.get('allow') !== probe.allow) {
      throw new Error(`${probe.method} ${probe.path} returned an invalid Allow header`);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error(`${probe.method} ${probe.path} returned an invalid envelope`);
    }
    evidence.push({ method: probe.method, path: probe.path, status: response.status });
  }
  return evidence;
}

const flags = parseFlags(process.argv.slice(3));
const tests = domain === 'traceability'
  ? ['scripts/opportunity-v3/acceptance-traceability.test.mjs']
  : ['web/src/lib/opportunity-v3/opportunity-v3.test.ts'];
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...tests], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
if (result.status !== 0) process.exit(result.status ?? 1);

let httpEvidence = null;
if (flags['--base-url']) {
  try {
    httpEvidence = await auditHttpSurface(flags['--base-url']);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'V3 HTTP audit failed');
    process.exit(1);
  }
}
console.log(JSON.stringify({
  audit: domain,
  acceptanceVersion: '1.39.0',
  httpEvidence,
  httpStatus: httpEvidence ? 'pass' : 'not_run',
  acceptanceClassification: domain === 'traceability'
    ? { semantic_automated: 240, structural_meta: 6, elapsed_data_blocked: 20 }
    : null,
  status: domain === 'traceability' ? 'blocked' : 'pass',
  blockedReason: domain === 'traceability'
    ? '20 point-in-time outcome/evaluation cases require non-fabricated matured data'
    : null,
}));
