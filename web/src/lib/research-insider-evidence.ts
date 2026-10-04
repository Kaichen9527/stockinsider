import { createHash } from 'node:crypto';

export type InsiderEvidence = {
  kind: 'holding_snapshot' | 'transfer_declaration' | 'confirmed_transaction';
  symbol: string; person: string; role: string; reportPeriod: string;
  sourceUrl: string; transferMethod: string | null;
  currentShares: number | null; comparablePriorShares: number | null;
  declaredShares: number | null; confirmedShares: number | null;
};
export function buildInsiderEvidence(input: InsiderEvidence) {
  if (!/^\d{4}$/u.test(input.symbol) || !input.person || !input.role || !input.reportPeriod
    || new URL(input.sourceUrl).protocol !== 'https:'
    || [input.currentShares, input.comparablePriorShares, input.declaredShares, input.confirmedShares]
      .some((value) => value !== null && (!Number.isFinite(value) || value < 0))) throw new Error('insider_evidence_invalid');
  const revisionHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const identity = createHash('sha256').update(JSON.stringify([
    input.sourceUrl, input.symbol, input.person, input.role, input.reportPeriod, input.kind,
  ])).digest('hex');
  const comparableChange = input.kind === 'holding_snapshot' && input.currentShares !== null
    && input.comparablePriorShares !== null ? input.currentShares - input.comparablePriorShares : null;
  return {
    ...input, identity, revisionHash,
    documentUrl: `${input.sourceUrl}#si-insider-${identity}-${revisionHash}`,
    comparableChange,
    /** A balance or intended transfer is not a confirmed open-market trade. */
    tradingDirection: input.kind === 'confirmed_transaction' && input.confirmedShares !== null
      ? 'transaction_requires_method_review' : 'not_confirmed_transaction',
  };
}
