import { INVEST_J_THINGS_FEED, INVEST_J_THINGS_PROGRAM } from './podcast-rss.ts';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { projectPublicPodcastSource, publicPodcastMention } from './podcast-public-evidence.ts';

const privateMarker = 'synthetic private transcript phrase';
const feed = 'https://creator.example/feed.xml';
const otherFeed = 'https://second-creator.example/feed.xml';

function allowCurrentFeed(t: TestContext) {
  const keys = ['PODCAST_RSS_ALLOWLIST', 'PODCAST_CONTENT_ANALYSIS_ALLOWLIST'] as const;
  const saved = keys.map(key => process.env[key]);
  t.after(() => {
    keys.forEach((key, index) => {
      const value = saved[index];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });
  for (const key of keys) process.env[key] = feed;
}
function document(overrides: Record<string, unknown> = {}) {
  return {
    platform: 'podcast',
    title: privateMarker,
    summary: privateMarker,
    transcript_text: privateMarker,
    extracted_thesis: [{ text: privateMarker }],
    symbols: ['2330', '2454'],
    document_url: 'https://creator.example/episode/1',
    published_at: '2026-11-17T01:00:00Z',
    metadata: {
      connector: 'podcast_sync',
      spoken_locator_version: 'podcast-spoken-locator-v1',
      license_basis: 'recorded_creator_content_rights',
      content_source: 'publisher_transcript',
      content_analyzable: true,
      rss_url: feed,
      weak_signal_only: true,
      spoken_stock_mentions: [{ symbol: '2330', startSeconds: 12, endSeconds: 17, text: privateMarker }],
      trackUrl: privateMarker,
    },
    ...overrides,
  };
}

test('public collections use only the recorded spoken code and timestamp, without excerpts or thesis text', t => {
  allowCurrentFeed(t);
  const row = document();
  const source = projectPublicPodcastSource(row);
  assert.deepEqual(source?.symbols, ['2330']);
  assert.equal(source?.summary, '股票代號 2330，12–17 秒');
  const mention = publicPodcastMention(row, '2330');
  assert.equal(mention?.episodeUrl, 'https://creator.example/episode/1');
  assert.deepEqual(mention?.thesisHighlights, []);
  assert.equal(publicPodcastMention(row, '2454'), null);
  assert.ok(!JSON.stringify({ source, mention }).includes(privateMarker));
});

test('legacy transcripts, index-only articles, and forged or invalid locators provide no public podcast evidence', t => {
  allowCurrentFeed(t);
  const row = document();
  const metadata = row.metadata as Record<string, unknown>;
  for (const invalid of [
    document({ metadata: { connector: 'podcast_transcript' } }),
    document({ metadata: { ...metadata, content_analyzable: false } }),
    document({ metadata: { ...metadata, spoken_stock_mentions: [{ symbol: '2330', startSeconds: 9, endSeconds: 3 }] } }),
    document({ published_at: 'time-unavailable' }),
    document({ platform: 'youtube', metadata: { connector: 'podcast_transcript' } }),
    document({ document_url: 'https://creator.example/episode/1?key=private' }),
    document({ document_url: 'https://reader:private@creator.example/episode/1' }),
  ]) {
    assert.equal(projectPublicPodcastSource(invalid), null);
    assert.equal(publicPodcastMention(invalid, '2330'), null);
  }
  const unrelated = { platform: 'official', title: '公開公告' };
  assert.equal(projectPublicPodcastSource(unrelated), unrelated);
});

test('public publisher episode identifiers can preserve the official playback link', t => {
  allowCurrentFeed(t);
  for (const document_url of [
    'https://www.youtube.com/watch?v=4eld9a5q5l0',
    'https://podcasts.apple.com/tw/podcast/show/id123?i=1000123',
  ]) {
    assert.equal(publicPodcastMention(document({ document_url }), '2330')?.episodeUrl, document_url);
  }
});


test('revoking either current feed permission hides saved locators on both public read paths', t => {
  allowCurrentFeed(t);
  const row = document();
  const unrelated = { platform: 'official', title: '公開公告' };
  const metadata = row.metadata as Record<string, unknown>;
  assert.ok(publicPodcastMention(row, '2330'));
  assert.ok(projectPublicPodcastSource(row));
  assert.ok(!JSON.stringify(projectPublicPodcastSource(row)).includes(feed));

  const deny = (value: Record<string, unknown>) => {
    assert.equal(publicPodcastMention(value, '2330'), null);
    assert.equal(projectPublicPodcastSource(value), null);
  };
  deny(document({ metadata: { ...metadata, rss_url: undefined } }));
  deny(document({ metadata: { ...metadata, rss_url: otherFeed } }));
  process.env.PODCAST_CONTENT_ANALYSIS_ALLOWLIST = otherFeed;
  deny(row);
  process.env.PODCAST_CONTENT_ANALYSIS_ALLOWLIST = feed;
  process.env.PODCAST_RSS_ALLOWLIST = otherFeed;
  deny(row);
  assert.equal(projectPublicPodcastSource(unrelated), unrelated);
});

test('public Invest J Things locators require the currently registered episode and transcript edition', t => {
  allowCurrentFeed(t);
  process.env.PODCAST_RSS_ALLOWLIST = INVEST_J_THINGS_FEED;
  process.env.PODCAST_CONTENT_ANALYSIS_ALLOWLIST = INVEST_J_THINGS_FEED;
  const prior = process.env.PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS;
  t.after(() => {
    if (prior === undefined) delete process.env.PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS;
    else process.env.PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS = prior;
  });
  const episodeUrl = 'https://www.youtube.com/watch?v=aBcDefGhI-0';
  const track = {
    feedUrl: INVEST_J_THINGS_FEED, episodeUrl, program: INVEST_J_THINGS_PROGRAM,
    type: 'text/vtt', language: 'zh-TW', url: 'https://creator.example/private-artifact.vtt', utf8Sha256: 'a'.repeat(64),
  };
  const row = document({
    document_url: episodeUrl,
    metadata: { ...document().metadata, rss_url: INVEST_J_THINGS_FEED, transcript_artifact_sha256: track.utf8Sha256 },
  });
  process.env.PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS = JSON.stringify([track]);
  const mention = publicPodcastMention(row, '2330');
  assert.equal(mention?.podcastName, INVEST_J_THINGS_PROGRAM);
  const projected = projectPublicPodcastSource(row);
  assert.equal(projected?.title, INVEST_J_THINGS_PROGRAM + ' 口述定位');
  const publicPayload = JSON.stringify({ mention, projected });
  for (const privateField of [privateMarker, track.url, track.utf8Sha256]) assert.ok(!publicPayload.includes(privateField));

  for (const registry of ['[]', 'invalid', JSON.stringify([{ ...track, utf8Sha256: 'b'.repeat(64) }]),
    JSON.stringify([{ ...track, episodeUrl: 'https://www.youtube.com/watch?v=bBcDefGhI-0' }])]) {
    process.env.PODCAST_AUTHORIZED_TRANSCRIPT_TRACKS = registry;
    assert.equal(publicPodcastMention(row, '2330'), null);
    assert.equal(projectPublicPodcastSource(row), null);
  }
});
