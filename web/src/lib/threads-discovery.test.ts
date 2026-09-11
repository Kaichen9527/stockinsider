import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreadsRunMetadata, normalizeThreadsAuthor, summarizeThreadsAuthors, threadsMarketQueries } from './threads-discovery.ts';
test('ingestion preserves the token-bound public-search canary rather than erasing it',()=>{
  const canary={observedAt:'2026-09-09T00:00:00Z',tokenHash:'a'};
  const result=mergeThreadsRunMetadata({token_hash:'a',non_self_public_search_canary:canary},{token_hash:'a',records_written:1});
  assert.deepEqual(result.non_self_public_search_canary,canary);
  assert.throws(()=>mergeThreadsRunMetadata({token_hash:'b'},{token_hash:'a'}),/token_changed/);
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
});
