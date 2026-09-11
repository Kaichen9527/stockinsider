/** Read-only deployment identity inventory. It never reads process environments,
 * container environments, database contents, TLS private keys or application files.
 */
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, statfs } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMeminfo } from './contabo-host-resource-check.mjs';

const execFile = promisify(execFileCallback);
const safeExec = async (command, args) => (await execFile(command, args,
  { encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 })).stdout;

export function extractNginxReferences(content) {
  const filesystem = [], loopback = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const fileMatch = line.match(/^(?:root|alias)\s+(\/[^;]+);$/);
    if (fileMatch && !fileMatch[1].includes('$')) filesystem.push(path.normalize(fileMatch[1]));
    const proxyMatch = line.match(/^proxy_pass\s+(https?:\/\/(?:127\.0\.0\.1|localhost):\d+(?:\/[^;]*)?);$/);
    if (proxyMatch) loopback.push(proxyMatch[1]);
  }
  return { filesystem: [...new Set(filesystem)].sort(), loopback: [...new Set(loopback)].sort() };
}

async function collectLinksAndReleases(base) {
  const links = [], releases = [], pending = [{ directory: base, depth: 0 }];
  while (pending.length) {
    const { directory, depth } = pending.pop();
    for (const name of await readdir(directory).catch(() => [])) {
      const item = path.join(directory, name);
      const metadata = await lstat(item).catch(() => null);
      if (!metadata) continue;
      if (metadata.isSymbolicLink()) {
        links.push({ path: item, target: await realpath(item).catch(() => null) });
      } else if (metadata.isDirectory() && depth < 4) {
        pending.push({ directory: item, depth: depth + 1 });
        if (path.basename(path.dirname(item)) === 'releases') {
          const raw = await safeExec('/usr/bin/du', ['-sb', item]).catch(() => '');
          const bytes = Number(raw.split(/\s+/)[0]);
          releases.push({ path: item, bytes: Number.isSafeInteger(bytes) ? bytes : null });
        }
      }
    }
  }
  return { links: links.sort((a, b) => a.path.localeCompare(b.path)),
    releases: releases.sort((a, b) => a.path.localeCompare(b.path)) };
}

async function collectServices() {
  const raw = await safeExec('/usr/bin/systemctl', ['list-units', '--type=service', '--state=running',
    '--no-legend', '--no-pager', '--plain']);
  const units = [...new Set(raw.split('\n').map(line => line.trim().split(/\s+/)[0])
    .filter(name => name?.endsWith('.service')))];
  const services = [];
  for (const unit of units) {
    const value = await safeExec('/usr/bin/systemctl', ['show', unit, '--property=Id,ActiveState,MainPID,FragmentPath,WorkingDirectory']);
    const fields = Object.fromEntries(value.trim().split('\n').map(line => {
      const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
    }));
    const pid = Number(fields.MainPID);
    services.push({ unit, activeState: fields.ActiveState, mainPid: Number.isSafeInteger(pid) ? pid : 0,
      fragmentPath: fields.FragmentPath || null, workingDirectory: fields.WorkingDirectory || null,
      processCwd: pid > 0 ? await realpath(`/proc/${pid}/cwd`).catch(() => null) : null,
      processExe: pid > 0 ? await realpath(`/proc/${pid}/exe`).catch(() => null) : null });
  }
  return services.sort((a, b) => a.unit.localeCompare(b.unit));
}

async function collectContainers() {
  const ids = (await safeExec('/usr/bin/docker', ['ps', '--no-trunc', '--format', '{{.ID}}'])).trim().split('\n').filter(Boolean);
  const containers = [];
  for (const id of ids) {
    const raw = await safeExec('/usr/bin/docker', ['inspect', '--format',
      '{{.Name}}\t{{.Image}}\t{{json .Mounts}}\t{{index .Config.Labels "com.docker.compose.project"}}\t{{index .Config.Labels "com.docker.compose.service"}}', id]);
    const [name, imageId, mountsJson, composeProject, composeService] = raw.trim().split('\t');
    const mounts = JSON.parse(mountsJson || '[]').map(item => ({ type: item.Type, name: item.Name || null,
      source: item.Source || null, destination: item.Destination || null, readOnly: item.RW === false }));
    containers.push({ id, name: name.replace(/^\//, ''), imageId, composeProject: composeProject || null,
      composeService: composeService || null, mounts });
  }
  return containers.sort((a, b) => a.name.localeCompare(b.name));
}

async function collectNginx() {
  const base = '/etc/nginx/sites-enabled', result = [];
  for (const name of await readdir(base).catch(() => [])) {
    const source = path.join(base, name), target = await realpath(source).catch(() => null);
    if (!target) continue;
    const content = await readFile(target, 'utf8').catch(() => null);
    if (content === null) continue;
    result.push({ source, target, sha256: createHash('sha256').update(content).digest('hex'),
      references: extractNginxReferences(content) });
  }
  return result.sort((a, b) => a.source.localeCompare(b.source));
}

export async function collectContaboDeploymentInventory() {
  if (process.platform !== 'linux') throw new Error('linux_host_required');
  const volume = await statfs('/', { bigint: true });
  const host = (await readFile('/etc/hostname', 'utf8')).trim();
  const machineId = (await readFile('/etc/machine-id', 'utf8')).trim();
  const { availableMemoryBytes, swapFreeBytes } = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
  const [filesystem, services, containers, nginx] = await Promise.all([
    collectLinksAndReleases('/opt'), collectServices(), collectContainers(), collectNginx(),
  ]);
  return { schema: 'stockinsider-contabo-deployment-inventory-v1', observedAt: new Date().toISOString(),
    host, machineIdSha256: createHash('sha256').update(machineId).digest('hex'),
    rootFilesystem: { totalBytes: Number(volume.blocks * volume.bsize),
      availableBytes: Number(volume.bavail * volume.bsize) },
    memory: { availableBytes: availableMemoryBytes, swapFreeBytes },
    services, containers, nginx, ...filesystem,
    destructiveActionPerformed: false, secretsInspected: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await collectContaboDeploymentInventory())); }
  catch (error) {
    console.error(JSON.stringify({ schema: 'stockinsider-contabo-deployment-inventory-v1',
      error: 'deployment_inventory_failed', reason: error.message }));
    process.exitCode = 1;
  }
}
