import { createHmac } from 'node:crypto';
import { parseFragment, type DefaultTreeAdapterTypes as Tree } from 'parse5';
import { evidenceInstant } from './evidence-clock.ts';

const SENDER_DOMAIN = 'mailer.investanchors.com';
const MESSAGE_ID = /^[a-z0-9_-]{1,128}$/iu;
const SOURCE_DAY_LIMIT = 50;
const ONE_DAY_MS = 86_400_000;
const PAGE_SIZE = SOURCE_DAY_LIMIT;
const MAX_PAGES = 10;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_MIME_PARTS = 16;
type Row = Record<string, unknown>;
type Notice = {
  noticeKey: string;
  receivedAt: string;
  observedAt: string;
  subjectKey: string;
  articleKey: string | null;
  status: 'awaiting_member_article' | 'awaiting_article_resolution' | 'notice_content_unavailable';
};
type MailDependencies = {
  list(request: { q: string; maxResults: number; pageToken?: string }): Promise<unknown>;
  get(request: { id: string; format: 'full' }): Promise<unknown>;
  now(): string;
};

function row(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

export function planInvestAnchorsMailboxDay(day: string) {
  if (!/^20\d{2}-\d{2}-\d{2}$/u.test(day)) throw Error('investanchors_mailbox_day_invalid');
  const startMs = Date.parse(day + 'T00:00:00+08:00');
  if (!Number.isFinite(startMs) || new Date(startMs + 8 * 3600000).toISOString().slice(0, 10) !== day) {
    throw Error('investanchors_mailbox_day_invalid');
  }
  const endMs = startMs + ONE_DAY_MS;
  // Gmail search is a superset. Verify the exact half-open window against internalDate.
  const q = `from:${SENDER_DOMAIN} -in:spam -in:trash after:${startMs / 1000 - 1} before:${endMs / 1000}`;
  return { day, startMs, endMs, q };
}

function keyedId(key: Uint8Array, scope: string, value: string) {
  return createHmac('sha256', key).update('stockinsider:investanchors:notice:v1\0').update(scope).update('\0').update(value).digest('hex');
}

function getHeaders(payload: Row, name: string): string[] {
  return Array.isArray(payload.headers) && payload.headers.length <= 128
    ? payload.headers.flatMap(entry => {
      const h = row(entry);
      return typeof h?.name === 'string' && h.name.toLowerCase() === name
        && typeof h.value === 'string' && h.value.length <= 4096 ? [h.value] : [];
    }) : [];
}

function receiverReportsPublisher(payload: Row) {
  const from = getHeaders(payload, 'from');
  if (from.length !== 1) return false;
  const mailbox = /<([^<>]+)>\s*$/u.exec(from[0])?.[1] ?? from[0].trim();
  if (!/^[a-z0-9.!+_-]+@mailer\.investanchors\.com$/iu.test(mailbox)) return false;

  // Treat the Gmail-supplied result as a receiver observation, never an
  // independent signature check or a permission to resolve the article.
  const results = getHeaders(payload, 'authentication-results').filter(value => /^\s*mx\.google\.com\s*;/iu.test(value));
  if (results.length !== 1) return false;
  return results[0].split(';').some(field => /^\s*dkim=pass\b/iu.test(field)
    && /\bheader\.[di]=@?(?:mailer\.)?investanchors\.com(?=\s|$)/iu.test(field));
}

function articlePath(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://investanchors.com' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return /^\/user\/vip_contents\/[1-9]\d{5,23}$/u.test(parsed.pathname) ? parsed.pathname : null;
  } catch {
    return null;
  }
}

