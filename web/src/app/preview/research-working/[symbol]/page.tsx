import { notFound } from 'next/navigation';
import path from 'node:path';
import { DeepResearchView } from '@/app/stock/[symbol]/CandidateDetailView';
import { loadReadOnlyWorkingDraft, workingDraftPreviewEnabled } from '@/lib/research-working-draft-loader';
import { publicationPreviewSelection } from '@/lib/research-publication-view';
import { readResearchCompanyPublication } from '@/lib/research-publication-view-server';
export const dynamic = 'force-dynamic';
export const metadata = { title: '唯讀研究工作稿 · StockInsider', robots: {index:false,follow:false} };
export default async function WorkingResearchPreview({ params, searchParams }: {params: Promise<{symbol:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if (!workingDraftPreviewEnabled(process.env)) notFound();
  const {symbol} = await params;
  if (symbol !== '2409' && symbol !== '2383') notFound();
  let selection;
  try { selection = publicationPreviewSelection(await searchParams); } catch { notFound(); }
  if (selection.kind === 'published') {
    let publication;
    try { publication = await readResearchCompanyPublication(selection.companyId,symbol); } catch { notFound(); }
    if (!publication) notFound();
    return <main className="mx-auto max-w-6xl px-5 py-8"><DeepResearchView article={null} sourceLinks={[]} publication={publication}/></main>;
  }
  // Local demo app is launched from web; fixed checkout artifacts only.
  let draft;
  try { draft = await loadReadOnlyWorkingDraft(path.resolve(process.cwd(), '..'), symbol); }
  catch { notFound(); }
  return <main className="mx-auto max-w-6xl px-5 py-8"><DeepResearchView article={null} sourceLinks={[]} draft={draft}/></main>;
}
