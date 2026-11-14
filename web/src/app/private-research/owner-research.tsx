'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type View = 'loading' | 'unconfigured' | 'signed_out' | 'authenticated' | 'unavailable';
export default function OwnerResearch() {
  const [view, setView] = useState<View>('loading');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  useEffect(() => {
    const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const status = await fetch('/api/owner/session', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
        const session = await status.json();
        if (abort.signal.aborted) return;
        if (session.configured === false) { setView('unconfigured'); return; }
        if (!status.ok || session.authenticated !== true) { setView('signed_out'); setExpiresAt(null); return; }
        const research = await fetch('/api/owner/research', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
        if (abort.signal.aborted) return;
        if (research.status === 401) { setView('signed_out'); setExpiresAt(null); return; }
        if (!research.ok) { setView('unavailable'); return; }
        const result = await research.json();
        if (abort.signal.aborted) return;
        if (result.research?.status !== 'missing_data') { setView('unavailable'); return; }
        setView('authenticated'); setExpiresAt(typeof session.expiresAt === 'string' ? session.expiresAt : null);
        const expiry = Date.parse(session.expiresAt);
        if (Number.isFinite(expiry)) timer = setTimeout(() => { void load(); }, Math.max(50, expiry - Date.now() + 50));
      } catch { if (!abort.signal.aborted) setView('unavailable'); }
    }
    void load();
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, []);
  const messages: Record<View, string> = {
    loading: '正在確認登入狀態…',
    unconfigured: '私人研究登入尚未開放。帳號設定完成後才能登入。',
    signed_out: '請使用獲授權的帳號登入，查看私人研究。',
    authenticated: '已登入。私人研究資料尚未接通，目前沒有可顯示的研究內容。',
    unavailable: '目前無法確認私人研究狀態，請稍後重新整理。',
  };
  return <main data-testid="owner-private-page" className="mx-auto min-h-screen max-w-3xl px-5 py-12 text-slate-900 dark:text-slate-100">
    <Link href="/" className="text-sm text-sky-700 dark:text-sky-300">← 返回公開雷達</Link>
    <h1 className="mt-8 text-3xl font-semibold">私人研究</h1>
    <p className="mt-3 text-slate-600 dark:text-slate-300">僅限獲授權帳號。公開雷達與私人研究分開顯示。</p>
    <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100">
      <p data-testid="owner-private-state" data-state={view} role="status" aria-live="polite">{messages[view]}</p>
      {view === 'signed_out' && <form method="post" action="/api/owner/login" className="mt-6">
        <button data-testid="owner-login-submit" type="submit" className="rounded-lg bg-sky-400 px-5 py-3 font-semibold text-slate-950">使用 Google 登入</button>
      </form>}
      {view === 'authenticated' && <>
        <h2 className="mt-6 font-semibold">研究資料缺口</h2>
        <p className="mt-2 text-sm text-slate-300">尚未取得可供此帳號查閱的研究資料與來源授權；不會以示範內容替代。</p>
        {expiresAt && <p className="mt-4 text-sm text-slate-300">本次登入將在五分鐘內到期。到期後需重新登入。</p>}
        <form method="post" action="/api/owner/logout" className="mt-6">
          <button data-testid="owner-logout-submit" type="submit" className="rounded-lg border border-slate-500 px-5 py-3">登出</button>
        </form>
      </>}
    </section>
  </main>;
}
