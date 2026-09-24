import Link from 'next/link';

/** Navigation only: four-digit shape does not attest stock eligibility or plan availability. */
export default function CurrentTechnicalResearchLink({ symbol, context = 'card' }: {
  symbol: string; context?: 'card' | 'detail';
}) {
  if (!/^\d{4}$/u.test(symbol)) return null;
  return <aside aria-label="目前技術研究導覽" className="mt-4 rounded-xl border border-current/20 p-3">
    <Link href={`/stock/${symbol}`} prefetch={false} data-testid="current-technical-research-link"
      className="inline-flex min-h-11 items-center rounded-full border border-current/30 px-4 py-2 text-sm font-semibold">
      目前技術研究 →
    </Link>
    <p className="mt-2 text-xs leading-5 opacity-75">另開此股票目前的候選研究，查看策略與資料狀態。{context === 'card' ? '本卡決策摘要' : '此頁決策'}仍保留原版本；連結不代表已有可用計畫。</p>
  </aside>;
}
