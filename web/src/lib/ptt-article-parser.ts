/** Bounded, transient PTT article parsing. Never persists or authorizes content. */
import { createHash } from 'node:crypto';
import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { evidenceInstant, evidenceKnownAt } from './vnext/evidence-clock.ts';

export const PTT_ARTICLE_PARSER = 'ptt-own-body-v1' as const;
const MAX_HTML_BYTES = 524288, MAX_NODES = 20000, MAX_DEPTH = 64, MAX_BODY_BYTES = 32768;
const CLOCK_TOLERANCE_SECONDS = 5;
type Status = 'body_read' | 'body_missing' | 'html_overbound' | 'layout_unsupported' | 'body_overbound';
export type PttArticleRead = {
  parserVersion: typeof PTT_ARTICLE_PARSER; status: Status; canonicalUrl: string | null; articleId: string | null;
  sourcePublishedAt: string | null; articleIdAt: string | null; clockDeltaSeconds: number | null;
  clockConsistent: boolean; originKind: 'original' | 'reply_or_repost' | 'unknown';
  title: string | null; author: string | null; bodyText: string | null; cleanBodySha256: string | null; gaps: string[];
};
export type PttBodyProvenance = {
  schema: 'ptt-own-body-provenance-v1'; parser_version: typeof PTT_ARTICLE_PARSER;
  status: Status; canonical_url: string | null; article_id: string | null;
  source_published_at: string | null; article_id_at: string | null; clock_delta_seconds: number | null;
  clock_consistent: boolean; origin_kind: PttArticleRead['originKind']; clean_body_sha256: string | null;
  local_author_sha256: string | null; body_symbols: string[]; body_retained: false;
  publisher_revision_verified: false; original_root_verified: false; gaps: string[];
};
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
function boundedStrings(value: unknown, max: number, pattern: RegExp): string[] | null {
  if (!Array.isArray(value)) return null;
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < 0 || length > max || Reflect.ownKeys(value).length !== length + 1) return null;
  const result: string[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string' || !pattern.test(descriptor.value)) return null;
    result.push(descriptor.value);
  }
  return result;
}
const element = (node: Tree.Node): node is Tree.Element => 'tagName' in node;
const children = (node: Tree.Node): Tree.ChildNode[] => 'childNodes' in node ? node.childNodes : [];
const attribute = (node: Tree.Element, name: string) => node.attrs.find(attr => attr.name === name)?.value ?? '';
const classes = (node: Tree.Element) => new Set(attribute(node, 'class').split(/\s+/u));
function text(node: Tree.Node): string {
  const output: string[] = []; const pending = [node];
  while (pending.length) {
    const current = pending.pop()!;
    if (current.nodeName === '#text') output.push((current as Tree.TextNode).value);
    else pending.push(...children(current).slice().reverse());
  }
  return output.join('').replace(/\s+/gu, ' ').trim();
}
function articleIdentity(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.ptt.cc', 'ptt.cc'].includes(url.hostname) || url.username || url.password || url.port || url.search || url.hash) return null;
    const match = /^\/bbs\/Stock\/(M\.(\d{10})\.A\.[A-F0-9]{3})\.html$/u.exec(url.pathname);
    if (!match) return null;
    return { canonicalUrl: `https://www.ptt.cc${url.pathname}`, articleId: match[1], articleIdAt: new Date(Number(match[2]) * 1000).toISOString() };
  } catch { return null; }
}
/** PTT's header uses English weekday/month and Taipei local time, not UTC.
 * Numeric article IDs are retained as a separate coarse consistency clock. */
