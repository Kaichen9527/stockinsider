import { createHash } from 'node:crypto';
import { historicalCashPins } from './research-historical-cash-pins.ts';
import { projectPinnedHistoricalCash } from './research-historical-cash-projection.ts';
import { FinancialIoDeadline, FINANCIAL_IO_LIMITS } from './research-financial-io-owner.ts';
import { acquireFinancialIo, checkFinancialIoInventory, type FinancialIoPin, type FinancialIoDependencies } from './research-financial-io-engine.ts';

/** Trusted NEW-closure composition root; no route, caller paths or live v2 change.
 * All copies/imports share the realm ownership registry at acquisition. */
export function createCandidateFinancialReaders(root: string, io?: FinancialIoDependencies) {
  return Object.freeze({
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
    async historicalCash(profile: unknown, symbol: unknown, deadline: FinancialIoDeadline = new FinancialIoDeadline()) {
      if (profile !== historicalCashPins.profile || (symbol !== '2409' && symbol !== '2383')) throw new Error('financial_profile_invalid');
      const selected = historicalCashPins.companies[symbol];
      checkFinancialIoInventory(root, selected.files, selected.files.length);
      const session = await acquireFinancialIo(root, selected.files, deadline, io);
      try {
        // Internal fixed literal encoder. No caller Map/object is normalized.
        const chunks = ['{"files":['];
        for (let i = 0; i < session.files.length; i++) {
          deadline.check(); const f = session.files[i];
          chunks.push((i ? ',' : '') + '{"path":' + JSON.stringify(f.pin.path) + ',"rawBase64":' + JSON.stringify(f.raw.subarray(0, f.pin.bytes).toString('base64')) + '}');
        }
        chunks.push('],"financialProfile":' + JSON.stringify(historicalCashPins.profile) + ',"schemaVersion":"historical-cash-private-byte-material-v1","symbol":' + JSON.stringify(symbol) + '}');
        deadline.check(); const text = chunks.join('');
        if (Buffer.byteLength(text, 'utf8') !== selected.carrier.bytes) throw new Error('financial_carrier_invalid');
        const carrier = session.owner.buffer(selected.carrier.bytes); carrier.write(text, 'utf8');
        deadline.check(); if (createHash('sha256').update(carrier).digest('hex') !== selected.carrier.sha256) throw new Error('financial_carrier_invalid');
        await session.validate(); const projection = projectPinnedHistoricalCash(profile, symbol, carrier, deadline);
        await session.validate(); await session.owner.cleanup(deadline); deadline.check();
        return { projection, readerReceipt: { execution: 'new-financial-io-v1', files: selected.files.length, rawBytes: selected.aggregateBytes,
          carrierBytes: selected.carrier.bytes, carrierSha256: selected.carrier.sha256, cleanupComplete: true, kernelIoCancellationConfirmed: false } };
      } catch (error) { await session.owner.cleanup(deadline, error); throw error; }
    },
  });
}
