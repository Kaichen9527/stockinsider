import type { CandidateStageCard, RadarDailyPayload } from './types';

function isCandidateCard(value: unknown): value is CandidateStageCard {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const scores = row.scores as Record<string, unknown> | undefined;
  return typeof row.symbol === 'string'
    && ['found', 'waiting', 'actionable'].includes(String(row.lifecycleStage || ''))
    && Boolean(scores)
    && typeof scores?.research === 'number'
    && typeof scores?.actionability === 'number'
    && typeof row.valuation === 'object'
    && typeof row.technical === 'object';
}

export function hasCandidateStageCards(payload: Pick<RadarDailyPayload, 'schemaVersion' | 'stages'> | Record<string, unknown>): payload is RadarDailyPayload & { stages: NonNullable<RadarDailyPayload['stages']> } {
  const row = payload as RadarDailyPayload;
  if (!row.stages) return false;
  const groups = [row.stages.found, row.stages.waiting, row.stages.actionable];
  if (!groups.every(Array.isArray)) return false;
  if (row.schemaVersion === 'radar-public-v2' && groups.every((items) => items.length === 0)) return true;
  return groups.flat().every(isCandidateCard) && groups.some((items) => items.length > 0);
}
