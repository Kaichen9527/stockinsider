import type { SupabaseClient } from '@supabase/supabase-js';
import { isPaidInvestAnchorsReference } from './candidate-dossier-contract.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';
import type { EvidenceDocument } from './research-deep-article.ts';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export async function loadDeepArticleEvidence(db: Pick<SupabaseClient, 'from'>, ids: string[]): Promise<EvidenceDocument[]> {
  if (ids.length > 100 || new Set(ids).size !== ids.length || ids.some((id) => !UUID.test(id))) {
    throw new Error('deep_article_source_id_bound_invalid');
  }
  const rows: Row[] = [];
  for (let start = 0; start < ids.length; start += 50) {
    const batch = ids.slice(start, start + 50);
    const result = await db.from('source_raw_documents')
      .select('id,document_url,published_at,collected_at,symbols,metadata')
      .in('id', batch).limit(batch.length);
    if (result.error || !result.data) throw new Error(result.error?.message || 'deep_article_source_read_failed');
    rows.push(...result.data);
  }
  if (rows.length !== ids.length) throw new Error('deep_article_source_missing');
  return rows.map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Row : {};
    const candidateUrl = String(metadata.canonical_url || row.document_url || '').split('#si-revision-')[0];
    const url = sanitizePublicSourceUrl(candidateUrl);
    return {
      id: String(row.id), symbols: Array.isArray(row.symbols) ? row.symbols.map(String) : [],
      publishedAt: String(row.published_at || ''), observedAt: String(metadata.first_observed_at || row.collected_at || ''),
      sourceUrl: url || '', retracted: Boolean(metadata.retracted_at),
      publicCitation: Boolean(url) && metadata.visibility !== 'authenticated_summary'
        && !isPaidInvestAnchorsReference(candidateUrl),
    };
  });
}
