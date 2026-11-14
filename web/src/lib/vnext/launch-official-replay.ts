/** DRAFT staging-only exchange-source parser. No acquisition, rights grant,
 * writer or publication authority; files/bytes must arrive through allowed scope. */
import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { officialTaiwanDataUrl } from '../taiwan-data-provider.ts';
import { parseOfficialCalendarBackfillPage } from '../official-calendar-backfill.ts';
import { isHistoryDate } from '../candidate-price-history.ts';
import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import type { LaunchExternalEvidence } from './launch-score-rules.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';

export const OFFICIAL_REPLAY_SCHEMA = 'launch-official-public-replay-v1';
export const OFFICIAL_REPLAY_PARSER = 'twse-t86-taiex-and-tpex-dailytrade-inx-v1';
const MAX_BYTES = 112 * 1024 * 1024, MAX_PAGES = 68;
const FLOW_HTML = 'https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html';
const INDEX_HTML = 'https://www.tpex.org.tw/zh-tw/indices/stock-index/industrial/inxh.html';
type Market = 'TWSE' | 'TPEX';
type Kind = 'index_month' | 'institutional_day';
type Body = { encoding: 'base64'; data: string } | { encoding: 'file'; path: string } | { encoding: 'absent' };
type Page = { market: Market; kind: Kind; requestKey: string; sourceUrl: string; observedAt: string; publisherPublishedAt: null;
  httpStatus: 200 | null; redirectCount: 0 | null; contentType: string | null; bytes: number; rawSha256: string; body: Body };
type Header = { kind: 'tpex_flow_group_header' | 'tpex_index_header'; sourceUrl: string; observedAt: string; bytes: number; rawSha256: string; body: Body };
type IndexRow = { session: string; close: number };
type FlowRow = { session: string; symbol: string; foreignNetShares: number; trustNetShares: number };
type Parsed = { page: Omit<Page, 'body'>; canonicalPayloadSha256: string; availableAt: string; schemaRevision: string | null; index: IndexRow[]; flow: FlowRow | null };
type State = { cutoff: string; pages: Parsed[]; gaps: string[]; throughSessions: string[] };
const states = new WeakMap<object, State>();
const fail = (code: string): never => { throw Error(code); };
const text = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const exact = (v: unknown, keys: string): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v)) && Object.keys(v).sort().join(' ') === keys.split(' ').sort().join(' ')
  && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value'));
const known = (at: unknown, cutoff: string) => evidenceInstant(at) !== null && evidenceInstant(at)! <= evidenceInstant(cutoff)!;
const normalize = (v: unknown) => String(v).replace(/\s+/gu, '').replace(/（/gu, '(').replace(/）/gu, ')');
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
const date = (v: unknown) => {
  const value = String(v).trim();
  if (isHistoryDate(value)) return value;
  const m = /^(\d{3,4})[/-]?(\d{2})[/-]?(\d{2})$/u.exec(value);
  if (!m) return null;
  const result = `${Number(m[1]) < 1911 ? Number(m[1]) + 1911 : m[1]}-${m[2]}-${m[3]}`;
  return isHistoryDate(result) ? result : null;
};
const integer = (v: unknown) => {
  if (typeof v === 'number') return Number.isSafeInteger(v) ? v : null;
  if (typeof v !== 'string' || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(v.trim())) return null;
  const n = Number(v.replace(/,/gu, '').trim()); return Number.isSafeInteger(n) ? n : null;
};

/** Additive historical routes; existing provider defaults remain unchanged. */
export function officialLaunchHistoricalUrl(market: Market, kind: Kind, key: string) {
  const session = kind === 'index_month' ? `${key}-01` : key;
  if (!['TWSE', 'TPEX'].includes(market) || !['index_month', 'institutional_day'].includes(kind) || !isHistoryDate(session)) return fail('official_replay_request_invalid');
  if (market === 'TWSE') return officialTaiwanDataUrl({ exchange: market, dataset: kind === 'index_month' ? 'market_index' : 'institutional_flow',
    symbol: null, phase: 'final', sessionDate: session })!;
  return kind === 'index_month'
    ? `https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?date=${encodeURIComponent(session.replace(/-/gu, '/'))}&response=json`
    : `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=${encodeURIComponent(session.replace(/-/gu, '/'))}&type=Daily&response=json&sect=EW`;
}

