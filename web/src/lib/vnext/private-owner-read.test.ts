import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import test from 'node:test';
import { createPrivateOwnerReadBoundary, type OwnerReadTrust } from './private-owner-read.ts';

// Invented NONPRODUCTION issuer, never written to a key file or configured.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const jwk = publicKey.export({ format: 'jwk' });
const metadataId = '00000000-0000-4000-8000-000000000001';
const revisionId = '00000000-0000-4000-8000-000000000002';
const time = 1_800_000_000;
const trust: OwnerReadTrust = {
  issuer: 'https://nonproduction-owner-issuer.invalid', audience: 'NONPRODUCTION-owner-metadata',
  ownerSubjects: ['NONPRODUCTION_owner_0001'],
  publicKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: jwk.x! }, metadataIds: [metadataId],
};
function claims() {
  return { iss: trust.issuer, aud: trust.audience, sub: trust.ownerSubjects[0], scope: 'owner:read', iat: time, nbf: time, exp: time + 300 };
}
function encode(value: unknown) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function signed(payload: unknown = claims(), header: unknown = { alg: 'EdDSA', typ: 'owner-read+jwt' }, key: KeyObject = privateKey) {
  const input = `${encode(header)}.${encode(payload)}`;
  return `${input}.${sign(null, Buffer.from(input), key).toString('base64url')}`;
}
function request(token: string) { return new Request('https://nonproduction.invalid/private', { headers: { Authorization: `Bearer ${token}` } }); }
function fixture() {
  let current = time;
  const boundary = createPrivateOwnerReadBoundary(trust, () => current);
  return { boundary, advance: (next: number) => { current = next; }, capability: () => boundary.authenticate(request(signed())) };
}
const query = { metadataId };
const metadata = { metadataId, revisionId, status: 'available' };
function noStore(response: Response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('surrogate-control'), 'no-store');
  assert.equal(response.headers.get('pragma'), 'no-cache');
  assert.equal(response.headers.get('expires'), '0');
  assert.equal(response.headers.get('vary'), 'Authorization');
}
async function deniedTokens(tokens: string[]) {
  const { boundary } = fixture(); let calls = 0;
  for (const token of tokens) {
    const cap = boundary.authenticate(request(token)); assert.equal(cap, null);
    const response = await boundary.respond(cap, query, async () => { calls++; return metadata; });
    assert.equal(response.status, 401); noStore(response);
  }
  assert.equal(calls, 0);
}

test('T02 default/null/invalid trusted public-only configuration disables with zero reader calls', async () => {
  const invalid = [undefined, null, { ...trust, owner: true }, { ...trust, ownerSubjects: [] },
    { ...trust, metadataIds: [] }, { ...trust, publicKeyJwk: { ...trust.publicKeyJwk, d: 'NONPRODUCTION_REJECT' } },
    { ...trust, publicKeyJwk: { ...trust.publicKeyJwk, jku: 'https://nonproduction.invalid/key' } },
    { ...trust, publicKeyJwk: { ...trust.publicKeyJwk, x: 'invalid' } },
    { ...trust, ownerSubjects: ['owner@example.invalid'] }, { ...trust, metadataIds: [metadataId, metadataId] }];
  let calls = 0;
  for (const config of invalid) {
    const boundary = createPrivateOwnerReadBoundary(config as OwnerReadTrust | null);
    assert.equal(boundary.authenticate(request(signed())), null);
    const response = await boundary.respond({}, query, async () => { calls++; return metadata; });
    assert.equal(response.status, 503); noStore(response);
  }
  assert.equal(calls, 0);
});

test('T02 independently signed capability permits only bounded allowlisted metadata without identity/token extras', async () => {
  const { boundary, capability } = fixture(); const cap = capability(); assert.ok(cap);
  assert.deepEqual(Object.keys(cap), []); assert.ok(Object.isFrozen(cap));
  let calls = 0;
  const response = await boundary.respond(cap, query, async input => {
    calls++; assert.deepEqual(input, query); assert.ok(Object.isFrozen(input));
    return { ...metadata, unexpected: 'NONPRODUCTION_DROP_SENTINEL', principal: 'NONPRODUCTION_DROP_SUBJECT' };
  });
  assert.equal(calls, 1); assert.equal(response.status, 200); noStore(response);
  assert.deepEqual(await response.json(), { ok: true, metadata });
});

