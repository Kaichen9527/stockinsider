import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { captureMopsConsolidatedEbook, parseMopsConsolidatedEbookIndex } from './mops-consolidated-ebook.ts';

const input = { symbol: '3526', year: 2025, quarter: 2 };
const filename = '202502_3526_AI1.pdf';
const pdf = Buffer.from('%PDF-1.6\nmock content\n');
const archiveUrl = 'https://doc.twse.com.tw/server-java/t57sb01';
const path = '/pdf/202502_3526_AI1_20261118_082712.pdf';
const now = () => new Date('2026-11-18T00:27:30Z');
const headings = ['證券代號', '資料年度', '資料類型', '結案類型', '性質', '資料細節說明', '備註', '電子檔案',
  '檔案大小', '上傳日期', '財務報告更(補)正'];
const original = {
  symbol: '3526', period: '114 年 第二季', type: '財務報告書', kind: 'IFRSs合併財報',
  text: filename, href: 'javascript:readfile2("A","3526","' + filename + '");',
  size: String(pdf.byteLength), upload: '114/08/11 17:02:48', correction: '無',
};

function row(fields: Partial<typeof original> = {}) {
  const data = { ...original, ...fields };
  return '<tr>' + [data.symbol, data.period, data.type, '', '', data.kind, '',
    '<a href=\'' + data.href + '\'>' + data.text + '</a>', data.size, data.upload, data.correction]
    .map((value) => '<td>' + value + '</td>').join('') + '</tr>';
}

function index(...rows: string[]) {
  return '<html><body><table><tr>' + headings.map((heading) => '<th>' + heading + '</th>').join('')
    + '</tr>' + rows.join('') + '</table></body></html>';
}

