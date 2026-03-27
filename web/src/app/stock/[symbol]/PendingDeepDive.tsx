'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  symbol: string;
  retryAfterSec: number;
};

export default function PendingDeepDive({ symbol, retryAfterSec }: Props) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(retryAfterSec);
  const [statusText, setStatusText] = useState('正在排隊建立深度分析…');

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/stocks/${symbol}/deep-dive`, { cache: 'no-store' });
        if (!active) return;
        if (res.status === 200) {
          setStatusText('資料已完成，正在刷新頁面…');
          router.refresh();
          return;
        }
        if (res.status === 202) {
          const payload = (await res.json().catch(() => null)) as { retryAfterSec?: number } | null;
          setSeconds(payload?.retryAfterSec ?? retryAfterSec);
          setStatusText('仍在建模中，系統會自動重試。');
          return;
        }
        setStatusText('目前無法取得資料，請稍後手動重新整理。');
      } catch {
        if (active) setStatusText('網路或 API 暫時異常，請稍後重試。');
      }
    };

    const interval = setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          void poll();
          return retryAfterSec;
        }
        return value - 1;
      });
    }, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [retryAfterSec, router, symbol]);

  return (
    <div className="rounded-[1.5rem] border border-amber-400/30 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <p className="font-medium">深度分析資料尚在建立中</p>
      <p className="mt-1">{statusText}</p>
      <p className="mt-1 text-xs opacity-80">下次自動檢查：{seconds} 秒後</p>
    </div>
  );
}
