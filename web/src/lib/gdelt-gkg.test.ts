import assert from 'node:assert/strict';
import test from 'node:test';
import { gdeltGkgUrlsAfter, gdeltSearchableText, gdeltTransportReason, isRetiredNewsHost, matchGdeltStockSymbols, parseGdeltSeenDate, selectLatestGdeltGkgUrl } from './gdelt-gkg.ts';

test('GDELT raw feed selection upgrades the official HTTP listing to HTTPS', () => {
  const text = [
    '1 hash https://data.gdeltproject.org/gdeltv2/20260901150000.export.CSV.zip',
    '2 hash http://data.gdeltproject.org/gdeltv2/20260901150000.gkg.csv.zip',
  ].join('\n');
  assert.equal(selectLatestGdeltGkgUrl(text), 'https://data.gdeltproject.org/gdeltv2/20260901150000.gkg.csv.zip');
  assert.throws(() => selectLatestGdeltGkgUrl('1 hash http://example.test/fake.gkg.csv.zip'), /gdelt_lastupdate_gkg_missing/u);
});

test('GDELT cursor enumerates every 15-minute archive without reprocessing the cursor', () => {
  assert.deepEqual(gdeltGkgUrlsAfter(
    'https://data.gdeltproject.org/gdeltv2/20260901150000.gkg.csv.zip',
    'https://data.gdeltproject.org/gdeltv2/20260901154500.gkg.csv.zip',
  ), [
    'https://data.gdeltproject.org/gdeltv2/20260901151500.gkg.csv.zip',
    'https://data.gdeltproject.org/gdeltv2/20260901153000.gkg.csv.zip',
    'https://data.gdeltproject.org/gdeltv2/20260901154500.gkg.csv.zip',
  ]);
});

test('GDELT dates and transport failures retain exact terminal semantics', () => {
  assert.equal(parseGdeltSeenDate('20260901153045'), '2026-09-01T15:30:45Z');
  assert.match(gdeltTransportReason(new Error('ENOTFOUND data.gdeltproject.org')), /^gdelt_dns_failed:/u);
  assert.match(gdeltTransportReason(new Error('signal timed out')), /^gdelt_timeout:/u);
});

test('retired publishers cannot re-enter through GDELT discovery', () => {
  assert.equal(isRetiredNewsHost('https://money.udn.com/news/story/1'), true);
  assert.equal(isRetiredNewsHost('https://news.cnyes.com/news/id/1'), true);
  assert.equal(isRetiredNewsHost('https://example.com/company/2330'), false);
});

test('GKG matching reads content columns, not record date, and excludes year-shaped hits', () => {
  const columns = Array.from({ length: 27 }, () => '');
  columns[0] = '20260902120000-1';
  columns[1] = '20260902120000';
  columns[22] = '台積電,2330,2026 年市場展望';
  const searchable = gdeltSearchableText(columns);
  assert.deepEqual(matchGdeltStockSymbols(searchable, [
    { symbol: '2330', name: '台積電' },
    { symbol: '2026', name: '不存在公司' },
  ]), ['2330']);
  assert.equal(parseGdeltSeenDate(columns[1]), '2026-09-02T12:00:00Z');
});

test('GKG ignores bare four-digit numbers and accepts only explicit ticker syntax or company names', () => {
  const stocks = [
    { symbol: '2330', name: '台積電' },
    { symbol: '2002', name: '中鋼' },
    { symbol: '1234', name: '黑松' },
  ];
  assert.deepEqual(matchGdeltStockSymbols('revenue reached 2330 and 2002 units in 1234 regions', stocks), []);
  assert.deepEqual(matchGdeltStockSymbols('TWSE:2330 and $2002 moved while 1234 was a count', stocks), ['2330', '2002']);
  assert.deepEqual(matchGdeltStockSymbols('台積電供應鏈展望', stocks), ['2330']);
});
