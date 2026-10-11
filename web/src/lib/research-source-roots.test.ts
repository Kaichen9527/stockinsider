import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDirectCompanyMentionScope, researchRootFromDocument } from './research-source-roots.ts';

test('industry head with inherited stock tags is retained as a source, not direct company evidence', () => {
  const document = { id: 'industry-doc', platform: 'research_inbox_threads',
    document_url: 'https://www.threads.com/@investanchors/post/Ddaum9QGFr_',
    published_at: '2026-09-18T05:52:39Z', collected_at: '2026-10-05T05:40:28Z',
    symbols: ['2409'], content_semantics: 'editorial_discussion',
    metadata: { subject_scope: 'industry_context', claim_status: 'reported',
      first_observed_at: '2026-10-05T05:40:28Z', revision_observed_at: '2026-10-05T05:40:28Z' } };
  assert.equal(hasDirectCompanyMentionScope(document), false);
  assert.ok(researchRootFromDocument(document, '2026-10-05T08:00:00Z'));
  // Filtering the company binding does not erase a root from the source ledger.
  assert.equal([document].filter(hasDirectCompanyMentionScope).length, 0);
  assert.equal(document.symbols[0], '2409');
});
test('legacy/direct company sources remain eligible; unknown or malformed scope fails closed', () => {
  assert.equal(hasDirectCompanyMentionScope({}), true);
  assert.equal(hasDirectCompanyMentionScope({ metadata: null }), true);
  assert.equal(hasDirectCompanyMentionScope({ metadata: { subject_scope: 'company_mentions' } }), true);
  for (const metadata of [[], 'industry_context', { subject_scope: 'unknown' }, { subject_scope: null }])
    assert.equal(hasDirectCompanyMentionScope({ metadata }), false);
});
