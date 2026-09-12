import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStockInsiderDataPlaneClient } from './data-plane-runtime.ts';
import {
  decryptProviderSecret,
  encryptProviderSecret,
  type ProviderSecretEnvelope,
  type ProviderSecretIdentity,
} from './provider-secret-envelope.ts';

type Provider = ProviderSecretIdentity['provider'];
type RpcClient = Pick<SupabaseClient, 'rpc'>;

function exactRow(data: unknown): Record<string, unknown> {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('provider_credential_missing');
  return value as Record<string, unknown>;
}

function readRootKey(keyVersion: string, readCredential?: (name: string) => Buffer) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(keyVersion)) throw new Error('provider_credential_key_version_invalid');
  const reader = readCredential ?? ((name: string) => {
    const directory = String(process.env.CREDENTIALS_DIRECTORY || '');
    if (!directory.startsWith('/run/credentials/') || directory !== path.resolve(directory)) {
      throw new Error('provider_credentials_directory_invalid');
    }
    return readFileSync(path.join(directory, name));
  });
  const encoded = reader(`provider-secrets-${keyVersion}.key`);
  try {
    const value = encoded.toString('utf8').trim();
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(value)) throw new Error('provider_credential_root_key_invalid');
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value) { key.fill(0); throw new Error('provider_credential_root_key_invalid'); }
    return key;
  } finally { encoded.fill(0); }
}

function envelopeFromRow(row: Record<string, unknown>): ProviderSecretEnvelope {
  return {
    schema: 'stockinsider-provider-secret-v1', provider: String(row.provider) as Provider,
    credentialId: String(row.credential_id), generation: Number(row.generation),
    keyVersion: String(row.key_version), iv: String(row.iv), tag: String(row.tag),
    ciphertext: String(row.ciphertext), tokenSha256: String(row.token_sha256),
  };
}

/** Plaintext exists only in the returned Buffer. Callers must clear it after
 * the provider request. The database never receives the root key or plaintext. */
export async function readProviderCredential(input: {
  provider: Provider;
  client?: RpcClient;
  readCredential?: (name: string) => Buffer;
}) {
  const client = input.client ?? getStockInsiderDataPlaneClient();
  const response = await client.rpc('read_provider_credential_envelope_v1', { p_provider: input.provider });
  if (response.error) throw new Error(`provider_credential_read_failed:${response.error.message}`);
  const row = exactRow(response.data);
  const envelope = envelopeFromRow(row);
  const expected: ProviderSecretIdentity = {
    provider: input.provider, credentialId: envelope.credentialId,
    generation: envelope.generation, keyVersion: envelope.keyVersion,
  };
  const key = readRootKey(envelope.keyVersion, input.readCredential);
  try {
    return { plaintext: decryptProviderSecret(envelope, expected, key), identity: expected,
      expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
      ownerUserIdHash: typeof row.owner_user_id_hash === 'string' ? row.owner_user_id_hash : null };
  } finally { key.fill(0); }
}

export async function readProviderCredentialState(input: { provider: Provider; client?: RpcClient }) {
  const client = input.client ?? getStockInsiderDataPlaneClient();
  const response = await client.rpc('read_provider_credential_state_v1', { p_provider: input.provider });
  if (response.error) throw new Error(`provider_credential_state_failed:${response.error.message}`);
  const value = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!value) return null;
  const row = value as Record<string, unknown>;
  return { credentialId: String(row.credential_id), generation: Number(row.generation), status: String(row.status) };
}

/** Compare-and-swap prevents a delayed refresh from reviving a revoked or
 * replaced token. expectedGeneration=0 is the only bootstrap path. */
export async function replaceProviderCredential(input: {
  provider: Provider;
  plaintext: Buffer;
  expectedGeneration: number;
  credentialId: string;
  keyVersion: string;
  expiresAt: string | null;
  ownerUserIdHash: string | null;
  client?: RpcClient;
  readCredential?: (name: string) => Buffer;
}) {
  const generation = input.expectedGeneration + 1;
  const identity = { provider: input.provider, credentialId: input.credentialId, generation, keyVersion: input.keyVersion };
  const key = readRootKey(input.keyVersion, input.readCredential);
  let envelope: ProviderSecretEnvelope;
  try { envelope = encryptProviderSecret(identity, input.plaintext, key); }
  finally { key.fill(0); }
  const client = input.client ?? getStockInsiderDataPlaneClient();
  const response = await client.rpc('replace_provider_credential_cas_v1', {
    p_provider: input.provider, p_expected_generation: input.expectedGeneration,
    p_credential_id: input.credentialId, p_key_version: input.keyVersion,
    p_iv: envelope.iv, p_tag: envelope.tag, p_ciphertext: envelope.ciphertext,
    p_token_sha256: envelope.tokenSha256, p_expires_at: input.expiresAt,
    p_owner_user_id_hash: input.ownerUserIdHash,
  });
  if (response.error) throw new Error(`provider_credential_replace_failed:${response.error.message}`);
  const row = exactRow(response.data);
  if (Number(row.generation) !== generation) throw new Error('provider_credential_generation_mismatch');
  return { generation, tokenSha256: envelope.tokenSha256 };
}
