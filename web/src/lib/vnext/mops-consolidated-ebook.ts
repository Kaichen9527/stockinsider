import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES } from '../candidate-financial-documents.ts';
import { evidenceInstant, evidenceKnownAt } from './evidence-clock.ts';

const archiveUrl = 'https://doc.twse.com.tw/server-java/t57sb01';
const archiveOrigin = new URL(archiveUrl).origin;
const archiveHeader = ['證券代號', '資料年度', '資料類型', '結案類型', '性質', '資料細節說明',
  '備註', '電子檔案', '檔案大小', '上傳日期', '財務報告更(補)正'];
const quarterNames = ['第一季', '第二季', '第三季', '第四季'];
const quarterEnds = ['03-31', '06-30', '09-30', '12-31'];
const maxHtmlBytes = 256 * 1024;

type Scope = { symbol: string; year: number; quarter: number };
type ArchiveRow = { filename: string; expectedBytes: number; archiveUploadedAt: string };

function fail(reason: string): never {
  throw Error('vnext_mops_consolidated_ebook_' + reason);
}

function scope(input: Scope) {
  const { symbol, year, quarter } = input;
  if (typeof symbol !== 'string' || !/^\d{4,6}$/u.test(symbol) || !Number.isInteger(year) || year < 2013 || year > 2200
    || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) fail('scope_invalid');
  return {
    symbol, year, quarter, rocYear: year - 1911, periodEnd: year + '-' + quarterEnds[quarter - 1],
    filenamePrefix: year + '0' + quarter + '_' + symbol + '_',
  };
}

function descendants(node: Tree.Node): Tree.Node[] {
  const found: Tree.Node[] = [];
  const pending = [node];
  while (pending.length > 0) {
    const next = pending.pop()!;
    found.push(next);
    if ('childNodes' in next) for (let i = next.childNodes.length - 1; i >= 0; i--) pending.push(next.childNodes[i]);
  }
  return found;
}

function elements(node: Tree.Node, tag: string) {
  return descendants(node).filter((item): item is Tree.Element => 'tagName' in item && item.tagName === tag);
}

function attribute(node: Tree.Element, name: string) {
  return node.attrs.find((attr) => attr.name === name)?.value;
}