function publication(value: string): string | null {
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(20\d{2})$/u.exec(value);
  if (!match) return null;
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[2]);
  const [day, hour, minute, second, year] = match.slice(3).map(Number);
  const local = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month || local.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59 ||
      ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][local.getUTCDay()] !== match[1]) return null;
  return new Date(local.getTime() - 8 * 3600000).toISOString();
}
function cleanLines(value: string): { body: string; quoted: boolean } {
  const output: string[] = []; let quoted = false;
  let withoutExamples = '';
  for (let index = 0; index < value.length; index++) {
    if (!['(', '（'].includes(value[index]) || !/^\s*(?:例|例如|範例)/u.test(value.slice(index + 1, index + 24))) { withoutExamples += value[index]; continue; }
    const stack = [value[index]]; const start = index;
    while (stack.length) {
      if (++index >= value.length || index - start > 2048 || stack.length > 16) throw Error('template_boundary_unsupported');
      const token = value[index];
      if (token === '(' || token === '（') stack.push(token);
      else if (token === ')' || token === '）') {
        if (stack.pop() !== (token === ')' ? '(' : '（')) throw Error('template_boundary_unsupported');
      }
    }
  }
  for (const raw of withoutExamples.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.replace(/[\t\u00a0 ]+/gu, ' ').trim();
    if (/^--\s*$/u.test(line) || /^※\s*(發信站|文章網址|編輯)/u.test(line)) break;
    if (/^※\s*(引述|轉錄)|^\s*[:：>]/u.test(line)) { quoted = true; continue; }
    // Board instructions/examples are not the author's stock selection. Keep
    // actual numbered 標的/分析 fields, but discard their instructional examples.
    if (/範例|例如|\(\s*例|（\s*例|請勿刪除|發文前請|標的文(?:格式|範本)|以上(?:範本|模板)|板規|版規/u.test(line)) continue;
    if (/^※/u.test(line)) continue;
    output.push(line);
  }
  return { body: output.join('\n').replace(/\n{3,}/gu, '\n\n').trim(), quoted };
}
export function parsePttArticleHtml(html: string, documentUrl: string): PttArticleRead {
  const identity = typeof documentUrl === 'string' && documentUrl.length <= 2048 ? articleIdentity(documentUrl) : null;
  const result: PttArticleRead = { parserVersion: PTT_ARTICLE_PARSER, status: 'layout_unsupported', canonicalUrl: identity?.canonicalUrl ?? null,
    articleId: identity?.articleId ?? null, articleIdAt: identity?.articleIdAt ?? null, sourcePublishedAt: null, clockDeltaSeconds: null,
    clockConsistent: false, originKind: 'unknown', title: null, author: null, bodyText: null, cleanBodySha256: null, gaps: [] };
  if (!identity) { result.gaps.push('article_url_invalid'); return result; }
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) { result.status = 'html_overbound'; result.gaps.push('html_bound_exceeded'); return result; }
  try {
    let duplicateAttribute = false;
    const document = parse(html, { sourceCodeLocationInfo: true, onParseError(error) { if (error.code === 'duplicate-attribute') duplicateAttribute = true; } });
    const mains: Tree.Element[] = []; const pending: Array<{ node: Tree.Node; depth: number }> = [{ node: document, depth: 0 }]; let count = 0;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++count > MAX_NODES || depth > MAX_DEPTH) throw Error('layout_bound_exceeded');
      if (element(node) && attribute(node, 'id') === 'main-content') mains.push(node);
      for (const child of children(node)) pending.push({ node: child, depth: depth + 1 });
    }
    if (duplicateAttribute || mains.length !== 1 || !mains[0].sourceCodeLocation?.endTag) throw Error('main_content_not_unique_and_closed');
    const main = mains[0]; const metadata = new Map<string, string[]>(); const body: string[] = [];
    const skip = new Set(['script','style','noscript','template','blockquote']);
    const excluded = new Set(['article-metaline','article-metaline-right','push','article-polling','article-footer','board-rule','template']);
    const walk: Array<{ node: Tree.Node; exit?: boolean }> = [{ node: main }];
    let htmlQuote = false;
    while (walk.length) {
      const { node, exit } = walk.pop()!;
      if (node.nodeName === '#text') { if (!exit) body.push((node as Tree.TextNode).value); continue; }
      if (!element(node)) continue;
      const classNames = classes(node);
      if (!exit && (classNames.has('article-metaline') || classNames.has('article-metaline-right'))) {
        const tags = children(node).filter(element).filter(child => classes(child).has('article-meta-tag'));
        const values = children(node).filter(element).filter(child => classes(child).has('article-meta-value'));
        if (tags.length !== 1 || values.length !== 1) throw Error('article_metadata_ambiguous');
        const key = text(tags[0]); metadata.set(key, [...(metadata.get(key) ?? []), text(values[0])]); continue;
      }
      if (skip.has(node.tagName) || [...classNames].some(name => excluded.has(name))) { if (node.tagName === 'blockquote') htmlQuote = true; continue; }
      if (node.tagName === 'br' || ['div','p','li','pre'].includes(node.tagName)) body.push('\n');
      if (exit) continue;
      walk.push({ node, exit: true });
      for (const child of children(node).slice().reverse()) walk.push({ node: child });
    }
    for (const key of ['作者','標題','時間']) if (metadata.get(key)?.length !== 1 || !metadata.get(key)?.[0]) throw Error('article_metadata_missing_or_duplicate');
    if (metadata.has('看板') && (metadata.get('看板')?.length !== 1 || metadata.get('看板')?.[0] !== 'Stock')) throw Error('article_board_mismatch');
    if (metadata.get('作者')![0].length > 128 || metadata.get('標題')![0].length > 512) throw Error('article_metadata_overbound');
    result.author = metadata.get('作者')![0]; result.title = metadata.get('標題')![0];
    result.sourcePublishedAt = publication(metadata.get('時間')![0]);
    if (result.sourcePublishedAt) {
      result.clockDeltaSeconds = (Date.parse(result.sourcePublishedAt) - Date.parse(identity.articleIdAt)) / 1000;
      result.clockConsistent = Math.abs(result.clockDeltaSeconds) <= CLOCK_TOLERANCE_SECONDS;
    }
    const cleaned = cleanLines(body.join(''));
    result.originKind = /^(?:\s*(?:Re|Fw)\s*:\s*)|\[轉錄\]/iu.test(result.title) || cleaned.quoted || htmlQuote ? 'reply_or_repost' : 'original';
    if (!result.sourcePublishedAt) result.gaps.push('source_publication_time_missing');
    else if (!result.clockConsistent) result.gaps.push('article_clock_conflict');
    if (result.originKind !== 'original') result.gaps.push('quoted_or_reposted_original_unresolved');
    if (Buffer.byteLength(cleaned.body, 'utf8') > MAX_BODY_BYTES) { result.status = 'body_overbound'; result.gaps.push('clean_body_bound_exceeded'); return result; }
    result.status = cleaned.body ? 'body_read' : 'body_missing';
    if (!cleaned.body) result.gaps.push('own_body_missing');
    else { result.bodyText = cleaned.body; result.cleanBodySha256 = sha(cleaned.body); }
    return result;
  } catch { result.status = 'layout_unsupported'; result.bodyText = null; result.cleanBodySha256 = null; result.gaps.push('article_layout_unsupported'); return result; }
}
/** Only bounded metadata leaves the transient parser; never body text/title or
 * author identity. This is an acquired-page observation, not publisher authority. */