function raw(page: { bytes: number; rawSha256: string; body: Body }, files: ReadonlyMap<string, Uint8Array>, maximum: number) {
  if (!Number.isSafeInteger(page.bytes) || page.bytes < 2 || page.bytes > maximum || !hash(page.rawSha256)) fail('official_replay_bytes_invalid');
  const body = page.body;
  if (exact(body, 'encoding') && body.encoding === 'absent') return null;
  let bytes: Uint8Array;
  if (exact(body, 'encoding data') && body.encoding === 'base64' && text(body.data, Math.ceil(maximum / 3) * 4)) {
    bytes = Buffer.from(body.data, 'base64');
    if (Buffer.from(bytes).toString('base64') !== body.data) fail('official_replay_base64_invalid');
  } else if (exact(body, 'encoding path') && body.encoding === 'file' && text(body.path, 180)
    && /^bodies\/[A-Za-z0-9_./-]+$/u.test(body.path) && body.path.split('/').every(part => part !== '' && part !== '.' && part !== '..')) {
    const found = files.get(body.path); if (!found) return null; bytes = found;
  } else return fail('official_replay_body_invalid');
  if (bytes.byteLength !== page.bytes || sha(bytes) !== page.rawSha256) fail('official_replay_raw_hash_mismatch');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

type Element = Tree.Element;
const element = (n: Tree.Node): n is Element => 'tagName' in n;
const children = (n: Tree.Node): Tree.ChildNode[] => 'childNodes' in n ? n.childNodes : [];
const attr = (n: Element, name: string) => n.attrs.find(a => a.name === name)?.value;
const nodeText = (n: Tree.Node): string => n.nodeName === '#text' ? (n as Tree.TextNode).value
  : element(n) && ['script', 'style', 'template', 'noscript'].includes(n.tagName) ? '' : children(n).map(nodeText).join('');
/** Expand a bounded real THEAD; every leaf must match the raw25-column array. */
function tpexHeader(html: string): string[][] | null {
  let duplicate = false;
  const dom = parse(html, { sourceCodeLocationInfo: true, onParseError(e) { if (e.code === 'duplicate-attribute') duplicate = true; } });
  const stack: Array<{ node: Tree.Node; depth: number }> = [{ node: dom, depth: 0 }], heads: Element[] = []; let count = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > 30000 || depth > 64) return null;
    if (element(node) && node.tagName === 'thead') heads.push(node);
    for (const child of children(node)) stack.push({ node: child, depth: depth + 1 });
  }
  if (duplicate) return null;
  const proofs: string[][][] = [];
  for (const head of heads) {
    if (!head.sourceCodeLocation?.endTag) continue;
    const rows = children(head).filter(element).filter(n => n.tagName === 'tr');
    if (!rows.length || rows.length > 8) continue;
    const grid: Array<Array<string | undefined>> = Array.from({ length: rows.length }, () => []); let invalid = false;
    rows.forEach((row, r) => {
      let column = 0;
      for (const cell of children(row).filter(element)) {
        if (cell.tagName !== 'th') { invalid = true; break; }
        while (grid[r][column] !== undefined) column++;
        const width = Number(attr(cell, 'colspan') ?? 1), height = Number(attr(cell, 'rowspan') ?? 1), value = normalize(nodeText(cell));
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || column + width > 25 || r + height > rows.length || !value) { invalid = true; break; }
        for (let rr = r; rr < r + height; rr++) for (let c = column; c < column + width; c++) {
          if (grid[rr][c] !== undefined) invalid = true; grid[rr][c] = value;
        }
        column += width;
      }
    });
    if (invalid || grid.some(row => row.length !== 25 || Array.from({ length: 25 }, (_, i) => row[i]).some(v => !v))) continue;
    const paths = Array.from({ length: 25 }, (_, c) => [...new Set(grid.map(row => row[c]!))]);
    const foreign = paths[4].slice(0, -1), trust = paths[13].slice(0, -1);
    if (foreign.some(v => ['外資及陸資(不含外資自營商)', '外陸資(不含外資自營商)'].includes(v)) && trust.includes('投信')
      && [2, 3].every(c => JSON.stringify(paths[c].slice(0, -1)) === JSON.stringify(foreign))
      && [11, 12].every(c => JSON.stringify(paths[c].slice(0, -1)) === JSON.stringify(trust))
      && [2, 11].every(c => ['買進', '買進股數'].includes(paths[c].at(-1)!))
      && [3, 12].every(c => ['賣出', '賣出股數'].includes(paths[c].at(-1)!))
      && [4, 13].every(c => ['買賣超', '買賣超股數'].includes(paths[c].at(-1)!))) proofs.push(paths);
  }
  return proofs.length === 1 ? proofs[0] : null;
}

