import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stockInsiderDataPlaneMode } from './data-plane-runtime.ts';
import { privateArtifactStore } from './private-artifact-store.ts';

function privateRoot() {
  const value = String(process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT || '');
  if (!value) throw new Error('private_artifact_root_missing');
  return value;
}

export async function putSourceAuditArtifact(input: {
  client: SupabaseClient;
  bucket: string;
  objectKey: string;
  bytes: Buffer;
  contentType: string;
}) {
  if (stockInsiderDataPlaneMode() === 'contabo') {
    const hash = createHash('sha256').update(input.bytes).digest('hex');
    const stored = await privateArtifactStore(privateRoot()).put(hash, input.bytes);
    const receipt = await input.client.rpc('register_private_artifact_receipt_v1', {
      p_artifact_hash: hash,
      p_byte_length: input.bytes.byteLength,
      p_media_type: input.contentType,
      p_purpose: 'diagnostic_attachment',
      p_metadata: { storage: 'private_hash_store_v1', logical_key: input.objectKey },
    });
    if (receipt.error) throw new Error(`private_artifact_receipt_failed:${receipt.error.message}`);
    return { path: `sha256:${hash}`, storage: 'private_hash_store_v1', created: stored.created };
  }

  const uploaded = await input.client.storage.from(input.bucket).upload(
    input.objectKey,
    input.bytes,
    { contentType: input.contentType, upsert: false },
  );
  if (uploaded.error) throw new Error(uploaded.error.message);
  return { path: input.objectKey, storage: 'private_supabase_storage', created: true };
}
