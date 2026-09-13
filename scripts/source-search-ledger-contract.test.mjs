import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const domain = readFileSync(new URL('../web/src/lib/domain.ts', import.meta.url), 'utf8');

test('public source search always loads the compact connector ledger summary', () => {
  assert.match(domain, /\n\s*loadLatestSourceRunLedger\(\),\n/u);
  assert.doesNotMatch(
    domain,
    /includeDiagnostics\s*\?\s*loadLatestSourceRunLedger\(\)\s*:\s*Promise\.resolve\(\[\]\)/u,
  );
});

test('historical connector runs and source audits remain diagnostics-only', () => {
  assert.match(domain, /includeDiagnostics\s*\?\s*supabase\s*\n\s*\.from\('connector_runs'\)/u);
  assert.match(domain, /includeDiagnostics\s*\?\s*auditsQuery\s*:\s*Promise\.resolve/u);
});
