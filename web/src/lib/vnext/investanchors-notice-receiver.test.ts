import assert from 'node:assert/strict';
import test from 'node:test';
import { collectInvestAnchorsNotices, planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';

const day = '2026-11-12';
const clock = '2026-11-13T00:02:00+08:00';
const key = Buffer.alloc(32, 9);
const window = planInvestAnchorsMailboxDay(day);
const dateOptions = { readBudget: 50, checkedKeys: new Set<string>() };
const member = 'https://investanchors.com/user/vip_contents/12345678901234';
const subject = 'NONPRODUCTION notification subject';

function textPart(text: string, mimeType = 'text/plain') {
  return { mimeType, filename: '', body: { size: Buffer.byteLength(text), data: Buffer.from(text).toString('base64url') } };
}

function mail(id: string, when: number, parts = [textPart('Placeholder notice only')]) {
  return { id, internalDate: String(when), payload: { mimeType: 'multipart/alternative', parts, headers: [
    { name: 'From', value: 'Synthetic <bulletin@mailer.investanchors.com>' },
    { name: 'Subject', value: subject },
    { name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.i=@mailer.investanchors.com header.s=synthetic; spf=pass' },
  ] } };
}

function provider(messages: ReturnType<typeof mail>[], sampleClock = clock) {
  let reads = 0;
  return {
    reads: () => reads,
    now: () => sampleClock,
    list: async () => ({ messages: messages.map(value => ({ id: value.id })) }),
    get: async ({ id, format }: { id: string; format: 'full' }) => {
      reads++;
      assert.equal(format, 'full');
      return messages.find(value => value.id === id);
    },
  };
}

test('Taipei half-open day uses epoch seconds, independent of receiver local time', () => {
  assert.equal(new Date(window.startMs).toISOString(), '2026-11-11T16:00:00.000Z');
  assert.equal(new Date(window.endMs).toISOString(), '2026-11-12T16:00:00.000Z');
  assert.match(window.q, new RegExp(`after:${window.startMs / 1000 - 1} before:${window.endMs / 1000}$`));
  assert.throws(() => planInvestAnchorsMailboxDay('2026-02-30'));
  assert.throws(() => planInvestAnchorsMailboxDay('2026-11-12 after:0'));
});

test('pagination deduplicates immutable IDs, checks internalDate boundaries and reuses private keys', async () => {
  const gmail = provider([
    mail('from_before', window.startMs - 1), mail('valid1', window.startMs),
    mail('valid2', window.endMs - 1), mail('past_stop', window.endMs),
  ]);
  const queries: unknown[] = [];
  const list = async (request: { q: string; maxResults: number; pageToken?: string }) => {
    queries.push(request);
    return request.pageToken ? { messages: [{ id: 'valid1' }, { id: 'valid2' }, { id: 'past_stop' }] }
      : { messages: [{ id: 'from_before' }, { id: 'valid1' }], nextPageToken: 'page2' };
  };
  const scan = await collectInvestAnchorsNotices(day, key, { ...gmail, list }, dateOptions);
  assert.equal(scan.checkpointDay, day);
  assert.equal(gmail.reads(), 4);
  assert.equal(queries.length, 2);
  assert.deepEqual(scan.notices.map(notice => notice.receivedAt), ['2026-11-11T16:00:00.000Z', '2026-11-12T15:59:59.999Z']);
  assert.ok(scan.notices.every(notice => notice.observedAt === clock && notice.status === 'awaiting_article_resolution'));
  assert.doesNotMatch(JSON.stringify(scan), /valid1|valid2|from_before|NONPRODUCTION|mailer\.investanchors/u);
  const repeating = await collectInvestAnchorsNotices(day, key, { ...gmail, list }, dateOptions);
  assert.deepEqual(repeating.notices.map(notice => notice.noticeKey), scan.notices.map(notice => notice.noticeKey));
  const checkedKeys = new Set(scan.checkedKeys);
  const noRepeat = await collectInvestAnchorsNotices(day, key, { ...gmail, list }, { ...dateOptions, checkedKeys });
  assert.equal(noRepeat.notices.length, 0);
  assert.equal(gmail.reads(), 8);
});

test('a verified direct member path remains a private unresolved content observation', async () => {
  const tracking = 'https://track.mailer.investanchors.com/redirect?private=secret';
  const g = provider([
    mail('direct', window.startMs, [
      textPart(member), textPart(`<a href="${member}">Read</a><a href="${tracking}">Go</a>`, 'text/html'),
    ]),
    mail('waiting', window.startMs + 1, [textPart(`<a href="${tracking}">Read more</a>`, 'text/html')]),
    mail('ambiguous', window.startMs + 2, [textPart(`${member}\nhttps://investanchors.com/user/vip_contents/12345678901235`)]),
    mail('external', window.startMs + 3, [textPart('https://investanchors.com.invalid/user/vip_contents/12345678901234')]),
    mail('header_only', window.startMs + 4, [{
      ...textPart('unavailable'), body: { size: 123, data: '', attachmentId: 'private_attachment' },
    } as ReturnType<typeof textPart>]),
  ]);
  const result = await collectInvestAnchorsNotices(day, key, g, dateOptions);
  assert.equal(result.articleAuthority, false);
  assert.equal(result.sourceAuthority, false);
  assert.deepEqual(result.notices.map(item => item.status), [
    'awaiting_member_article', 'awaiting_article_resolution', 'awaiting_article_resolution', 'awaiting_article_resolution', 'notice_content_unavailable',
  ]);
  assert.match(result.notices[0].articleKey!, /^[0-9a-f]{64}$/u);
  assert.ok(result.notices.slice(1).every(notice => notice.articleKey === null));
  assert.doesNotMatch(JSON.stringify(result), /vip_contents|12345678901234|track\.mailer|private_attachment|secret/u);
});

test('sender display, spoofed or ambiguous auth, and a mismatched signature never produce notices', async () => {
  const emails = ['spoof', 'different', 'untrusted', 'two'].map((id, index) => mail(id, window.startMs + index));
  emails[0].payload.headers[0].value = 'bulletin@mailer.investanchors.com <fake@attacker.invalid>';
  emails[1].payload.headers[2].value = 'mx.google.com; dkim=pass header.i=@different.invalid';
  emails[2].payload.headers[2].value = 'attacker.invalid; dkim=pass header.i=@mailer.investanchors.com';
  emails[3].payload.headers.push({ ...emails[3].payload.headers[2] });
  const g = provider(emails);
  const result = await collectInvestAnchorsNotices(day, key, g, dateOptions);
  assert.deepEqual(result.notices, []);
  assert.equal(result.rejected, 4);
  assert.equal(result.checkedKeys.length, 4);
});

test('shared ledger budget defers excess reads and does not advance the checkpoint', async () => {
  const g = provider([mail('one', window.startMs), mail('two', window.startMs + 1)]);
  const first = await collectInvestAnchorsNotices(day, key, g, { ...dateOptions, readBudget: 1 });
  assert.equal(g.reads(), 1);
  assert.equal(first.scanStatus, 'deferred');
  assert.equal(first.checkpointDay, null);
  assert.equal(first.deferred, 1);
  const second = await collectInvestAnchorsNotices(day, key, g, { ...dateOptions, checkedKeys: new Set(first.checkedKeys) });
  assert.deepEqual(second.notices.map(item => item.receivedAt), ['2026-11-11T16:00:00.001Z']);
  assert.equal(second.checkpointDay, day);
  assert.equal(g.reads(), 2);
  await assert.rejects(() => collectInvestAnchorsNotices(day, key, g, { ...dateOptions, readBudget: 51 }));
});

test('only a complete closed-day listing permits a checkpoint, even when there are no notices', async () => {
  const g = provider([]);
  const open = await collectInvestAnchorsNotices(day, key, { ...g, now: () => '2026-11-12T20:00:00+08:00' }, dateOptions);
  assert.equal(open.scanStatus, 'open_day');
  assert.equal(open.checkpointDay, null);
  const complete = await collectInvestAnchorsNotices(day, key, { ...g, list: async () => ({ resultSizeEstimate: 0 }) }, dateOptions);
  assert.equal(complete.checkpointDay, day);
  assert.deepEqual(complete.notices, []);
});

test('broken credentials, cycles, inconsistent message identity, and clock reversal cannot advance the day', async () => {
  const g = provider([mail('one', window.startMs)]);
  let calls = 0;
  for (const deps of [
    { ...g, list: async () => { throw Error('secret token expired'); } },
    { ...g, list: async () => ({}) },
    { ...g, list: async () => ({ messages: [], nextPageToken: 'repeated' }) },
    { ...g, get: async () => mail('different_id', window.startMs) },
    { ...g, now: () => calls++ ? '2026-11-13T00:00:00+08:00' : clock },
  ]) {
    const result = await collectInvestAnchorsNotices(day, key, deps, dateOptions);
    assert.equal(result.scanStatus, 'retry_required');
    assert.equal(result.checkpointDay, null);
    assert.deepEqual(result.notices, []);
    assert.deepEqual(result.checkedKeys, []);
    assert.doesNotMatch(JSON.stringify(result), /secret token/u);
  }
});