function table(payload: Record<string, unknown>, required: string[]) {
  const candidates = [payload, ...(Array.isArray(payload.tables) ? payload.tables : [])].filter(value => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return Array.isArray(record.fields) && Array.isArray(record.data) && required.every(field => (record.fields as unknown[]).includes(field));
  });
  return candidates.length === 1 ? candidates[0] as { fields: unknown[]; data: unknown[] } : fail('official_replay_table_ambiguous');
}
function indexRows(page: Page, payload: Record<string, unknown>, responseText: string): IndexRow[] {
  const name = page.market === 'TWSE' ? '收盤指數' : '收市', selected = table(payload, ['日期', name]);
  const fields = selected.fields.map(normalize), di = fields.indexOf('日期'), ci = fields.indexOf(name), seen = new Set<string>();
  if (new Set(fields).size !== fields.length || !selected.data.length || selected.data.length > 31) fail('official_replay_index_schema_invalid');
  const rows = selected.data.map(row => {
    if (!Array.isArray(row) || row.length !== fields.length) return fail('official_replay_index_row_invalid');
    const session = date(row[di]), close = Number(String(row[ci]).replace(/,/gu, ''));
    if (!session || session.slice(0, 7) !== page.requestKey || seen.has(session) || !Number.isFinite(close) || close <= 0) return fail('official_replay_index_row_invalid');
    seen.add(session); return { session, close };
  });
  if (page.market === 'TWSE' && parseOfficialCalendarBackfillPage({ market: 'TWSE', sourceUrl: page.sourceUrl,
    responseText, responseSha256: page.rawSha256 })?.dates.length !== rows.length) fail('official_replay_existing_index_parser_mismatch');
  return rows.sort((a, b) => a.session.localeCompare(b.session));
}
function flowRow(page: Page, payload: Record<string, unknown>, proof: string[][] | null): FlowRow | null {
  if (page.market === 'TPEX' && !proof) return null;
  if (date(payload.date) !== page.requestKey) fail('official_replay_flow_date_invalid');
  const symbol = page.market === 'TWSE' ? '2330' : '6488';
  const selected = page.market === 'TWSE' ? table(payload, ['證券代號', '外陸資買進股數(不含外資自營商)', '外陸資賣出股數(不含外資自營商)',
    '外陸資買賣超股數(不含外資自營商)', '投信買進股數', '投信賣出股數', '投信買賣超股數']) : table(payload, ['代號']);
  const fields = selected.fields.map(normalize);
  if (!selected.data.length || selected.data.length > (page.market === 'TWSE' ? 50000 : 5000)) fail('official_replay_flow_bound');
  const code = page.market === 'TWSE' ? fields.indexOf('證券代號') : fields.indexOf('代號');
  if (page.market === 'TPEX' && (!proof || fields.length !== 25 || fields.some((field, i) => field !== proof[i].at(-1)))) return null;
  if (page.market === 'TWSE' && new Set(fields).size !== fields.length) fail('official_replay_flow_schema_invalid');
  const matching = selected.data.filter(row => Array.isArray(row) && String(row[code]).trim() === symbol);
  if (matching.length !== 1 || !Array.isArray(matching[0]) || matching[0].length !== fields.length) fail('official_replay_candidate_row_missing_or_duplicate');
  const row = matching[0], fi = page.market === 'TWSE' ? fields.indexOf('外陸資買賣超股數(不含外資自營商)') : 4;
  const ti = page.market === 'TWSE' ? fields.indexOf('投信買賣超股數') : 13;
  const foreign = integer(row[fi]), trust = integer(row[ti]);
  if (foreign === null || trust === null) fail('official_replay_flow_not_integer_shares');
  const pairs = page.market === 'TWSE' ? [
    [fields.indexOf('外陸資買進股數(不含外資自營商)'), fields.indexOf('外陸資賣出股數(不含外資自營商)'), foreign],
    [fields.indexOf('投信買進股數'), fields.indexOf('投信賣出股數'), trust],
  ] : [[2, 3, foreign], [11, 12, trust]];
  for (const [b, s, net] of pairs) {
    const bv = integer(row[b]), sv = integer(row[s]);
    if (b < 0 || s < 0 || bv === null || sv === null || bv < 0 || sv < 0 || bv - sv !== net) fail('official_replay_flow_net_mismatch');
  }
  return { session: page.requestKey, symbol, foreignNetShares: foreign, trustNetShares: trust };
}