test('T02 exact issuer/audience/opaque owner/scope and closed claim keys reject nonowners and caller flags', async () => {
  await deniedTokens([
    signed({ ...claims(), iss: 'https://other.invalid' }), signed({ ...claims(), aud: 'other' }),
    signed({ ...claims(), sub: 'NONPRODUCTION_nonowner_01' }), signed({ ...claims(), scope: 'operator' }),
    signed({ ...claims(), scope: ['owner:read'] }), signed({ ...claims(), owner: true }),
    signed({ ...claims(), key: trust.publicKeyJwk }), signed({ ...claims(), aud: [trust.audience] }),
  ]);
});

test('T02 future/expired/oversized lifetime and noninteger or contradictory timestamps fail closed', async () => {
  await deniedTokens([
    signed({ ...claims(), exp: time }), signed({ ...claims(), exp: time + 301 }),
    signed({ ...claims(), iat: time + 1 }), signed({ ...claims(), nbf: time + 1 }),
    signed({ ...claims(), nbf: time - 1 }), signed({ ...claims(), iat: time + 0.1 }),
    signed({ ...claims(), exp: String(time + 300) }), signed({ ...claims(), iat: -1 }),
  ]);
});

test('T02 fixed JWS algorithm/type/no key selection rejects alternate protected headers', async () => {
  await deniedTokens([
    signed(claims(), { alg: 'none', typ: 'owner-read+jwt' }), signed(claims(), { alg: 'HS256', typ: 'owner-read+jwt' }),
    signed(claims(), { alg: 'EdDSA', typ: 'JWT' }), signed(claims(), { alg: 'EdDSA', typ: 'owner-read+jwt', kid: 'caller' }),
    signed(claims(), { alg: 'EdDSA', typ: 'owner-read+jwt', jku: 'https://other.invalid' }),
    signed(claims(), { alg: 'EdDSA', typ: 'owner-read+jwt', x5u: 'https://other.invalid' }),
  ]);
});

test('T02 tampered/wrong-key signatures never mint capabilities', async () => {
  const token = signed(); const [header, payload, signature] = token.split('.');
  const otherKey = generateKeyPairSync('ed25519').privateKey;
  const changedSignature = Buffer.from(signature, 'base64url'); changedSignature[0] ^= 1;
  await deniedTokens([
    `${header}.${encode({ ...claims(), exp: time + 299 })}.${signature}`,
    `${header}.${payload}.${changedSignature.toString('base64url')}`, signed(claims(), undefined, otherKey),
  ]);
});

test('T02 canonical encoding/closed parsing rejects duplicate keys, malformed, padded and oversized JWS', async () => {
  const header = encode({ alg: 'EdDSA', typ: 'owner-read+jwt' });
  function raw(json: string) {
    const input = `${header}.${Buffer.from(json).toString('base64url')}`;
    return `${input}.${sign(null, Buffer.from(input), privateKey).toString('base64url')}`;
  }
  await deniedTokens(['', 'not-a-jws', 'a.b.c.d', signed() + '=', 'x'.repeat(2049),
    raw('{"sub":"duplicate",' + JSON.stringify(claims()).slice(1)), raw(JSON.stringify(claims()) + ' '), raw('[]'), raw('null'), raw('{')]);
});

test('T02 absent auth, worker bearer tokens and internal key never fall back to worker authority', async () => {
  await deniedTokens(['NONPRODUCTION_operator_token', 'NONPRODUCTION_author_token', 'NONPRODUCTION_reviewer_token']);
  const { boundary } = fixture();
  assert.equal(boundary.authenticate(new Request('https://nonproduction.invalid')), null);
  const internal = request(signed()); internal.headers.set('x-internal-key', 'NONPRODUCTION_worker');
  assert.equal(boundary.authenticate(internal), null);
});

