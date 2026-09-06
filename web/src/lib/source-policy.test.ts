import assert from 'node:assert/strict';
import test from 'node:test';
import { requireExactInternalBearer, requireInternalAuth } from './internal-auth.ts';
import { activeSourceConnectorKeys, APPROVED_TELEGRAM_PUBLIC_CHANNELS, RETIRED_SOURCE_CONNECTORS, UNAVAILABLE_TELEGRAM_PUBLIC_CHANNELS, authorizedPodcastRssAllowlist, podcastContentAnalyzable, scheduledSourceConnectorKeys, sourceExecutionPolicy } from './source-policy.ts';

const ENV_KEYS = [
  'INTERNAL_API_KEY', 'CRON_SECRET', 'THREADS_OFFICIAL_API_ENABLED', 'THREADS_OFFICIAL_CANARY_ACTIVE',
  'TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED', 'PTT_METADATA_AUTHORIZED',
  'BULLTALK_LICENSED', 'BULLTALK_AUTHORIZED_FEED_URL',
  'PODCAST_RSS_ALLOWLIST', 'PODCAST_CONTENT_ANALYSIS_ALLOWLIST', 'TWSE_OFFICIAL_OPENAPI_ENABLED',
] as const;

function withEnvironment(values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) {
  const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    run();
  } finally {
    for (const key of ENV_KEYS) {
      if (before[key] == null) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('internal auth accepts either configured secret without weakening exact bearer auth', () => {
  withEnvironment({ INTERNAL_API_KEY: 'internal-secret', CRON_SECRET: 'cron-secret' }, () => {
    const internal = new Request('https://example.test', { headers: { authorization: 'Bearer internal-secret' } });
    const cron = new Request('https://example.test', { headers: { authorization: 'Bearer cron-secret' } });
    assert.deepEqual(requireInternalAuth(internal), { ok: true, authSource: 'internal_api_key' });
    assert.deepEqual(requireInternalAuth(cron), { ok: true, authSource: 'cron_secret' });
    assert.equal(requireExactInternalBearer(internal), true);
    assert.equal(requireExactInternalBearer(cron), false);
  });
});

test('Threads and licensed sources report explicit blocks instead of false success', () => {
  withEnvironment({}, () => {
    assert.equal(sourceExecutionPolicy('threads').disposition, 'blocked_auth');
    assert.equal(sourceExecutionPolicy('telegram').disposition, 'blocked_license');
    assert.equal(sourceExecutionPolicy('bulltalk').disposition, 'blocked_license');
  });
  withEnvironment({ THREADS_OFFICIAL_API_ENABLED: 'true' }, () => {
    assert.equal(sourceExecutionPolicy('threads').disposition, 'blocked_auth');
    assert.equal(sourceExecutionPolicy('threads').terminalReason, 'threads_official_canary_inactive');
  });
  withEnvironment({ THREADS_OFFICIAL_API_ENABLED: 'true', THREADS_OFFICIAL_CANARY_ACTIVE: 'true' }, () => {
    assert.equal(sourceExecutionPolicy('threads').disposition, 'active');
  });
});

test('retired connectors remain explicitly queryable as historical-only policy', () => {
  assert.deepEqual([...RETIRED_SOURCE_CONNECTORS], ['youtube', 'googlenews', 'anue', 'udn', 'mobile01', 'instagram']);
  for (const connector of RETIRED_SOURCE_CONNECTORS) {
    assert.equal(sourceExecutionPolicy(connector).disposition, 'retired');
    assert.equal(sourceExecutionPolicy(connector).licenseBasis, 'historical_audit_only');
  }
});

test('available Telegram channels have stable identities and unavailable channels never enter the crawler', () => {
  const channels = [...APPROVED_TELEGRAM_PUBLIC_CHANNELS];
  assert.equal(channels.length, 6);
  assert.equal(new Set([...channels, ...UNAVAILABLE_TELEGRAM_PUBLIC_CHANNELS].map((value) => value.toLowerCase())).size, 7);
  assert.deepEqual(UNAVAILABLE_TELEGRAM_PUBLIC_CHANNELS, ['twstockanalysis']);
});

test('GDELT is active metadata discovery and retired publishers stay retired', () => {
  assert.equal(sourceExecutionPolicy('gdelt').disposition, 'active');
  assert.equal(sourceExecutionPolicy('gdelt').licenseBasis, 'gdelt_metadata_and_source_links');
});

test('TWSE insider is excluded from VPS schedules until official egress is confirmed', () => {
  withEnvironment({}, () => {
    const policy = sourceExecutionPolicy('twse_insider');
    assert.equal(policy.disposition, 'manual_only');
    assert.equal(policy.terminalReason, 'twse_official_openapi_vps_egress_waf_blocked');
  });
  withEnvironment({ TWSE_OFFICIAL_OPENAPI_ENABLED: 'true' }, () => {
    assert.equal(sourceExecutionPolicy('twse_insider').disposition, 'active');
  });
});

test('Podcast creator-published RSS index is active independently of transcript rights', () => {
  withEnvironment({}, () => assert.equal(sourceExecutionPolicy('podcast').disposition, 'active'));
  withEnvironment({ PODCAST_RSS_ALLOWLIST: 'https://creator.example/feed.xml' }, () => {
    assert.equal(sourceExecutionPolicy('podcast').disposition, 'active');
    assert.equal(sourceExecutionPolicy('podcast').licenseBasis, 'creator_published_rss_index_allowlist');
  });
});

test('Podcast RSS indexing and content analysis are independently allowlisted', () => {
  withEnvironment({
    PODCAST_RSS_ALLOWLIST: 'https://creator.example/feed.xml,not-a-url',
    PODCAST_CONTENT_ANALYSIS_ALLOWLIST: 'https://creator.example/paid-feed.xml',
  }, () => {
    assert.deepEqual(authorizedPodcastRssAllowlist(), [
      'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
      'https://creator.example/feed.xml',
    ]);
    assert.equal(podcastContentAnalyzable('https://creator.example/feed.xml'), false);
    assert.equal(podcastContentAnalyzable('https://creator.example/paid-feed.xml'), true);
  });
});

test('connector=all includes only sources authorized in the current runtime', () => {
  withEnvironment({}, () => {
    assert.deepEqual(activeSourceConnectorKeys(), ['podcast', 'gdelt']);
  });
  withEnvironment({ THREADS_OFFICIAL_API_ENABLED: 'true', THREADS_OFFICIAL_CANARY_ACTIVE: 'true', TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED: 'true' }, () => {
    assert.deepEqual(activeSourceConnectorKeys(), ['telegram', 'threads', 'podcast', 'gdelt']);
    assert.deepEqual(scheduledSourceConnectorKeys(), ['telegram', 'threads', 'podcast', 'gdelt']);
  });
});
