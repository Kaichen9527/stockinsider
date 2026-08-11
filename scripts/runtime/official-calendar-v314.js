'use strict';

const { sha256 } = require('./codec');

const TWSE_ANNUAL_URL = 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule';
const TPEX_ANNUAL_URL = 'https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date';

function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value))) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? String(value) : null;
}

function rocCompact(value) {
  if (!/^\d{7}$/u.test(String(value))) return null;
  const year = Number(String(value).slice(0, 3)) + 1911;
  return dateOnly(`${year}-${String(value).slice(3, 5)}-${String(value).slice(5, 7)}`);
}

function parseTwseAnnualCalendar(payload, year) {
  const raw = Array.isArray(payload) ? payload.map((row) => ({ date:rocCompact(row?.Date), name:row?.Name,
    description:row?.Description })) : Array.isArray(payload?.data) ? payload.data.map((row) => ({
    date:dateOnly(row?.[0]), name:row?.[1], description:row?.[2],
  })) : [];
  const rows = raw.filter((row) => row.date?.startsWith(`${year}-`) && typeof row.name === 'string');
  if (rows.length < 10) throw new Error('twse_calendar_schema');
  return rows;
}

function isTradingMarker(row) {
  const text = `${row.name ?? ''} ${row.description ?? ''}`;
  return /開始交易|最後交易/u.test(text) && !/市場無交易|不交易|休市|放假/u.test(text);
}

function normalizeTpexHtml(html) {
  return String(html).replace(/<br\s*\/?\s*>/giu, ' ').replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;|&#160;/giu, ' ').replace(/\s+/gu, ' ');
}

function tpexContainsDate(html, session) {
  const month = Number(session.slice(5, 7)); const day = Number(session.slice(8, 10));
  return html.includes(`${month}月${day}日`);
}

async function responseBytes(url, fetchImpl, accept) {
  const response = await fetchImpl(url, { headers:{ Accept:accept, 'user-agent':'StockInsider/3.14' },
    redirect:'error', signal:AbortSignal.timeout(12000) });
  if (!response?.ok || response.redirected) throw new Error(`official_calendar_unavailable:${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10 || bytes.length > 4_000_000) throw new Error(`official_calendar_size:${url}`);
  return bytes;
}

function weekdaySessions(year) {
  const output = [];
  for (let cursor = new Date(Date.UTC(year, 0, 1)); cursor.getUTCFullYear() === year;
    cursor = new Date(cursor.getTime() + 86_400_000)) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) output.push(cursor.toISOString().slice(0, 10));
  }
  return output;
}

async function loadOfficialTradingCalendarV314({ cutoff, fetchImpl = globalThis.fetch } = {}) {
  if (typeof cutoff !== 'string' || !Number.isFinite(Date.parse(cutoff))) throw new Error('calendar_cutoff');
  const cutoffInstant = Date.parse(cutoff); const cutoffSession = new Date(cutoffInstant).toISOString().slice(0, 10);
  const currentYear = Number(cutoffSession.slice(0, 4));
  // January/February cutoffs cannot reach the 300 completed-session authority floor from
  // only the current and immediately preceding calendar years.
  const years = [currentYear - 2, currentYear - 1, currentYear];
  const collectedAt = new Date().toISOString().replace('.000Z', 'Z'); const calendarSessions = []; const sourceHashes = {};
  for (const year of years) {
    const twseUrl = `${TWSE_ANNUAL_URL}?response=json&date=${year}0101`;
    const tpexUrl = `${TPEX_ANNUAL_URL}/trading_date_${year - 1911}.htm`;
    const [twseBytes, tpexBytes] = await Promise.all([
      responseBytes(twseUrl, fetchImpl, 'application/json'), responseBytes(tpexUrl, fetchImpl, 'text/html'),
    ]);
    let twsePayload; try { twsePayload = JSON.parse(twseBytes.toString('utf8')); } catch { throw new Error('twse_calendar_json'); }
    const events = parseTwseAnnualCalendar(twsePayload, year); const tpexHtml = normalizeTpexHtml(tpexBytes.toString('utf8'));
    if (!tpexHtml.includes(`中華民國${year - 1911}年`) || !/開（休）市日期表|開\(休\)市日期表/u.test(tpexHtml))
      throw new Error('tpex_calendar_schema');
    const closed = new Set(events.filter((row) => !isTradingMarker(row)).map((row) => row.date));
    for (const session of closed) {
      const weekday = new Date(`${session}T00:00:00Z`).getUTCDay();
      if (weekday !== 0 && weekday !== 6 && !tpexContainsDate(tpexHtml, session))
        throw new Error(`calendar_cross_market_conflict:${session}`);
    }
    const twseHash = sha256(twseBytes); const tpexHash = sha256(tpexBytes);
    sourceHashes[twseUrl] = twseHash; sourceHashes[tpexUrl] = tpexHash;
    for (const session of weekdaySessions(year)) {
      const openAt=`${session}T01:00:00Z`;const scheduledCloseAt = `${session}T05:30:00Z`;
      const status = closed.has(session) ? 'holiday'
        : Date.parse(scheduledCloseAt) <= cutoffInstant ? 'completed' : 'scheduled';
      for (const [market, sourceUrl, sourceSha256] of [['TWSE', twseUrl, twseHash], ['TPEX', tpexUrl, tpexHash]]) {
        calendarSessions.push({ market, session, status,openAt,scheduledCloseAt,
          closeAt:status === 'holiday' ? null : scheduledCloseAt,
          provider:market.toLowerCase(), sourceTimestamp:collectedAt, collectedAt, sourceUrl, sourceSha256,
          sourceRef:`${market.toLowerCase()}-annual-calendar:${year}:${session}:${sourceSha256}` });
      }
    }
  }
  // The completion RPC accepts at most 1,200 calendar rows.  Retain enough
  // completed history to prove the 300-session authority floor plus a bounded
  // forward schedule for freshness calculations; do not stream three entire
  // exchange calendars into every facts-refresh completion.
  const pastSessions = [...new Set(calendarSessions.filter((row) => row.session <= cutoffSession)
    .map((row) => row.session))].sort().slice(-400);
  const futureSessions = [...new Set(calendarSessions.filter((row) => row.session > cutoffSession)
    .map((row) => row.session))].sort().slice(0, 80);
  const retainedSessions = new Set([...pastSessions, ...futureSessions]);
  const boundedCalendarSessions = calendarSessions.filter((row) => retainedSessions.has(row.session));
  if (boundedCalendarSessions.length > 1200) throw new Error('official_calendar_ingestion_bound');
  const completed = boundedCalendarSessions.filter((row) => row.market === 'TWSE' && row.status === 'completed');
  if (completed.length < 300) throw new Error('official_calendar_completed_sessions_below_300');
  return Object.freeze({ schema:'official-calendar-acquisition-v3.14', collectedAt, cutoff,
    calendarSessions:Object.freeze(boundedCalendarSessions), sourceHashes:Object.freeze(sourceHashes) });
}

module.exports = { TPEX_ANNUAL_URL, TWSE_ANNUAL_URL, isTradingMarker, loadOfficialTradingCalendarV314,
  normalizeTpexHtml, parseTwseAnnualCalendar, tpexContainsDate };