test('T02 forged/copied/serialized/cross-instance capabilities reject with zero reader calls', async () => {
  const first = fixture(); const second = fixture(); const cap = first.capability(); assert.ok(cap);
  let calls = 0;
  for (const fake of [null, {}, { owner: true }, { ...cap }, JSON.parse(JSON.stringify(cap)), cap]) {
    const response = await second.boundary.respond(fake, query, async () => { calls++; return metadata; });
    assert.equal(response.status, 401); noStore(response);
  }
  assert.equal(calls, 0);
});

test('T02 unallowlisted/malformed/extra metadata query rejects before reader invocation', async () => {
  const { boundary, capability } = fixture(); let calls = 0;
  const throwingQuery = Object.defineProperty({}, 'metadataId', { enumerable: true, get() { throw Error('NONPRODUCTION_QUERY'); } });
  for (const bad of [null, {}, { metadataId: revisionId }, { metadataId, owner: true }, { metadataId, issuer: trust.issuer }, throwingQuery]) {
    const response = await boundary.respond(capability(), bad, async () => { calls++; return metadata; });
    assert.equal(response.status, 403); noStore(response);
  }
  assert.equal(calls, 0);
});

test('T02 expiry is checked again immediately before metadata callback', async () => {
  const { boundary, capability, advance } = fixture(); const cap = capability(); advance(time + 300);
  let calls = 0; const response = await boundary.respond(cap, query, async () => { calls++; return metadata; });
  assert.equal(response.status, 401); noStore(response); assert.equal(calls, 0);
});

test('T02 capability expiry during callback suppresses even valid late metadata', async () => {
  const { boundary, capability, advance } = fixture();
  const response = await boundary.respond(capability(), query, async () => { advance(time + 300); return metadata; });
  assert.equal(response.status, 401); noStore(response);
  assert.deepEqual(await response.json(), { ok: false, error: 'owner_read_unauthorized' });
});

test('T02 invalid or throwing trusted server clock denies mint/read and late response', async () => {
  for (const invalid of [NaN, Infinity, -1, time + 0.5, time - 1]) {
    const f = fixture(); f.advance(invalid); assert.equal(f.capability(), null);
    const g = fixture(); const cap = g.capability(); g.advance(invalid); let calls = 0;
    assert.equal((await g.boundary.respond(cap, query, async () => { calls++; return metadata; })).status, 401);
    assert.equal(calls, 0);
  }
  const boundary = createPrivateOwnerReadBoundary(trust, () => { throw Error('NONPRODUCTION_CLOCK'); });
  assert.equal(boundary.authenticate(request(signed())), null);
  const f = fixture(); const cap = f.capability();
  assert.equal((await f.boundary.respond(cap, query, async () => { f.advance(NaN); return metadata; })).status, 401);
});

test('T02 malformed/throwing reader yields fixed sanitized no-store failures', async () => {
  const { boundary, capability } = fixture();
  for (const output of [null, { ...metadata, metadataId: revisionId }, { ...metadata, revisionId: 'invalid' }, { ...metadata, status: 'unknown' }]) {
    const response = await boundary.respond(capability(), query, async () => output);
    assert.equal(response.status, 503); noStore(response);
    assert.deepEqual(await response.json(), { ok: false, error: 'owner_read_unavailable' });
  }
  const response = await boundary.respond(capability(), query, async () => { throw Error('NONPRODUCTION_ERROR_SENTINEL'); });
  assert.equal(response.status, 503); noStore(response);
  assert.deepEqual(await response.json(), { ok: false, error: 'owner_read_unavailable' });
});

