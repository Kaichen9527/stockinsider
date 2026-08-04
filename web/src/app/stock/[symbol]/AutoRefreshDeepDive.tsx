'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  symbol: string;
  initialUpdatedAt: string | null;
};

export default function AutoRefreshDeepDive({ symbol, initialUpdatedAt }: Props) {
  const router = useRouter();
  const [statusText, setStatusText] = useState('背景更新中，若抓到新來源會自動刷新。');

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();

    const poll = async () => {
      try {
        const res = await fetch(`/api/stocks/${symbol}/deep-dive?view=status`, { cache: 'no-store' });
        if (!active || !res.ok) return;
        const payload = (await res.json().catch(() => null)) as {
          targetSnapshot?: { reportUpdatedAt?: string | null };
          summaryCard?: { lastUpdatedAt?: string | null };
        } | null;
        const nextUpdatedAt =
          payload?.targetSnapshot?.reportUpdatedAt ||
          payload?.summaryCard?.lastUpdatedAt ||
          null;
        if (nextUpdatedAt && nextUpdatedAt !== initialUpdatedAt) {
          setStatusText('已抓到更新，正在刷新頁面…');
          router.refresh();
          return;
        }
        if (Date.now() - startedAt > 60_000) {
          setStatusText('目前仍沿用現有資料；若稍後有新來源，重新整理後會看到更新。');
        }
      } catch {
        if (active) {
          setStatusText('背景更新暫時失敗，目前先顯示現有資料。');
        }
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 8000);
    void poll();

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [initialUpdatedAt, router, symbol]);

  return <p className="text-xs text-slate-500 dark:text-emerald-100/55">{statusText}</p>;
}
