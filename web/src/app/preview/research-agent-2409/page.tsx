import Link from 'next/link';
import type { Metadata } from 'next';
import { DeepResearchView } from '@/app/stock/[symbol]/CandidateDetailView';
import { auoArticleSections, auoBackground, auoSources } from '@/lib/auo-deep-dive-v1';
import { DEEP_ARTICLE_SECTION_ORDER, type DeepResearchSection } from '@/lib/research-deep-article';
import { sanitizePublicSourceUrl } from '@/lib/public-source-url';

export const metadata: Metadata = {
  title: '友達研究 Agent 文章版面預覽｜StockInsider',
  description: '用已標日期的友達示範文章，檢查通用深度研究文章版面與逐段引用。',
};

const sections: DeepResearchSection[] = auoArticleSections.map((section, index) => ({
  key: DEEP_ARTICLE_SECTION_ORDER[index], title: section.title,
  paragraphs: section.paragraphs.map((paragraph) => ({
    text: paragraph.text, kind: 'inference' as const,
    sourceDocumentIds: [...paragraph.sources], officialFactIds: [],
  })),
}));
const sources = auoSources.flatMap((source) => {
  const url = sanitizePublicSourceUrl(source.url);
  return url ? [{ id: source.id, title: source.title, url,
    publishedAt: source.date, retracted: false }] : [];
});

export default function ResearchAgentAuoLayoutPreview() {
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
      <div><p className="text-sm text-stone-500">友達 2409 · 文章元件預覽</p>
        <h1 className="mt-2 text-3xl font-semibold">產業變化如何傳到估值</h1></div>
      <Link href="/preview/auo-2409" className="rounded-full border border-line px-4 py-2 text-sm hover:border-orange-500">
        查看原始研究示範與財表
      </Link>
    </div>
    <DeepResearchView layoutPreview sourceLinks={sources} article={{
      summary: '本頁以 2026 年 9 月 25 日以前的友達研究文字，驗證通用文章的章節順序、長文閱讀與逐段來源。Intel 合作及新技術訂單仍未有可核對的量產證據；新財測與交易資格須等獨立審查。',
      authoredAt: '2026-09-25', evidenceCutoffAt: '2026-09-25', sections,
      scenarios: [], companyBackground: auoBackground.map((row) => row.text).join('\n\n'),
    }} />
  </main>;
}
