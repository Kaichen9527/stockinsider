import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateDossierBundleId, candidateDossierInputHash, candidateDossierReceiptMatchesRequest, compareCandidateDossierPageRows, decodeCandidateDossierCursor, encodeCandidateDossierCursor, numberedCandidateSources, sanitizeRevisionScopedDossierEvidence } from './candidate-dossier-contract.ts';
import { candidateDossierBundleHash } from './candidate-dossier-bundle.ts';

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
  const sources = numberedCandidateSources({ fact_ids: ['revenue-fact'], source_links: [{ label: 'IR', url: 'https://example.com/ir' }, { label: '定錨會員', url: 'https://investanchors.example/a' }] }, [
    { fact_id: 'revenue-fact', fact_key: 'revenue', source_url: 'https://example.com/ir', period_end: '2026-06-30', provenance: { locator: 'p.7' } },
    { fact_id: 'revenue-fact', fact_key: 'revenue', source_url: 'https://example.com/ir', period_end: '2026-06-30', provenance: { locator: 'p.7' } },
  ]);
  assert.deepEqual(sources.map((source) => source.referenceNumber), [1, 2]);
  assert.ok(sources.every((source) => !/investanchors/iu.test(source.url)));
});

test('revision evidence excludes other issuers, unadopted facts, future mentions and arbitrary links', () => {
  const detail = {
    id: '11111111-1111-4111-8111-111111111111', stock_id: 'stock-a', available_at: '2026-09-06T10:00:00.000Z',
    fact_ids: ['fact-c', 'fact-b', 'fact-a', 'missing'],
    source_links: [
      { platform: 'ptt', label: 'adopted mention', url: 'https://example.com/mention', publishedAt: '2026-09-06T09:00:00.000Z' },
      { platform: 'ptt', label: 'future mention', url: 'https://example.com/future', publishedAt: '2026-09-07T09:00:00.000Z' },
      { label: 'unbound', url: 'https://example.com/unbound' },
      { label: 'official fact', url: 'https://mops.twse.com.tw/fact' },
    ],
  };
  const facts = [
    { fact_id: 'fact-a', stock_id: 'stock-a', fact_key: 'revenue', available_at: '2026-09-06T08:00:00.000Z', source_url: 'https://mops.twse.com.tw/fact' },
    { fact_id: 'fact-b', stock_id: 'stock-b', fact_key: 'close', source_url: 'https://www.twse.com.tw/' },
    { fact_id: 'fact-c', stock_id: 'stock-a', fact_key: 'eps', available_at: '2026-09-07T10:00:00.000Z', source_url: 'https://mops.twse.com.tw/future-fact' },
    { fact_id: 'not-adopted', stock_id: 'stock-a', fact_key: 'eps', source_url: 'https://mops.twse.com.tw/other' },
  ];
  const scoped = sanitizeRevisionScopedDossierEvidence(detail, facts);
  assert.deepEqual(scoped.detail.fact_ids, ['fact-a']);
  assert.deepEqual(scoped.facts.map((fact) => fact.fact_id), ['fact-a']);
  assert.deepEqual((scoped.detail.source_links as Array<{ label: string }>).map((source) => source.label), ['adopted mention', 'official fact']);
});

test('bundle hashes ignore facts that were not adopted by the revision', () => {
  const detail = { id: 'revision', stock_id: 'stock-a', fact_ids: ['fact-a'] };
  const adopted = { fact_id: 'fact-a', stock_id: 'stock-a', value: 100 };
  const unrelated = { fact_id: 'fact-b', stock_id: 'stock-a', value: 999 };
  assert.equal(candidateDossierBundleHash(detail, [adopted]), candidateDossierBundleHash(detail, [adopted, unrelated]));
  assert.equal(candidateDossierInputHash(detail, [adopted]), candidateDossierInputHash(detail, [unrelated, adopted]));
});

test('page ordering and receipts are bound to the exact revision and hash', () => {
  const newer = { id: '22222222-2222-4222-8222-222222222222', available_at: '2026-09-06T10:00:00.000Z' };
  const older = { id: '11111111-1111-4111-8111-111111111111', available_at: '2026-09-05T10:00:00.000Z' };
  assert.deepEqual([older, newer].sort(compareCandidateDossierPageRows), [newer, older]);
  const expectation = { revisionId: newer.id, inputHash: 'a'.repeat(64) };
  const receipt = {
    ok: true, status: 'accepted', validationStatus: 'valid', revisionId: newer.id, inputHash: expectation.inputHash,
    submissionId: '33333333-3333-4333-8333-333333333333', dossierId: '44444444-4444-4444-8444-444444444444',
    rejectionReasons: [], idempotentReplay: false,
  };
  assert.equal(candidateDossierReceiptMatchesRequest(receipt, expectation), true);
  assert.equal(candidateDossierReceiptMatchesRequest({ ...receipt, revisionId: older.id }, expectation), false);
});