test('T02 trusted allowlists are snapshotted and cannot mutate after construction', async () => {
  const config = { ...trust, ownerSubjects: [...trust.ownerSubjects], metadataIds: [...trust.metadataIds], publicKeyJwk: { ...trust.publicKeyJwk } };
  const boundary = createPrivateOwnerReadBoundary(config, () => time);
  config.ownerSubjects.push('NONPRODUCTION_nonowner_01'); config.metadataIds.push(revisionId); config.publicKeyJwk.x = 'invalid';
  assert.equal(boundary.authenticate(request(signed({ ...claims(), sub: 'NONPRODUCTION_nonowner_01' }))), null);
  const cap = boundary.authenticate(request(signed())); assert.ok(cap);
  const response = await boundary.respond(cap, { metadataId: revisionId }, async () => metadata);
  assert.equal(response.status, 403); noStore(response);
});

test('T02 accessor query is rejected without invocation and descriptor-time expiry prevents reader IO', async () => {
  const f = fixture(); const cap = f.capability(); let calls = 0; let getters = 0;
  const accessor = Object.defineProperty({}, 'metadataId', { enumerable: true, get() { getters++; f.advance(time + 300); return metadataId; } });
  const denied = await f.boundary.respond(cap, accessor, async () => { calls++; return metadata; });
  assert.equal(denied.status, 403); noStore(denied); assert.equal(getters, 0);
  const delayed = new Proxy(query, { getOwnPropertyDescriptor(target, key) {
    f.advance(time + 300); return Object.getOwnPropertyDescriptor(target, key);
  } });
  const expired = await f.boundary.respond(cap, delayed, async () => { calls++; return metadata; });
  assert.equal(expired.status, 401); noStore(expired); assert.equal(calls, 0);
});

test('T02 reader accessors cannot inject values and extraction-time expiry suppresses response', async () => {
  const f = fixture(); let getters = 0;
  const accessor = Object.defineProperty({ metadataId, revisionId }, 'status', { enumerable: true,
    get() { getters++; return getters === 1 ? 'available' : 'NONPRODUCTION_DROP_SENTINEL'; } });
  const denied = await f.boundary.respond(f.capability(), query, async () => accessor);
  assert.equal(denied.status, 503); noStore(denied); assert.equal(getters, 0);
  assert.deepEqual(await denied.json(), { ok: false, error: 'owner_read_unavailable' });
  const delayed = new Proxy(metadata, { getOwnPropertyDescriptor(target, key) {
    f.advance(time + 300); return Object.getOwnPropertyDescriptor(target, key);
  } });
  const expired = await f.boundary.respond(f.capability(), query, async () => delayed);
  assert.equal(expired.status, 401); noStore(expired);
  assert.deepEqual(await expired.json(), { ok: false, error: 'owner_read_unauthorized' });
});

test('T02 config/JWK/array accessors, sparse arrays and custom iterators disable without invocation', () => {
  let calls = 0;
  const configAccessor = Object.defineProperty({ ...trust }, 'issuer', { enumerable: true, get() { calls++; return trust.issuer; } });
  const jwkAccessor = Object.defineProperty({ ...trust.publicKeyJwk }, 'x', { enumerable: true, get() { calls++; return jwk.x; } });
  const arrayAccessor = Object.defineProperty([...trust.ownerSubjects], '0', { enumerable: true, get() { calls++; return trust.ownerSubjects[0]; } });
  const iterator = [...trust.ownerSubjects];
  Object.defineProperty(iterator, Symbol.iterator, { value: () => { calls++; throw Error('NONPRODUCTION_ITERATOR'); } });
  for (const config of [configAccessor, { ...trust, publicKeyJwk: jwkAccessor }, { ...trust, ownerSubjects: arrayAccessor },
    { ...trust, ownerSubjects: new Array(1) }, { ...trust, ownerSubjects: iterator }]) {
    assert.equal(createPrivateOwnerReadBoundary(config, () => time).authenticate(request(signed())), null);
  }
  assert.equal(calls, 0);
  const frozen = Object.freeze({ ...trust, ownerSubjects: Object.freeze([...trust.ownerSubjects]),
    metadataIds: Object.freeze([...trust.metadataIds]), publicKeyJwk: Object.freeze({ ...trust.publicKeyJwk }) });
  assert.ok(createPrivateOwnerReadBoundary(frozen, () => time).authenticate(request(signed())));
});
