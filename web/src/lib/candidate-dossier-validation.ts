type RawSection = Record<string, unknown>;
type RawClaim = Record<string, unknown>;

export type CandidateDossierClaimKind = 'fact' | 'guidance' | 'assumption' | 'derived_calculation';

export type CandidateDossierFormula = { expression: string; inputs: string[] };

export type CandidateDossierClaim = {
  id: string;
  kind: CandidateDossierClaimKind;
  factIds: string[];
  text: string;
  formula?: CandidateDossierFormula;
  metric?: string;
  unit?: string;
  period?: string;
  locator?: string;
};

export type CandidateDossierSubmission = {
  summary: string;
  summaryFactIds: string[];
  sections: Array<{ key: string; title: string; body: string; factIds: string[] }>;
  claims: CandidateDossierClaim[];
  rejectionReasons: string[];
};

export type CandidateDossierFactMetadata = {
  factKey: string;
  factKind?: string;
  stockId?: string | null;
  symbol?: string | null;
  unit?: string | null;
  period?: string | null;
  locator?: string | null;
  values?: number[];
};

export type CandidateDossierCompanyIdentity = {
  stockId?: string | null;
  symbol?: string | null;
  name?: string | null;
};

function numericClaims(value: string, excludedTokens: ReadonlySet<string> = new Set()) {
  const withoutPeriodContext = value
    .replace(/\b(?:19|20)\d{2}(?:[-/.]\d{1,2}){1,2}\b/gu, ' ')
    .replace(/\b(?:19|20)\d{2}\s*年?\s*(?:Q[1-4]|第\s*[一二三四1-4]\s*季(?:度)?)/giu, ' ')
    .replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/gu, ' ')
    .replace(/\[(?:\d+)\]/gu, ' ')
    .replace(/第\s*[一二三四1-4]\s*季(?:度)?/gu, ' ');
  return [...withoutPeriodContext.matchAll(/(?<![\p{L}\d])[-+]?\d+(?:\.\d+)?/gu)].flatMap((match) => {
    const token = match[0].replace(/^\+/u, '');
    if (excludedTokens.has(token)) return [];
    const number = Number(token);
    return Number.isFinite(number) ? [number] : [];
  });
}
function numericClaimsMatchFacts(value: string, factIds: string[], factValues: ReadonlyMap<string, number[]>, excludedTokens?: ReadonlySet<string>) {
  const claims = numericClaims(value, excludedTokens);
  if (claims.length === 0) return true;
  const cited = factIds.flatMap((factId) => factValues.get(factId) || []);
  return claims.every((claim) => cited.some((fact) => Math.abs(claim - fact) <= Math.max(0.01, Math.abs(fact) * 0.001)));
}

const SECTION_FACT_PATTERNS: Record<string, RegExp> = {
  mix: /(?:revenue|gross_profit|monthly_revenue|product_mix)/u,
  demand: /(?:industry|peer|demand|gap_industry)/u,
  customers: /(?:customer|certification|shipment)/u,
  operations: /(?:capacity|yield|asp|company_actions|operating_income|revenue)/u,
  bridge: /(?:quarterly_|forward_|eps_ttm|monthly_revenue)/u,
  valuation: /(?:close|pe_ratio|pb_ratio|target|upside|forward_.*eps)/u,
  risk: /(?:target|upside|quarterly_|gap_|counter|invalidation)/u,
  technical: /(?:close|ma20|ma60|ma120|ma240|rsi14|volume_ratio|institutional|market)/u,
};
const CLAIM_RELEVANCE_PATTERNS: Array<{ text: RegExp; facts: RegExp }> = [
  { text: /(?:產品|業務|組合|product|business|mix)/iu, facts: /(?:product|business|mix|revenue)/iu },
  { text: /(?:需求|產業|同業|市場|demand|industry|peer|market)/iu, facts: /(?:demand|industry|peer|market)/iu },
  { text: /(?:客戶|customer|認證|certification|出貨|shipment)/iu, facts: /(?:customer|certification|shipment)/iu },
  { text: /(?:產能|capacity|良率|yield|平均售價|\basp\b)/iu, facts: /(?:capacity|yield|asp)/iu },
  { text: /(?:營收|revenue)/iu, facts: /(?:revenue|sales)/iu },
  { text: /(?:毛利|gross\s*margin|gross_profit)/iu, facts: /(?:gross_margin|gross_profit)/iu },
  { text: /(?:eps|每股盈餘)/iu, facts: /eps/iu },
  { text: /(?:目標價|target|估值|valuation|\bpe\b|\bpb\b)/iu, facts: /(?:target|upside|pe_ratio|pb_ratio|close|forward_.*eps)/iu },
  { text: /(?:收盤|股價|價格|close|price)/iu, facts: /(?:close|price)/iu },
  { text: /(?:均線|ma(?:20|60|120|240)|rsi|成交量|volume|法人|institutional|大盤|market)/iu, facts: /(?:ma20|ma60|ma120|ma240|rsi|volume|institutional|market)/iu },
  { text: /(?:營業利益|淨利|現金流|負債|權益|資產|operating\s*income|net\s*income|cash\s*flow|debt|equity|assets)/iu, facts: /(?:operating_income|net_income|cash_flow|debt|equity|assets)/iu },
];

