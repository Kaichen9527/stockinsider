import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPttContentSemantics,
  platformDiscoveryCap,
  relativeDiscussionBurst,
  roundRobinSourceLinks,
  sourceConcentration,
} from './source-content-semantics.ts';

test('PTT institutional ranking is chip evidence instead of discovery', () => {
  assert.equal(classifyPttContentSemantics('[情報] 外資買超前20名排行'), 'bulk_institutional_ranking');
  assert.equal(classifyPttContentSemantics('[心得] 2330 法說與需求觀察'), 'editorial_discussion');
});

test('source concentration dedupes content and caps thin platform coverage', () => {
  const value = sourceConcentration([
    { platform: 'ptt', publisherKey: 'ptt:a', contentHash: 'x' },
    { platform: 'ptt', publisherKey: 'ptt:a', contentHash: 'x' },
    { platform: 'telegram', publisherKey: 'telegram:b', contentHash: 'y' },
  ]);
  assert.deepEqual(value, { rawMentions: 3, effectiveMentions: 2, publisherCount: 2, platformCount: 2, dominantPlatformShare: 0.5 });
  assert.equal(platformDiscoveryCap(1), 60);
  assert.equal(platformDiscoveryCap(2), 85);
  assert.equal(relativeDiscussionBurst(1, 0), 10);
  assert.equal(relativeDiscussionBurst(10, 0), 50);
});

test('source links rotate platforms and limit one platform', () => {
  const links = roundRobinSourceLinks([
    { platform: 'ptt', id: 1 }, { platform: 'ptt', id: 2 }, { platform: 'ptt', id: 3 },
    { platform: 'telegram', id: 4 }, { platform: 'gdelt', id: 5 },
  ]);
  assert.deepEqual(links.map((item) => item.id), [1, 4, 5, 2]);
});
