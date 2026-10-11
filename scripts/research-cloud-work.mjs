import { readFile, open, realpath, statfs, mkdir, rmdir, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createCloudWork, validateCloudWork, createCloudResult, recomputeCloudArticle, verifyCloudResult } from '../web/src/lib/research-cloud-work.ts';
import { assessCloudCapacity } from './research-cloud-capacity.mjs';

export async function readCloudPrivateJson(filename, { openFile = open, statPath = lstat } = {}) {
  if (!path.isAbsolute(filename || '')) throw new Error('cloud_absolute_file_required');
  const handle = await openFile(filename, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 0 || info.size > 4_000_000)
      throw new Error('cloud_file_bound_invalid');
    const buffer = Buffer.alloc(info.size + 1); let offset = 0;
    while (offset < buffer.length) {
      const read = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    const currentPath = await statPath(filename);
    const unchanged = candidate => candidate.isFile() && ['size', 'dev', 'ino', 'ctimeMs', 'mtimeMs']
      .every(key => candidate[key] === info[key]);
    if (offset !== info.size || !unchanged(after) || !unchanged(currentPath))
      throw new Error('cloud_file_changed_during_read');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)));
  } finally { await handle.close(); }
}
const jsonFile = readCloudPrivateJson;
async function writeNew(filename, value) {
  if (!path.isAbsolute(filename || '')) throw new Error('cloud_absolute_file_required');
  const text = JSON.stringify(value, null, 2) + '\n';
  const handle = await open(filename, 'wx', 0o600);
  try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
}
export async function inspectCloudCapacity(root, additionalTemporaryBytes = 4_000_000_000, expectedPeakMemoryBytes = 512 * 1024 ** 2) {
  const actualRoot = await realpath(root);
  const disk = await statfs(actualRoot, { bigint: true });
  const filesystemAvailableBytes = Number(disk.bavail * disk.bsize);
  const residentText = execFileSync('du', ['-sk', actualRoot], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 });
  const residentBytes = Number(residentText.trim().split(/\s/u)[0]) * 1024;
  const meminfo = await readFile('/proc/meminfo', 'utf8');
  const available = /MemAvailable:\s+(\d+) kB/u.exec(meminfo);
  if (!available) throw new Error('cloud_meminfo_missing');
  const max = (await readFile('/sys/fs/cgroup/memory.max', 'utf8')).trim();
  const current = Number((await readFile('/sys/fs/cgroup/memory.current', 'utf8')).trim());
  if (!/^\d+$/u.test(max) || !Number.isSafeInteger(current)) throw new Error('cloud_cgroup_limit_missing');
  return { observedAt: new Date().toISOString(), residentBytes, additionalTemporaryBytes,
    filesystemAvailableBytes, projectQuotaAvailableBytes: null,
    availableMemoryBytes: Math.min(Number(available[1]) * 1024, Number(max) - current), expectedPeakMemoryBytes };
}
export async function cloudWorkCommand(args) {
  const [action, ...tail] = args;
  if (tail.length % 2) throw new Error('cloud_arguments_invalid');
  const flags = new Map();
  for (let i = 0; i < tail.length; i += 2) {
    if (!['--input', '--task', '--result', '--output', '--workspace'].includes(tail[i]) || flags.has(tail[i])) throw new Error('cloud_arguments_invalid');
    flags.set(tail[i], tail[i + 1]);
  }
  const requireFlags = (names) => {
    if (flags.size !== names.length || names.some((name) => !flags.has(name))) throw new Error('cloud_arguments_invalid');
  };
  if (action === 'prepare') {
    requireFlags(['--input', '--output']);
    const task = createCloudWork(await jsonFile(flags.get('--input')));
    const now = Date.now();
    if (Date.parse(task.issuedAt) > now || now >= Date.parse(task.deadlineAt)) throw new Error('cloud_prepare_clock_invalid');
    await writeNew(flags.get('--output'), task);
    return { workHash: task.workHash, prepared: true, reservationCreated: false };
  }
  if (action === 'verify') {
    requireFlags(['--task', '--result', '--output']);
    const handoff = verifyCloudResult(await jsonFile(flags.get('--task')), await jsonFile(flags.get('--result')), new Date().toISOString());
    await writeNew(flags.get('--output'), handoff);
    return handoff;
  }
  if (action !== 'run') throw new Error('cloud_action_invalid');
  requireFlags(['--task', '--output', '--workspace']);
  const root = await realpath(flags.get('--workspace'));
  const sourceRoot = await realpath(path.join(fileURLToPath(new URL('..', import.meta.url))));
  if (sourceRoot !== root && !sourceRoot.startsWith(`${root}${path.sep}`))
    throw new Error('cloud_workspace_source_mismatch');
  const task = validateCloudWork(await jsonFile(flags.get('--task')));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
  if (sourceCommit !== task.sourceCommit || execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: sourceRoot, encoding: 'utf8' }).trim())
    throw new Error('cloud_exact_clean_source_required');
  if (task.kind !== 'deep_article_validation') throw new Error('cloud_manual_model_adapter_not_implemented');
  const startedAt = new Date().toISOString();
  if (Date.parse(startedAt) < Date.parse(task.issuedAt) || Date.parse(startedAt) >= Date.parse(task.deadlineAt)) throw new Error('cloud_task_expired');
  const capacity = assessCloudCapacity(await inspectCloudCapacity(root));
  if (!capacity.allowed) throw new Error(`cloud_capacity_blocked:${capacity.reasons.join(',')}`);
  // Per-sandbox lock; never takes over an uncertain prior process or claims a global model lease.
  const lock = path.join(root, '.stockinsider-cloud-validation.lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    const output = recomputeCloudArticle(task, new Date().toISOString());
    const result = createCloudResult({ work: task, sourceCommit, startedAt, completedAt: new Date().toISOString(), status: 'completed', output });
    await writeNew(flags.get('--output'), result);
    return { completed: true, workHash: task.workHash, resultHash: result.resultHash, capacity,
      authoritativePublication: false, strategyApproved: false };
  } finally { await rmdir(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await cloudWorkCommand(process.argv.slice(2)))); }
  catch (error) { console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'cloud_work_failed' })); process.exitCode = 1; }
}