function factIdsSupportSection(key: string, factIds: string[], factKeys: ReadonlyMap<string, string>) {
  const pattern = SECTION_FACT_PATTERNS[key];
  return !pattern || factIds.some((factId) => pattern.test(factKeys.get(factId) || ''));
}
function factIdsSupportClaim(text: string, factIds: string[], facts: ReadonlyMap<string, CandidateDossierFactMetadata>) {
  const applicable = CLAIM_RELEVANCE_PATTERNS.filter(({ text: pattern }) => pattern.test(text));
  return applicable.length > 0
    && applicable.every(({ facts: pattern }) => factIds.some((factId) => pattern.test(facts.get(factId)?.factKey || '')));
}
function typedFactClaimHasVerifiableSemantics(text: string, factIds: string[], facts: ReadonlyMap<string, CandidateDossierFactMetadata>) {
  const applicable = CLAIM_RELEVANCE_PATTERNS.filter(({ text: pattern }) => pattern.test(text));
  return applicable.length > 0
    && applicable.every(({ facts: pattern }) => factIds.some((factId) => pattern.test(facts.get(factId)?.factKey || '')));
}
function factKeysSupportClaim(text: string, factIds: string[], factKeys: ReadonlyMap<string, string>) {
  const facts = new Map(factIds.map((factId) => [factId, { factKey: factKeys.get(factId) || '' }]));
  return factIdsSupportClaim(text, factIds, facts);
}
function dataGapFactsOnlySupportExplicitGapLanguage(value: string, factIds: string[], factKinds: ReadonlyMap<string, string>) {
  if (!factIds.length || !factIds.every((factId) => factKinds.get(factId) === 'data_gap')) return true;
  return /(?:尚未|沒有|缺少|待補|未知|無法確認|insufficient|missing|unknown)/iu.test(value);
}
function stringArray(value: unknown) { return (Array.isArray(value) ? value : []).map(String).map((item) => item.trim()).filter(Boolean); }
function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function normalizedToken(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9\p{Script=Han}]+/gu, '_').replace(/^_+|_+$/gu, ''); }
function validClaimKind(value: string): value is CandidateDossierClaimKind { return value === 'fact' || value === 'guidance' || value === 'assumption' || value === 'derived_calculation'; }
function normalizeFormula(value: unknown): CandidateDossierFormula | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const expression = optionalString(raw.expression);
  return expression ? { expression, inputs: stringArray(raw.inputs) } : undefined;
}

function companyIdentityAppears(value: string, identity: CandidateDossierCompanyIdentity) {
  const symbol = optionalString(identity.symbol ?? undefined);
  const name = optionalString(identity.name ?? undefined);
  const symbolPattern = symbol ? new RegExp(`(^|[^0-9A-Za-z])${symbol.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}([^0-9A-Za-z]|$)`, 'u') : null;
  return Boolean((name && value.includes(name)) || (symbolPattern && symbolPattern.test(value)));
}

