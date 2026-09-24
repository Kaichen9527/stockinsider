import type { SupabaseClient } from '@supabase/supabase-js';

type Revision = Record<string, unknown> & {
  id: string; stock_id: string; session_date: string; model_version: string; revision_hash: string;
};

/** Append-only publication. A concurrent retry may reuse only the exact same
 * content identity; a UUID conflict with another hash is never overwritten. */
export async function appendCandidateDetailRevision(client: Pick<SupabaseClient, 'from'>, revision: Revision) {
  const readIdentical = () => client.from('candidate_detail_snapshots').select('id')
    .eq('id', revision.id).eq('stock_id', revision.stock_id)
    .eq('session_date', revision.session_date).eq('model_version', revision.model_version)
    .eq('revision_hash', revision.revision_hash).maybeSingle();
  const identical = await readIdentical();
  if (identical.error) throw new Error(identical.error.message);
  if (identical.data) return { id: String(identical.data.id), appended: false };
  const prior = await client.from('candidate_detail_snapshots').select('id')
    .eq('stock_id', revision.stock_id).eq('model_version', revision.model_version)
    .order('available_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (prior.error) throw new Error(prior.error.message);
  const write = await client.from('candidate_detail_snapshots')
    .insert({ ...revision, supersedes_revision_id: prior.data?.id || null }).select('id').single();
  if (!write.error && write.data) return { id: String(write.data.id), appended: true };
  if (write.error?.code === '23505') {
    const concurrent = await readIdentical();
    if (!concurrent.error && concurrent.data) return { id: String(concurrent.data.id), appended: false };
  }
  throw new Error(write.error?.message || 'candidate_detail_write_failed');
}
