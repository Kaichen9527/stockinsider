// Inactive recovery protocol candidate. Nothing imports this from the protected
// gate. A repository candidate cannot choose the trusted context or activate it.
import assert from 'node:assert/strict';
import { createHash, createPublicKey, verify } from 'node:crypto';

export const canonical = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
};
export const digest = value => createHash('sha256').update(value).digest('hex');
const keys = (value, expected) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'object required');
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), 'closed schema');
};
const hex = (value, length) => assert.match(value, new RegExp(`^[0-9a-f]{${length}}$`, 'u'));
function tuple(value) {
  keys(value, ['commit', 'tree', 'listingSha256']);
  hex(value.commit, 40); hex(value.tree, 40); hex(value.listingSha256, 64);
}
function signature(payload, encoded, pem) {
  assert.match(encoded, /^[A-Za-z0-9+/]{86}==$/u, 'Ed25519 signature encoding');
  assert.equal(Buffer.from(encoded, 'base64').toString('base64'), encoded, 'canonical signature encoding');
  const key = createPublicKey(pem);
  assert.equal(key.asymmetricKeyType, 'ed25519', 'external Ed25519 authority');
  assert.ok(verify(null, Buffer.from(canonical(payload)), key, Buffer.from(encoded, 'base64')), 'signature verification');
}

/** Pure validation only. trusted is supplied by an independently installed
 * control plane, NEVER decoded from a candidate file, flag or environment.
 * The consumer must atomically reserve the transition before performing any
 * action. This return value is neither a Code Gate PASS nor activation. */
export function verifyRecoveryPacket(bytes, trusted) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 128 * 1024, 'bounded packet');
  const packet = JSON.parse(bytes.toString('utf8'));
  assert.ok(bytes.equals(Buffer.from(`${canonical(packet)}\n`)), 'canonical UTF-8 packet with one LF');
  keys(packet, ['payload', 'reviews', 'authoritySignature']);
  const p = packet.payload;
  keys(p, ['schema', 'repository', 'authorityId', 'nonce', 'issuedAt', 'expiresAt',
    'predecessor', 'candidate', 'activeGraphSha256', 'hostFixtureSha256',
    'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256', 'makerId']);
  assert.equal(p.schema, 'stockinsider-host-recovery-v1');
  assert.equal(p.repository, 'Kaichen9527/stockinsider');
  assert.equal(p.authorityId, trusted.authorityId);
  hex(p.nonce, 64);
  tuple(p.predecessor); tuple(p.candidate);
  for (const name of ['activeGraphSha256', 'hostFixtureSha256', 'nativeIdentitySha256',
    'recoveryVerifierSha256', 'permissionPolicySha256']) hex(p[name], 64);
  assert.equal(typeof p.makerId, 'string'); assert.ok(p.makerId.length > 0);
  for (const name of ['issuedAt', 'expiresAt']) {
    assert.match(p[name], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u);
    assert.equal(new Date(p[name]).toISOString(), p[name]);
  }
  const issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt);
  assert.ok(Number.isSafeInteger(trusted.nowMs), 'trusted clock');
  assert.ok(issued <= trusted.nowMs && trusted.nowMs < expires && expires - issued <= 24 * 60 * 60 * 1000,
    'current bounded authority window');
  // All observed tuples/digests come from immutable Git objects and independently
  // measured host/code bytes in the external control plane. No candidate execution.
  for (const name of ['predecessor', 'candidate', 'activeGraphSha256', 'hostFixtureSha256',
    'nativeIdentitySha256', 'recoveryVerifierSha256', 'permissionPolicySha256', 'makerId'])
    assert.deepEqual(p[name], trusted[name], `trusted ${name} binding`);
  assert.notEqual(p.predecessor.commit, p.candidate.commit, 'actual transition');
  assert.notEqual(p.predecessor.listingSha256, p.candidate.listingSha256, 'actual successor');
  assert.ok(Array.isArray(packet.reviews) && packet.reviews.length === 3, 'three independent review roles');
  const identities = new Set([p.makerId]);
  const publicKeys = new Set();
  for (const [index, role] of ['requirements', 'architecture', 'exact-review'].entries()) {
    const review = packet.reviews[index];
    keys(review, ['role', 'reviewerId', 'evidenceSha256', 'payloadSha256', 'verdict', 'signature']);
    assert.equal(review.role, role);
    assert.equal(review.verdict, 'PASS');
    assert.equal(review.payloadSha256, digest(canonical(p)));
    hex(review.evidenceSha256, 64);
    assert.equal(typeof review.reviewerId, 'string');
    assert.ok(!identities.has(review.reviewerId), 'maker and review principals are distinct');
    identities.add(review.reviewerId);
    const source = trusted.reviewSources[role];
    const fingerprint = digest(createPublicKey(source.publicKey).export({ type: 'spki', format: 'der' }));
    assert.ok(!publicKeys.has(fingerprint), 'distinct independent reviewer keys');
    publicKeys.add(fingerprint);
    assert.equal(review.reviewerId, source.reviewerId, 'external reviewer authority');
    assert.equal(review.evidenceSha256, digest(source.evidenceBytes), 'exact independent evidence');
    const { signature: signed, ...statement } = review;
    signature(statement, signed, source.publicKey);
  }
  signature({ payload: p, reviews: packet.reviews }, packet.authoritySignature, trusted.authorityPublicKey);
  // Key is predecessor-scoped, not nonce-scoped: a second nonce/signature cannot
  // reuse a consumed predecessor. External storage must use a durable atomic CAS.
  return Object.freeze({ schema: 'stockinsider-host-recovery-validated-v1',
    transitionKey: digest(canonical([p.repository, p.predecessor])),
    packetSha256: digest(bytes), candidateCommit: p.candidate.commit,
    authority: 'external_recovery_validation_only', protectedGatePassed: false });
}

/** reserve must be a durable atomic compare-and-set in the trusted control
 * plane. A false result or exception leaves recovery closed. A consumed record
 * is never removed, including when subsequent execution fails. */
export async function reserveRecoveryPacket(bytes, trusted, reserve) {
  const receipt = verifyRecoveryPacket(bytes, trusted);
  assert.equal(typeof reserve, 'function', 'external atomic ledger required');
  assert.equal(await reserve(receipt.transitionKey, receipt.packetSha256), true, 'predecessor already reserved or ledger unavailable');
  return receipt;
}
