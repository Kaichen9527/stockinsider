import assert from 'node:assert/strict';
import test from 'node:test';
import {publicCitation} from './citations.ts';
import {sanitizePublicSourceUrl} from '../public-source-url.ts';

/** Inert synthetic addresses only; these tests never fetch a URL or establish
 * source rights. Launch publication has a separate permission contract. */
import {unsafeCitationUrls} from './launch-citation.test-fixture.ts';
test('URL safety refuses member/tracking/redirect/secret/fragment encodings without requesting or repairing them',()=>{
  for(const url of unsafeCitationUrls)assert.equal(publicCitation(url),null,url);
  const secret='https://example.org/read?access_token=SYNTHETIC_ONLY#fragment';
  assert.equal(sanitizePublicSourceUrl(secret),'https://example.org/read');
  assert.equal(publicCitation(secret),null,'publication must not silently change a permission-bound URL');
});
test('URL safety preserves inert ordinary official/public references but grants no publication permission',()=>{
  for(const url of ['https://data.gov.tw/dataset/11370','https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20261113&response=json',
    'https://www.ptt.cc/bbs/Stock/M.SYNTHETIC.html','https://example.org/public-reference'])assert.equal(publicCitation(url),url);
  // The last URL is safe as a URL, not an assertion of public-content rights.
  for(const url of ['file:///tmp/SYNTHETIC','https://127.0.0.1/','https://example.internal/','https://user:password@example.org/',
    'https://example.org:444/',' https://example.org/','https://example.org/\\redirect'])assert.equal(publicCitation(url),null);
});