/** Hash/schema stage only. Missing physical bytes never become cached rows. */
export function parseLaunchOfficialReplay(value: unknown, files: ReadonlyMap<string, Uint8Array> = new Map()) {
  if (!exact(value, 'schema parserContract targets throughSessions cutoff capture indexMonths flowSessions responses schemaEvidence')
    || value.schema !== OFFICIAL_REPLAY_SCHEMA || value.parserContract !== OFFICIAL_REPLAY_PARSER || evidenceInstant(value.cutoff) === null
    || JSON.stringify(value.targets) !== JSON.stringify([{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }])
    || JSON.stringify(value.throughSessions) !== JSON.stringify(['2026-11-12', '2026-11-13'])
    || !exact(value.capture, 'repository sourceCommit workflowPath runId runAttempt startedAt completedAt')
    || !text(value.capture.repository) || !/^[a-f0-9]{40}$/u.test(String(value.capture.sourceCommit))
    || !/^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/u.test(String(value.capture.workflowPath)) || !/^\d{1,20}$/u.test(String(value.capture.runId))
    || !Number.isSafeInteger(value.capture.runAttempt) || Number(value.capture.runAttempt) < 1
    || !known(value.capture.completedAt, String(value.cutoff)) || evidenceInstant(value.capture.completedAt)! >= evidenceInstant(value.cutoff)!
    || value.capture.startedAt !== null && !known(value.capture.startedAt, String(value.capture.completedAt))
    || !exact(value.indexMonths, 'TWSE TPEX') || !Array.isArray(value.flowSessions) || value.flowSessions.length > 21
    || value.flowSessions.some((day, i) => !isHistoryDate(day) || i > 0 && day <= (value.flowSessions as string[])[i - 1])
    || !Array.isArray(value.responses) || !Array.isArray(value.schemaEvidence) || value.schemaEvidence.length > 2
    || value.responses.length + value.schemaEvidence.length > MAX_PAGES) fail('official_replay_manifest_invalid');
  for (const market of ['TWSE', 'TPEX']) {
    const months = value.indexMonths[market];
    if (!Array.isArray(months) || months.length > 13 || months.some((month, i) => typeof month !== 'string' || !isHistoryDate(`${month}-01`) || i > 0 && month <= months[i - 1])) fail('official_replay_months_invalid');
  }
  const cutoff = value.cutoff as string, gaps: string[] = ['raw_replay_does_not_grant_source_or_redistribution_rights', 'selected_price_action_calendar_binding_not_connected'];
  let bytes = 0; const identities = new Set<string>(), paths = new Set<string>(), pages: Parsed[] = []; let proof: string[][] | null = null;
  let schemaAvailableAt: string | null = null, schemaRevision: string | null = null;
  const reserve = (page: { bytes: number; body: Body }) => {
    bytes += page.bytes; if (!Number.isSafeInteger(bytes) || bytes > MAX_BYTES) fail('official_replay_total_bound');
    if ('path' in page.body) { if (paths.has(page.body.path)) fail('official_replay_duplicate_file'); paths.add(page.body.path); }
  };
  for (const candidate of value.schemaEvidence) {
    if (!exact(candidate, 'kind sourceUrl observedAt bytes rawSha256 body') || !['tpex_flow_group_header', 'tpex_index_header'].includes(String(candidate.kind))
      || candidate.sourceUrl !== (candidate.kind === 'tpex_flow_group_header' ? FLOW_HTML : INDEX_HTML) || !known(candidate.observedAt, String(value.capture.completedAt))) fail('official_replay_schema_evidence_invalid');
    const header = candidate as unknown as Header;
    if (value.capture.startedAt !== null && evidenceInstant(header.observedAt)! < evidenceInstant(value.capture.startedAt)!) fail('official_replay_capture_clock_invalid');
    if (identities.has(header.kind)) fail('official_replay_duplicate_schema'); identities.add(header.kind); reserve(header);
    const body = raw(header, files, 500000);
    if (header.kind === 'tpex_flow_group_header' && body !== null) {
      proof = tpexHeader(body);
      if (proof) { schemaAvailableAt = header.observedAt; schemaRevision = sha256Canonical([header.sourceUrl, header.rawSha256, header.observedAt, proof]); }
    }
  }
  if (!proof) gaps.push('tpex_complete_grouped_header_proof_missing');
  for (const candidate of value.responses) {
    if (!exact(candidate, 'market kind requestKey sourceUrl observedAt publisherPublishedAt httpStatus redirectCount contentType bytes rawSha256 body')
      || !['TWSE', 'TPEX'].includes(String(candidate.market)) || !['index_month', 'institutional_day'].includes(String(candidate.kind))
      || candidate.publisherPublishedAt !== null || ![200, null].includes(candidate.httpStatus as number | null) || ![0, null].includes(candidate.redirectCount as number | null)
      || candidate.contentType !== null && !text(candidate.contentType, 128) || !known(candidate.observedAt, String(value.capture.completedAt))) fail('official_replay_response_invalid');
    const page = candidate as unknown as Page;
    if (value.capture.startedAt !== null && evidenceInstant(page.observedAt)! < evidenceInstant(value.capture.startedAt)!) fail('official_replay_capture_clock_invalid');
    if (page.sourceUrl !== officialLaunchHistoricalUrl(page.market, page.kind, page.requestKey)) fail('official_replay_source_invalid');
    const identity = `${page.market}:${page.kind}:${page.requestKey}`;
    if (identities.has(identity)) fail('official_replay_duplicate_page'); identities.add(identity); reserve(page);
    if (page.kind === 'index_month' ? !(value.indexMonths as Record<Market, string[]>)[page.market].includes(page.requestKey)
      : !(value.flowSessions as string[]).includes(page.requestKey)) fail('official_replay_unplanned_page');
    const body = raw(page, files, page.kind === 'institutional_day' && page.market === 'TWSE' ? 5000000 : 500000);
    if (body === null) { gaps.push(`raw_body_missing:${identity}`); continue; }
    if (page.httpStatus === null || page.redirectCount === null) gaps.push(`transport_receipt_unverified:${identity}`);
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(body); } catch { fail('official_replay_json_invalid'); }
    if (!payload! || typeof payload !== 'object' || Array.isArray(payload) || String(payload.stat).toLowerCase() !== 'ok') fail('official_replay_payload_invalid');
    const index = page.kind === 'index_month' ? indexRows(page, payload, body) : [];
    const flow = page.kind === 'institutional_day' ? flowRow(page, payload, proof) : null;
    if (page.kind === 'institutional_day' && flow === null) gaps.push(`flow_schema_unproven:${identity}`);
    const receipt = { market: page.market, kind: page.kind, requestKey: page.requestKey, sourceUrl: page.sourceUrl,
      observedAt: page.observedAt, publisherPublishedAt: null, httpStatus: page.httpStatus, redirectCount: page.redirectCount,
      contentType: page.contentType, bytes: page.bytes, rawSha256: page.rawSha256 };
    pages.push({ page: receipt, canonicalPayloadSha256: sha256Canonical(payload),
      availableAt: flow && page.market === 'TPEX' && schemaAvailableAt && evidenceInstant(schemaAvailableAt)! > evidenceInstant(page.observedAt)! ? schemaAvailableAt : page.observedAt,
      schemaRevision: flow && page.market === 'TPEX' ? schemaRevision : null, index, flow });
  }
  const state: State = { cutoff, pages, gaps, throughSessions: [...value.throughSessions as string[]] };
  const result = Object.freeze({ schema: OFFICIAL_REPLAY_SCHEMA, parserVersion: OFFICIAL_REPLAY_PARSER,
    scope: 'staging_raw_schema_replay_only' as const, cutoff, decodedBytes: bytes, parsedPages: pages.length,
    responseReceipts: pages.map(({ page, canonicalPayloadSha256, index, flow }) => ({ market: page.market, kind: page.kind,
      requestKey: page.requestKey, sourceUrl: page.sourceUrl, observedAt: page.observedAt, bytes: page.bytes, rawSha256: page.rawSha256,
      canonicalPayloadSha256, indexRows: index.length, candidateFlowRows: flow ? 1 : 0 })),
    sourceAuthority: false as const, publicationAuthority: false as const, redistributionAuthority: false as const, gaps: [...new Set(gaps)].sort() });
  states.set(result, state); return result;
}

