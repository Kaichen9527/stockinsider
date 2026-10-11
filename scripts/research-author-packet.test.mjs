import test from 'node:test';
import assert from 'node:assert/strict';
import { projectResearchAuthorPacket } from '../web/src/lib/research-author-packet.ts';
import { FinancialDeadline } from '../web/src/lib/research-financial-file-reader.ts';
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { authorPacketFixture } from './research-author-packet-fixture.mjs';
import { randomUUID } from 'node:crypto';

const project = (f, deadline = new FinancialDeadline(), now) => projectResearchAuthorPacket(
  f.request, f.revision, f.assignment, f.response, deadline, now);
for (const symbol of ['2409', '2383']) test(symbol + ' public sources and actual fixed financial calculator share sealed input; model-safe projection', async () => {
  const f = await authorPacketFixture(symbol), before = JSON.stringify(f), r = project(f);
  assert.equal(JSON.stringify(f), before); assert.equal(completeHash(r.packet), r.packetHash);
  assert.equal(r.packet.researchIdentity.symbol, symbol);
  assert.deepEqual(r.packet.financial.calculation, f.revision.canonical_payload.financial.material.calculation);
  assert.equal(r.packet.sources[0].descriptor.publication.precision, 'unknown');
  assert.equal(r.packet.sources[0].descriptor.publication.instant, null);
  assert.equal(r.packet.sources[0].unverifiedPublicationClaim, '2026-10-08T00:00:00Z');
  for (const key of ['job_id', 'reservation_id', 'controller_principal', 'canonical_request', 'work_owner', 'originalJob', 'originalReservation'])
    assert.equal(JSON.stringify(r).includes('"' + key + '"'), false);
  for (const privateValue of [f.request.input.owner, f.request.input.jobId, f.request.input.reservationId])
    assert.equal(JSON.stringify(r).includes(privateValue), false);
  assert.ok(Object.values(r.packet.capabilities).every(v => v === false));
  assert.equal(r.dispatchReady, false); assert.equal(r.modelDispatched, false);
  r.packet.sources[0].summary = 'changed'; assert.equal(JSON.stringify(f), before);
});
const mutations = {
  'different input revision': f => { f.response.inputRevisionId = f.request.input.jobId; },
  'different source row': f => { f.response.sources[0].descriptor.rowHash = 'c'.repeat(64); },
  'missing selected source': f => { f.response.sources = []; },
  'extra source': f => { f.response.sources.push(structuredClone(f.response.sources[0])); },
  'extra private source field': f => { f.response.sources[0].content_text = 'private member text'; },
  'private source descriptor': f => { f.response.sources[0].descriptor.rights = 'bounded_summary_only'; },
  'withdrawn source': f => { f.response.sources[0].descriptor.retracted = true; },
  'wrong company': f => { f.response.sources[0].descriptor.symbols = ['9999']; },
  'industry source invents company symbol': f => { f.response.sources[0].descriptor.scope = 'industry_context'; },
  'legacy midnight promoted to instant': f => { f.response.sources[0].descriptor.publication = { precision: 'instant', raw: '2026-10-08T00:00:00Z', timezone: 'UTC', instant: '2026-10-08T00:00:00Z' }; },
  'unknown publication with fabricated date': f => { f.response.sources[0].descriptor.publication.raw = '2026-10-08'; },
  'observation after collection': f => { f.response.sources[0].descriptor.observedAt = '2099-01-01T00:00:00Z'; },
  'collection after seal receipt': f => { f.response.sources[0].collectedAt = '2099-01-01T00:00:00Z'; },
  'different seal receipt': f => { f.response.sources[0].descriptor.admittedAt = '2026-10-08T14:02:00Z'; },
  'future seal receipt': f => { f.response.sourceSealReceivedAt = '2099-01-01T00:00:00Z'; },
  'credential URL': f => { f.response.sources[0].descriptor.url = 'https://example.com/?api_key=private'; },
  'private host': f => { f.response.sources[0].descriptor.url = 'https://localhost/secret'; },
  'source secret text': f => { f.response.sources[0].summary = 'cookie=do-not-export'; },
  'source untrusted flag removed': f => { f.response.sources[0].untrustedEvidence = false; },
  'extra RPC field': f => { f.response.principal = 'e'.repeat(64); },
  'wrong original assignment': f => { f.assignment.reservation_expires_at = '2099-01-01T00:00:00Z'; f.response.assignment = structuredClone(f.assignment); },
  'different original assignment': f => { f.response.assignment.work_owner = 'different'; },
};
for (const [name, mutate] of Object.entries(mutations)) test('reject ' + name, async () => {
  const f = await authorPacketFixture(); mutate(f); assert.throws(() => project(f));
});
for (const [field, limit] of [['title', 512], ['summary', 4096], ['catalyst', 2048], ['risk', 2048], ['platform', 80]])
  test(field + ' exact UTF8 byte boundary accepted, +1 rejected without truncation', async () => {
    const f = await authorPacketFixture(); f.response.sources[0][field] = 'a'.repeat(limit); assert.ok(project(f));
    f.response.sources[0][field] += 'b'; assert.throws(() => project(f));
    f.response.sources[0][field] = '友'.repeat(Math.floor(limit / 3)) + 'a'.repeat(limit % 3); assert.ok(project(f));
    f.response.sources[0][field] += 'a'; assert.throws(() => project(f));
  });
