import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../migrations/20260906_authority_pagination_v2.sql', import.meta.url), 'utf8');
const candidateResearch = readFileSync(new URL('../web/src/lib/candidate-research.ts', import.meta.url), 'utf8');
const marketEvidence = readFileSync(new URL('../web/src/lib/market-evidence.ts', import.meta.url), 'utf8');
const researchV2 = readFileSync(new URL('../web/src/lib/research-v2.ts', import.meta.url), 'utf8');

test('authority RPC pages apply offset and limit inside PostgreSQL', () => {
  assert.match(migration, /candidate_research_stock_authority_page[\s\S]*OFFSET p_page_offset[\s\S]*LIMIT p_page_limit/u);
  assert.match(migration, /candidate_research_official_sessions_page[\s\S]*OFFSET p_page_offset[\s\S]*LIMIT p_page_limit/u);
  assert.match(migration, /p_page_limit < 1 OR p_page_limit > 1000/u);
  assert.match(migration, /REVOKE ALL[\s\S]*candidate_research_stock_authority_page[\s\S]*PUBLIC, anon, authenticated/u);
  assert.match(migration, /GRANT EXECUTE[\s\S]*candidate_research_stock_authority_page[\s\S]*service_role/u);
});

test('candidate, market, and GDELT authority readers use database-bound pages', () => {
  for (const source of [candidateResearch, marketEvidence, researchV2]) {
    assert.match(source, /rpc\('candidate_research_stock_authority_page',[\s\S]*p_page_offset: from,[\s\S]*p_page_limit: to - from \+ 1/u);
    assert.doesNotMatch(source, /rpc\('candidate_research_stock_authority',/u);
  }
  assert.match(candidateResearch, /rpc\('candidate_research_official_sessions_page',[\s\S]*p_page_offset: from,[\s\S]*p_page_limit: to - from \+ 1/u);
});
