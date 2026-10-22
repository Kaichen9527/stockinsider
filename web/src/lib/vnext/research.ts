import { artifactFinancialSummary } from './artifact-financial-summary.ts';
import { inputHash } from './policy.ts';
export const REQUIRED_SECTIONS = ['conclusion', 'productsRevenue', 'competitionDemand', 'profitBridge', 'cashflows', 'valuation', 'catalysts', 'falsifiers', 'technical', 'history'] as const;
export type Evidence = { id: string; key?: string; value: unknown; unit?: string; period?: string; contentHash: string;
  source: string; sourceTier?: 'official' | 'public' | 'operator'; eventAt: string; availableAt: string; kind: 'fact' | 'assumption' | 'derived' };
export type Claim = { id: string; text: string; kind: 'fact' | 'assumption' | 'guidance' | 'derived'; evidenceIds: string[];
  numeric?: { value: number; unit: string; period: string; key: string; formula?: { operation: 'add' | 'subtract' | 'multiply' | 'divide'; evidenceIds: string[] } } };
export type Artifact = { schemaVersion: 'stockinsider-vnext-research-v1'; model: string; modelVersion: string; inputHash: string; outputHash: string;
  sections: Record<string, { text: string; evidenceIds: string[]; claimIds: string[] }>; claims: Claim[]; quoteDate: string; valuationDate: string;
  annualEps: number | null; nextFourQuarterEps: number | null; gaps: string[] };
