import assert from 'node:assert/strict';
import test from 'node:test';
import { deepSourceCitation } from './research-deep-source-rights.ts';
const permalink = 'https://www.threads.com/@investanchors/post/Ddaum9QGFr_';
const rights = { subject_scope: 'industry_context', visibility: 'public',
  rights_boundary: 'public_citation', acquisition_method: 'public_document' };
test('admission/display share explicit scope and public rights; account names do not authorize content', () => {
  assert.deepEqual(deepSourceCitation(rights, permalink), { subjectScope: 'industry_context', url: permalink });
  assert.equal(deepSourceCitation({ ...rights, acquisition_method: 'publisher_transcript' }, permalink).url, permalink);
  for (const metadata of [null, [], 'public', 1, true, { subject_scope: [] }, { subject_scope: null }])
    assert.deepEqual(deepSourceCitation(metadata, permalink), { subjectScope: 'unknown', url: null });
  for (const patch of [{ rights_boundary: null }, { visibility: null }, { acquisition_method: null },
    { visibility: 'authenticated_summary' }, { rights_boundary: 'bounded_summary_only' },
    { acquisition_method: 'authenticated_browser_summary' }, { acquisition_method: 'user_authorized_document' },
    { acquisition_method: ['public_document'] }, { acquisition_method: ['publisher_transcript'] },
    { acquisition_method: { toString: () => 'public_document' } }])
    assert.equal(deepSourceCitation({ ...rights, ...patch }, permalink).url, null);
});
test('member, profile, host spoofing, credential, fragment and non-http URLs cannot use the social exception', () => {
  for (const url of ['https://www.investanchors.com/member/report', 'https://www.threads.com/@investanchors',
    'https://threads.com.evil.example/@investanchors/post/Ddaum9QGFr_',
    'https://www.threads.com/@investanchors/post/Ddaum9QGFr_/member',
    'https://evil.example/https://threads.com/@investanchors/post/Ddaum9QGFr_',
    'https://user:password@www.threads.com/@investanchors/post/Ddaum9QGFr_', 'javascript:alert(1)'])
    assert.equal(deepSourceCitation(rights, url).url, null);
});
test('legacy company sources keep existing conservative member policy; industry scope never inferred from handle', () => {
  const publicNews = 'https://news.example/company';
  assert.deepEqual(deepSourceCitation({}, publicNews), { subjectScope: 'company_mentions', url: publicNews });
  assert.deepEqual(deepSourceCitation(undefined, publicNews), { subjectScope: 'company_mentions', url: publicNews });
  assert.equal(deepSourceCitation({}, permalink).url, null);
  assert.equal(deepSourceCitation({ subject_scope: 'company_mentions', visibility: 'authenticated_summary' }, publicNews).url, null);
  assert.deepEqual(deepSourceCitation({ subject_scope: 'unknown' }, publicNews), { subjectScope: 'unknown', url: null });
});
