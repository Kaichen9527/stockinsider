import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { canonical, digest, verifyRecoveryPacket, reserveRecoveryPacket } from './host-recovery-packet.mjs';

function fixture() {
  const authority = generateKeyPairSync('ed25519');
  const p = { schema: 'stockinsider-host-recovery-v1', repository: 'Kaichen9527/stockinsider',
    authorityId: 'external-owner-1', nonce: 'a'.repeat(64),
    issuedAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-04T01:00:00.000Z',
    predecessor: { commit: '1'.repeat(40), tree: '2'.repeat(40), listingSha256: '3'.repeat(64) },
    candidate: { commit: '4'.repeat(40), tree: '5'.repeat(40), listingSha256: '6'.repeat(64) },
    activeGraphSha256: '7'.repeat(64), hostFixtureSha256: '8'.repeat(64),
    nativeIdentitySha256: '9'.repeat(64), recoveryVerifierSha256: 'a'.repeat(64),
    permissionPolicySha256: 'b'.repeat(64), makerId: 'maker' };
  const pem = key => key.export({ type: 'spki', format: 'pem' });
  const signed = (payload, key) => sign(null, Buffer.from(canonical(payload)), key).toString('base64');
  const trusted = { ...structuredClone(p), nowMs: Date.parse('2026-10-04T00:30:00.000Z'),
    authorityPublicKey: pem(authority.publicKey), reviewSources: {} };
  const reviews = ['requirements', 'architecture', 'exact-review'].map(role => {
    const keys = generateKeyPairSync('ed25519'), evidenceBytes = Buffer.from(`independent ${role}`);
    trusted.reviewSources[role] = { reviewerId: role, evidenceBytes, publicKey: pem(keys.publicKey) };
    const statement = { role, reviewerId: role, evidenceSha256: digest(evidenceBytes),
      payloadSha256: digest(canonical(p)), verdict: 'PASS' };
    return { ...statement, signature: signed(statement, keys.privateKey) };
  });
  const packet = { payload: p, reviews };
  packet.authoritySignature = signed(packet, authority.privateKey);
  return { packet, trusted, bytes: () => Buffer.from(`${canonical(packet)}\n`) };
}

test('signed exact packet validates without claiming a protected gate or activation', () => {
  const f = fixture(), receipt = verifyRecoveryPacket(f.bytes(), f.trusted);
  assert.equal(receipt.protectedGatePassed, false);
  assert.equal(receipt.candidateCommit, f.packet.payload.candidate.commit);
});
for (const field of ['predecessor', 'candidate', 'activeGraphSha256', 'hostFixtureSha256',
  'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256', 'makerId']) {
  test(`rejects changed trusted ${field} even with valid candidate signatures`, () => {
    const f = fixture();
    f.trusted[field] = typeof f.trusted[field] === 'object'
      ? { ...f.trusted[field], tree: '0'.repeat(40) } : '0'.repeat(64);
    assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted), /trusted .* binding/u);
  });
}
test('rejects duplicate JSON keys, alternate encoding, unknown members, and oversized packets', () => {
  const f = fixture();
  for (const bytes of [Buffer.from(f.bytes().toString().replace('"payload":', '"payload":null,"payload":')),
    Buffer.from(JSON.stringify(f.packet, null, 2)), Buffer.concat([f.bytes(), Buffer.from('\n')]),
    Buffer.from(`${canonical({ ...f.packet, activated: true })}\n`), Buffer.alloc(128 * 1024 + 1)])
    assert.throws(() => verifyRecoveryPacket(bytes, f.trusted));
});
test('rejects expired, future and excessive authority windows', () => {
  for (const now of ['2026-10-03T23:59:59.999Z', '2026-10-04T01:00:00.000Z']) {
    const f = fixture(); f.trusted.nowMs = Date.parse(now);
    assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted), /authority window/u);
  }
  const f = fixture(); f.packet.payload.expiresAt = '2026-10-06T00:00:00.000Z';
  assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted), /authority window/u);
});
test('candidate-selected authority key, altered signatures, and unsigned claims fail', () => {
  const f = fixture();
  f.trusted.authorityPublicKey = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted), /signature verification/u);
  f.packet.authoritySignature = '';
  assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted), /signature encoding/u);
});
test('reviews must bind exact bytes, full recovery payload, role, and external principal', () => {
  for (const mutate of [
    f => { f.packet.reviews[0].reviewerId = 'maker'; },
    f => { f.packet.reviews[1].reviewerId = 'requirements'; },
    f => { f.packet.reviews[0].payloadSha256 = '0'.repeat(64); },
    f => { f.trusted.reviewSources.requirements.evidenceBytes = Buffer.from('changed'); },
    f => { f.packet.reviews.reverse(); },
    f => { f.packet.reviews.pop(); },
    f => { f.packet.reviews[0].verdict = 'PENDING'; },
    f => { f.packet.reviews[0].signature = 'A'.repeat(86) + '=='; },
    f => { f.trusted.reviewSources.architecture.publicKey = f.trusted.reviewSources.requirements.publicKey; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => verifyRecoveryPacket(f.bytes(), f.trusted)); }
});
test('one predecessor may be reserved once; validation alone never consumes it', async () => {
  const f = fixture(), ledger = new Map();
  const reserve = async (key, value) => { if (ledger.has(key)) return false; ledger.set(key, value); return true; };
  verifyRecoveryPacket(f.bytes(), f.trusted); assert.equal(ledger.size, 0);
  const results = await Promise.allSettled([reserveRecoveryPacket(f.bytes(), f.trusted, reserve),
    reserveRecoveryPacket(f.bytes(), f.trusted, reserve)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(ledger.size, 1);
  await assert.rejects(() => reserveRecoveryPacket(f.bytes(), f.trusted, reserve), /already reserved/u);
});
test('missing or unavailable external ledger cannot authorize recovery', async () => {
  const f = fixture();
  await assert.rejects(() => reserveRecoveryPacket(f.bytes(), f.trusted), /ledger required/u);
  await assert.rejects(() => reserveRecoveryPacket(f.bytes(), f.trusted, async () => { throw Error('offline'); }), /offline/u);
  await assert.rejects(() => reserveRecoveryPacket(f.bytes(), f.trusted, async () => false), /ledger unavailable/u);
});
