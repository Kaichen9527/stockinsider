/** Unconnected T02 source contract. No login, source-content permission or route.
 * Trust is supplied only by a future reviewed server adapter; absent/invalid
 * configuration disables the boundary. This module never issues credentials. */
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

export type OwnerReadTrust = Readonly<{
  issuer: string;
  audience: string;
  ownerSubjects: readonly string[];
  publicKeyJwk: Readonly<{ kty: 'OKP'; crv: 'Ed25519'; x: string }>;
  metadataIds: readonly string[];
}>;
declare const verifiedOwner: unique symbol;
export type VerifiedOwnerCapability = Readonly<{ [verifiedOwner]: true }>;
export type OwnerMetadataQuery = Readonly<{ metadataId: string }>;
export type OwnerMetadata = Readonly<{
  metadataId: string;
  revisionId: string;
  status: 'available' | 'unavailable';
}>;
type MetadataReader = (query: OwnerMetadataQuery) => Promise<unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OPAQUE_SUBJECT = /^[A-Za-z0-9_-]{16,128}$/u;
const MAX_TOKEN_BYTES = 2048;
const MAX_LIFETIME_SECONDS = 300;
const HEADER = Buffer.from('{"alg":"EdDSA","typ":"owner-read+jwt"}').toString('base64url');

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function fields(value: unknown, keys: readonly string[], exact = true): Record<string, unknown> | null {
  if (!record(value) || (exact && Reflect.ownKeys(value).length !== keys.length)) return null;
  const snapshot: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}
function boundedString(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200 && /^[\x21-\x7e]+$/u.test(value);
}
function stringList(value: unknown, pattern: RegExp): string[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < 1 || length > 20 || Reflect.ownKeys(value).length !== length + 1) return null;
  const snapshot: string[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || !pattern.test(descriptor.value)) return null;
    snapshot.push(descriptor.value);
  }
  return new Set(snapshot).size === length ? snapshot : null;
}
function decode(segment: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(segment)) return null;
  const bytes = Buffer.from(segment, 'base64url');
  return bytes.toString('base64url') === segment ? bytes : null;
}
function trustedConfig(value: OwnerReadTrust | null): {
  issuer: string; audience: string; subjects: Set<string>; ids: Set<string>; key: KeyObject;
} | null {
  try {
    const config = fields(value, ['issuer', 'audience', 'ownerSubjects', 'publicKeyJwk', 'metadataIds']);
    if (!config || !boundedString(config.issuer) || !boundedString(config.audience)) return null;
    const subjects = stringList(config.ownerSubjects, OPAQUE_SUBJECT);
    const ids = stringList(config.metadataIds, UUID);
    const jwk = fields(config.publicKeyJwk, ['kty', 'crv', 'x']);
    if (!subjects || !ids || !jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' ||
        typeof jwk.x !== 'string' || decode(jwk.x)?.length !== 32) return null;
    const key = createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x } });
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') return null;
    return { issuer: config.issuer, audience: config.audience, subjects: new Set(subjects), ids: new Set(ids), key };
  } catch { return null; }
}
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'Surrogate-Control': 'no-store',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Authorization',
  } });
}

/** The optional clock is a trusted server dependency, in epoch seconds. Neither
 * trust nor clock comes from the request. Only public verification key material
 * is accepted. The issuer and its private key remain outside this runtime.
 * JWS profile: fixed protected header, canonical base64url and compact JSON
 * claims (JSON.stringify form), exact claim keys, no extensions/key selection. */