test('original expiry at exact microsecond and expiry crossed during calculation reject', async () => {
  const f = await authorPacketFixture(), prefix = new Date(Date.now() + 3600_000).toISOString().slice(0, 19);
  const expiry = prefix + '.123456Z', justBefore = prefix + '.123455Z';
  f.revision.canonical_payload.originalJob.leaseExpiresAt = expiry;
  f.revision.input_hash = completeHash(f.revision.canonical_payload); f.request.inputHash = f.revision.input_hash;
  f.assignment.input_hash = f.request.inputHash; f.assignment.original_job_deadline = expiry;
  f.response.inputHash = f.request.inputHash; f.response.assignment = structuredClone(f.assignment);
  f.revision.canonical_payload.originalReservation.leaseExpiresAt = expiry;
  f.revision.input_hash = completeHash(f.revision.canonical_payload); f.request.inputHash = f.revision.input_hash;
  f.assignment.input_hash = f.request.inputHash; f.assignment.reservation_expires_at = expiry;
  f.response.inputHash = f.request.inputHash; f.response.assignment = structuredClone(f.assignment);
  assert.ok(project(f, new FinancialDeadline(), () => justBefore));
  assert.throws(() => project(f, new FinancialDeadline(), () => expiry));
  let checks = 0;
  assert.throws(() => project(f, new FinancialDeadline(), () => ++checks === 1 ? justBefore : expiry));
});
test('aggregate compact source JSON exact300KiB accepted; +1 rejected without dropping a source', async () => {
  const f = await authorPacketFixture(), template = f.response.sources[0], p = f.revision.canonical_payload;
  f.response.sources = Array.from({ length: 30 }, () => {
    const source = structuredClone(template); source.descriptor.id = randomUUID();
    source.descriptor.url = 'https://example.com/' + 'x'.repeat(800 - 20);
    source.descriptor.symbols = ['2409', ...Array.from({ length: 49 }, (_, i) => String(i).padStart(4, '0'))];
    source.title = 'x'.repeat(512); source.summary = 'x'.repeat(4096);
    source.catalyst = source.risk = 'x'.repeat(2048); source.platform = 'x'.repeat(80); return source;
  });
  let removedFrom;
  for (const source of f.response.sources) {
    const extra = Buffer.byteLength(JSON.stringify(f.response.sources)) - 307200;
    if (extra <= 0) break;
    source.summary = source.summary.slice(0, source.summary.length - Math.min(extra, source.summary.length - 1)); removedFrom = source;
  }
  assert.equal(Buffer.byteLength(JSON.stringify(f.response.sources)), 307200);
  p.sources.manifest = f.response.sources.map(s => ({ id: s.descriptor.id, rowHash: s.descriptor.rowHash }));
  f.revision.input_hash = completeHash(p); f.request.inputHash = f.revision.input_hash;
  f.assignment.input_hash = f.request.inputHash; f.response.inputHash = f.request.inputHash;
  f.response.assignment = structuredClone(f.assignment); assert.ok(project(f));
  removedFrom.summary += 'x'; assert.equal(Buffer.byteLength(JSON.stringify(f.response.sources)), 307201);
  assert.throws(() => project(f));
});
test('same original deadline covers recompute and serialization checks, no restarted budget', async () => {
  const f = await authorPacketFixture(); let checks = 0;
  const deadline = { check() { if (++checks === 3) throw new Error('financial_deadline'); } };
  assert.throws(() => project(f, deadline), /financial_deadline/);
});
test('financial tamper rejects despite rebinding all caller hashes; no assumption promotion', async () => {
  const f = await authorPacketFixture(), p = f.revision.canonical_payload;
  p.financial.material.calculation.scenarios[1].nextFourUnreported.dilutedEpsConditional += 1;
  p.hashes.resultHash = completeHash(p.financial.material.calculation);
  f.revision.input_hash = completeHash(p); f.request.inputHash = f.revision.input_hash;
  f.response.inputHash = f.request.inputHash; f.assignment.input_hash = f.request.inputHash;
  f.response.assignment = structuredClone(f.assignment); assert.throws(() => project(f));
});
test('empty manifest retains sources-not-selected gap, no invented receipt or authority', async () => {
  const f = await authorPacketFixture(), p = f.revision.canonical_payload;
  p.sources.manifest = []; p.gaps.push({ namespace: 'source', reason: 'sources_not_selected' });
  f.revision.input_hash = completeHash(p); f.request.inputHash = f.revision.input_hash;
  f.assignment.input_hash = f.request.inputHash; f.response.inputHash = f.request.inputHash;
  f.response.assignment = structuredClone(f.assignment); f.response.sources = []; f.response.sourceSealReceivedAt = null;
  const r = project(f); assert.deepEqual(r.packet.sources, []); assert.equal(r.packet.sourceSealReceivedAt, null);
  f.response.sourceSealReceivedAt = new Date().toISOString(); assert.throws(() => project(f));
});
