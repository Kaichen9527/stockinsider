import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateRevisionHref, parseCandidateRevision } from './candidate-revision-query.ts';

const revision = '11111111-2222-4333-8444-555555555555';
test('candidate revision is explicit, non-ambiguous and never accepts an empty selector', () => {
  assert.deepEqual(parseCandidateRevision(undefined), { status: 'absent' });
  assert.deepEqual(parseCandidateRevision(revision), { status: 'valid', revisionId: revision });
  for (const invalid of ['', '--'.repeat(18), [revision], [revision, revision], '../latest']) {
    assert.deepEqual(parseCandidateRevision(invalid), { status: 'invalid' });
  }
  assert.equal(candidateRevisionHref('2330', revision), `/stock/2330?candidateRevision=${revision}`);
  assert.equal(candidateRevisionHref('2330', 'bad'), '/stock/2330?candidateRevision=invalid');
  assert.equal(candidateRevisionHref('2330', null), '/stock/2330');
});
