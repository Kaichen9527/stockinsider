import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveMarketEvidence, missingOfficialIndexAuthorityRequests, parseForeignNetTwd, parseTaiexHistory, parseTpexDailyCloses, parseTpexIndex } from './market-evidence.ts';

test('market evidence requires both indices, breadth and official flows', () => {
  const sessions = Array.from({ length: 520 }, (_, index) => ({ date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`, close: 100 + index }));
  const latest = sessions.at(-1)!.date;
  const evidence = deriveMarketEvidence({ sessionDate: latest, taiex: sessions, tpex: sessions, breadth: [
    { market: 'TWSE', numerator: 900, observed: 1000, eligible: 1000, date: latest },
    { market: 'TPEX', numerator: 700, observed: 800, eligible: 800, date: latest },
  ], foreignFlows: sessions.slice(-5).map((row) => ({ date: row.date, value: 1 })) });
  assert.equal(evidence.status, 'complete');
  assert.equal(evidence.regime, 'risk_on');
  assert.deepEqual(evidence.missingComponents, []);
});

test('missing market component disables risk budget', () => {
  const evidence = deriveMarketEvidence({ sessionDate: '2026-09-01', taiex: [], tpex: [], breadth: [], foreignFlows: [] });
  assert.equal(evidence.status, 'data_incomplete');
  assert.equal(evidence.riskBudget, null);
  assert.ok(evidence.missingComponents.length === 4);
});

test('official index acquisition only requests authority dates absent from retained history', () => {
  const sessions = ['2026-08-31', '2026-09-01'];
  assert.deepEqual(missingOfficialIndexAuthorityRequests(sessions, [
    { market: 'TWSE', session_date: '2026-08-31', index_close: 24000 },
    { market: 'TWSE', session_date: '2026-09-01', index_close: null },
    { market: 'TPEX', session_date: '2026-08-31', index_close: 260 },
    { market: 'TPEX', session_date: '2026-09-01', index_close: 261 },
  ]), { taiexMonths: ['2026-09-01'], tpexSessions: [] });
});

test('official market parsers normalize TWSE and TPEx evidence', () => {
  assert.deepEqual(parseTaiexHistory({
    fields: ['日期', '開盤指數', '收盤指數'],
    data: [['115/09/01', '46,177.11', '46,948.72']],
  }), [{ date: '2026-09-01', close: 46948.72 }]);
  assert.deepEqual(parseTpexIndex({ tables: [{
    fields: ['日期', '成交張數', '櫃買指數'],
    data: [['115/09/01', '902,905', 410.77]],
  }] }), [{ date: '2026-09-01', close: 410.77 }]);
  assert.deepEqual([...parseTpexDailyCloses({ tables: [{
    fields: ['代號', '名稱', '收盤'],
    data: [['6488', '環球晶', '399.50'], ['00679B', 'ETF', '25.59'], ['----', 'invalid', '--']],
  }] })], [['6488', 399.5]]);
  assert.equal(parseForeignNetTwd({
    fields: ['單位名稱', '買進金額', '賣出金額', '買賣差額'],
    data: [['外資及陸資(不含外資自營商)', '10', '4', '6']],
  }, 'TWSE'), 6);
  assert.equal(parseForeignNetTwd({ tables: [{
    fields: ['單位名稱', '買進金額(元)', '賣出金額(元)', '買賣超(元)'],
    data: [['外資及陸資合計', '10', '4', '6']],
  }] }, 'TPEX'), 6);
});
