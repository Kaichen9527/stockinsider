import { createHash } from 'crypto';
import { sanitizeRevisionScopedDossierEvidence } from './candidate-dossier-contract.ts';

type Row = Record<string, unknown>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Row).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]));
  return value;
}

export function candidateDossierBundleHash(detail: Row, facts: Row[]) {
  const scoped = sanitizeRevisionScopedDossierEvidence(detail, facts);
  detail = scoped.detail;
  facts = scoped.facts;
  const allowed = new Set((Array.isArray(detail.fact_ids) ? detail.fact_ids : []).map(String));
  const exactFacts = facts.filter((fact) => allowed.has(String(fact.fact_id))).sort((left, right) => String(left.fact_id).localeCompare(String(right.fact_id)));
  const payload = {
    revisionId: String(detail.id || ''), sessionDate: String(detail.session_date || ''), lifecycleStage: String(detail.lifecycle_stage || ''),
    factIds: [...allowed].sort(), facts: exactFacts, valuation: detail.valuation || {}, technical: detail.technical || {},
    asOf: String(detail.as_of || ''), availableAt: String(detail.available_at || ''),
  };
  return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}