export function pttBodyProvenance(read: PttArticleRead, symbols: readonly string[]): PttBodyProvenance {
  const bodySymbols = [...new Set(symbols.filter(symbol => /^\d{4}$/u.test(symbol)))].sort();
  return { schema: 'ptt-own-body-provenance-v1', parser_version: PTT_ARTICLE_PARSER, status: read.status,
    canonical_url: read.canonicalUrl, article_id: read.articleId, source_published_at: read.sourcePublishedAt, article_id_at: read.articleIdAt,
    clock_delta_seconds: read.clockDeltaSeconds, clock_consistent: read.clockConsistent, origin_kind: read.originKind,
    clean_body_sha256: read.cleanBodySha256, local_author_sha256: read.author ? sha(read.author) : null,
    body_symbols: read.status === 'body_read' && bodySymbols.length <= 12 ? bodySymbols : [], body_retained: false, publisher_revision_verified: false,
    original_root_verified: false, gaps: [...read.gaps, ...(bodySymbols.length > 12 ? ['body_symbol_bound_exceeded'] : [])] };
}
/** Header and filename agreement never supersedes actual acquisition time. */
export function pttPublicationKnownAt(read: PttArticleRead, observedAt: string): boolean {
  return read.sourcePublishedAt !== null && read.clockConsistent && evidenceKnownAt(read.sourcePublishedAt, observedAt);
}
/** Validate retained parser metadata without treating it as a rights credential.
 * This projection never contains raw text/author and cannot authorize a queue. */
