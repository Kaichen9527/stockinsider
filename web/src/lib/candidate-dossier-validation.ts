type RawSection = Record<string, unknown>;

export type CandidateDossierSubmission = {
  summary: string;
  summaryFactIds: string[];
  sections: Array<{ key: string; title: string; body: string; factIds: string[] }>;
  rejectionReasons: string[];
};

function hasNumericClaim(value: string) {
  return /\d/u.test(value);
}

function numericClaims(value: string) {
  return [...value.matchAll(/(?<![\p{L}\d])[-+]?\d+(?:\.\d+)?/gu)].map((match) => Number(match[0])).filter(Number.isFinite);
}

function numericClaimsMatchFacts(value: string, factIds: string[], factValues: ReadonlyMap<string, number[]>) {
  const claims = numericClaims(value);
  if (claims.length === 0) return true;
  const cited = factIds.flatMap((factId) => factValues.get(factId) || []);
  return claims.every((claim) => cited.some((fact) => Math.abs(claim - fact) <= Math.max(0.01, Math.abs(fact) * 0.001)));
}

export function validateCandidateDossierSubmission(input: {
  summary: unknown;
  summaryFactIds: unknown;
  sections: unknown;
  allowedFactIds: Iterable<string>;
  factValues?: ReadonlyMap<string, number[]>;
}): CandidateDossierSubmission {
  const allowed = new Set(input.allowedFactIds);
  const summary = String(input.summary || '').trim();
  const summaryFactIds = (Array.isArray(input.summaryFactIds) ? input.summaryFactIds : []).map(String);
  const rawSections = Array.isArray(input.sections) ? input.sections as RawSection[] : [];
  const rejectionReasons: string[] = [];

  if (summary.length < 20 || rawSections.length === 0) rejectionReasons.push('invalid_submission_schema');
  if (summary.length >= 20 && summaryFactIds.length === 0) rejectionReasons.push('summary_missing_fact_id');
  if (summaryFactIds.some((factId) => !allowed.has(factId))) rejectionReasons.push('summary_unknown_fact_id');
  if (input.factValues && summaryFactIds.length > 0 && hasNumericClaim(summary) && !numericClaimsMatchFacts(summary, summaryFactIds, input.factValues)) rejectionReasons.push('summary_numeric_claim_mismatch');

  const sections = rawSections.map((section, index) => {
    const title = String(section.title || '').trim();
    const key = String(section.key || `section_${index + 1}`);
    const body = String(section.body || '').trim();
    const factIds = (Array.isArray(section.factIds) ? section.factIds : []).map(String);
    if (!title || body.length < 10) rejectionReasons.push(`section_${index + 1}_invalid`);
    if (title && body.length >= 10 && factIds.length === 0) rejectionReasons.push(`section_${index + 1}_missing_fact_id`);
    if (factIds.some((factId) => !allowed.has(factId))) rejectionReasons.push(`section_${index + 1}_unknown_fact_id`);
    if (hasNumericClaim(body) && factIds.length === 0) rejectionReasons.push(`section_${index + 1}_numeric_claim_without_fact_id`);
    if (input.factValues && factIds.length > 0 && hasNumericClaim(body) && !numericClaimsMatchFacts(body, factIds, input.factValues)) rejectionReasons.push(`section_${index + 1}_numeric_claim_mismatch`);
    return { key, title, body, factIds };
  });

  const combined = `${summary}\n${sections.map((section) => section.body).join('\n')}`;
  if (/investanchors|定錨投資|定錨會員/iu.test(combined)) rejectionReasons.push('paid_reference_content_forbidden');

  return { summary, summaryFactIds, sections, rejectionReasons: [...new Set(rejectionReasons)] };
}
