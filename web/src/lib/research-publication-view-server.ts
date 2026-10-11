import 'server-only';
import { getSupabaseServerClient } from './supabase-server.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { parseResearchPublicationView } from './research-publication-view.ts';

export async function readResearchCompanyPublication(companyId: string, symbol: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(companyId)
    || !['2409','2383'].includes(symbol)) throw new Error('research_publication_view_request');
  const deadline = new FinancialDeadline();
  try {
    deadline.check();
    const result = await deadline.wait(getSupabaseServerClient().rpc('read_research_company_publication_v2', {p_company:companyId}).abortSignal(deadline.controller.signal));
    deadline.check(); if (result.error) throw new Error('research_publication_view_unavailable');
    return result.data === null ? null : parseResearchPublicationView(result.data,companyId,symbol);
  } finally { deadline.controller.abort(); }
}
