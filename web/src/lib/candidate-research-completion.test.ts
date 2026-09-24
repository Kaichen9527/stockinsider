import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateResearchPipelineRunIds,
  completedCandidateResearchSessions,
  isHistoricalResearchSession,
  type CandidateResearchCompletionReceipt,
} from './candidate-research-completion.ts';

const research: CandidateResearchCompletionReceipt = {
  technical_session_date: '2026-09-24', pipeline_run_id: 'pipeline-current', status: 'success', failed_count: 0,
};

test('research success alone cannot complete a running, failed, or missing pipeline', () => {
  for (const status of ['running', 'failed', 'partial', null, undefined]) {
    assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: [research],
      requestedPipelineRunIds: ['pipeline-current'], pipelineRuns: [{ id: 'pipeline-current', status }] })], []);
  }
  for (const pipelineRuns of [[], null]) {
    assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: [research],
      requestedPipelineRunIds: ['pipeline-current'], pipelineRuns })], []);
  }
});

test('matching successful research and successful pipeline complete their session', () => {
  assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: [research],
    requestedPipelineRunIds: ['pipeline-current'], pipelineRuns: [{ id: 'pipeline-current', status: 'success' }] })], ['2026-09-24']);
});

test('unrequested and unrelated successful pipeline IDs cannot lend completion', () => {
  assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: [research],
    requestedPipelineRunIds: ['pipeline-current'], pipelineRuns: [{ id: 'pipeline-other', status: 'success' }] })], []);
  assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: [research,
    { ...research, technical_session_date: '2026-09-23', pipeline_run_id: 'pipeline-outside' }],
  requestedPipelineRunIds: ['pipeline-current'], pipelineRuns: [{ id: 'pipeline-outside', status: 'success' }] })], []);
});

test('research status, failure count, and exact pipeline binding remain mandatory', () => {
  const invalid = [
    { ...research, status: 'running' }, { ...research, status: 'failed' }, { ...research, failed_count: 1 },
    { ...research, failed_count: '0' }, { ...research, failed_count: null }, { ...research, pipeline_run_id: null },
    { ...research, pipeline_run_id: '' }, { ...research, pipeline_run_id: ' ' },
  ];
  assert.deepEqual(candidateResearchPipelineRunIds(invalid), []);
  assert.deepEqual([...completedCandidateResearchSessions({ researchRuns: invalid,
    requestedPipelineRunIds: ['pipeline-current'], pipelineRuns: [{ id: 'pipeline-current', status: 'success' }] })], []);
});

test('pipeline lookup IDs deduplicate and preserve the 100-receipt bound', () => {
  assert.deepEqual(candidateResearchPipelineRunIds([research, { ...research }]), ['pipeline-current']);
  assert.equal(candidateResearchPipelineRunIds(Array.from({ length: 100 }, (_, index) => ({
    ...research, pipeline_run_id: `pipeline-${index}`,
  }))).length, 100);
  assert.throws(() => candidateResearchPipelineRunIds(Array.from({ length: 101 }, () => research)), /receipt_bound_exceeded/u);
  assert.throws(() => completedCandidateResearchSessions({ researchRuns: [research], pipelineRuns: [],
    requestedPipelineRunIds: Array.from({ length: 101 }, (_, index) => `pipeline-${index}`) }), /pipeline_bound_exceeded/u);
});

test('an older ready session is historical while the latest ready session remains current', () => {
  const readySessions = ['2026-09-23', '2026-09-24', '2026-09-22'];
  assert.equal(isHistoricalResearchSession('2026-09-23', readySessions), true);
  assert.equal(isHistoricalResearchSession('2026-09-24', readySessions), false);
  assert.equal(isHistoricalResearchSession('2026-09-24', []), false);
  assert.deepEqual(readySessions, ['2026-09-23', '2026-09-24', '2026-09-22']);
});