function decodeMimeText(payload: Row): Array<{ mime: string; text: string }> | null {
  const pending = [{ part: payload, depth: 0 }];
  const texts: Array<{ mime: string; text: string }> = [];
  let partCount = 0, bytes = 0;
  while (pending.length) {
    const { part, depth } = pending.pop()!;
    if (++partCount > MAX_MIME_PARTS || depth > 4 || typeof part.mimeType !== 'string') return null;
    if (typeof part.filename === 'string' && part.filename !== '') continue;
    if (part.mimeType === 'multipart/alternative' || part.mimeType === 'multipart/mixed' || part.mimeType === 'multipart/related') {
      if (!Array.isArray(part.parts) || part.parts.length > MAX_MIME_PARTS) return null;
      for (const value of part.parts) {
        const child = row(value);
        if (!child) return null;
        pending.push({ part: child, depth: depth + 1 });
      }
      continue;
    }
    if (part.mimeType !== 'text/plain' && part.mimeType !== 'text/html') continue;
    const body = row(part.body);
    if (!body || body.attachmentId || typeof body.data !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/u.test(body.data)
      || body.data.length > 4 * Math.ceil(MAX_BODY_BYTES / 3)) return null;
    const raw = Buffer.from(body.data, 'base64url');
    if (raw.length !== body.size || raw.toString('base64url') !== body.data.replace(/=+$/u, '') || (bytes += raw.length) > MAX_BODY_BYTES) return null;
    try {
      texts.push({ mime: part.mimeType, text: new TextDecoder('utf-8', { fatal: true }).decode(raw) });
    } catch {
      return null;
    }
  }
  return texts.length ? texts : null;
}