function fixture(options: {
  listing?: string; href?: string; payload?: Buffer; pdfMime?: string;
  responseUrl?: string; selection?: string;
} = {}) {
  const listing = options.listing ?? index(row());
  const handoff = '<html><a href="' + (options.href ?? path) + '">' + filename + '</a></html>';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const transport: typeof fetch = async (url, init) => {
    const requested = String(url);
    calls.push({ url: requested, init });
    if (options.selection !== undefined && calls.length === 1) {
      const result = new Response(options.selection, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      Object.defineProperty(result, 'url', { value: requested });
      return result;
    }
    const position = calls.length - Number(options.selection !== undefined);
    const body = position === 1 ? listing : position === 2 ? handoff : new Uint8Array(options.payload ?? pdf);
    const type = position <= 2 ? 'text/html;charset=utf-8' : options.pdfMime ?? 'application/pdf';
    const response = new Response(body, { headers: { 'content-type': type } });
    Object.defineProperty(response, 'url', { value: position === 3 ? options.responseUrl ?? requested : requested });
    return response;
  };
  return { listing, handoff, calls, transport };
}

test('the index selects only the requested original Chinese IFRS consolidated filing', () => {
  const result = parseMopsConsolidatedEbookIndex(index(
    row({ kind: 'IFRSs英文版-合併財報', text: '202502_3526_AIA.pdf' }),
    row({ kind: 'IFRSs個體財報' }), row({ symbol: '2330' }), row({ period: '114 年 第一季' }), row(),
  ), input);
  assert.deepEqual(result, { filename, archiveUploadedAt: '2025-08-11T17:02:48+08:00', expectedBytes: pdf.byteLength });
});

test('corrected and duplicate original rows remain explicit gaps', () => {
  for (const html of [index(row({ correction: '有' })), index(row(), row())]) {
    assert.throws(() => parseMopsConsolidatedEbookIndex(html, input), /revision_history_required/u);
  }
  assert.throws(() => parseMopsConsolidatedEbookIndex(index(row({ period: '114 年 第一季' })), input), /report_unavailable/u);
  assert.throws(() => parseMopsConsolidatedEbookIndex('<html>no table</html>', input), /listing_unavailable/u);
});

test('the metadata rejects mismatched anchors, impossible or early clocks, and invalid sizes', () => {
  for (const changes of [
    { href: 'javascript:readfile2("A","2330","' + filename + '");' },
    { href: 'https://doc.twse.com.tw/' + filename },
    { text: '202502_2330_AI1.pdf' },
    { text: '202501_3526_AI1.pdf' },
  ]) {
    assert.throws(() => parseMopsConsolidatedEbookIndex(index(row(changes)), input), /report_link_invalid/u);
  }
  for (const value of ['114/02/30 17:00:00', '114/08/11 25:00:00']) {
    assert.throws(() => parseMopsConsolidatedEbookIndex(index(row({ upload: value })), input), /upload_clock_invalid/u);
  }
  assert.throws(() => parseMopsConsolidatedEbookIndex(index(row({ upload: '114/06/29 10:00:00' })), input), /upload_before_period_end/u);
  for (const value of ['0', '5,24', '100,000,000']) {
    assert.throws(() => parseMopsConsolidatedEbookIndex(index(row({ size: value })), input), /report_size_invalid/u);
  }
});

test('the actual capture flow uses the fixed form and records original bytes and both clocks', async () => {
  const { transport, calls, listing, handoff } = fixture();
  const result = await captureMopsConsolidatedEbook(input, transport, now);
  assert.deepEqual(calls.map((call) => call.url), [
    archiveUrl + '?step=1&colorchg=1&co_id=3526&year=114&seamon=2&mtype=A', archiveUrl, 'https://doc.twse.com.tw' + path,
  ]);
  assert.equal(calls[1].init?.method, 'POST');
  assert.equal(calls[1].init?.body?.toString(), 'colorchg=1&step=9&kind=A&co_id=3526&filename=' + filename + '&DEBUG=');
  assert(calls.every((call) => call.init?.redirect === 'error' && call.init.cache === 'no-store'));
  assert.equal(result.receipt.requestedPeriodEnd, '2025-06-30');
  assert.equal(result.receipt.knownAt, '2026-11-18T00:27:30.000Z');
  assert.equal(result.receipt.archiveUploadedAt, '2025-08-11T17:02:48+08:00');
  assert.equal(result.receipt.authority, 'raw_document_only');
  assert.deepEqual(result.originals.pdf, pdf);
  for (const [field, originalBytes] of [
    ['listingSha256', Buffer.from(listing)], ['handoffSha256', Buffer.from(handoff)], ['documentSha256', pdf],
  ] as const) assert.equal(result.receipt[field], createHash('sha256').update(originalBytes).digest('hex'));
  assert.equal(JSON.stringify(result.receipt).includes(path), false);
});

test('the capture stops before downloading a wrong document or a future upload', async () => {
  for (const href of [
    'https://doc.twse.com.tw' + path, '//elsewhere.invalid' + path, path + '?x=2',
    '/pdf/202502_2330_AI1_20261118_082712.pdf',
  ]) {
    const { transport, calls } = fixture({ href });
    await assert.rejects(captureMopsConsolidatedEbook(input, transport, now), /download_link_invalid/u);
    assert.equal(calls.length, 2);
  }
  const { transport, calls } = fixture({ listing: index(row({ upload: '115/11/19 13:00:00' })) });
  await assert.rejects(captureMopsConsolidatedEbook(input, transport, now), /upload_clock_after_observation/u);
  assert.equal(calls.length, 1);
});

test('the PDF body must match the archive size, magic, MIME and exact HTTPS response', async () => {
  for (const [options, reason] of [
    [{ payload: pdf.subarray(0, -1) }, /pdf_file_invalid/u],
    [{ payload: Buffer.concat([pdf, Buffer.of(1)]) }, /response_too_large/u],
    [{ payload: Buffer.alloc(pdf.byteLength) }, /pdf_file_invalid/u],
    [{ pdfMime: 'text/html' }, /pdf_content_type_invalid/u],
    [{ responseUrl: 'https://elsewhere.invalid' + path }, /source_response_unavailable/u],
  ] as const) {
    const { transport } = fixture(options);
    await assert.rejects(captureMopsConsolidatedEbook(input, transport, now), reason);
  }
});

function confirmation(patch: Record<string, string> = {}) {
  const fields = { check2858: 'Y', co_id: '3526', colorchg: '1', year: '114', step: '1', seamon: '2', mtype: 'A', ...patch };
  return '<form name="fm" action="/server-java/t57sb01" method="post">'
    + Object.entries(fields).map(([name, value]) => '<input type="hidden" name="' + name + '" value="' + value + '">').join('')
    + '<table><tr><td>3526</td><td>同一發行人</td><td><input type="image" src="/image/t56sf26.gif"></td></tr>'
    + '<tr><td>35260001</td><td>子公司</td><td><a href="javascript:setCoid(2330)"></a></td></tr></table></form>';
}

test('holding-company selection retains a separate source receipt and stays on the exact issuer and period', async () => {
  const selection = confirmation();
  const { transport, calls } = fixture({ selection });
  const result = await captureMopsConsolidatedEbook(input, transport, now);
  assert.equal(calls.length, 4);
  assert.equal(calls[1].url, archiveUrl);
  assert.equal(calls[1].init?.body?.toString(), 'check2858=Y&co_id=3526&colorchg=1&year=114&step=1&seamon=2&mtype=A');
  assert.equal(result.receipt.holdingCompanyIndexSha256, createHash('sha256').update(selection).digest('hex'));
  assert.deepEqual(result.originals.holdingCompanyIndex, Buffer.from(selection));
});

test('selection of a subsidiary or change of filing period stops before any later request', async () => {
  const changedFields: Record<string, string>[] = [{ co_id: '35260001' }, { seamon: '3' }, { mtype: 'F' }];
  for (const patch of changedFields) {
    const { transport, calls } = fixture({ selection: confirmation(patch) });
    await assert.rejects(captureMopsConsolidatedEbook(input, transport, now), /holding_company_selection_invalid/u);
    assert.equal(calls.length, 1);
  }
});