/** Only parser-created state can bind; all requested sessions still come from
 * actual existing selected price/action/calendar evidence, not observed dates. */
export function bindLaunchOfficialReplay(read: ReturnType<typeof parseLaunchOfficialReplay>, request: TwEntryAuthorityRequest, selected: TwLaunchPatternReadEvidence) {
  const state = states.get(read); if (!state) fail('official_replay_foreign_or_cloned_read');
  const gaps = [...state.gaps], external: LaunchExternalEvidence = {};
  const calendar = selected.calendar;
  if (state.cutoff !== request.cutoff || !state.throughSessions.includes(request.signalSession) || calendar?.status !== 'validated_selected_window'
    || selected.history.missingData.length || selected.history.completedSessions.at(-1) !== request.signalSession
    || selected.history.bars.length < 240 || selected.history.priceBasis?.status !== 'verified' || !selected.corporateActions
    || !known(calendar.availableAt, request.cutoff) || !known(selected.history.availableAt, request.cutoff)
    || !known(selected.corporateActions.availableAt, request.cutoff)) return { external, gaps: [...gaps, 'official_replay_selected_binding_missing'] };
  const pages = state.pages.filter(item => item.page.market === request.exchange && known(item.page.observedAt, request.cutoff));
  type Match = { item: Parsed; row: IndexRow | FlowRow };
  const select = (kind: Kind, length: number): Array<Match | null> => calendar.sessions.slice(-length).map(session => {
    const matching: Match[] = [];
    for (const item of pages) {
      if (kind === 'index_month') for (const row of item.index) { if (row.session === session.session) matching.push({ item, row }); }
      else if (item.flow?.session === session.session) matching.push({ item, row: item.flow });
    }
    if (matching.length !== 1 || evidenceInstant(matching[0].item.page.observedAt)! < evidenceInstant(session.closeAt)!) return null;
    return matching[0];
  });
  const indexes = select('index_month', 200).filter((item): item is Match => item !== null);
  const source = (items: Array<{ item: Parsed }>) => ({ revisionId: `official-replay:${sha256Canonical(items.map(({ item }) => [item.page.sourceUrl, item.page.rawSha256, item.page.observedAt, item.schemaRevision, item.availableAt]))}`,
    market: request.exchange, provider: request.exchange.toLowerCase() as 'twse' | 'tpex', sourceUrl: items.at(-1)!.item.page.sourceUrl,
    sourceRef: OFFICIAL_REPLAY_PARSER, availableAt: items.map(({ item }) => item.availableAt).sort((a, b) => evidenceInstant(a)! < evidenceInstant(b)! ? -1 : 1).at(-1)!, cutoff: request.cutoff });
  if (indexes.length === 200) external.index = { ...source(indexes), rows: indexes.map(({ item, row }) =>
    ({ session: row.session, close: (row as IndexRow).close, sourceTimestamp: item.page.observedAt, availableAt: item.availableAt })) };
  else gaps.push('official_replay_200_selected_index_sessions_missing');
  const flows = select('institutional_day', 20).filter((item): item is Match => item !== null), share = selected.shareVolume;
  if (request.exchange === 'TPEX') gaps.push('tpex_exact_native_share_volume_20_and_51_not_proven');
  else if (share && share.status === 'no_candidate_events_in_selected_51' && share.snapshotIds.length === 51
    && share.sourceDatasetRevision === selected.history.sourceDatasetRevision && known(share.availableAt, request.cutoff)
    && selected.history.bars.slice(-51).every(bar => Number.isSafeInteger(bar.volume) && bar.volume >= 0)
    && share.fromSession <= selected.history.bars.at(-51)!.session && share.throughSession === request.signalSession && flows.length === 20
    && flows.every(({ row }) => (row as FlowRow).symbol === request.symbol)) external.chips = { ...source(flows), symbol: request.symbol, unit: 'shares', volumeUnit: 'shares',
    priceRevision: selected.history.sourceDatasetRevision, calendarRevision: calendar.revisionId, shareVolumeRevision: share.revisionId,
    rows: flows.map(({ item, row }) => ({ session: row.session, foreignNetShares: (row as FlowRow).foreignNetShares,
      trustNetShares: (row as FlowRow).trustNetShares, sourceTimestamp: item.page.observedAt, availableAt: item.availableAt })) };
  else gaps.push('official_replay_20_selected_flow_sessions_or_exact_volume_missing');
  return { external, gaps: [...new Set(gaps)].sort() };
}

