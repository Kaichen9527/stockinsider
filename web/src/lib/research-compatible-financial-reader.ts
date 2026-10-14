import { compatibleFinancialInventory as inventory } from './research-compatible-financial-inventory.ts';
import { projectCompatibleFinancial } from './research-compatible-financial-projection.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
import { FinancialIoDeadline, FINANCIAL_IO_LIMITS } from './research-financial-io-owner.ts';
import { runFinancialIoSession, type FinancialIoDependencies } from './research-financial-io-engine.ts';

/** NEW candidate execution, fixed old8/6 files. Assertion is trusted server composition,
 * never HTTP/model input; its 64hex context witness does not prove a real RPC/lease.
 * No mapping, old77b1 identity, job ID or formal authority is manufactured here. */
export function createCompatibleFinancialReader(root: string, assertPreparation: () => Promise<string>, io?: FinancialIoDependencies) {
  if (typeof assertPreparation !== 'function') throw new Error('financial_preparation_assertion_required');
  return Object.freeze({
    async read(profile: unknown, symbol: unknown, deadline: FinancialIoDeadline = new FinancialIoDeadline()) {
      if (profile !== inventory.profile || (symbol !== '2409' && symbol !== '2383')) throw new Error('financial_profile_invalid');
      const pins = inventory.companies[symbol];
      return runFinancialIoSession(root, pins, deadline, assertPreparation, files => {
        deadline.check();
        const records = new Map(files.map(f => [f.pin.path, { pin: f.pin, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(f.raw.subarray(0, f.pin.bytes))) }]));
        const readAt = new Date().toISOString();
        const projection = projectCompatibleFinancial(symbol, records, readAt); deadline.check();
        const calculation = { ...recalculateResearchBusinessScenarios(projection.projected, readAt) } as Record<string, unknown>; deadline.check();
        // Exact15d4 completeMaterial normalization, not a new canonical algorithm.
        delete (projection as Record<string, unknown>).sourceManifestHash;
        for (const key of ['inputHash', 'resultHash', 'executionCodeHash']) delete calculation[key];
        const financialMaterial = { projection, calculation };
        if (Buffer.byteLength(JSON.stringify(financialMaterial)) > FINANCIAL_IO_LIMITS.material) throw new Error('financial_material_bound');
        return { financialMaterial, artifactReadKnownAt: readAt, readerReceipt: {
          execution: 'new-compatible-financial-session-candidate-v1', profile: inventory.profile,
          files: pins.length, cleanupComplete: true, sourceClosureApproved: false, enabledForLiveV2: false,
          legacy77ExecutionClaimed: false, filesystemAuthorityApproved: false, financialVerified: false,
          dispatchReady: false, modelDispatched: false, publishableResearch: false, researchQualified: false,
          strategyApproved: false, entryEligible: false, kernelIoCancellationConfirmed: false,
        } };
      }, io);
    },
  });
}
