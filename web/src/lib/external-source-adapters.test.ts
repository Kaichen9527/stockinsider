import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLicensedBullTalkFeed, bullTalkLicenseReadiness } from './bulltalk-feed.ts';
import { derivePodcastLedgerSemantics, parsePodcastNamespaceFeed, parsePublisherChapters, parsePublisherTranscript } from './podcast-rss.ts';
import {
  THREADS_KEYWORD_SEARCH_URL,
  THREADS_REQUIRED_SCOPES,
  assertThreadsKeywordSearchEndpoint,
  buildThreadsAuthorizationUrl,
  createThreadsOAuthState,
  verifyThreadsOAuthState,
} from './threads-api.ts';

test('Threads uses the versioned graph.threads.com endpoint and only required scopes', () => {
  assert.equal(THREADS_KEYWORD_SEARCH_URL, 'https://graph.threads.com/v1.0/keyword_search');
  assert.deepEqual([...THREADS_REQUIRED_SCOPES], ['threads_basic', 'threads_keyword_search']);
  assert.equal(assertThreadsKeywordSearchEndpoint(THREADS_KEYWORD_SEARCH_URL).toString(), THREADS_KEYWORD_SEARCH_URL);
  assert.throws(() => assertThreadsKeywordSearchEndpoint('https://graph.threads.net/keyword_search'), /not_approved/u);
});

test('Threads OAuth state is signed, expires, and builds a dedicated-app request', () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      INTERNAL_API_KEY: 'x'.repeat(40),
      THREADS_DEDICATED_APP_CONFIRMED: 'true',
      THREADS_APP_ID: '123456789',
      THREADS_REDIRECT_URI: 'https://stock.example/api/auth/threads/callback',
    });
    const now = Date.parse('2026-09-07T12:00:00Z');
    const state = createThreadsOAuthState(now);
    assert.equal(verifyThreadsOAuthState(state, now + 60_000), true);
    assert.equal(verifyThreadsOAuthState(`${state}x`, now + 60_000), false);
    assert.equal(verifyThreadsOAuthState(state, now + 11 * 60_000), false);
    const url = new URL(buildThreadsAuthorizationUrl(state));
    assert.equal(url.searchParams.get('scope'), 'threads_basic,threads_keyword_search');
    assert.equal(url.searchParams.get('state'), state);
  } finally {
    process.env = previous;
  }
});

test('BullTalk adapter rejects HTML and parses quoted licensed CSV without scraping', () => {
  assert.throws(() => parseLicensedBullTalkFeed('text/html', '<html>public page</html>'), /content_type_not_licensed/u);
  const rows = parseLicensedBullTalkFeed('text/csv; charset=utf-8', [
    'title,url,symbols,stance,mention_count,comment_count,rank',
    '"AI, server 討論",https://licensed.example/post/1,"2382|3231",positive,12,3,1',
  ].join('\n'));
  assert.deepEqual(rows, [{
    title: 'AI, server 討論', sourceUrl: 'https://licensed.example/post/1', symbols: ['2382', '3231'],
    publishedAt: null, stance: 'bullish', mentionCount: 12, commentCount: 3, engagementCount: 0, rank: 1,
  }]);
  assert.equal(bullTalkLicenseReadiness({
    BULLTALK_LICENSED: 'true',
    BULLTALK_AUTHORIZED_FEED_URL: 'https://licensed.example/feed.csv',
    BULLTALK_LICENSE_SCOPE_REF: 'contract:2026-09',
    BULLTALK_REAL_SAMPLE_SHA256: 'f'.repeat(64),
  }).ready, true);
});

test('Podcast namespace adapter recognizes alternate prefixes and preserves transcript and chapter timecodes', () => {
  const xml = `<?xml version="1.0"?><rss xmlns:p="https://podcastindex.org/namespace/1.0"><channel><item>
    <guid>episode-1</guid><title>產業更新</title><link>https://creator.example/e/1</link>
    <pubDate>Mon, 07 Sep 2026 12:00:00 GMT</pubDate>
    <p:transcript url="https://creator.example/e/1.vtt" type="text/vtt" language="zh-TW" />
    <p:chapters url="https://creator.example/e/1.json" type="application/json" />
  </item></channel></rss>`;
  const episodes = parsePodcastNamespaceFeed(xml);
  assert.equal(episodes.length, 1);
  assert.deepEqual(episodes[0].transcript, { url: 'https://creator.example/e/1.vtt', type: 'text/vtt', language: 'zh-TW' });
  assert.deepEqual(episodes[0].chapters, { url: 'https://creator.example/e/1.json', type: 'application/json', language: null });
  assert.deepEqual(parsePublisherTranscript('text/vtt', 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n台股 2330 需求更新'), [
    { startSeconds: 1, endSeconds: 4, text: '台股 2330 需求更新' },
  ]);
  assert.deepEqual(parsePublisherChapters('application/json', JSON.stringify({ chapters: [
    { startTime: 0, title: '開場' }, { startTime: 90, title: '股票代號 2330' },
  ] })), [
    { startSeconds: 0, endSeconds: 90, text: '開場' },
    { startSeconds: 90, endSeconds: null, text: '股票代號 2330' },
  ]);
});

test('Podcast feed rejects entities and does not treat undeclared transcript-like tags as publisher artifacts', () => {
  assert.throws(() => parsePodcastNamespaceFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>'), /unsafe_xml/u);
  const xml = '<rss><channel><item><guid>1</guid><title>x</title><link>https://creator.example/e/1</link><podcast:transcript url="https://creator.example/t.txt" type="text/plain" /></item></channel></rss>';
  assert.equal(parsePodcastNamespaceFeed(xml)[0].transcript, null);
});

test('Podcast ledger never equates RSS indexing with content rights or a valid stock match', () => {
  assert.deepEqual(derivePodcastLedgerSemantics({ episodesIndexed: 4, analyzableEpisodes: 0, validMatches: 0 }), {
    indexUpdated: true, contentAnalyzable: false, validMatches: 0,
  });
  assert.deepEqual(derivePodcastLedgerSemantics({ episodesIndexed: 4, analyzableEpisodes: 1, validMatches: 0 }), {
    indexUpdated: true, contentAnalyzable: true, validMatches: 0,
  });
});
