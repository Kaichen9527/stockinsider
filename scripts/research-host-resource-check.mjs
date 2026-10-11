import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectHostResources, MINIMUM_AVAILABLE_MEMORY_BYTES } from './contabo-host-resource-check.mjs';
import { assessResearchCapacity } from './research-capacity-admission.mjs';

const execute = promisify(execFile);
// Count the shared PostgreSQL tree conservatively. Other apps' data is never
// reclaimed by this observer. Only the optional log root may be absent; missing data roots and read errors fail.
export const APP_STORAGE_ROOTS = Object.freeze([
  '/opt/stockinsider', '/opt/stockinsider-standalone', '/opt/stockinsider-previews',
  '/var/lib/stockinsider', '/var/lib/postgresql', '/var/log/stockinsider',
]);
export async function inspectResearchStorage({ resolvePath = realpath, measure = execute, clock = () => new Date() } = {}) {
  const roots = [];
  for (const directory of APP_STORAGE_ROOTS) {
    let resolved;
    try { resolved = await resolvePath(directory); }
    catch (error) {
      if (error.code !== 'ENOENT' || directory !== '/var/log/stockinsider') throw error;
      roots.push({ realPath: directory, usedBytes: 0 });
      continue;
    }
    const { stdout } = await measure('/usr/bin/du', ['-sx', '-B1', '--', resolved],
      { timeout: 120_000, maxBuffer: 16_384 });
    const usedBytes = Number(stdout.trim().split(/\s+/u)[0]);
    if (!Number.isSafeInteger(usedBytes) || usedBytes < 0) throw new Error('research_storage_measurement_invalid');
    roots.push({ realPath: resolved, usedBytes });
  }
  return { roots, observedAt: clock().toISOString() };
}

if (process.argv[1] && await realpath(path.resolve(process.argv[1])).catch(() => null)
  === await realpath(fileURLToPath(import.meta.url))) {
  try {
    const [budgetPath, ...extra] = process.argv.slice(2);
    if (extra.length || !path.isAbsolute(budgetPath || '')) throw new Error('absolute_budget_path_required');
    const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
    const appObservation = await inspectResearchStorage();
    const observed = await inspectHostResources('/');
    const capacity = { ...budget, availableBytes: observed.availableBytes, observedAt: observed.observedAt };
    const result = assessResearchCapacity({ appObservation, host: { capacity,
      availableMemoryBytes: observed.availableMemoryBytes, peakMemoryBytes: budget.peakMemoryBytes,
      minimumAvailableMemoryBytes: Math.max(MINIMUM_AVAILABLE_MEMORY_BYTES,
        budget.minimumAvailableMemoryBytes ?? MINIMUM_AVAILABLE_MEMORY_BYTES) } });
    console.log(JSON.stringify({ ...result, appObservation, observed }));
    process.exitCode = result.allowed ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ allowed: false, reason: error.message }));
    process.exitCode = 1;
  }
}
