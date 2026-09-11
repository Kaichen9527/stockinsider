import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateThreadsReadiness, mergeThreadsRunMetadata, normalizeThreadsAuthor, normalizeThreadsCursor, normalizeThreadsPermalink, summarizeThreadsAuthors, threadsMarketQueries } from './threads-discovery.ts';
test('ingestion preserves the token-bound public-search canary rather than erasing it',()=>{
  const hash='a'.repeat(64);
  const canary={observedAt:'2026-09-09T00:00:00Z',tokenHash:hash,selfUsernameHash:'b'.repeat(64),publicPostIdHash:'c'.repeat(64),queryHash:'d'.repeat(64)};
  const result=mergeThreadsRunMetadata({token_hash:hash,expires_at:'2026-12-01T00:00:00Z',non_self_public_search_canary:canary},{token_hash:hash,records_written:1});
  assert.deepEqual(result.non_self_public_search_canary,canary);
  assert.throws(()=>mergeThreadsRunMetadata({token_hash:'b'},{token_hash:'a'}),/token_changed/);
  assert.throws(()=>mergeThreadsRunMetadata({token_hash:hash,non_self_public_search_canary:{...canary,tokenHash:'e'.repeat(64)}},{token_hash:hash}),/canary_token_hash_mismatch/);
});
test('readiness requires a fresh complete receipt bound to the current token hash',()=>{
  const now=Date.parse('2026-09-11T00:00:00Z');const tokenHash='a'.repeat(64);
  const metadata={token_hash:tokenHash,expires_at:'2026-10-01T00:00:00Z',non_self_public_search_canary:{
    observedAt:'2026-09-10T00:00:00Z',tokenHash,selfUsernameHash:'b'.repeat(64),publicPostIdHash:'c'.repeat(64),queryHash:'d'.repeat(64),
  },public_search_zero_row_streak:2};
  assert.deepEqual(evaluateThreadsReadiness(metadata,'valid',now),{publicSearchVerified:true,zeroRowStreak:2,reason:null});
  assert.equal(evaluateThreadsReadiness({...metadata,token_hash:'e'.repeat(64)},'valid',now).reason,'threads_canary_token_hash_mismatch');
  assert.equal(evaluateThreadsReadiness(metadata,'invalid',now).reason,'threads_credential_not_valid');
});
test('zero-result streak is monotonic only across consecutive zero-row provider attempts',()=>{
  const base={public_search_zero_row_streak:2};
  assert.equal(mergeThreadsRunMetadata(base,{public_search_result_count:0}).public_search_zero_row_streak,3);
  assert.equal(mergeThreadsRunMetadata(base,{public_search_result_count:4}).public_search_zero_row_streak,0);
});
test('market discovery always searches 股票 and 台股 with bounded deduplicated queries', () => {
  const queries=threadsMarketQueries(['台股', ...Array.from({length:20},(_,i)=>`產業${i}`)]);
  assert.deepEqual(queries.slice(0,2),['股票','台股']); assert.equal(queries.length,12);
});
test('untracked authors survive discovery; repeated search hits do not inflate KOL evidence', () => {
  const post={id:'a',username:'new_author',text:'台積電 EPS 與毛利',symbols:['2330'],publishedAt:'2026-09-09T00:00:00Z'};
  const rows=summarizeThreadsAuthors([post,post,{...post,id:'b',username:'known'}],new Set(['known']));
  assert.equal(rows.length,2); assert.equal(rows.find(r=>r.username==='new_author')?.uniquePosts,1);
  assert.equal(rows.find(r=>r.username==='new_author')?.tracked,false);
  assert.equal(rows.find(r=>r.username==='known')?.tracked,true);
  assert.ok(rows.every(r=>r.assessment==='discovery_only_unverified'));
  assert.equal(normalizeThreadsAuthor('@Valid.Name'),'valid.name');
  assert.equal(normalizeThreadsAuthor('../bad/name'),null);
  assert.equal(normalizeThreadsPermalink('https://www.threads.com/@valid.name/post/abc'),'https://www.threads.com/@valid.name/post/abc');
  assert.equal(normalizeThreadsPermalink('https://example.com/@valid.name/post/abc'),null);
  assert.equal(normalizeThreadsCursor('safe_CURSOR-1'),'safe_CURSOR-1');
  assert.equal(normalizeThreadsCursor('../unsafe'),null);
});
