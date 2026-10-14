import { normalizeScenarioCashMaterial } from './research-v3-finite-material.ts';
import { createHash } from 'node:crypto';
import { historicalCashPins } from './research-historical-cash-pins.ts';
import { projectPinnedHistoricalCash } from './research-historical-cash-projection.ts';
import { projectScenarioCashMaterial } from './research-scenario-cash-material.ts';
import { FinancialIoDeadline, FINANCIAL_IO_LIMITS } from './research-financial-io-owner.ts';
import { acquireFinancialIo, runFinancialIoSession, checkFinancialIoInventory, type FinancialIoPin, type FinancialIoDependencies } from './research-financial-io-engine.ts';

function encodeFixedCarrier(files: Array<{pin: FinancialIoPin;raw:Buffer}>, symbol:'2409'|'2383', deadline:FinancialIoDeadline, allocate:(bytes:number)=>Buffer) {
 const selected=historicalCashPins.companies[symbol];
  // Private fixed literal encoder. Never an arbitrary caller Map API.
        const chunks = ['{"files":['];
        for (let i = 0; i < files.length; i++) {
          deadline.check(); const f = files[i];
          chunks.push((i ? ',' : '') + '{"path":' + JSON.stringify(f.pin.path) + ',"rawBase64":' + JSON.stringify(f.raw.subarray(0, f.pin.bytes).toString('base64')) + '}');
        }
        chunks.push('],"financialProfile":' + JSON.stringify(historicalCashPins.profile) + ',"schemaVersion":"historical-cash-private-byte-material-v1","symbol":' + JSON.stringify(symbol) + '}');
        deadline.check(); const text = chunks.join('');
        if (Buffer.byteLength(text, 'utf8') !== selected.carrier.bytes) throw new Error('financial_carrier_invalid');
        const carrier = allocate(selected.carrier.bytes); carrier.write(text, 'utf8');
        deadline.check(); if (createHash('sha256').update(carrier).digest('hex') !== selected.carrier.sha256) throw new Error('financial_carrier_invalid');
        return carrier;
}

/** Trusted NEW-closure composition root; no route, caller paths or live v2 change.
 * All copies/imports share the realm ownership registry at acquisition. */
export function createCandidateFinancialReaders(root: string, io?: FinancialIoDependencies) {
  const fixed = async (kind: 'historicalCash' | 'scenarioCash', profile: unknown, symbol: unknown, deadline: FinancialIoDeadline) => {
      if (profile !== historicalCashPins.profile || (symbol !== '2409' && symbol !== '2383')) throw new Error('financial_profile_invalid');
      const selected = historicalCashPins.companies[symbol];
      checkFinancialIoInventory(root, selected.files, selected.files.length);
      const session = await acquireFinancialIo(root, selected.files, deadline, io);
      try {
        const carrier = encodeFixedCarrier(session.files, symbol, deadline, n=>session.owner.buffer(n));
        await session.validate();
        const readAt = new Date().toISOString();
        const result = kind === 'historicalCash'
          ? { projection: projectPinnedHistoricalCash(profile, symbol, carrier, deadline) }
          : { material: projectScenarioCashMaterial(profile, symbol, carrier, readAt, deadline) };
        await session.validate(); await session.owner.cleanup(deadline); deadline.check();
        return { ...result, readerReceipt: { execution: 'new-financial-io-v1', files: selected.files.length, rawBytes: selected.aggregateBytes,
          carrierBytes: selected.carrier.bytes, carrierSha256: selected.carrier.sha256, cleanupComplete: true, kernelIoCancellationConfirmed: false } };
      } catch (error) { await session.owner.cleanup(deadline, error); throw error; }
  };
  return Object.freeze({
    /** Assertion callback is trusted composition, not HTTP/body or real RPC proof. */
    async completeScenarioCash(profile: unknown, symbol: unknown, assertPreparation: () => Promise<string>, deadline: FinancialIoDeadline = new FinancialIoDeadline()) {
      if (profile !== historicalCashPins.profile || (symbol !== '2409' && symbol !== '2383')) throw new Error('financial_profile_invalid');
      if (typeof assertPreparation !== 'function') throw new Error('financial_preparation_assertion_required');
      const selected=historicalCashPins.companies[symbol];
      return runFinancialIoSession(root,selected.files,deadline,assertPreparation,files=>{
        let scratch:Buffer|null=null;
        try {
          const carrier=encodeFixedCarrier(files,symbol,deadline,n=>{scratch=Buffer.alloc(n);return scratch;});
          const readAt=new Date().toISOString();
          const raw=projectScenarioCashMaterial(profile,symbol,carrier,readAt,deadline);
          const material=normalizeScenarioCashMaterial(profile,symbol,JSON.stringify(raw),readAt,deadline);
          return {material,readerReceipt:{execution:'new-v3-finite-material-session-candidate',files:files.length,cleanupComplete:true,
            kernelIoCancellationConfirmed:false,sourceClosureApproved:false,wireDispatchEnabled:false,wholeExecutionClosureBound:false}};
        } finally { if(scratch!==null)(scratch as Buffer).fill(0); }
      },io);
    },
    async legacy(pins: readonly FinancialIoPin[], deadline: FinancialIoDeadline = new FinancialIoDeadline()) {
      checkFinancialIoInventory(root, pins, FINANCIAL_IO_LIMITS.legacyFiles);
      const fixedPins = pins.map(p => Object.freeze({ path: p.path, bytes: p.bytes, sha256: p.sha256 }));
      const session = await acquireFinancialIo(root, fixedPins, deadline, io);
      try {
        const records = new Map<string, { pin: FinancialIoPin; value: unknown }>();
        for (const file of session.files) { deadline.check(); records.set(file.pin.path, { pin: file.pin, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.raw.subarray(0, file.pin.bytes))) }); }
        await session.validate(); await session.owner.cleanup(deadline); deadline.check();
        return { records, readerReceipt: { execution: 'new-financial-io-v1', files: pins.length, cleanupComplete: true, kernelIoCancellationConfirmed: false } };
      } catch (error) { await session.owner.cleanup(deadline, error); throw error; }
    },
    async historicalCash(profile: unknown, symbol: unknown, deadline: FinancialIoDeadline = new FinancialIoDeadline()) { const result = await fixed('historicalCash', profile, symbol, deadline); if (!('projection' in result) || !result.projection) throw new Error('financial_projection_invalid'); return { projection: result.projection, readerReceipt: result.readerReceipt }; },
    async scenarioCash(profile: unknown, symbol: unknown, deadline: FinancialIoDeadline = new FinancialIoDeadline()) { const result = await fixed('scenarioCash', profile, symbol, deadline); if (!('material' in result) || !result.material) throw new Error('financial_material_invalid'); return { material: result.material, readerReceipt: result.readerReceipt }; },
  });
}
