import { readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessContaboCapacity, GIB } from './contabo-capacity-guard.mjs';

export const MINIMUM_AVAILABLE_MEMORY_BYTES = 1536 * 1024 ** 2;

export function parseMeminfo(value) {
  const fields = new Map();
  for (const line of value.split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
    if (match) fields.set(match[1], Number(match[2]) * 1024);
  }
  const availableMemoryBytes = fields.get('MemAvailable');
  const swapFreeBytes = fields.get('SwapFree');
  if (![availableMemoryBytes, swapFreeBytes].every(Number.isSafeInteger)) throw new Error('meminfo_invalid');
  return { availableMemoryBytes, swapFreeBytes };
}

export function assessHostResources({ capacity, availableMemoryBytes, peakMemoryBytes,
  minimumAvailableMemoryBytes = MINIMUM_AVAILABLE_MEMORY_BYTES }, now = Date.now()) {
  const disk = assessContaboCapacity(capacity, now);
  for (const [key, value] of Object.entries({ availableMemoryBytes, peakMemoryBytes,
    minimumAvailableMemoryBytes })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      return { allowed: false, disposition: 'blocked', reasons: [`memory_budget_missing_or_invalid:${key}`], disk };
    }
  }
  const projectedAvailableMemoryBytes = availableMemoryBytes - peakMemoryBytes;
  const memoryAllowed = projectedAvailableMemoryBytes >= minimumAvailableMemoryBytes;
  const reasons = [...disk.reasons, ...(memoryAllowed ? [] : ['memory_below_required_reserve'])];
  return { allowed: disk.allowed && memoryAllowed,
    disposition: !disk.allowed || !memoryAllowed ? 'blocked' : disk.disposition,
    reasons, disk, availableMemoryBytes, peakMemoryBytes, projectedAvailableMemoryBytes,
    minimumAvailableMemoryBytes };
}

export async function inspectHostResources(root = '/') {
  const volume = await statfs(root, { bigint: true });
  const available = volume.bavail * volume.bsize;
  if (available > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('filesystem_capacity_overflow');
  return { availableBytes: Number(available), ...parseMeminfo(await readFile('/proc/meminfo', 'utf8')),
    observedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [budgetPath, ...extra] = process.argv.slice(2);
    if (extra.length || !path.isAbsolute(budgetPath || '')) throw new Error('absolute_budget_path_required');
    const budget = JSON.parse(await readFile(budgetPath, 'utf8'));
    const observed = await inspectHostResources('/');
    const capacity = { observedAt: observed.observedAt, availableBytes: observed.availableBytes };
    for (const key of ['databaseRestoreBytes', 'documentBytes', 'peakWalBytes', 'peakTemporaryBytes',
      'deploymentBytes', 'localBackupStagingBytes']) capacity[key] = budget[key];
    const result = assessHostResources({ capacity, availableMemoryBytes: observed.availableMemoryBytes,
      peakMemoryBytes: budget.peakMemoryBytes,
      minimumAvailableMemoryBytes: budget.minimumAvailableMemoryBytes ?? MINIMUM_AVAILABLE_MEMORY_BYTES });
    console.log(JSON.stringify({ schema: 'stockinsider-host-resource-check-v1', ...observed,
      swapFreeBytes: observed.swapFreeBytes, ...result }));
    process.exitCode = result.allowed ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ schema: 'stockinsider-host-resource-check-v1', allowed: false,
      reason: error.message, minimumReserveBytes: 15 * GIB }));
    process.exitCode = 1;
  }
}
