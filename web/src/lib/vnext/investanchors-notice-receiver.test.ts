import assert from 'node:assert/strict';
import test from 'node:test';
import { collectInvestAnchorsNotices, planInvestAnchorsMailboxDay } from './investanchors-notice-receiver.ts';

import { continueInvestAnchorsNoticeDays, continueInvestAnchorsNoticeScan } from './investanchors-notice-progress.ts';

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

test('ledger bridge resumes privately with stored checked keys and returns only summary counts', async () => {
  const gmail = provider([mail('distinct_first', window.startMs), mail('distinct_next', window.startMs + 1)]);
  const initial = await collectInvestAnchorsNotices(day, key, gmail, { ...dateOptions, readBudget: 1 });
  const calls: unknown[] = [];
  const result = await continueInvestAnchorsNoticeScan(day, key, gmail, async value => {
    calls.push(value);
    if (value === undefined) return { progressId: '23', checkedKeys: initial.checkedKeys, checkpointDay: null, readBudget: 1, articleAuthority: false };
    assert.equal(value.baseProgressId, '23');
    assert.equal(value.scanStatus, 'scanned');
    assert.equal((value.notices as unknown[]).length, 1);
    assert.equal((value.checkedKeys as unknown[]).length, 1);
    return { progressId: '24', replay: false, articleAuthority: false };
  });
  assert.deepEqual(result, { scanStatus: 'scanned', checkpointDay: day, checked: 1, awaiting: 1, deferred: 0, rejected: 0, articleAuthority: false });
  assert.doesNotMatch(JSON.stringify(result), /distinct_|noticeKey|subjectKey|articleKey|observedAt/u);
  assert.equal(calls.length, 2);
  assert.equal(gmail.reads(), 2);
});

test('ledger refuses unexpected authority and leaves a failed receiver scan uncommitted', async () => {
  const gmail = provider([mail('distinct_first', window.startMs)]);
  await assert.rejects(() => continueInvestAnchorsNoticeScan(day, key, gmail,
    async () => ({ progressId: null, checkedKeys: [], checkpointDay: null, readBudget: 50, articleAuthority: true })), /progress_unavailable/u);
  let calls = 0;
  const result = await continueInvestAnchorsNoticeScan(day, key, { ...gmail, list: async () => { throw Error('provider'); } }, async value => {
    assert.equal(value, undefined);
    calls++;
    return { progressId: null, checkedKeys: [], checkpointDay: null, readBudget: 50, articleAuthority: false };
  });
  assert.equal(calls, 1);
  assert.equal(result.scanStatus, 'retry_required');
  assert.equal(result.checkpointDay, null);
  assert.equal(gmail.reads(), 0);
});

test('ledger acknowledgement uncertainty cannot trigger a second append or fresh email read', async () => {
  const gmail = provider([mail('distinct_first', window.startMs)]);
  let appends = 0;
  await assert.rejects(() => continueInvestAnchorsNoticeScan(day, key, gmail, async value => {
    if (!value) return { progressId: null, checkedKeys: [], checkpointDay: null, readBudget: 50, articleAuthority: false };
    appends++;
    return { progressId: null, replay: false, articleAuthority: false };
  }), /progress_write_uncertain/u);
  assert.equal(appends, 1);
  assert.equal(gmail.reads(), 1);
});

const earliest = '2026-11-10';
const middle = '2026-11-11';
const plan = (selected: string, kind: 'pending' | 'recheck' = 'pending', closedThrough = day) =>
  ({ day: selected, kind, closedThrough, articleAuthority: false });
type DayScan = Awaited<ReturnType<typeof continueInvestAnchorsNoticeScan>>;
const scanned = (checkpointDay: string): DayScan =>
  ({ scanStatus: 'scanned', checkpointDay, checked: 1, awaiting: 1, rejected: 0, deferred: 0, articleAuthority: false });

test('closed-day recovery processes the two oldest days and retains its next pending date', async () => {
  const outstanding = [earliest, middle, day];
  const scans: string[] = [];
  const next = async () => outstanding.length ? plan(outstanding[0]) : plan(day, 'recheck');
  const scan = async (selected: string) => {
    assert.equal(selected, outstanding.shift());
    scans.push(selected);
    return scanned(selected);
  };
  assert.deepEqual(await continueInvestAnchorsNoticeDays(next, scan), {
    scanStatus: 'deferred', checkpointDay: middle, pendingDay: day,
    checked: 2, awaiting: 2, rejected: 0, deferred: 0, articleAuthority: false,
  });
  assert.deepEqual(await continueInvestAnchorsNoticeDays(next, scan), {
    scanStatus: 'scanned', checkpointDay: day, pendingDay: null,
    checked: 1, awaiting: 1, rejected: 0, deferred: 0, articleAuthority: false,
  });
  assert.deepEqual(scans, [earliest, middle, day]);
});

test('deferred and retry-required scans stop at the oldest uncovered day', async () => {
  for (const scanStatus of ['deferred', 'retry_required'] as const) {
    let plans = 0;
    const scan = async (selected: string): Promise<DayScan> => {
      assert.equal(selected, earliest);
      return { scanStatus, checkpointDay: null, checked: 0, awaiting: 0, rejected: 0,
        deferred: 0, articleAuthority: false };
    };
    const summary = await continueInvestAnchorsNoticeDays(async () => { plans++; return plan(earliest); }, scan);
    assert.equal(plans, 1);
    assert.equal(summary.scanStatus, scanStatus);
    assert.equal(summary.pendingDay, earliest);
    assert.equal(summary.checkpointDay, null);
  }
});

test('the daily recheck opens yesterday only once when no days are outstanding', async () => {
  let plans = 0;
  const scans: string[] = [];
  const summary = await continueInvestAnchorsNoticeDays(async () => { plans++; return plan(day, 'recheck'); },
    async selected => { scans.push(selected); return scanned(selected); });
  assert.equal(plans, 1);
  assert.deepEqual(scans, [day]);
  assert.equal(summary.pendingDay, null);
});

test('invalid plan, wrong checkpoint, and a stagnant plan fail closed', async () => {
  let scans = 0;
  const scan = async (selected: string) => { scans++; return scanned(selected); };
  await assert.rejects(continueInvestAnchorsNoticeDays(async () => plan(earliest, 'recheck'), scan),
    /investanchors_notice_plan_unavailable/);
  assert.equal(scans, 0);
  await assert.rejects(continueInvestAnchorsNoticeDays(async () => plan(earliest), async () => scanned(day)),
    /investanchors_notice_checkpoint_mismatch/);
  await assert.rejects(continueInvestAnchorsNoticeDays(async () => plan(earliest), scan),
    /investanchors_notice_plan_not_advanced/);
  assert.equal(scans, 1);
});

test('a Taipei date rollover keeps the new pending date for the next invocation', async () => {
  const plans = [plan(day), plan('2026-11-13', 'pending', '2026-11-13')];
  const scans: string[] = [];
  const summary = await continueInvestAnchorsNoticeDays(async () => plans.shift(),
    async selected => { scans.push(selected); return scanned(selected); });
  assert.deepEqual(scans, [day]);
  assert.equal(summary.scanStatus, 'deferred');
  assert.equal(summary.checkpointDay, day);
  assert.equal(summary.pendingDay, '2026-11-13');
});
