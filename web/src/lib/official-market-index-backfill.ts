import { createHash } from 'crypto';
import { parseTaiexHistory, parseTpexIndex } from './market-evidence.ts';

export type OfficialMarketIndexPage = {
  market: 'TWSE' | 'TPEX';
  sourceUrl: string;
  payload: Record<string, unknown>;
  responseSha256: string;
};

export type OfficialMarketIndexRow = {
  market: 'TWSE' | 'TPEX';
  sessionDate: string;
  close: number;
  sourceUrl: string;
  responseSha256: string;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function officialMarketIndexBatchHash(pages: OfficialMarketIndexPage[]) {
  return sha256(JSON.stringify(pages));
}

export function parseOfficialMarketIndexPage(page: OfficialMarketIndexPage): OfficialMarketIndexRow[] | null {
  if (!page || !['TWSE', 'TPEX'].includes(page.market) || !page.payload || typeof page.payload !== 'object' || Array.isArray(page.payload)) return null;
  let url: URL;
  try { url = new URL(page.sourceUrl); } catch { return null; }
  const official = page.market === 'TWSE'
    ? url.protocol === 'https:' && url.hostname === 'www.twse.com.tw' && url.pathname === '/rwd/zh/TAIEX/MI_5MINS_HIST'
    : url.protocol === 'https:' && url.hostname === 'www.tpex.org.tw' && url.pathname === '/www/zh-tw/afterTrading/tradingIndex';
  if (!official || !/^[0-9a-f]{64}$/u.test(page.responseSha256) || sha256(JSON.stringify(page.payload)) !== page.responseSha256) return null;
  const rows = page.market === 'TWSE' ? parseTaiexHistory(page.payload) : parseTpexIndex(page.payload);
  return rows.map((row) => ({ market: page.market, sessionDate: row.date, close: row.close, sourceUrl: page.sourceUrl, responseSha256: page.responseSha256 }));
}

export function officialCalendarCorrections(pages: OfficialMarketIndexPage[], parsed: OfficialMarketIndexRow[][], completedSessions: string[]) {
  const coverage = pages.map((page, index) => {
    const rows = parsed[index] || [];
    return { market: page.market, month: rows[0]?.sessionDate.slice(0, 7) || '', dates: new Set(rows.map((row) => row.sessionDate)), sourceUrl: page.sourceUrl };
  });
  const pairs = [...new Set(coverage.map((page) => page.month).filter(Boolean))].flatMap((month) => {
    const twse = coverage.find((page) => page.month === month && page.market === 'TWSE');
    const tpex = coverage.find((page) => page.month === month && page.market === 'TPEX');
    return twse && tpex ? [{ month, twse, tpex }] : [];
  });
  return completedSessions.flatMap((date) => {
    const pair = pairs.find((item) => item.month === date.slice(0, 7));
    return pair && !pair.twse.dates.has(date) && !pair.tpex.dates.has(date)
      ? [{ date, sourceUrls: { TWSE: pair.twse.sourceUrl, TPEX: pair.tpex.sourceUrl } }]
      : [];
  });
}
