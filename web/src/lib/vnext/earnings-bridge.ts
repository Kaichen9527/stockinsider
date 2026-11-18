import { isHistoryDate } from '../candidate-price-history.ts';
import { evidenceInstant } from './evidence-clock.ts';

type PeriodKind = 'fiscal_quarter' | 'fiscal_year' | 'next_four_quarters';
type OperatingBasis = 'reported' | 'issuer_guidance' | 'model_assumption';
type Unit = 'TWD' | 'shares' | 'multiple_x10000';
type Scope = { symbol: string; periodStart: string; periodEnd: string };
export type EarningsBridgeOperand = Scope & {
  value: number;
  unit: Unit;
  basis: OperatingBasis;
  knownAt: string;
  sourceRef: string;
  sourceSha256: string;
  shareBasis?: 'basic' | 'diluted';
};
const units = {
  operatingIncome: 'TWD',
  netNonoperatingIncome: 'TWD',
  incomeTaxExpense: 'TWD',
  noncontrollingIncome: 'TWD',
  ordinaryNumeratorAdjustment: 'TWD',
  weightedAverageShares: 'shares',
  peMultiple: 'multiple_x10000',
} as const;
type OperandName = keyof typeof units;
export type EarningsBridgeInput = Scope & {
  periodKind: PeriodKind;
  classification: 'reported_reconciliation' | 'modeled_scenario';
  shareBasis: 'basic' | 'diluted';
  cutoff: string;
  operands: Partial<Record<OperandName, EarningsBridgeOperand | null>>;
};
function invalid(reason: string): never { throw Error('vnext_earnings_bridge_' + reason); }
function validPeriod(start: string, end: string, months: number) {
  if (!isHistoryDate(start) || !isHistoryDate(end) || !start.endsWith('-01')) return false;
  const expected = new Date(start + 'T00:00:00Z');
  expected.setUTCMonth(expected.getUTCMonth() + months);
  expected.setUTCDate(0);
  return expected.toISOString().slice(0, 10) === end;
}
function decimal(numerator: bigint, denominator: bigint, digits: number) {
  const scale = BigInt(10) ** BigInt(digits);
  const magnitude = (numerator < BigInt(0) ? -numerator : numerator) * scale;
  const rounded = (BigInt(2)*magnitude + denominator) / (BigInt(2)*denominator);
  return (numerator < BigInt(0) && rounded !== BigInt(0) ? '-' : '') + (rounded / scale).toString() + '.' + (rounded % scale).toString().padStart(digits, '0');
}
function sum(a: bigint | null, b: bigint | null, direction: 'add' | 'subtract' = 'add') {
  if (a === null || b === null) return null;
  return direction === 'add' ? a + b : a - b;
}

/** Calculates from explicitly supplied amounts in one fiscal duration.
 * Receipts identify previous source checks; arithmetic does not grant source,
 * model, provider, trade or disclosure authority. */
