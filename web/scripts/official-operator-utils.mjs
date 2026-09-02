export async function readResponseTextWithin(response, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 15_000);
  const maxBytes = Number(options.maxBytes || 12_000_000);
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('official_response_body_timeout');
      let timer;
      const next = await Promise.race([
        reader.read(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('official_response_body_timeout')), remaining); }),
      ]).finally(() => clearTimeout(timer));
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new Error('official_response_body_too_large');
      text += decoder.decode(next.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel(String(error instanceof Error ? error.message : error)).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function rocSession(value) {
  const match = String(value || '').trim().match(/^(\d{3,4})[\/\-](\d{2})[\/\-](\d{2})$/u);
  if (!match) return null;
  const year = Number(match[1]) < 1911 ? Number(match[1]) + 1911 : Number(match[1]);
  const output = `${year}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${output}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === output ? output : null;
}

export function parseTwseTradingDates(payload) {
  const fields = Array.isArray(payload?.fields) ? payload.fields.map(String) : [];
  const dateIndex = fields.indexOf('日期');
  if (dateIndex < 0 || !Array.isArray(payload?.data)) return [];
  return [...new Set(payload.data.flatMap((row) => {
    const date = Array.isArray(row) ? rocSession(row[dateIndex]) : null;
    return date ? [date] : [];
  }))].sort();
}

export function parseTpexTradingDates(payload) {
  const table = (Array.isArray(payload?.tables) ? payload.tables : []).find((candidate) => {
    const fields = Array.isArray(candidate?.fields) ? candidate.fields.map(String) : [];
    return fields.includes('日期') && fields.includes('櫃買指數');
  });
  if (!table || !Array.isArray(table.data)) return [];
  const dateIndex = table.fields.map(String).indexOf('日期');
  return [...new Set(table.data.flatMap((row) => {
    const date = Array.isArray(row) ? rocSession(row[dateIndex]) : null;
    return date ? [date] : [];
  }))].sort();
}

export function monthCoordinates(latestSession, monthsBack) {
  const date = new Date(`${latestSession.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - monthsBack);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return { compact: `${year}${month}01`, slash: `${year}/${month}/01`, key: `${year}-${month}` };
}
