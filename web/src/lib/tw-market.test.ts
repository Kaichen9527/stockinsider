import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTpexTradingStockRows } from './tw-market.ts';

test('TPEx official monthly rows normalize ROC dates and trading lots', () => {
  const rows = parseTpexTradingStockRows({
    tables: [{
      fields: ['日 期', '成交張數', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌', '筆數'],
      data: [['115/08/28', '1,234', '33,000', '27.65', '30.15', '27.60', '27.60', '-0.05', '81']],
    }],
  });
  assert.deepEqual(rows, [{
    time: '2026-08-28',
    open: 27.65,
    high: 30.15,
    low: 27.6,
    close: 27.6,
    volume: 1_234_000,
  }]);
});
