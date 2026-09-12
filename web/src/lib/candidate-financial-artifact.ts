import type { SupabaseClient } from '@supabase/supabase-js';
import { privateArtifactStore } from './private-artifact-store.ts';
import { stockInsiderDataPlaneMode } from './data-plane-runtime.ts';
import { CANDIDATE_FINANCIAL_DOCUMENT_BUCKET } from './candidate-financial-documents.ts';

function root() {
  const value = String(process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT || '');
  if (!value) throw new Error('private_artifact_root_missing');
  return value;
}

export async function putCandidateFinancialArtifact(input: {
  client: SupabaseClient;
  objectKey: string;
  sha256: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  if (stockInsiderDataPlaneMode() === 'contabo') {
    const stored = await privateArtifactStore(root()).put(input.sha256, Buffer.from(input.bytes));
    const receipt = await input.client.rpc('register_private_artifact_receipt_v1', {
      p_artifact_hash: input.sha256, p_byte_length: input.bytes.byteLength,
      p_media_type: input.contentType, p_purpose: 'financial_document',
      p_metadata: { storage: 'private_hash_store_v1' },
    });
    if (receipt.error) throw new Error(`private_artifact_receipt_failed:${receipt.error.message}`);
    return stored;
  }
  const copy = new Uint8Array(input.bytes.byteLength); copy.set(input.bytes);
  const upload = await input.client.storage.from(CANDIDATE_FINANCIAL_DOCUMENT_BUCKET).upload(
    input.objectKey, new Blob([copy.buffer], { type: input.contentType }),
    { contentType: input.contentType, upsert: false },
  );
  if (upload.error && !/already exists|duplicate/iu.test(upload.error.message)) {
    throw new Error(`candidate_financial_document_storage_failed:${upload.error.message}`);
  }
  return { hash: input.sha256, bytes: input.bytes.byteLength, created: !upload.error };
}

export async function readCandidateFinancialArtifact(input: {
  client: SupabaseClient;
  objectKey: string;
  sha256: string;
}) {
  if (stockInsiderDataPlaneMode() === 'contabo') return privateArtifactStore(root()).read(input.sha256);
  const object = await input.client.storage.from(CANDIDATE_FINANCIAL_DOCUMENT_BUCKET).download(input.objectKey);
  if (object.error || !object.data) throw new Error(`stored_document_download_failed:${object.error?.message || 'missing'}`);
  return Buffer.from(await object.data.arrayBuffer());
}
