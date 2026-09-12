import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type ProviderSecretIdentity = {
  provider: 'threads' | 'finmind'; credentialId: string; generation: number; keyVersion: string;
};
export type ProviderSecretEnvelope = ProviderSecretIdentity & {
  schema: 'stockinsider-provider-secret-v1'; iv: string; tag: string; ciphertext: string; tokenSha256: string;
};
const SCHEMA = 'stockinsider-provider-secret-v1' as const;
function validateIdentity(value: ProviderSecretIdentity) {
  if (!value || !['threads','finmind'].includes(value.provider)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value.credentialId)
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || !/^[a-zA-Z0-9_-]{1,64}$/u.test(value.keyVersion)) throw new Error('provider_secret_invalid');
}
function aad(value: ProviderSecretIdentity, tokenSha256: string) {
  validateIdentity(value);
  if (!/^[0-9a-f]{64}$/u.test(tokenSha256)) throw new Error('provider_secret_invalid');
  return Buffer.from(JSON.stringify([SCHEMA,value.provider,value.credentialId,value.generation,value.keyVersion,tokenSha256]));
}
function binary(value: string, max: number, exact?: number) {
  if (typeof value !== 'string' || value.length > Math.ceil(max/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error('provider_secret_invalid');
  const buffer=Buffer.from(value,'base64');
  if (buffer.toString('base64')!==value || buffer.length>max || (exact!=null && buffer.length!==exact)) throw new Error('provider_secret_invalid');
  return buffer;
}
function checkKey(key: Buffer) {
  if (!Buffer.isBuffer(key) || key.length!==32) throw new Error('provider_secret_invalid');
}

/** Caller owns and clears plaintext/key buffers; ciphertext carries no key. */
export function encryptProviderSecret(identity: ProviderSecretIdentity, plaintext: Buffer, key: Buffer): ProviderSecretEnvelope {
  validateIdentity(identity); checkKey(key);
  if (!Buffer.isBuffer(plaintext) || plaintext.length<16 || plaintext.length>16384
    || !plaintext.every(byte=>byte>=0x21 && byte<=0x7e)) throw new Error('provider_secret_invalid');
  const tokenSha256=createHash('sha256').update(plaintext).digest('hex');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(aad(identity,tokenSha256));
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  return {...identity,schema:SCHEMA,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
    ciphertext:ciphertext.toString('base64'),tokenSha256};
}

/** Expected generation comes from the live credential registry, never the
 * stored envelope. A revoked or replaced credential cannot resurrect itself. */
export function decryptProviderSecret(envelope: ProviderSecretEnvelope, expected: ProviderSecretIdentity, key: Buffer): Buffer {
  let pending: Buffer | undefined;
  try {
    validateIdentity(expected); checkKey(key);
    if (!envelope || envelope.schema!==SCHEMA || envelope.provider!==expected.provider
      || envelope.credentialId!==expected.credentialId || envelope.generation!==expected.generation
      || envelope.keyVersion!==expected.keyVersion) throw new Error();
    const decipher=createDecipheriv('aes-256-gcm',key,binary(envelope.iv,12,12));
    decipher.setAAD(aad(expected,envelope.tokenSha256)); decipher.setAuthTag(binary(envelope.tag,16,16));
    pending=decipher.update(binary(envelope.ciphertext,16384));
    const tail=decipher.final();
    const plaintext=Buffer.concat([pending,tail]); pending.fill(0); tail.fill(0);
    const actual=createHash('sha256').update(plaintext).digest();
    if (plaintext.length<16 || !plaintext.every(byte=>byte>=0x21 && byte<=0x7e)
      || !timingSafeEqual(actual,Buffer.from(envelope.tokenSha256,'hex'))) { plaintext.fill(0); throw new Error(); }
    return plaintext;
  } catch { pending?.fill(0); throw new Error('provider_secret_invalid'); }
}
