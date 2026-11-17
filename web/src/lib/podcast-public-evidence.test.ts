import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublicPodcastSource, publicPodcastMention } from './podcast-public-evidence.ts';

const privateMarker = 'synthetic private transcript phrase';
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
      weak_signal_only: true,
      spoken_stock_mentions: [{ symbol: '2330', startSeconds: 12, endSeconds: 17, text: privateMarker }],
      trackUrl: privateMarker,
    },
    ...overrides,
  };
}

test('public collections use only the recorded spoken code and timestamp, without excerpts or thesis text', () => {
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

test('legacy transcripts, index-only articles, and forged or invalid locators provide no public podcast evidence', () => {
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

test('public publisher episode identifiers can preserve the official playback link', () => {
  for (const document_url of [
    'https://www.youtube.com/watch?v=4eld9a5q5l0',
    'https://podcasts.apple.com/tw/podcast/show/id123?i=1000123',
  ]) {
    assert.equal(publicPodcastMention(document({ document_url }), '2330')?.episodeUrl, document_url);
  }
});
