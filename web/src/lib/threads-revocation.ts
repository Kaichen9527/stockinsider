import { getSupabaseServerClient } from './supabase-server';
import { hashThreadsDeletionConfirmationCode, hashThreadsSignedRequest } from './threads-signed-request';

export async function revokeThreadsCredential(input: {
  confirmationCode: string;
  requestKind: 'deauthorize' | 'data_deletion';
  signedRequest: string;
  userIdHash: string;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc('revoke_threads_source_credential_v7', {
    p_confirmation_code_hash: hashThreadsDeletionConfirmationCode(input.confirmationCode),
    p_request_kind: input.requestKind,
    p_request_digest: hashThreadsSignedRequest(input.signedRequest),
    p_threads_user_id_hash: input.userIdHash,
  });
  if (error) throw new Error(`threads_credential_revocation_failed:${error.message}`);
}

export async function readThreadsDeletionStatus(code: string): Promise<{
  completedAt: string | null;
  requestedAt: string;
  status: string;
} | null> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(code)) return null;
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('threads_data_deletion_requests')
    .select('status,requested_at,completed_at')
    .eq('confirmation_code_hash', hashThreadsDeletionConfirmationCode(code))
    .maybeSingle();
  if (error) throw new Error(`threads_deletion_status_failed:${error.message}`);
  if (!data) return null;
  return {
    completedAt: typeof data.completed_at === 'string' ? data.completed_at : null,
    requestedAt: String(data.requested_at),
    status: String(data.status),
  };
}
