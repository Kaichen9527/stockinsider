import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { researchEntryQualification, type ThesisQualification } from '@/lib/research-agent-qualification';
import type { PaperBook } from '@/lib/research-paper-books';

/** Qualifications choose new-entry monitoring; holdings never disappear with a thesis. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const asOf = new Date().toISOString(); const db = getSupabaseServerClient();
  try {
    const heads = new Map<string, ThesisQualification>();
    for (let offset = 0; offset <= 20_000; offset += 500) {
      const result = await db.rpc('research_thesis_heads_page_v1', {
        p_cutoff: asOf, p_offset: offset, p_limit: 500,
      });
      if (result.error || !Array.isArray(result.data)) throw new Error(result.error?.message || 'research_monitor_qualification_read_failed');
      if (offset + result.data.length > 20_000) throw new Error('research_monitor_company_bound_exceeded');
      for (const row of result.data) {
        const thesis = row.payload as ThesisQualification;
        if (!heads.has(thesis.symbol)) heads.set(thesis.symbol, thesis);
      }
      if (result.data.length < 500) break;
    }
    const held = new Set<string>(); const bookHeads: Record<string, string | null> = {};
    for (const bookId of ['conservative', 'growth']) {
      const result = await db.from('research_paper_book_revisions_v1').select('revision_hash,state')
        .eq('book_id', bookId).lte('available_at', asOf).order('available_at', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw new Error(result.error.message);
      bookHeads[bookId] = result.data?.revision_hash || null;
      for (const position of (result.data?.state as PaperBook | undefined)?.positions || []) held.add(position.symbol);
    }
    const symbols = new Set([...held, ...[...heads.values()].filter((thesis) => researchEntryQualification(thesis, asOf).allowed).map((thesis) => thesis.symbol)]);
    return NextResponse.json({ ok: true, asOf, bookHeads,
      technicalSymbols: [...symbols].sort().map((symbol) => ({ symbol, existingPaperPosition: held.has(symbol),
        newEntryQualified: Boolean(heads.get(symbol) && researchEntryQualification(heads.get(symbol)!, asOf).allowed) })),
      monthlyReviewsDue: [...heads.values()].filter((thesis) => thesis.status === 'qualified'
        && Date.parse(thesis.nextReviewAt) <= Date.parse(asOf)).map((thesis) => ({ symbol: thesis.symbol,
        thesisRevisionId: thesis.thesisRevisionId, articleRevisionId: thesis.articleRevisionId, nextReviewAt: thesis.nextReviewAt })),
      accountedTheses: heads.size, heldSymbols: [...held].sort() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_monitor_worklist_failed' }, { status: 409 });
  }
}
