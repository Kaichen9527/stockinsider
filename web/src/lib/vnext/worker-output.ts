import { inputHash } from './policy.ts';
import { validateArtifact, validateReview, REQUIRED_SECTIONS, type Artifact, type Evidence, type Review } from './research.ts';
type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function keys(value: Row, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
/** Explicit shared JSON codec domain: finite fixed-decimal JS numbers only.
 * Outside this range JS exponent formatting differs from PostgreSQL jsonb.
 * Rejection consumes a settled output; we never round or silently rewrite it. */
export function assertWorkerJsonCodec(value: unknown, depth=0): void {
 if(depth>12) throw new Error('vnext_worker_json_depth');
 if(typeof value==='number' && (!Number.isFinite(value) || value!==0 && (Math.abs(value)<1e-6 || Math.abs(value)>=1e21))) throw new Error('vnext_worker_json_number_codec_unsupported');
 if(typeof value==='string') for(let i=0;i<value.length;i++) { const unit=value.charCodeAt(i); if(unit>=0xd800 && unit<=0xdbff) { const next=value.charCodeAt(++i); if(!(next>=0xdc00 && next<=0xdfff)) throw new Error('vnext_worker_json_unicode_invalid'); } else if(unit>=0xdc00 && unit<=0xdfff) throw new Error('vnext_worker_json_unicode_invalid'); }
 if(Array.isArray(value)) for(const item of value) assertWorkerJsonCodec(item,depth+1);
 else if(object(value)) for(const [key,item] of Object.entries(value)) { if(!/^[A-Za-z][A-Za-z0-9]*$/u.test(key)) throw new Error('vnext_worker_json_key_codec_unsupported'); assertWorkerJsonCodec(item,depth+1); }
}

export function normalizeWorkerAuthor(raw: unknown, binding: { model: string; modelVersion: string }, inputHashValue: string, evidence: Evidence[]) {
 if (!object(raw) || !keys(raw,['sections','claims','quoteDate','valuationDate','annualEps','nextFourQuarterEps','gaps'])) throw new Error('vnext_worker_author_closed_shape');
 if (!object(raw.sections) || !keys(raw.sections,[...REQUIRED_SECTIONS]) || Object.keys(raw.sections).length!==REQUIRED_SECTIONS.length) throw new Error('vnext_worker_sections_closed_shape');
 for (const section of Object.values(raw.sections)) if (!object(section) || !keys(section,['text','evidenceIds','claimIds']) || typeof section.text!=='string' || !Array.isArray(section.evidenceIds) || !section.evidenceIds.every((id) => typeof id==='string') || !Array.isArray(section.claimIds) || !section.claimIds.every((id) => typeof id==='string')) throw new Error('vnext_worker_section_closed_shape');
 if (!Array.isArray(raw.claims)) throw new Error('vnext_worker_claims_required');
 for (const claim of raw.claims) {
  if (!object(claim) || !keys(claim,['id','text','kind','evidenceIds','numeric']) || typeof claim.id!=='string' || typeof claim.text!=='string' || !Array.isArray(claim.evidenceIds) || !claim.evidenceIds.every((id) => typeof id==='string')) throw new Error('vnext_worker_claim_closed_shape');
  if (claim.numeric!==undefined) {
   if (!object(claim.numeric) || !keys(claim.numeric,['value','unit','period','key','formula'])) throw new Error('vnext_worker_numeric_closed_shape');
   const formula=claim.numeric.formula; if (formula!==undefined && (!object(formula) || !keys(formula,['operation','evidenceIds']) || !Array.isArray(formula.evidenceIds) || !formula.evidenceIds.every((id) => typeof id==='string'))) throw new Error('vnext_worker_formula_closed_shape');
  }
 }
 assertWorkerJsonCodec(raw);
 const normalized = { ...raw, schemaVersion: 'stockinsider-vnext-research-v1', model: binding.model, modelVersion: binding.modelVersion, inputHash: inputHashValue } as Omit<Artifact,'outputHash'>;
 const artifact = { ...normalized, outputHash: inputHash(normalized) } as Artifact;
 const validation=validateArtifact(artifact,evidence,inputHashValue); if (!validation.valid) throw new Error(`vnext_worker_author_invalid:${validation.reasons.join(',')}`);
 return artifact;
}
export function normalizeWorkerReview(raw: unknown, modelVersion: string, artifact: Artifact, evidence: Evidence[]) {
 if (!object(raw) || !keys(raw,['approved','findings','factsChecked','valuationChecked','claimsChecked','claimChecks']) || typeof raw.approved!=='boolean' || !['factsChecked','valuationChecked','claimsChecked'].every((key) => typeof raw[key]==='boolean')
  || !Array.isArray(raw.findings) || !raw.findings.every((finding) => typeof finding==='string' && finding.length>0) || !Array.isArray(raw.claimChecks) || raw.claimChecks.length!==artifact.claims.length) throw new Error('vnext_worker_review_closed_shape');
 const seen=new Set<string>();
 for (const check of raw.claimChecks) {
  if (!object(check) || !keys(check,['claimId','verdict','reason','sources']) || typeof check.claimId!=='string' || seen.has(check.claimId) || !['supported','unsupported'].includes(String(check.verdict)) || typeof check.reason!=='string' || !check.reason.trim() || !Array.isArray(check.sources)) throw new Error('vnext_worker_review_check_closed_shape');
  seen.add(check.claimId); const claim=artifact.claims.find((c) => c.id===check.claimId); if (!claim || check.sources.length!==claim.evidenceIds.length) throw new Error('vnext_worker_review_claim_binding');
  const ids=new Set<string>(); for (const source of check.sources) {
   if (!object(source) || !keys(source,['id','contentHash']) || typeof source.id!=='string' || ids.has(source.id) || !claim.evidenceIds.includes(source.id) || evidence.find((e) => e.id===source.id)?.contentHash!==source.contentHash) throw new Error('vnext_worker_review_source_binding'); ids.add(source.id);
  }
 }
 assertWorkerJsonCodec(raw);
 const review = { ...raw, modelVersion, authorOutputHash: artifact.outputHash } as Review;
 const errors=validateReview(review,artifact,evidence); if(errors.length) throw new Error(`vnext_worker_review_invalid:${errors.join(',')}`);
 return review;
}
