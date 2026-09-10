export type CandidateRevisionScores = {
  discovery: number | null; research: number | null; actionability: number | null; dataConfidence: number | null;
};
export type CandidateRevisionRisk = { state: string; reasons: string[] };
const SCORE_KEYS = ['discovery', 'research', 'actionability', 'dataConfidence'] as const;
const RISK_STATES = ['hold', 'trim_no_chase', 'hard_exit', 'data_incomplete'];

/** This envelope is stored inside the immutable, hashed detail payload. */
export function freezeCandidateRevisionContext(scores: CandidateRevisionScores, riskAction: CandidateRevisionRisk) {
  return { version: 1, scores: { ...scores }, riskAction: { state: riskAction.state, reasons: [...riskAction.reasons] } };
}

export function readCandidateRevisionContext(provenance: unknown) {
  const missing = { status: 'unavailable' as const,
    scores: { discovery: null, research: null, actionability: null, dataConfidence: null } as CandidateRevisionScores,
    riskAction: null as CandidateRevisionRisk | null };
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return missing;
  const context = (provenance as Record<string, unknown>).revision_context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return missing;
  const row = context as Record<string, unknown>;
  const scores = row.scores as CandidateRevisionScores | undefined;
  const risk = row.riskAction as CandidateRevisionRisk | undefined;
  if (row.version !== 1 || !scores || !SCORE_KEYS.every((key) => typeof scores[key] === 'number'
    && Number.isFinite(scores[key]) && scores[key]! >= 0 && scores[key]! <= 100)
    || !risk || !RISK_STATES.includes(risk.state) || !Array.isArray(risk.reasons)
    || !risk.reasons.every((reason) => typeof reason === 'string')) return missing;
  return { status: 'available' as const, scores: { ...scores },
    riskAction: { state: risk.state, reasons: [...risk.reasons] } as CandidateRevisionRisk | null };
}