export function createPrivateOwnerReadBoundary(
  trust: OwnerReadTrust | null = null,
  clock: () => number = () => Math.floor(Date.now() / 1000),
) {
  const config = trustedConfig(trust);
  const capabilities = new WeakMap<object, { notBefore: number; expiry: number }>();
  function now(): number | null {
    try { const value = clock(); return Number.isSafeInteger(value) && value >= 0 ? value : null; }
    catch { return null; }
  }
  function validCapability(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const lifetime = capabilities.get(value);
    const current = now();
    return lifetime !== undefined && current !== null && current >= lifetime.notBefore && current < lifetime.expiry;
  }
  function authenticate(request: Request): VerifiedOwnerCapability | null {
    if (!config) return null;
    try {
      if (request.headers.has('x-internal-key')) return null;
      const authorization = request.headers.get('authorization');
      if (!authorization?.startsWith('Bearer ')) return null;
      const token = authorization.slice(7);
      if (Buffer.byteLength(token, 'utf8') > MAX_TOKEN_BYTES) return null;
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== HEADER) return null;
      const payload = decode(parts[1]); const signature = decode(parts[2]);
      if (!payload || signature?.length !== 64) return null;
      // Round-trip rejects duplicate keys, whitespace, escaped aliases and
      // invalid UTF-8. Unknown/algorithm/key headers never reach verification.
      const json = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      const parsed: unknown = JSON.parse(json);
      const claims = fields(parsed, ['iss', 'aud', 'sub', 'scope', 'iat', 'nbf', 'exp']);
      if (JSON.stringify(parsed) !== json || !claims ||
          claims.iss !== config.issuer || claims.aud !== config.audience || claims.scope !== 'owner:read' ||
          typeof claims.sub !== 'string' || !config.subjects.has(claims.sub)) return null;
      const { iat, nbf, exp } = claims;
      if (typeof iat !== 'number' || typeof nbf !== 'number' || typeof exp !== 'number' ||
          !Number.isSafeInteger(iat) || !Number.isSafeInteger(nbf) || !Number.isSafeInteger(exp) ||
          iat < 0 || nbf < iat || exp <= nbf || exp - iat > MAX_LIFETIME_SECONDS) return null;
      const current = now();
      if (current === null || current < iat || current < nbf || current >= exp ||
          !verify(null, Buffer.from(`${parts[0]}.${parts[1]}`, 'ascii'), config.key, signature)) return null;
      const capability = Object.freeze(Object.create(null)) as VerifiedOwnerCapability;
      capabilities.set(capability, { notBefore: nbf, expiry: exp });
      return capability;
    } catch { return null; }
  }
  async function respond(capability: unknown, query: unknown, reader: MetadataReader): Promise<Response> {
    if (!config) return reply(503, { ok: false, error: 'owner_read_unconfigured' });
    if (!validCapability(capability)) return reply(401, { ok: false, error: 'owner_read_unauthorized' });
    let metadataId: string;
    try {
      const input = fields(query, ['metadataId']);
      if (!input) return reply(403, { ok: false, error: 'owner_read_forbidden' });
      const requestedId = input.metadataId;
      if (typeof requestedId !== 'string' || !config.ids.has(requestedId)) return reply(403, { ok: false, error: 'owner_read_forbidden' });
      metadataId = requestedId;
    } catch { return reply(403, { ok: false, error: 'owner_read_forbidden' }); }
    if (!validCapability(capability)) return reply(401, { ok: false, error: 'owner_read_unauthorized' });
    try {
      // Metadata only: this callback grants no source/platform content rights.
      const result = await reader(Object.freeze({ metadataId }));
      if (!validCapability(capability)) return reply(401, { ok: false, error: 'owner_read_unauthorized' });
      const output = fields(result, ['metadataId', 'revisionId', 'status'], false);
      if (!output) return reply(503, { ok: false, error: 'owner_read_unavailable' });
      const { metadataId: returnedId, revisionId, status } = output;
      if (returnedId !== metadataId || typeof revisionId !== 'string' ||
          !UUID.test(revisionId) || (status !== 'available' && status !== 'unavailable')) {
        return reply(503, { ok: false, error: 'owner_read_unavailable' });
      }
      if (!validCapability(capability)) return reply(401, { ok: false, error: 'owner_read_unauthorized' });
      // Explicit allowlist: no raw content, token, subject or reader extras.
      return reply(200, { ok: true, metadata: { metadataId, revisionId, status } });
    } catch { return reply(503, { ok: false, error: 'owner_read_unavailable' }); }
  }
  return Object.freeze({ authenticate, respond });
}