/** External observation metadata plans collection/replay; it never creates raw
 * cached data or a parser-branded value accepted by the selected binder. */
export function officialReplayObservationPlan(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('official_observation_receipt_invalid');
  const receipt = value as Record<string, unknown>;
  if (receipt.schema !== 'stockinsider-official-launch-window-observation-v1') fail('official_observation_receipt_invalid');
  const index = receipt.marketIndex as { months?: unknown[] } | undefined, chips = receipt.chipWindow as { rows?: unknown[] } | undefined;
  if (!Array.isArray(index?.months) || !Array.isArray(chips?.rows) || index.months.length + chips.rows.length > MAX_PAGES) fail('official_observation_receipt_invalid');
  const records: Array<{ market: Market; kind: Kind; requestKey: string; sourceUrl: string; reportedBytes: number; reportedRawSha256: string; observedAt: string }> = [];
  const dates: Record<Market, Set<string>> = { TWSE: new Set(), TPEX: new Set() };
  for (const [kind, rows] of [['index_month', index!.months!], ['institutional_day', chips!.rows!]] as const) for (const candidate of rows) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail('official_observation_receipt_invalid');
    const row = candidate as Record<string, unknown>, market = row.market as Market;
    const key = kind === 'index_month' ? `2026-${String(row.month).padStart(2, '0')}` : String(row.day);
    if (!['TWSE', 'TPEX'].includes(market) || row.url !== officialLaunchHistoricalUrl(market, kind, key)
      || !hash(row.sha256) || !Number.isSafeInteger(row.bytes) || Number(row.bytes) < 2 || evidenceInstant(row.observedAt) === null) fail('official_observation_receipt_invalid');
    if (kind === 'index_month') {
      if (!Array.isArray(row.sessions) || row.sessions.some(day => !isHistoryDate(day) || day.slice(0, 7) !== key)) fail('official_observation_receipt_invalid');
      for (const day of row.sessions as string[]) dates[market].add(day);
    }
    records.push({ market, kind, requestKey: key, sourceUrl: String(row.url), reportedBytes: Number(row.bytes), reportedRawSha256: row.sha256 as string, observedAt: String(row.observedAt) });
  }
  if (new Set(records.map(row => `${row.market}:${row.kind}:${row.requestKey}`)).size !== records.length) fail('official_observation_receipt_invalid');
  return { scope: 'externally_reported_metadata_only' as const, records, rawBodiesAvailable: false as const, sourceAuthority: false as const,
    publicationAuthority: false as const, redistributionAuthority: false as const,
    observedWindowPlans: (['TWSE', 'TPEX'] as const).flatMap(market => ['2026-11-12', '2026-11-13'].map(throughSession => {
      const sessions = [...dates[market]].filter(day => day <= throughSession).sort();
      return { market, throughSession, observedIndexSessions: sessions.slice(-200), observedFlowSessions: sessions.slice(-20), calendarAuthority: false as const };
    })), gaps: ['raw_bodies_not_present_in_observation_receipt', 'reported_dates_are_not_calendar_authority', 'public_raw_redistribution_rights_not_established'] };
}