export function projectPttBodyObservation(value: unknown, documentUrl: string, availableAt: string, cutoff: string) {
  const blocked = (reason: string) => ({ status: 'blocked' as const, reason, symbols: [] as string[],
    articleId: null as string | null, sourcePublishedAt: null as string | null, cleanBodySha256: null as string | null,
    researchAdmissionAuthority: false as const, independentOriginVerified: false as const,
    instrumentQualificationAuthority: false as const, liquidityQualificationAuthority: false as const });
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return blocked('body_provenance_invalid');
    const keys = ['schema','parser_version','status','canonical_url','article_id','source_published_at','article_id_at','clock_delta_seconds',
      'clock_consistent','origin_kind','clean_body_sha256','local_author_sha256','body_symbols','body_retained','publisher_revision_verified','original_root_verified','gaps'];
    if (Reflect.ownKeys(value).length !== keys.length) return blocked('body_provenance_invalid');
    const row: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return blocked('body_provenance_invalid');
      row[key] = descriptor.value;
    }
    const identity = articleIdentity(documentUrl);
    const symbols = boundedStrings(row.body_symbols, 12, /^\d{4}$/u);
    const gaps = boundedStrings(row.gaps, 8, /^[a-z_]{1,80}$/u);
    if (!identity || row.schema !== 'ptt-own-body-provenance-v1' || row.parser_version !== PTT_ARTICLE_PARSER ||
        row.canonical_url !== identity.canonicalUrl || row.article_id !== identity.articleId || row.article_id_at !== identity.articleIdAt ||
        row.body_retained !== false || row.publisher_revision_verified !== false || row.original_root_verified !== false ||
        !symbols || new Set(symbols).size !== symbols.length || !gaps ||
        typeof row.local_author_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.local_author_sha256)) return blocked('body_provenance_invalid');
    if (row.status !== 'body_read' || typeof row.clean_body_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.clean_body_sha256)) return blocked('own_body_not_complete');
    if (typeof row.source_published_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/u.test(row.source_published_at) ||
        evidenceInstant(row.source_published_at) === null) return blocked('source_publication_time_missing');
    const event = Date.parse(row.source_published_at), delta = (event - Date.parse(identity.articleIdAt)) / 1000;
    if (row.clock_delta_seconds !== delta || row.clock_consistent !== true || Math.abs(delta) > CLOCK_TOLERANCE_SECONDS) return blocked('article_clock_conflict');
    if (row.origin_kind !== 'original') return blocked('quoted_or_reposted_original_unresolved');
    if (!evidenceKnownAt(row.source_published_at, availableAt) || !evidenceKnownAt(availableAt, cutoff)) return blocked('source_availability_clock_invalid');
    if (evidenceInstant(cutoff)! - evidenceInstant(row.source_published_at)! > BigInt(30 * 86400000000)) return blocked('source_publication_older_than_30_days');
    if (!symbols.length || gaps.length) return blocked('body_local_symbol_basis_missing_or_partial');
    return { status: 'ready_observation' as const, reason: null, symbols, articleId: identity.articleId,
      sourcePublishedAt: row.source_published_at, cleanBodySha256: row.clean_body_sha256,
      researchAdmissionAuthority: false as const, independentOriginVerified: false as const,
      instrumentQualificationAuthority: false as const, liquidityQualificationAuthority: false as const };
  } catch { return blocked('body_provenance_invalid'); }
}
