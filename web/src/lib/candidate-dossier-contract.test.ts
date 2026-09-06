import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateDossierBundleId, candidateDossierInputHash, decodeCandidateDossierCursor, encodeCandidateDossierCursor, numberedCandidateSources } from './candidate-dossier-contract.ts';

test('candidate dossier cursors round trip and reject malformed input', () => {
  const cursor = { availableAt: '2026-09-06T10:00:00.000Z', revisionId: '11111111-1111-4111-8111-111111111111' };
  assert.deepEqual(decodeCandidateDossierCursor(encodeCandidateDossierCursor(cursor)), cursor);
  assert.equal(decodeCandidateDossierCursor('not-json'), null);
});

test('bundle IDs are deterministic UUIDs bound to input hash', () => {
  const hash = 'a'.repeat(64);
  assert.match(candidateDossierBundleId(hash), /^[0-9a-f-]{36}$/u);
  assert.equal(candidateDossierBundleId(hash), candidateDossierBundleId(hash));
  assert.notEqual(candidateDossierBundleId(hash), candidateDossierBundleId('b'.repeat(64)));
});

test('input hashes bind the exact article revision as well as its facts', () => {
  const base = { id: 'revision', fact_ids: ['fact'], summary: 'first', sections: [] };
  const facts = [{ fact_id: 'fact', fact_key: 'close', value: 100 }];
  assert.notEqual(candidateDossierInputHash(base, facts), candidateDossierInputHash({ ...base, summary: 'second' }, facts));
  assert.notEqual(candidateDossierInputHash(base, facts), candidateDossierInputHash(base, [{ ...facts[0], value: 101 }]));
});

test('sources are numbered, de-duplicated and paid InvestAnchors references are excluded', () => {
  const sources = numberedCandidateSources({ source_links: [{ label: 'IR', url: 'https://example.com/ir' }, { label: '定錨會員', url: 'https://investanchors.example/a' }] }, [
    { fact_key: 'revenue', source_url: 'https://example.com/ir', period_end: '2026-06-30', provenance: { locator: 'p.7' } },
    { fact_key: 'revenue', source_url: 'https://example.com/ir', period_end: '2026-06-30', provenance: { locator: 'p.7' } },
  ]);
  assert.deepEqual(sources.map((source) => source.referenceNumber), [1, 2]);
  assert.ok(sources.every((source) => !/investanchors/iu.test(source.url)));
});
