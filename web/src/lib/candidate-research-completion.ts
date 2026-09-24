export const CANDIDATE_RESEARCH_COMPLETION_LIMIT = 100;

export type CandidateResearchCompletionReceipt = {
  technical_session_date?: unknown;
  pipeline_run_id?: unknown;
  status?: unknown;
  failed_count?: unknown;
};

export type CandidatePipelineCompletionReceipt = { id?: unknown; status?: unknown };

export function isHistoricalResearchSession(researchSession: string, readySessions: readonly string[]): boolean {
  const latestReadySession = [...readySessions].sort().at(-1);
  return latestReadySession !== undefined && researchSession < latestReadySession;
}

function isSuccessfulResearch(row: CandidateResearchCompletionReceipt): row is {
  technical_session_date: string;
  pipeline_run_id: string;
  status: 'success';
  failed_count: 0;
} {
  return row.status === 'success' && row.failed_count === 0
    && typeof row.pipeline_run_id === 'string' && row.pipeline_run_id.trim().length > 0
    && typeof row.technical_session_date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(row.technical_session_date);
}

/** Only these exact, bounded IDs may supply completion evidence. */
export function candidateResearchPipelineRunIds(researchRuns: readonly CandidateResearchCompletionReceipt[]): string[] {
  if (researchRuns.length > CANDIDATE_RESEARCH_COMPLETION_LIMIT) throw new Error('research_resume_receipt_bound_exceeded');
  return [...new Set(researchRuns.filter(isSuccessfulResearch).map((row) => row.pipeline_run_id))];
}

/** Research can finish before publication; both receipts must succeed in the same pipeline. */
export function completedCandidateResearchSessions(input: {
  researchRuns: readonly CandidateResearchCompletionReceipt[];
  requestedPipelineRunIds: readonly string[];
  pipelineRuns: readonly CandidatePipelineCompletionReceipt[] | null;
}): Set<string> {
  const eligibleIds = new Set(candidateResearchPipelineRunIds(input.researchRuns));
  if (input.requestedPipelineRunIds.length > CANDIDATE_RESEARCH_COMPLETION_LIMIT) throw new Error('research_resume_pipeline_bound_exceeded');
  const requestedIds = new Set(input.requestedPipelineRunIds.filter((id) => eligibleIds.has(id)));
  const successfulIds = new Set((input.pipelineRuns || [])
    .filter((row) => row.status === 'success' && typeof row.id === 'string' && requestedIds.has(row.id))
    .map((row) => row.id));
  return new Set(input.researchRuns.filter(isSuccessfulResearch)
    .filter((row) => successfulIds.has(row.pipeline_run_id))
    .map((row) => row.technical_session_date));
}
