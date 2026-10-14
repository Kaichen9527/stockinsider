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
// Native typed-array copy owns the verified bytes. Caller buffers and getters
// cannot change a later parse; no filesystem custody or I/O cancellation claim.
function copy(value: unknown, expected: number): Uint8Array {
  ensure(ArrayBuffer.isView(value) && (Object.getPrototypeOf(value) === Uint8Array.prototype || Object.getPrototypeOf(value) === Buffer.prototype));
  const proto = Object.getPrototypeOf(Uint8Array.prototype);
  ensure(Object.getOwnPropertyDescriptor(proto, 'byteLength')!.get!.call(value) === expected);
  const owned = new Uint8Array(expected); Uint8Array.prototype.set.call(owned, value as Uint8Array); return owned;
}
const capitalKeys = ['instant', 'ownersEquityTwdThousands', 'nonControllingEquityTwdThousands', 'groupEquityTwdThousands',
  'paidCapitalTwdThousands', 'parTwd', 'issuedSharesThousands', 'treasuryCarryingAmountTwdThousands', 'treasurySharesThousands'] as const;
const derivedKeys = ['nonCashAdjustments', 'workingCapitalCashEffect', 'cfo', 'groupNetProfit', 'cfoLessPpeCashOutlay',
  'cfoLessPpeAndIntangibleCashOutlay', 'netBorrowingCash', 'cashChange', 'closingCash'] as const;

/** Private injected bytes from the future single-owner reader. Fixed 9/7
 * complete inventories are verified here; this is not a reader, prepared input,
 * filesystem attestation, source admission or a v3 publication integration. */
export function projectPinnedHistoricalCash(profile: unknown, symbol: unknown, files: unknown, deadline: Deadline) {
  ensure(profile === historicalCashPins.profile && (symbol === '2409' || symbol === '2383'));
  deadline.check();
  ensure(files instanceof Map && Object.getPrototypeOf(files) === Map.prototype);
  const selected = historicalCashPins.companies[symbol];
  ensure(Object.getOwnPropertyDescriptor(Map.prototype, 'size')!.get!.call(files) === selected.files.length);
  ensure(Reflect.ownKeys(files).length === 0);
  const entries = [...Map.prototype.entries.call(files)] as Array<[unknown, unknown]>;
  ensure(entries.length === selected.files.length);
  const owned = new Map<string, Uint8Array>();
  try {
    let total = 0;
    for (let i = 0; i < selected.files.length; i++) {
      deadline.check(); const pin = selected.files[i];
      ensure(entries[i][0] === pin.path && pin.bytes <= historicalCashPins.limits.perFile);
      const raw = copy(entries[i][1], pin.bytes); owned.set(pin.path, raw);
      total += raw.byteLength; ensure(total <= historicalCashPins.limits.aggregate && sha(raw) === pin.sha256);
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
  } finally { for (const raw of owned.values()) raw.fill(0); }
}