function claimFactsBelongToCompany(claim: CandidateDossierClaim, identity: CandidateDossierCompanyIdentity, facts: ReadonlyMap<string, CandidateDossierFactMetadata>) {
  const stockId = optionalString(identity.stockId ?? undefined);
  const symbol = optionalString(identity.symbol ?? undefined);
  return claim.factIds.every((factId) => {
    const fact = facts.get(factId);
    if (!fact) return false;
    if (stockId) return fact.stockId === stockId;
    if (symbol) return fact.symbol === symbol;
    return true;
  });
}

function factIdsBelongToCompany(factIds: string[], identity: CandidateDossierCompanyIdentity, facts: ReadonlyMap<string, CandidateDossierFactMetadata>) {
  return claimFactsBelongToCompany({ id: 'article', kind: 'fact', factIds, text: 'article' }, identity, facts);
}

function validateFormulaDag(claims: CandidateDossierClaim[], rejectionReasons: string[]) {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  for (const claim of claims) {
    if (claim.kind !== 'derived_calculation') continue;
    if (!claim.formula || claim.formula.inputs.length === 0) rejectionReasons.push(`claim_${claim.id}_formula_required`);
    else {
      if (claim.formula.inputs.some((input) => !byId.has(input))) rejectionReasons.push(`claim_${claim.id}_formula_unknown_input`);
      if (claim.formula.inputs.includes(claim.id)) rejectionReasons.push(`claim_${claim.id}_formula_cycle`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const claim = byId.get(id);
    const cyclic = claim?.kind === 'derived_calculation' && (claim.formula?.inputs || []).some((dependency) => byId.has(dependency) && walk(dependency));
    visiting.delete(id);
    visited.add(id);
    return Boolean(cyclic);
  };
  if (claims.some((claim) => walk(claim.id))) rejectionReasons.push('claim_formula_dag_cycle');
}

function claimMatchesMetadata(claim: CandidateDossierClaim, facts: ReadonlyMap<string, CandidateDossierFactMetadata>) {
  if (!claim.metric && !claim.unit && !claim.period && !claim.locator) return true;
  return claim.factIds.some((factId) => {
    const fact = facts.get(factId);
    if (!fact) return false;
    if (claim.metric && !normalizedToken(fact.factKey).includes(normalizedToken(claim.metric)) && !normalizedToken(claim.metric).includes(normalizedToken(fact.factKey))) return false;
    if (claim.unit && normalizedToken(fact.unit || '') !== normalizedToken(claim.unit)) return false;
    if (claim.period && String(fact.period || '') !== claim.period) return false;
    if (claim.locator && String(fact.locator || '') !== claim.locator) return false;
    return true;
  });
}

export function validateCandidateDossierSubmission(input: {
  summary: unknown; summaryFactIds: unknown; sections: unknown; claims?: unknown; allowedFactIds: Iterable<string>;
  factValues?: ReadonlyMap<string, number[]>; factKeys?: ReadonlyMap<string, string>; factKinds?: ReadonlyMap<string, string>;
  factMetadata?: ReadonlyMap<string, CandidateDossierFactMetadata>;
  companyIdentity?: CandidateDossierCompanyIdentity;
}): CandidateDossierSubmission {
  const allowed = new Set(input.allowedFactIds);
  const summary = String(input.summary || '').trim();
  const summaryFactIds = stringArray(input.summaryFactIds);
  const rawSections = Array.isArray(input.sections) ? input.sections as RawSection[] : [];
  const rawClaims = Array.isArray(input.claims) ? input.claims as RawClaim[] : [];
  const rejectionReasons: string[] = [];
  const excludedNumericTokens = new Set([optionalString(input.companyIdentity?.symbol ?? undefined)].filter((value): value is string => Boolean(value)));
  if (summary.length < 20 || rawSections.length === 0) rejectionReasons.push('invalid_submission_schema');
  if (summary.length >= 20 && summaryFactIds.length === 0) rejectionReasons.push('summary_missing_fact_id');
  if (summaryFactIds.some((factId) => !allowed.has(factId))) rejectionReasons.push('summary_unknown_fact_id');
  if (input.factKeys && summaryFactIds.length > 0 && !factKeysSupportClaim(summary, summaryFactIds, input.factKeys)) rejectionReasons.push('summary_fact_semantic_mismatch');
  if (input.companyIdentity && input.factMetadata && summaryFactIds.length > 0 && !factIdsBelongToCompany(summaryFactIds, input.companyIdentity, input.factMetadata)) rejectionReasons.push('summary_company_identity_mismatch');
  if (input.factKinds && !dataGapFactsOnlySupportExplicitGapLanguage(summary, summaryFactIds, input.factKinds)) rejectionReasons.push('summary_data_gap_used_as_positive_evidence');
  if (input.factValues && summaryFactIds.length > 0 && numericClaims(summary, excludedNumericTokens).length > 0 && !numericClaimsMatchFacts(summary, summaryFactIds, input.factValues, excludedNumericTokens)) rejectionReasons.push('summary_numeric_claim_mismatch');

  const sections = rawSections.map((section, index) => {
    const title = String(section.title || '').trim(); const key = String(section.key || `section_${index + 1}`); const body = String(section.body || '').trim(); const factIds = stringArray(section.factIds);
    if (!title || body.length < 10) rejectionReasons.push(`section_${index + 1}_invalid`);
    if (title && body.length >= 10 && factIds.length === 0) rejectionReasons.push(`section_${index + 1}_missing_fact_id`);
    if (factIds.some((factId) => !allowed.has(factId))) rejectionReasons.push(`section_${index + 1}_unknown_fact_id`);
    if (input.factKeys && factIds.length > 0 && !factIdsSupportSection(key, factIds, input.factKeys)) rejectionReasons.push(`section_${index + 1}_fact_semantic_mismatch`);
    if (input.factKeys && factIds.length > 0 && !factKeysSupportClaim(body, factIds, input.factKeys)) rejectionReasons.push(`section_${index + 1}_fact_semantic_mismatch`);
    if (input.companyIdentity && input.factMetadata && factIds.length > 0 && !factIdsBelongToCompany(factIds, input.companyIdentity, input.factMetadata)) rejectionReasons.push(`section_${index + 1}_company_identity_mismatch`);
    if (input.factKinds && !dataGapFactsOnlySupportExplicitGapLanguage(body, factIds, input.factKinds)) rejectionReasons.push(`section_${index + 1}_data_gap_used_as_positive_evidence`);
    if (numericClaims(body, excludedNumericTokens).length > 0 && factIds.length === 0) rejectionReasons.push(`section_${index + 1}_numeric_claim_without_fact_id`);
    if (input.factValues && factIds.length > 0 && numericClaims(body, excludedNumericTokens).length > 0 && !numericClaimsMatchFacts(body, factIds, input.factValues, excludedNumericTokens)) rejectionReasons.push(`section_${index + 1}_numeric_claim_mismatch`);
    return { key, title, body, factIds };
  });

  const seenClaimIds = new Set<string>();
  const claims = rawClaims.map((raw, index): CandidateDossierClaim => {
    const id = optionalString(raw.id) || `invalid_${index + 1}`; const kindValue = String(raw.kind || ''); const kind = validClaimKind(kindValue) ? kindValue : 'fact';
    const text = String(raw.text || '').trim(); const factIds = stringArray(raw.factIds); const formula = normalizeFormula(raw.formula);
    const metric = optionalString(raw.metric); const unit = optionalString(raw.unit); const period = optionalString(raw.period); const locator = optionalString(raw.locator);
    const claim: CandidateDossierClaim = { id, kind, text, factIds, ...(formula ? { formula } : {}), ...(metric ? { metric } : {}), ...(unit ? { unit } : {}), ...(period ? { period } : {}), ...(locator ? { locator } : {}) };
    if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(id) || seenClaimIds.has(id) || text.length < 5 || !validClaimKind(kindValue)) rejectionReasons.push(`claim_${index + 1}_invalid`);
    seenClaimIds.add(id);
    if ((kind === 'fact' || kind === 'guidance') && factIds.length === 0) rejectionReasons.push(`claim_${id}_missing_fact_id`);
    if (factIds.some((factId) => !allowed.has(factId))) rejectionReasons.push(`claim_${id}_unknown_fact_id`);
    if (kind === 'assumption' && !/(?:假設|情境|assum(?:e|ption)|scenario)/iu.test(text)) rejectionReasons.push(`claim_${id}_assumption_not_disclosed`);
    if (kind !== 'derived_calculation' && formula) rejectionReasons.push(`claim_${id}_formula_not_allowed`);
    if (input.factKinds && !dataGapFactsOnlySupportExplicitGapLanguage(text, factIds, input.factKinds)) rejectionReasons.push(`claim_${id}_data_gap_used_as_positive_evidence`);
    if (input.factKinds && factIds.length > 0) {
      const permittedKinds: Record<CandidateDossierClaimKind, Set<string>> = {
        fact: new Set(['official_numeric', 'official_text']), guidance: new Set(['official_text']),
        assumption: new Set(['model_assumption']), derived_calculation: new Set(['derived_calculation']),
      };
      if (factIds.some((factId) => !permittedKinds[kind].has(input.factKinds?.get(factId) || ''))) rejectionReasons.push(`claim_${id}_fact_kind_mismatch`);
    }
    if ((kind === 'fact' || kind === 'guidance') && !input.factMetadata) rejectionReasons.push(`claim_${id}_fact_metadata_required`);
    if ((kind === 'fact' || kind === 'guidance') && input.factMetadata && factIds.length > 0
      && !typedFactClaimHasVerifiableSemantics(text, factIds, input.factMetadata)) rejectionReasons.push(`claim_${id}_fact_semantic_mismatch`);
    if (input.factMetadata && factIds.length > 0 && !claimMatchesMetadata(claim, input.factMetadata)) rejectionReasons.push(`claim_${id}_fact_metadata_mismatch`);
    if (input.companyIdentity && input.factMetadata && factIds.length > 0 && !claimFactsBelongToCompany(claim, input.companyIdentity, input.factMetadata)) rejectionReasons.push(`claim_${id}_company_identity_mismatch`);
    if ((kind === 'fact' || kind === 'guidance') && (!metric || !locator)) rejectionReasons.push(`claim_${id}_structured_context_required`);
    if (kind === 'fact' && input.factKinds && factIds.some((factId) => input.factKinds?.get(factId) === 'official_numeric') && numericClaims(text, excludedNumericTokens).length === 0) {
      rejectionReasons.push(`claim_${id}_official_numeric_value_required`);
    }
    if (numericClaims(text, excludedNumericTokens).length > 0 && kind !== 'assumption' && kind !== 'derived_calculation') {
      if (!metric || !unit || !period || !locator) rejectionReasons.push(`claim_${id}_numeric_context_required`);
      if (input.factValues && !numericClaimsMatchFacts(text, factIds, input.factValues, excludedNumericTokens)) rejectionReasons.push(`claim_${id}_numeric_claim_mismatch`);
    }
    if (numericClaims(text, excludedNumericTokens).length > 0 && (kind === 'assumption' || kind === 'derived_calculation') && (!metric || !unit || !period)) rejectionReasons.push(`claim_${id}_numeric_context_required`);
    return claim;
  });
  validateFormulaDag(claims, rejectionReasons);
  const combined = `${summary}\n${sections.map((section) => section.body).join('\n')}\n${claims.map((claim) => claim.text).join('\n')}`;
  if (input.companyIdentity) {
    if (claims.length === 0) rejectionReasons.push('article_claims_required');
    if (!companyIdentityAppears(combined, input.companyIdentity)) rejectionReasons.push('article_company_identity_missing');
  }
  if (/investanchors|定錨投資|定錨會員/iu.test(combined)) rejectionReasons.push('paid_reference_content_forbidden');
  return { summary, summaryFactIds, sections, claims, rejectionReasons: [...new Set(rejectionReasons)] };
}