export function calculateEarningsBridge(input: EarningsBridgeInput) {
  const cutoff = evidenceInstant(input.cutoff);
  if (cutoff === null || !/^\d{4}$/u.test(input.symbol)
    || !['fiscal_quarter', 'fiscal_year', 'next_four_quarters'].includes(input.periodKind)
    || !validPeriod(input.periodStart, input.periodEnd, input.periodKind === 'fiscal_quarter' ? 3 : 12)
    || !['basic','diluted'].includes(input.shareBasis)
    || !['reported_reconciliation','modeled_scenario'].includes(input.classification)
    || !input.operands || typeof input.operands !== 'object' || Array.isArray(input.operands)
    || Object.keys(input.operands).some(field => !Object.hasOwn(units, field))) invalid('scope_invalid');
  const reported = input.classification === 'reported_reconciliation';
  if (reported && (input.periodKind === 'next_four_quarters' || input.operands.peMultiple
    || cutoff < evidenceInstant(input.periodEnd+'T23:59:59.999999+08:00')!)) invalid('reported_scope_invalid');

  const missing: string[] = [];
  const receipts: Partial<Record<OperandName, Pick<EarningsBridgeOperand,'value'|'unit'|'shareBasis'|'basis'|'knownAt'|'sourceRef'|'sourceSha256'>>> = {};
  const amount = (key: OperandName) => {
    const row = input.operands[key];
    if (row === null || row === undefined) {
      if (key !== 'peMultiple') missing.push(key);
      return null;
    }
    const known = evidenceInstant(row.knownAt);
    if (!Number.isSafeInteger(row.value) || (key === 'weightedAverageShares' || key === 'peMultiple') && row.value <= 0
      || ((key === 'weightedAverageShares' || key === 'ordinaryNumeratorAdjustment')
        ? row.shareBasis !== input.shareBasis : row.shareBasis !== undefined)
      || row.unit !== units[key] || row.symbol !== input.symbol
      || row.periodStart !== input.periodStart || row.periodEnd !== input.periodEnd
      || known === null || known > cutoff || typeof row.sourceRef !== 'string' || row.sourceRef.length < 1
      || row.sourceRef.length > 240 || /[\u0000-\u001f\u007f]/u.test(row.sourceRef)
      || typeof row.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sourceSha256)
      || (reported ? row.basis !== 'reported' :
        row.basis !== 'model_assumption' && !(row.basis === 'issuer_guidance' && key === 'operatingIncome'))) invalid('operand_invalid:' + key);
    receipts[key] = {value:row.value,unit:row.unit,basis:row.basis,knownAt:row.knownAt,sourceRef:row.sourceRef,
      sourceSha256:row.sourceSha256,...(row.shareBasis?{shareBasis:row.shareBasis}:{})};
    return BigInt(row.value);
  };
  const operatingIncome = amount('operatingIncome');
  const netNonoperatingIncome = amount('netNonoperatingIncome');
  const incomeTaxExpense = amount('incomeTaxExpense');
  const noncontrollingIncome = amount('noncontrollingIncome');
  const ordinaryNumeratorAdjustment = amount('ordinaryNumeratorAdjustment');
  const shares = amount('weightedAverageShares');
  const peMultiple = amount('peMultiple');
  const pretax = sum(operatingIncome, netNonoperatingIncome);
  const net = sum(pretax, incomeTaxExpense, 'subtract');
  const parent = sum(net, noncontrollingIncome, 'subtract');
  const numerator = sum(parent, ordinaryNumeratorAdjustment);

  const valuationGap = reported ? 'reported_period_only' :
    input.periodKind === 'fiscal_quarter' ? 'annual_earnings_period_required' :
    numerator === null || shares === null ? 'earnings_incomplete' :
    numerator <= BigInt(0) ? 'nonpositive_eps' : peMultiple === null ? 'valuation_multiple_missing' : null;
  const valuation = valuationGap === null ? {
    peMultiple: decimal(peMultiple!, BigInt(10000), 4),
    targetPriceTwd: decimal(numerator! * peMultiple!, shares! * BigInt(10000), 2),
  } : null;
  return {
    schemaVersion: 'vnext-earnings-bridge-v1' as const,
    symbol: input.symbol,periodStart: input.periodStart,periodEnd: input.periodEnd,
    periodKind: input.periodKind,cutoff: input.cutoff,classification: input.classification,shareBasis: input.shareBasis,
    pretaxIncomeTwd: pretax?.toString() ?? null, netIncomeTwd: net?.toString() ?? null,
    parentIncomeTwd: parent?.toString() ?? null,
    eps: numerator !== null && shares !== null ? {
      numeratorTwd: numerator.toString(),denominatorShares: shares.toString(),amount: decimal(numerator, shares, 6),
      roundedToCents: decimal(numerator, shares, 2),
    } : null,
    valuation, valuationGap, missing, receipts,
  };
}
