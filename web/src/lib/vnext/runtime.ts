import { AsyncLocalStorage } from 'node:async_hooks';
import { vnextEnabled } from './policy.ts';
type WorkContext = { symbol: string; jobId: string; executionId: string; verify?: () => Promise<void> };
const admittedWork = new AsyncLocalStorage<Readonly<WorkContext>>();
export function rejectLegacyResearchInVnext() {
  if (vnextEnabled()) throw new Error('vnext_shared_authority_required');
}
export function requireAdmittedResearch(symbol: string) {
  if (!vnextEnabled()) return;
  const context = admittedWork.getStore();
  if (!context || context.symbol !== symbol) throw new Error('vnext_expensive_work_not_admitted');
}
export async function verifyAdmittedResearch(symbol?: string) {
  if (!vnextEnabled()) return;
  const context = admittedWork.getStore();
  if (!context) throw new Error('vnext_expensive_work_not_admitted');
  requireAdmittedResearch(symbol || context.symbol);
  if (!context.verify) throw new Error('vnext_live_authority_required');
  await context.verify();
}
export function runAdmittedResearch<T>(context: WorkContext, work: () => Promise<T>) {
  return admittedWork.run(Object.freeze(context), work);
}
export function requireCandidateCycleScope(symbols: string[] | undefined) {
  if (!vnextEnabled()) return;
  if (!symbols || symbols.length !== 1) throw new Error('vnext_explicit_admitted_scope_required');
  requireAdmittedResearch(symbols[0]);
}
