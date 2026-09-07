import { getSupabaseServerClient } from './supabase-server.ts';
import {
  shadowReplayHash,
  type FrozenShadowReplayPayload,
  verifiesFrozenShadowReplayPayload,
} from './shadow-policy-v2.ts';

type Supabase = ReturnType<typeof getSupabaseServerClient>;

export type PersistFrozenShadowReplayPayloadInput = {
  payload: FrozenShadowReplayPayload;
  manifestId: string;
  finalPublicationId: string;
};

/**
 * Server-only persistence boundary.  Callers must invoke this after the final
 * Radar publication has a receipt; preliminary, weekend and backtest attempts
 * have no valid shape for this API.
 */
export async function persistFrozenShadowReplayPayload(
  input: PersistFrozenShadowReplayPayloadInput,
  client: Supabase = getSupabaseServerClient(),
) {
  if (!verifiesFrozenShadowReplayPayload(input.payload)) throw new Error('shadow_replay_payload_invalid');
  if (input.payload.manifestId !== input.manifestId || input.payload.finalPublicationId !== input.finalPublicationId) {
    throw new Error('shadow_replay_payload_binding_mismatch');
  }
  const payloadHash = shadowReplayHash(input.payload);
  const write = await client.from('candidate_shadow_replay_payloads').insert({
    manifest_id: input.manifestId,
    final_publication_id: input.finalPublicationId,
    session_date: input.payload.sessionDate,
    ruleset_version: input.payload.rulesetVersion,
    model_version: input.payload.modelVersion,
    publication_phase: 'final',
    session_kind: 'official_trading',
    manifest_hash: input.payload.manifestHash,
    final_publication_hash: input.payload.finalPublicationHash,
    payload: input.payload,
    payload_hash: payloadHash,
    verifier_version: input.payload.schemaVersion,
  }).select('id,payload_hash').single();
  if (write.error || !write.data) throw new Error(`shadow_replay_payload_write_failed:${write.error?.message || 'missing'}`);
  if (String(write.data.payload_hash) !== payloadHash) throw new Error('shadow_replay_payload_hash_mismatch');
  return { id: String(write.data.id), payloadHash };
}

export async function loadFrozenShadowReplayPayload(
  replayPayloadId: string,
  client: Supabase = getSupabaseServerClient(),
): Promise<{ payload: FrozenShadowReplayPayload; payloadHash: string } | null> {
  const read = await client.from('candidate_shadow_replay_payloads')
    .select('payload,payload_hash').eq('id', replayPayloadId).maybeSingle();
  if (read.error) throw new Error(`shadow_replay_payload_read_failed:${read.error.message}`);
  if (!read.data || !verifiesFrozenShadowReplayPayload(read.data.payload)) return null;
  const payload = read.data.payload;
  const payloadHash = shadowReplayHash(payload);
  return payloadHash === String(read.data.payload_hash) ? { payload, payloadHash } : null;
}
