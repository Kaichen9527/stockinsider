import { createHash } from 'node:crypto';
import raw2409 from './research-v3-material-schemas/2409-raw.json' with { type: 'json' };
import raw2383 from './research-v3-material-schemas/2383-raw.json' with { type: 'json' };
import normalized2409 from './research-v3-material-schemas/2409-normalized.json' with { type: 'json' };
import normalized2383 from './research-v3-material-schemas/2383-normalized.json' with { type: 'json' };
import { completeEnsure as ensure, completeHash, parseCompleteJson, validateCompleteSchema } from './research-v3-material-canonical.ts';
import { historicalCashPins } from './research-historical-cash-pins.ts';
import { financialInstant } from './research-financial-clock.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
type Row = Record<string, unknown>;
type Deadline = { check(): void };
const schemas = { '2409': { raw: raw2409, normalized: normalized2409 }, '2383': { raw: raw2383, normalized: normalized2383 } };
// Schema identity is static JSON UTF8 serialization, NOT depth-limited data tagged canonical.
export const v3MaterialSchemaIdentity = Object.freeze(Object.fromEntries(Object.entries(schemas).map(([symbol,pair]) => [symbol,Object.freeze(Object.fromEntries(Object.entries(pair).map(([kind,schema])=>[kind,createHash('sha256').update(JSON.stringify(schema)+'\n').digest('hex')])))])));
function canonical(v: unknown): string { if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;if(v&&typeof v==='object')return `{${Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Row)[k])).join(',')}}`;return JSON.stringify(v); }
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
function row(v: unknown): Row { ensure(v&&typeof v==='object'&&!Array.isArray(v));return v as Row; }
function context(profile:unknown,symbol:unknown,readAt:unknown,deadline:Deadline): asserts symbol is '2409'|'2383' {
 deadline.check();ensure(profile===historicalCashPins.profile&&(symbol==='2409'||symbol==='2383'));
 ensure(typeof readAt==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(readAt));
 ensure(financialInstant(readAt)<=BigInt(Date.now())*BigInt(1000000));
}
function parse(text:unknown,deadline:Deadline):Row {
 // Primitive/O(1) character bound BEFORE UTF8 scan or duplicate-key parsing.
 ensure(typeof text==='string'&&text.length<=262144);deadline.check();ensure(Buffer.byteLength(text,'utf8')<=262144);
 const result=row(parseCompleteJson(text));deadline.check();return result;
}
function normalizedCalculation(value:unknown) {const c={...row(value)};for(const key of ['inputHash','resultHash','executionCodeHash'])delete c[key];return c;}
function validateProjection(projection:Row,readAt:string,deadline:Deadline){
 ensure(Buffer.byteLength(JSON.stringify(projection),'utf8')<=160000);
 ensure(financialInstant(row(projection.historicalCash).extractionAvailableAt)<=financialInstant(readAt));deadline.check();
 const calculation=recalculateResearchBusinessScenarios(projection.projected,readAt);deadline.check();return calculation;
}
/** Primitive text ingress, trusted server clock only. No request-selected schema/identity. */
export function normalizeScenarioCashMaterial(profile:unknown,symbol:unknown,text:unknown,readAt:string,deadline:Deadline) {
 context(profile,symbol,readAt,deadline);const raw=parse(text,deadline);
 validateCompleteSchema(raw,schemas[symbol].raw,readAt);deadline.check();
 const projection=row(raw.projection),calculation=row(raw.calculation),recalculated=validateProjection(projection,readAt,deadline);
 ensure(raw.projectionHash===hash(projection)&&raw.scenarioInputHash===hash(row(projection.projected).scenarios)&&raw.resultHash===hash(calculation));
 ensure(canonical(calculation)===canonical(recalculated));deadline.check();
 const provenance={...raw};for(const key of ['projection','calculation','projectionHash','scenarioInputHash','resultHash','financialProfile','symbol','artifactReadKnownAt'])delete provenance[key];
 delete projection.sourceManifestHash;
 const output={schemaVersion:'research-complete-financial-material-v3-candidate',financialProfile:profile,symbol,artifactReadKnownAt:readAt,
 candidateArtifactInventoryHash:completeHash(historicalCashPins.companies[symbol].files),financialMaterial:{projection,calculation:normalizedCalculation(calculation),provenance},
 sourceClosureApproved:false,wireDispatchEnabled:false,wholeExecutionClosureBound:false};
 return validateNormalizedScenarioCashMaterial(profile,symbol,JSON.stringify(output),readAt,deadline);
}
export function validateNormalizedScenarioCashMaterial(profile:unknown,symbol:unknown,text:unknown,readAt:string,deadline:Deadline) {
 context(profile,symbol,readAt,deadline);const output=parse(text,deadline);
 validateCompleteSchema(output,schemas[symbol].normalized,readAt);deadline.check();
 ensure(output.candidateArtifactInventoryHash===completeHash(historicalCashPins.companies[symbol].files));
 const material=row(output.financialMaterial),projection=row(material.projection),recalculated=validateProjection(projection,readAt,deadline);
 ensure(canonical(material.calculation)===canonical(normalizedCalculation(recalculated)));completeHash(output);deadline.check();
 return output;
}