export function validateArtifact(value: unknown, evidence: Evidence[], expectedHash: string) {
  const a = value as Partial<Artifact> | null; const reasons: string[] = []; const ids = new Set(evidence.map((e) => e.id));
  const claims = Array.isArray(a?.claims) ? a.claims : [];
  const claimIds = new Set(claims.map((claim) => claim.id));
  if (!a || a.schemaVersion !== 'stockinsider-vnext-research-v1' || a.inputHash !== expectedHash || !a.model || !a.modelVersion) reasons.push('artifact_identity_missing');
  for (const key of REQUIRED_SECTIONS) {
    const section = a?.sections?.[key];
    if (!section?.text || !section.evidenceIds?.length || section.evidenceIds.some((id) => !ids.has(id))) reasons.push(`section_evidence_missing:${key}`);
    if (!section?.claimIds?.length || section.claimIds.some((id) => !claimIds.has(id))) reasons.push(`section_claims_missing:${key}`);
  }
  if (!a?.quoteDate || !a.valuationDate || !Number.isFinite(Date.parse(a.quoteDate)) || !Number.isFinite(Date.parse(a.valuationDate))) reasons.push('dated_valuation_missing');
  if (!Array.isArray(a?.gaps)) reasons.push('data_gaps_missing');
  for (const key of ['annualEps', 'nextFourQuarterEps'] as const) if (!a || !(key in a) || a[key] !== null && (typeof a[key] !== 'number' || !Number.isFinite(a[key]))) reasons.push(`${key}_required_numeric_or_null`);
  if (a?.annualEps === null && !a.gaps?.includes('annual_eps_missing')) reasons.push('annual_eps_gap_hidden');
  if (a?.nextFourQuarterEps === null && !a.gaps?.includes('next_four_quarter_eps_missing')) reasons.push('forward_eps_gap_hidden');
  if (a && a.outputHash !== inputHash({ ...a, outputHash: undefined })) reasons.push('artifact_output_hash_mismatch');
  if (!claims.length || claimIds.size !== claims.length) reasons.push('important_claims_missing_or_duplicate');
  for (const claim of claims) reasons.push(...validateClaim(claim, evidence));
  if(a) reasons.push(...artifactFinancialSummary(a,evidence));
  return { valid: reasons.length === 0, reasons };
}
export function validateClaim(claim: Claim, evidence: Evidence[]) {
  const reasons: string[] = [];
  if (!claim || !['fact', 'assumption', 'guidance', 'derived'].includes(claim.kind) || !Array.isArray(claim.evidenceIds)) return ['claim_known_kind_and_evidence_required'];
  const cited = evidence.filter((e) => claim.evidenceIds.includes(e.id));
  if (!claim.id || !claim.text || !claim.evidenceIds.length || cited.length !== claim.evidenceIds.length || cited.some((e) => !/^[a-f0-9]{64}$/u.test(e.contentHash))) return [`claim_evidence_invalid:${claim.id}`];
  if (claim.kind === 'fact' && cited.some((e) => e.kind !== 'fact' || e.sourceTier !== 'official')) reasons.push(`claim_fact_authority_invalid:${claim.id}`);
  if (claim.kind === 'assumption' && !cited.some((e) => e.kind === 'assumption')) reasons.push(`claim_assumption_not_labelled:${claim.id}`);
  const number = claim.numeric;
  if (!number) return reasons; // Semantic prose is independently checked against originals by the reviewer.
  if (!Number.isFinite(number.value) || !number.unit || !number.period || !number.key) return [...reasons, `claim_numeric_context_invalid:${claim.id}`];
  const numeric = cited.filter((e) => typeof e.value === 'number' && Number.isFinite(e.value));
  if (claim.kind !== 'derived') {
    if (!numeric.some((e) => e.key === number.key && e.unit === number.unit && e.period === number.period && e.value === number.value)) reasons.push(`claim_numeric_fact_mismatch:${claim.id}`);
    if (number.formula) reasons.push(`claim_formula_kind_invalid:${claim.id}`);
  } else {
    const formula = number.formula;
    const operands = formula?.evidenceIds.map((id) => numeric.find((e) => e.id === id));
    if (!formula || !operands || operands.length < 2 || operands.some((e) => !e || e.period !== number.period)) return [...reasons, `claim_formula_inputs_invalid:${claim.id}`];
    const values = operands.map((e) => e!.value as number);
    let result = values[0];
    if (formula.operation === 'add' || formula.operation === 'subtract') {
      if (operands.some((e) => e!.unit !== number.unit)) reasons.push(`claim_formula_unit_mismatch:${claim.id}`);
      for (const v of values.slice(1)) result = formula.operation === 'add' ? result + v : result - v;
    } else if (formula.operation === 'multiply') {
      const units = operands.map((e) => e!.unit).filter((unit) => unit !== 'multiple' && unit !== 'ratio');
      if (units.length !== 1 || units[0] !== number.unit) reasons.push(`claim_formula_unit_mismatch:${claim.id}`);
      for (const v of values.slice(1)) result *= v;
    } else if (formula.operation === 'divide') {
      if (values.slice(1).includes(0)) reasons.push(`claim_formula_zero_denominator:${claim.id}`);
      const units = operands.map((e) => e!.unit);
      if (!(units.length === 2 && (units[0] === units[1] && number.unit === 'ratio' || units[0] === number.unit && ['ratio', 'multiple'].includes(String(units[1]))))) reasons.push(`claim_formula_unit_mismatch:${claim.id}`);
      for (const v of values.slice(1)) result /= v;
    } else reasons.push(`claim_formula_operation_invalid:${claim.id}`);
    if (!Number.isFinite(result) || Math.abs(result - number.value) > Math.max(1e-8, Math.abs(result) * 1e-8)) reasons.push(`claim_formula_result_mismatch:${claim.id}`);
  }
  return reasons;
}
export type Review = { approved: boolean; authorOutputHash: string; modelVersion: string; findings: string[];
  factsChecked: boolean; valuationChecked: boolean; claimsChecked: boolean;
  claimChecks: Array<{ claimId: string; verdict: 'supported' | 'unsupported'; reason: string; sources: Array<{ id: string; contentHash: string }> }> };
export function validateReview(review: Review, artifact: Artifact, evidence: Evidence[]) {
  const reasons: string[] = [];
  if (!review || typeof review.approved !== 'boolean' || review.authorOutputHash !== artifact.outputHash || !review.modelVersion || !Array.isArray(review.findings) || !Array.isArray(review.claimChecks)) return ['review_artifact_binding_invalid'];
  if (review.approved && (!review.factsChecked || !review.valuationChecked || !review.claimsChecked || review.findings.length)) reasons.push('review_checks_incomplete');
  for (const claim of artifact.claims) {
    const checks = review.claimChecks.filter((check) => check.claimId === claim.id);
    if (checks.length !== 1) { reasons.push(`review_claim_unchecked:${claim.id}`); continue; }
    const check = checks[0];
    if (!check.reason || review.approved && check.verdict !== 'supported') reasons.push(`review_claim_unsupported:${claim.id}`);
    for (const id of claim.evidenceIds) {
      const original = evidence.find((e) => e.id === id);
      if (!original || !check.sources.some((source) => source.id === id && source.contentHash === original.contentHash)) reasons.push(`review_original_evidence_unchecked:${claim.id}:${id}`);
    }
  }
  return reasons;
}
