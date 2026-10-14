import { createHash } from 'node:crypto';
import { calculateHistoricalCash } from './research-historical-cash-core.ts';
import { historicalCashPins } from './research-historical-cash-pins.ts';

type Row = Record<string, unknown>;
type Deadline = { check(): void };
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Row)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function ensure(value: unknown): asserts value { if (!value) throw new Error('historical_cash_projection_invalid'); }
function row(value: unknown): Row { ensure(value !== null && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Capture realm intrinsics; caller view metadata, methods and proxies are never read.
const isView = ArrayBuffer.isView;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const nativeByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')!.get!;
const nativeKind = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!;
const nativeBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')!.get!;
const arrayBufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const arrayBufferResizable = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const nativeSet = Uint8Array.prototype.set;
const nativeFill = Uint8Array.prototype.fill;
const decodeBase64 = Buffer.from;
function copyCarrier(value: unknown, expected: number): Uint8Array {
  ensure(isView(value) && nativeKind.call(value) === 'Uint8Array');
  const backing = nativeBuffer.call(value);
  // This intrinsic throws for SharedArrayBuffer; no caller property access.
  arrayBufferLength.call(backing);
  ensure(!arrayBufferResizable?.call(backing));
  ensure(expected <= historicalCashPins.limits.carrier && nativeByteLength.call(value) === expected);
  const owned = new Uint8Array(expected);
  try { nativeSet.call(owned, value as Uint8Array); return owned; }
  catch (error) { nativeFill.call(owned, 0); throw error; }
}
const capitalKeys = ['instant', 'ownersEquityTwdThousands', 'nonControllingEquityTwdThousands', 'groupEquityTwdThousands',
  'paidCapitalTwdThousands', 'parTwd', 'issuedSharesThousands', 'treasuryCarryingAmountTwdThousands', 'treasurySharesThousands'] as const;
const derivedKeys = ['nonCashAdjustments', 'workingCapitalCashEffect', 'cfo', 'groupNetProfit', 'cfoLessPpeCashOutlay',
  'cfoLessPpeAndIntangibleCashOutlay', 'netBorrowingCash', 'cashChange', 'closingCash'] as const;

/** BREAKING unpublished internal API: one exact canonical UTF8 Uint8Array or
 * Buffer carrier. Maps and JS metadata are outside this byte-only input domain.
 * This is not a filesystem reader, prepared input or source/publication authority. */
export function projectPinnedHistoricalCash(profile: unknown, symbol: unknown, material: unknown, deadline: Deadline) {
  ensure(profile === historicalCashPins.profile && (symbol === '2409' || symbol === '2383'));
  deadline.check();
  const selected = historicalCashPins.companies[symbol];
  const owned = new Map<string, Uint8Array>();
  let carrier: Uint8Array | null = null;
  try {
    carrier = copyCarrier(material, selected.carrier.bytes);
    deadline.check();
    ensure(sha(carrier) === selected.carrier.sha256);
    deadline.check();
    const serialized = new TextDecoder('utf-8', { fatal: true }).decode(carrier);
    deadline.check();
    const envelope = row(JSON.parse(serialized));
    deadline.check();
    ensure(envelope.schemaVersion === 'historical-cash-private-byte-material-v1'
      && envelope.financialProfile === profile && envelope.symbol === symbol
      && Array.isArray(envelope.files) && envelope.files.length === selected.files.length);
    let total = 0;
    for (let i = 0; i < selected.files.length; i++) {
      deadline.check(); const pin = selected.files[i], entry = row(envelope.files[i]);
      ensure(entry.path === pin.path && typeof entry.rawBase64 === 'string'
        && pin.bytes <= historicalCashPins.limits.perFile);
      const raw = decodeBase64(entry.rawBase64, 'base64');
      owned.set(pin.path, raw); // Register the only decode buffer before any failing check.
      deadline.check();
      total += raw.byteLength;
      ensure(raw.byteLength === pin.bytes && total <= historicalCashPins.limits.aggregate && sha(raw) === pin.sha256);
    }
    ensure(total === selected.aggregateBytes);
    const parse = (name: string) => { deadline.check(); return row(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(owned.get(name)!))); };
    const model = parse(selected.files[0].path), packet = parse(historicalCashPins.packetPath);
    const { canonicalHash, inputManifest, ...modelBody } = model;
    ensure(model.symbol === symbol && canonicalHash === selected.modelCanonicalHash && sha(canonical(modelBody)) === canonicalHash);
    const manifest = selected.files.slice(1).map(p => ({ file: p.path, bytes: p.bytes, sha256: p.sha256 }));
    const cash = row(model.historicalCashFlow);
    ensure(canonical(inputManifest) === canonical(manifest) && canonical(cash.sourceInputManifest) === canonical(manifest));
    ensure(packet.schemaVersion === 1 && packet.status === 'research_addendum_not_published'
      && cash.schemaVersion === 'historical-group-cash-bridge-v1' && cash.symbol === symbol
      && cash.sourcePacketSha256 === selected.files.at(-1)!.sha256 && cash.extractionAvailableAt === packet.extractionAvailableAt
      && model.asOf === packet.extractionAvailableAt && cash.noFutureCash === true && cash.forecastCash === null
      && cash.valuationApproved === false && cash.technicalAdmission === false);
    const policy = row(packet.policy);
    ensure(policy.newExtractionBackdated === false && policy.valuationApproved === false && policy.published === false && policy.investmentAdmission === false);
    ensure(Array.isArray(packet.issuers) && packet.issuers.length === 2);
    const issuer = row(packet.issuers[selected.issuerIndex]), facts = row(issuer.facts), modelFacts = row(cash.sourceFacts);
    ensure(issuer.stock === symbol && issuer.consolidated === true && issuer.unit === 'TWD_thousands'
      && issuer.grain === 'six-month cumulative flow, not standalone Q2');
    ensure(canonical(Object.keys(facts)) === canonical(selected.metrics) && canonical(Object.keys(modelFacts)) === canonical(selected.metrics));
    const source = row(issuer.source);
    ensure(canonical(cash.originalSource) === canonical(source));
    const operands: Record<string, unknown> = {};
    const references = selected.metrics.map(metric => {
      deadline.check(); const fact = row(facts[metric]), modelFact = row(modelFacts[metric]);
      const pointer = `/issuers/${selected.issuerIndex}/facts/${metric}/values`;
      ensure(canonical(fact.values) === canonical(modelFact.values) && fact.label === modelFact.label
        && fact.pdfPage === modelFact.pdfPage && fact.sourceLine === modelFact.sourceLine && modelFact.sourceJsonPointer === pointer);
      ensure(typeof fact.sourceLine === 'string' && typeof fact.label === 'string' && Number.isInteger(fact.pdfPage));
      operands[metric] = fact.values;
      return { metric, label: fact.label, periodKind: 'half_year_cumulative', unit: 'TWD_thousands', values: fact.values,
        packetLocator: { file: historicalCashPins.packetPath, fileSha256: cash.sourcePacketSha256, jsonPointer: pointer },
        modelLocator: { file: selected.files[0].path, fileSha256: selected.files[0].sha256, jsonPointer: `/historicalCashFlow/sourceFacts/${metric}/values` },
        sourceLineSha256: sha(fact.sourceLine), pdfPage: fact.pdfPage, rawPdfSha256: source.sha256 };
    });
    const packetCapital = symbol === '2409' ? row(packet.auoJune30Capital) : null;
    const capital = packetCapital ? Object.fromEntries(capitalKeys.map(key => [key, packetCapital[key]])) : null;
    if (packetCapital) for (const key of capitalKeys) ensure(canonical(row(cash.historicalCapital)[key]) === canonical(packetCapital[key]));
    else ensure(cash.historicalCapital === null);
    deadline.check();
    const calculation = calculateHistoricalCash({ schemaVersion: 'historical-cash-operands-v1', symbol, unit: issuer.unit,
      consolidated: issuer.consolidated, grain: 'half_year_cumulative', periods: issuer.periods, facts: operands, capital });
    ensure(Array.isArray(cash.rows) && cash.rows.length === 2);
    calculation.rows.forEach((r, i) => {
      const prior = row((cash.rows as unknown[])[i]); ensure(r.period === prior.period);
      for (const key of derivedKeys) ensure(r.calculated[key] === prior[key]);
      ensure(Math.abs(r.ratio.value! - Number(prior.cfoDividedByGroupNetProfit)) <= 1e-9);
      ensure(r.calculated.rouCashAcquisitionSeparate === prior.rouCashAcquisitionSeparate);
    });
    const projection = { schemaVersion: 'historical-cash-pinned-projection-v1', financialProfile: historicalCashPins.profile,
      symbol, status: 'unsealed_private_candidate', sourceCommit: historicalCashPins.sourceCommit,
      sourceManifest: selected.files.map(p => ({ ...p })), inventorySha256: sha(canonical(selected.files)),
      modelCanonicalHash: canonicalHash, originalModelCutoff: model.originalModelAsOf,
      extractionAvailableAt: packet.extractionAvailableAt, rawSourceObservedAt: source.observedAt,
      rawPdfSha256: source.sha256, sourcePublicationVerified: false, rawPdfBytesRead: false,
      inventoryBytesVerified: true, filesystemCustodyVerified: false, references, calculation,
      capitalReferences: packetCapital ? capitalKeys.map(key => ({ field: key, jsonPointer: `/auoJune30Capital/${key}`,
        packetSha256: cash.sourcePacketSha256, instant: '2026-06-30',
        unit: key === 'parTwd' ? 'TWD' : key.includes('Shares') ? 'thousand_shares' : key === 'instant' ? 'date' : 'TWD_thousands' })) : [],
      financialVerified: false, dispatchReady: false, modelDispatched: false, publishableResearch: false,
      researchQualified: false, historicalPITEligible: false, strategyApproved: false, entryEligible: false, published: false,
      valuationApproved: false, technicalAdmission: false, noFutureCash: true, forecastCash: null };
    deadline.check(); const json = JSON.stringify(projection);
    ensure(Buffer.byteLength(json, 'utf8') <= historicalCashPins.limits.projection);
    const result = { ...projection, projectionSha256: sha(canonical(projection)) };
    ensure(Buffer.byteLength(JSON.stringify(result), 'utf8') <= historicalCashPins.limits.projection);
    deadline.check(); return freeze(result);
  } finally { for (const raw of owned.values()) nativeFill.call(raw, 0); if (carrier) nativeFill.call(carrier, 0); }
}
