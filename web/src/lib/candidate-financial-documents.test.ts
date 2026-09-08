import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateFinancialDocumentObjectKey,
  parseCandidateFinancialDocumentMetadata,
  readBoundedCandidateFinancialDocument,
  validateCandidateFinancialDocument,
} from './candidate-financial-documents.ts';

const metadata = JSON.stringify({
  stockId: '10000000-0000-4000-8000-000000000001', symbol: '2330', exchange: 'TWSE',
  periodEnd: '2026-06-30', sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb01',
  publishedAt: '2026-08-10T00:00:00Z', acquisitionJobId: null,
});

test('candidate document metadata is exact, source-bound and content-addressed', () => {
  const parsed = parseCandidateFinancialDocumentMetadata(metadata);
  assert.ok(parsed);
  assert.equal(candidateFinancialDocumentObjectKey({ stockId: parsed.stockId, periodEnd: parsed.periodEnd, sha256: 'a'.repeat(64) }),
    `issuer/${parsed.stockId}/2026-06-30/${'a'.repeat(64)}`);
  assert.equal(parseCandidateFinancialDocumentMetadata(JSON.stringify({ ...JSON.parse(metadata), facts: [] })), null);
  assert.equal(parseCandidateFinancialDocumentMetadata(JSON.stringify({ ...JSON.parse(metadata), sourceUrl: 'https://user:pass@mops.twse.com.tw/x' })), null);
});

test('candidate documents reject MIME confusion and XML external entities', () => {
  assert.deepEqual(validateCandidateFinancialDocument({ bytes: new TextEncoder().encode('%PDF-1.7\nbody'), contentType: 'text/html' }), { error: 'document_mime_magic_mismatch' });
  assert.deepEqual(validateCandidateFinancialDocument({
    bytes: new TextEncoder().encode('<?xml version="1.0"?><!DOCTYPE x [ <!ENTITY x SYSTEM "https://bad.invalid"> ]><xbrl/>'),
    contentType: 'application/xml',
  }), { error: 'document_external_entity_rejected' });
  const lateDtd = `<?xml version="1.0"?><xbrl>${' '.repeat(16_385)}<!DOCTYPE x [ <!ENTITY x SYSTEM "https://bad.invalid"> ]></xbrl>`;
  assert.deepEqual(validateCandidateFinancialDocument({
    bytes: new TextEncoder().encode(lateDtd), contentType: 'application/xml',
  }), { error: 'document_external_entity_rejected' });
});

test('candidate document ingress hashes a bounded stream', async () => {
  const bytes = new TextEncoder().encode('<html>issuer filing</html>');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes); controller.close(); } });
  const stored = await readBoundedCandidateFinancialDocument(stream);
  assert.equal(stored.byteLength, bytes.byteLength);
  assert.match(stored.sha256, /^[0-9a-f]{64}$/u);
});
