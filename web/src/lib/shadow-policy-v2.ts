import { classifyCandidateStage, type CandidateStageInput } from './stage-classifier.ts';
import { createHash } from 'node:crypto';

export type ShadowReplayCard = { symbol: string; stage: string; replayHash: string | null };

export const SHADOW_REPLAY_PAYLOAD_VERSION = 'candidate-shadow-replay-v5' as const;

export type FrozenShadowReplayCard = {
  symbol: string;
  expectedStage: string;
  classificationInput: CandidateStageInput;
  classificationHash: string;
};

export type FrozenShadowReplayPayload = {
  schemaVersion: typeof SHADOW_REPLAY_PAYLOAD_VERSION;
  manifestId: string;
  manifestHash: string;
  finalPublicationId: string;
  finalPublicationHash: string;
  sessionDate: string;
  rulesetVersion: string;
  modelVersion: string;
  cards: FrozenShadowReplayCard[];
};

export type ShadowReplayProgressRow = {
  sessionDate: string;
  sessionKind: 'official_trading' | 'preliminary' | 'weekend' | 'backtest';
  publicationPhase: 'final' | 'preliminary';
  reproducibilityStatus: 'matched' | 'conflict' | 'pending';
  qualifying: boolean;
  payloadHash: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object') throw new TypeError('shadow_replay_non_json_value');
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(',')}}`;
}

export function shadowReplayHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function nonEmpty(value: unknown, reason: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(reason);
  return value;
}

/**
 * Produces the ordered, immutable evidence input for an independent Shadow
 * replay.  It intentionally receives the classification input rather than a
 * live stage row: later stage, source, or publication changes cannot alter a
 * frozen replay cohort.
 */
export function buildFrozenShadowReplayPayload(input: Omit<FrozenShadowReplayPayload, 'schemaVersion' | 'cards'> & {
  cards: Array<{ symbol: string; expectedStage: string; classificationInput: CandidateStageInput }>;
}): FrozenShadowReplayPayload {
  for (const key of ['manifestId', 'manifestHash', 'finalPublicationId', 'finalPublicationHash', 'sessionDate', 'rulesetVersion', 'modelVersion'] as const) nonEmpty(input[key], `shadow_replay_${key}_required`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.sessionDate)) throw new TypeError('shadow_replay_session_date_invalid');
  const cards = input.cards.map((card) => {
    const symbol = nonEmpty(card.symbol, 'shadow_replay_symbol_required');
    const expectedStage = nonEmpty(card.expectedStage, 'shadow_replay_expected_stage_required');
    const classified = replayFrozenCandidateClassification(card.classificationInput);
    if (!classified || classified.stage !== expectedStage) throw new TypeError('shadow_replay_classification_mismatch');
    return {
      symbol,
      expectedStage,
      classificationInput: card.classificationInput,
      classificationHash: shadowReplayHash(classified),
    };
  }).sort((left, right) => left.symbol.localeCompare(right.symbol));
  if (cards.length === 0 || cards.some((card, index) => index > 0 && card.symbol === cards[index - 1].symbol)) throw new TypeError('shadow_replay_cards_not_unique');
  return {
    schemaVersion: SHADOW_REPLAY_PAYLOAD_VERSION,
    manifestId: input.manifestId,
    manifestHash: input.manifestHash,
    finalPublicationId: input.finalPublicationId,
    finalPublicationHash: input.finalPublicationHash,
    sessionDate: input.sessionDate,
    rulesetVersion: input.rulesetVersion,
    modelVersion: input.modelVersion,
    cards,
  };
}

/** Returns false rather than borrowing mutable daily-stage state on malformed evidence. */
export function verifiesFrozenShadowReplayPayload(value: unknown): value is FrozenShadowReplayPayload {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const payload = value as FrozenShadowReplayPayload;
    if (payload.schemaVersion !== SHADOW_REPLAY_PAYLOAD_VERSION || !Array.isArray(payload.cards)) return false;
    const rebuilt = buildFrozenShadowReplayPayload({
      manifestId: payload.manifestId,
      manifestHash: payload.manifestHash,
      finalPublicationId: payload.finalPublicationId,
      finalPublicationHash: payload.finalPublicationHash,
      sessionDate: payload.sessionDate,
      rulesetVersion: payload.rulesetVersion,
      modelVersion: payload.modelVersion,
      cards: payload.cards.map((card) => ({
        symbol: card.symbol,
        expectedStage: card.expectedStage,
        classificationInput: card.classificationInput,
      })),
    });
    return canonicalJson(rebuilt) === canonicalJson(payload);
  } catch { return false; }
}

export function countQualifyingShadowSessions(rows: ShadowReplayProgressRow[]): { qualifying: number; observed: number; ignored: number } {
  const qualified = new Map<string, ShadowReplayProgressRow>();
  let ignored = 0;
  for (const row of rows) {
    const eligible = row.sessionKind === 'official_trading'
      && row.publicationPhase === 'final'
      && row.reproducibilityStatus === 'matched'
      && row.qualifying
      && /^[a-f0-9]{64}$/u.test(row.payloadHash);
    if (!eligible) { ignored += 1; continue; }
    const existing = qualified.get(row.sessionDate);
    // A second payload for a session is a conflict, never a second day or an
    // implicit replacement.  The database retains its conflict evidence.
    if (existing && existing.payloadHash !== row.payloadHash) {
      qualified.delete(row.sessionDate);
      ignored += 1;
      continue;
    }
    qualified.set(row.sessionDate, row);
  }
  return { qualifying: qualified.size, observed: qualified.size, ignored };
}

export function replayFrozenCandidateClassification(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return classifyCandidateStage(value as CandidateStageInput);
  } catch {
    return null;
  }
}

export function buildShadowReplayInputs(
  manifestSymbols: string[],
  cards: ShadowReplayCard[],
): ShadowReplayCard[] {
  const allowed = new Set(manifestSymbols);
  const latest = new Map<string, ShadowReplayCard>();
  for (const card of cards) if (allowed.has(card.symbol)) latest.set(card.symbol, card);
  return [...latest.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
}

export function shadowReplayConflicts(input: {
  existingManifestId: string | null;
  existingReplayHash: string | null;
  existingStatus: string | null;
  manifestId: string;
  replayHash: string;
}): boolean {
  if (!input.existingManifestId && !input.existingReplayHash && !input.existingStatus) return false;
  return input.existingManifestId !== input.manifestId
    || input.existingReplayHash !== input.replayHash
    || input.existingStatus === 'conflict';
}