function sourceArticlePaths(parts: Array<{ mime: string; text: string }>) {
  const paths = new Set<string>();
  const add = (href: string) => { const path = articlePath(href); if (path) paths.add(path); };
  for (const { mime, text } of parts) {
    if (mime === 'text/plain') {
      for (const match of text.matchAll(/https:\/\/[^\s<>\[\]"']+/gu)) add(match[0]);
      continue;
    }
    const pending: Tree.Node[] = [parseFragment(text)];
    while (pending.length) {
      const node = pending.pop()!;
      if ('tagName' in node && node.tagName === 'a') {
        const href = node.attrs.find(attribute => attribute.name === 'href')?.value;
        if (href) add(href);
      }
      if ('childNodes' in node) pending.push(...node.childNodes);
    }
  }
  return paths;
}

type CheckedMessage = { kind: 'notice'; notice: Notice } | { kind: 'outside_window' | 'unverified_sender' | 'invalid_message' };
function checkMessage(message: unknown, id: string, start: number, end: number, observed: bigint, observedAt: string, key: Uint8Array, noticeKey: string): CheckedMessage {
  const value = row(message);
  if (value?.id !== id || typeof value.internalDate !== 'string' || !/^\d{12,14}$/u.test(value.internalDate)) return { kind: 'invalid_message' };
  const received = Number(value.internalDate);
  if (received < start || received >= end || BigInt(received) * BigInt(1000) > observed) return { kind: 'outside_window' };
  const payload = row(value.payload);
  if (!payload) return { kind: 'invalid_message' };
  if (!receiverReportsPublisher(payload)) return { kind: 'unverified_sender' };
  const subjects = getHeaders(payload, 'subject');
  const subject = subjects.length === 1 ? subjects[0].normalize('NFKC').replace(/\s+/gu, ' ').trim() : '';
  if (!subject || subject.length > 256) return { kind: 'invalid_message' };
  const text = decodeMimeText(payload);
  const paths = text ? sourceArticlePaths(text) : new Set<string>();
  const direct = paths.size === 1 ? paths.values().next().value : undefined;
  return { kind: 'notice', notice: {
    noticeKey,
    receivedAt: new Date(received).toISOString(), observedAt,
    subjectKey: keyedId(key, 'member-title', subject),
    articleKey: direct ? keyedId(key, 'member-path', direct) : null,
    status: !text ? 'notice_content_unavailable' : direct ? 'awaiting_member_article' : 'awaiting_article_resolution',
  } };
}

export async function collectInvestAnchorsNotices(
  day: string, key: Uint8Array, deps: MailDependencies,
  limits: { readBudget: number; checkedKeys: ReadonlySet<string> },
) {
  const window = planInvestAnchorsMailboxDay(day);
  const started = evidenceInstant(deps.now());
  if (started === null || started < BigInt(window.startMs) * BigInt(1000) || key.byteLength !== 32
    || !Number.isSafeInteger(limits.readBudget) || limits.readBudget < 0 || limits.readBudget > SOURCE_DAY_LIMIT) {
    throw Error('investanchors_mailbox_input_invalid');
  }
  const empty = (reason: 'provider_unavailable' | 'invalid_response' | 'page_bound') => ({
    scanStatus: 'retry_required' as const, reason, checkpointDay: null, notices: [] as Notice[],
    checkedKeys: [] as string[], deferred: 0, rejected: 0, articleAuthority: false as const, sourceAuthority: false as const,
  });

  const ids = new Set<string>(), tokens = new Set<string>();
  let pageToken: string | undefined;
  try {
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex++) {
      const page = row(await deps.list({ q: window.q, maxResults: PAGE_SIZE, ...(pageToken ? { pageToken } : {}) }));
      if (!page) return empty('invalid_response');
      const records = page.messages === undefined && page.resultSizeEstimate === 0 ? [] : page.messages;
      if (!Array.isArray(records) || records.length > PAGE_SIZE) return empty('invalid_response');
      for (const record of records) {
        const id = row(record)?.id;
        if (typeof id !== 'string' || !MESSAGE_ID.test(id)) return empty('invalid_response');
        ids.add(id);
      }
      if (page.nextPageToken === undefined) { pageToken = undefined; break; }
      if (typeof page.nextPageToken !== 'string' || !/^[!-~]{1,512}$/u.test(page.nextPageToken)
        || tokens.has(page.nextPageToken)) return empty('invalid_response');
      pageToken = page.nextPageToken;
      tokens.add(pageToken);
    }
    if (pageToken) return empty('page_bound');

    const unread = [...ids].map(id => ({ id, noticeKey: keyedId(key, 'gmail-message', id) }))
      .filter(item => !limits.checkedKeys.has(item.noticeKey));
    const batch = unread.slice(0, limits.readBudget);
    const notices: Notice[] = [], checkedKeys: string[] = [];
    let rejected = 0, lastObserved = started, providerInterrupted = false;
    for (const { id, noticeKey } of batch) {
      let message: unknown;
      try {
        message = await deps.get({ id, format: 'full' });
      } catch {
        // The inventory is complete. Keep only previously validated messages
        // and leave this message and the remainder pending for the next scan.
        if (checkedKeys.length === 0) return empty('provider_unavailable');
        providerInterrupted = true;
        break;
      }
      const observedAt = deps.now(), observed = evidenceInstant(observedAt);
      if (observed === null || observed < lastObserved) return empty('invalid_response');
      lastObserved = observed;
      const item = checkMessage(message, id, window.startMs, window.endMs, observed, observedAt, key, noticeKey);
      if (item.kind === 'invalid_message') return empty('invalid_response');
      checkedKeys.push(noticeKey);
      if (item.kind === 'notice') notices.push(item.notice);
      if (item.kind === 'unverified_sender') rejected++;
    }
    notices.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.noticeKey.localeCompare(b.noticeKey));
    const deferred = unread.length - checkedKeys.length;
    const scanStatus = deferred > 0 ? 'deferred' as const
      : started >= BigInt(window.endMs) * BigInt(1000) ? 'scanned' as const : 'open_day' as const;
    return { scanStatus, reason: providerInterrupted ? 'provider_unavailable' as const : null,
      checkpointDay: scanStatus === 'scanned' ? window.day : null,
      notices, checkedKeys, deferred, rejected, articleAuthority: false as const, sourceAuthority: false as const };
  } catch {
    return empty('provider_unavailable');
  }
}