function label(node: Tree.Node) {
  return descendants(node).map((item) => 'value' in item && item.nodeName === '#text' ? item.value : '')
    .join('').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function directCells(row: Tree.Element) {
  return row.childNodes.filter((node): node is Tree.Element => 'tagName' in node && (node.tagName === 'th' || node.tagName === 'td'));
}

function tableRows(table: Tree.Element) {
  const rows: Tree.Element[] = [];
  for (const part of table.childNodes) {
    if (!('tagName' in part)) continue;
    if (part.tagName === 'tr') rows.push(part);
    if (['thead', 'tbody', 'tfoot'].includes(part.tagName)) {
      for (const row of part.childNodes) if ('tagName' in row && row.tagName === 'tr') rows.push(row);
    }
  }
  return rows.map(directCells);
}

function parseHtml(body: string) {
  if (!body || Buffer.byteLength(body) > maxHtmlBytes * 3) fail('html_invalid');
  return parse(body, { scriptingEnabled: false });
}

function archiveClock(value: string) {
  const match = /^(\d{3})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/u.exec(value);
  if (!match) fail('upload_clock_invalid');
  const iso = (Number(match[1]) + 1911) + '-' + match[2] + '-' + match[3] + 'T' + match[4] + '+08:00';
  if (evidenceInstant(iso) === null) fail('upload_clock_invalid');
  return iso;
}

/** The archive's translated, corrected, and company-only rows do not supply
 * the same disclosure. A revised row needs the original/correction chain. */
export function parseMopsConsolidatedEbookIndex(body: string, input: Scope): ArchiveRow {
  const { symbol, rocYear, quarter, filenamePrefix, periodEnd } = scope(input);
  const page = parseHtml(body);
  const tables = elements(page, 'table').map(tableRows);
  const matchingTables = tables.filter((rows) => rows[0]?.map(label).join('|') === archiveHeader.join('|'));
  if (!matchingTables.length) fail('listing_unavailable');
  if (matchingTables.length !== 1) fail('ambiguous_listing');
  const period = rocYear + ' 年 ' + quarterNames[quarter - 1];
  const reports = matchingTables[0].slice(1).filter((cells) => cells.length === archiveHeader.length
    && label(cells[0]) === symbol && label(cells[1]) === period
    && label(cells[2]) === '財務報告書' && label(cells[5]) === 'IFRSs合併財報');
  if (!reports.length) fail('report_unavailable');
  if (reports.length !== 1 || label(reports[0][10]) !== '無') fail('revision_history_required');
  const row = reports[0];
  const links = elements(row[7], 'a');
  if (links.length !== 1) fail('report_link_invalid');
  const filename = label(links[0]);
  if (![filenamePrefix + 'AI1.pdf', filenamePrefix + 'A1.pdf'].includes(filename)
    || attribute(links[0], 'href') !== 'javascript:readfile2("A","' + symbol + '","' + filename + '");') fail('report_link_invalid');
  const rawSize = label(row[8]);
  if (!/^(?:[1-9]\d{0,8}|[1-9]\d{0,2}(?:,\d{3}){1,2})$/u.test(rawSize)) fail('report_size_invalid');
  const expectedBytes = Number(rawSize.replaceAll(',', ''));
  if (expectedBytes < 5 || expectedBytes > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES) fail('report_size_invalid');
  const archiveUploadedAt = archiveClock(label(row[9]));
  if (archiveUploadedAt.slice(0, 10) < periodEnd) fail('upload_before_period_end');
  return { filename, archiveUploadedAt, expectedBytes };
}

/**
 * Some financial holding-company queries return a selection form. Submit
 * it only for the exact originally requested listing code and period.
 */
function holdingCompanyConfirmation(body: string, input: Scope) {
  const { symbol, rocYear, quarter } = scope(input);
  const forms = elements(parseHtml(body), 'form').filter((form) => attribute(form, 'name') === 'fm'
    && elements(form, 'input').some((field) => attribute(field, 'name') === 'check2858'));
  if (!forms.length) return null;
  const [form] = forms;
  if (forms.length !== 1 || attribute(form, 'action') !== '/server-java/t57sb01'
    || attribute(form, 'method')?.toLowerCase() !== 'post') fail('holding_company_selection_invalid');
  const fields = {
    check2858: 'Y', co_id: symbol, colorchg: '1', year: String(rocYear),
    step: '1', seamon: String(quarter), mtype: 'A',
  };
  const hidden = elements(form, 'input').filter((field) => attribute(field, 'type') === 'hidden');
  if (hidden.length !== Object.keys(fields).length || Object.entries(fields).some(([name, value]) =>
    hidden.filter((field) => attribute(field, 'name') === name && attribute(field, 'value') === value).length !== 1)) {
    fail('holding_company_selection_invalid');
  }
  const selected = elements(form, 'tr').map(directCells).filter((cells) => cells.length === 3 && label(cells[0]) === symbol
    && elements(cells[2], 'input').some((button) => attribute(button, 'type') === 'image'
      && attribute(button, 'src') === '/image/t56sf26.gif'));
  if (selected.length !== 1) fail('holding_company_selection_invalid');
  return new URLSearchParams(fields);
}

function archiveDownloadUrl(body: string, filename: string) {
  const links = elements(parseHtml(body), 'a').filter((link) => label(link) === filename);
  if (links.length !== 1) fail('download_link_invalid');
  const path = attribute(links[0], 'href') || '';
  const base = '/pdf/' + filename.slice(0, -4) + '_';
  if (!path.startsWith(base) || !/^\d{8}_\d{6}[.]pdf$/u.test(path.slice(base.length))) fail('download_link_invalid');
  return archiveOrigin + path;
}

async function collect(response: Response, maxBytes: number) {
  if (!response.body) fail('body_missing');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        fail('response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!byteLength) fail('body_missing');
  return Buffer.concat(chunks, byteLength);
}

async function receive(transport: typeof fetch, url: string, init?: RequestInit) {
  const response = await transport(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || response.url !== url || response.redirected) fail('source_response_unavailable');
  return response;
}

async function receiveHtml(transport: typeof fetch, url: string, init?: RequestInit) {
  const response = await receive(transport, url, init);
  const contentType = response.headers.get('content-type') || '';
  const mime = /^text\/html\s*;\s*charset=(big5|utf-8)$/iu.exec(contentType.trim());
  if (!mime) fail('html_charset_unavailable');
  const raw = await collect(response, maxHtmlBytes);
  return { raw, body: new TextDecoder(mime[1].toLowerCase(), { fatal: true }).decode(raw) };
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Capture the listed original as private evidence. Upload time is registry
 * metadata. The complete acquisition time bounds when this receipt was known. */
export async function captureMopsConsolidatedEbook(input: Scope, transport = fetch, now = () => new Date()) {
  const { symbol, rocYear, quarter, periodEnd } = scope(input);
  const listingUrl = archiveUrl + '?' + new URLSearchParams({
    step: '1', colorchg: '1', co_id: symbol, year: String(rocYear), seamon: String(quarter), mtype: 'A',
  });
  const index = await receiveHtml(transport, listingUrl);
  const confirm = holdingCompanyConfirmation(index.body, input);
  const listing = confirm ? await receiveHtml(transport, archiveUrl, { method: 'POST', body: confirm }) : index;
  const selected = parseMopsConsolidatedEbookIndex(listing.body, input);
  const startedAt = now().toISOString();
  if (!evidenceKnownAt(selected.archiveUploadedAt, startedAt)) fail('upload_clock_after_observation');
  const handoff = await receiveHtml(transport, archiveUrl, {
    method: 'POST',
    body: new URLSearchParams({ colorchg: '1', step: '9', kind: 'A', co_id: symbol, filename: selected.filename, DEBUG: '' }),
  });
  const downloadUrl = archiveDownloadUrl(handoff.body, selected.filename);
  const response = await receive(transport, downloadUrl, { headers: { Accept: 'application/pdf' } });
  if (!/^application\/pdf(?:;|$)/iu.test(response.headers.get('content-type') || '')) fail('pdf_content_type_invalid');
  const pdf = await collect(response, selected.expectedBytes);
  if (pdf.byteLength !== selected.expectedBytes || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') fail('pdf_file_invalid');
  const knownAt = now().toISOString();
  if (!evidenceKnownAt(startedAt, knownAt)) fail('capture_clock_reversed');
  return {
    receipt: {
      schema: 'vnext-mops-consolidated-ebook-v1', symbol, requestedPeriodEnd: periodEnd,
      archiveFilename: selected.filename, archiveUploadedAt: selected.archiveUploadedAt, knownAt,
      listingUrl, listingSha256: sha256(listing.raw), handoffSha256: sha256(handoff.raw),
      holdingCompanyIndexSha256: confirm ? sha256(index.raw) : null,
      documentSha256: sha256(pdf), documentBytes: pdf.byteLength, authority: 'raw_document_only',
    },
    originals: { listing: listing.raw, handoff: handoff.raw, pdf, holdingCompanyIndex: confirm ? index.raw : null },
  };
}
