import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {freezeCandidateRevisionContext,readCandidateRevisionContext} from './candidate-revision-context.ts';

test('same-day revisions keep their own scores and risk after mutable inputs change', () => {
  const scores = {discovery:60,research:70,actionability:80,dataConfidence:90};
  const risk = {state:'hold',reasons:['original']};
  const first = {revision_context:freezeCandidateRevisionContext(scores,risk)};
  scores.research = 10; risk.state = 'hard_exit'; risk.reasons.push('new_event');
  const second = {revision_context:freezeCandidateRevisionContext(scores,risk)};
  assert.equal(readCandidateRevisionContext(first).scores.research,70);
  assert.deepEqual(readCandidateRevisionContext(first).riskAction,{state:'hold',reasons:['original']});
  assert.equal(readCandidateRevisionContext(second).riskAction?.state,'hard_exit');
});
test('legacy and malformed contexts explicitly withhold scores and risk', () => {
  for (const provenance of [null, {}, {revision_context:{version:2}},
    {revision_context:freezeCandidateRevisionContext({discovery:NaN,research:70,actionability:80,dataConfidence:90},{state:'hold',reasons:[]})}]) {
    const result=readCandidateRevisionContext(provenance);
    assert.equal(result.status,'unavailable'); assert.equal(result.riskAction,null);
    assert.deepEqual(Object.values(result.scores),[null,null,null,null]);
  }
});
test('detail caller reads frozen provenance without mutable stage or tracking joins', () => {
  const reader=readFileSync(new URL('./candidate-detail.ts',import.meta.url),'utf8');
  assert.match(reader,/readCandidateRevisionContext\(row.provenance\)/);
  assert.doesNotMatch(reader,/from\('candidate_daily_stage_snapshots'\)|from\('candidate_signal_tracking'\)/);
  const writer=readFileSync(new URL('./candidate-research.ts',import.meta.url),'utf8');
  assert.ok(writer.indexOf('const risk = candidateRiskAction(')<writer.indexOf('const detailPayload ='));
  assert.ok(writer.indexOf('revision_context: freezeCandidateRevisionContext(detailCard.scores, risk)')<writer.indexOf('const revisionHash = stableHash(detailPayload)'));
});
