#!/usr/bin/env node
/** Default dry run. Read-only SSH preflight requires existing agent and trusted
 * host key. It never provisions, deploys, starts units or queries a production DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const defaultPlan = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plan.json');
export function validatePlan(plan) {
  const errors = [];
  if (plan.schemaVersion !== 'stockinsider-vnext-isolated-staging-v1') errors.push('schema_version');
  if (!/^stockinsider-vnext-[a-z0-9-]+-staging$/u.test(plan.namespace || '')) errors.push('unique_staging_namespace');
  if (plan.service !== plan.namespace + '.service' || plan.queueNamespace !== plan.namespace || plan.storage !== '/srv/' + plan.namespace || plan.runtimeIdentity !== plan.namespace) errors.push('isolation_names');
  if (plan.database !== plan.namespace.replaceAll('-', '_') || plan.schema !== 'public') errors.push('independent_database_required');
  if (plan.listenAddress !== '127.0.0.1' || !plan.fixtureOnly || plan.scheduledJobsEnabled !== false) errors.push('fixture_loopback_no_schedules');
  const ports = Object.values(plan.ports || {});
  if (ports.length !== 3 || new Set(ports).size !== 3 || ports.some(p => !Number.isInteger(p) || p < 34000 || p > 34999)) errors.push('isolated_ports');
  const minimum = { diskFloor: 16106127360, diskWarning: 21474836480, memoryReserve: 1610612736, memoryPeak: 1073741824, wal: 1073741824, temporary: 536870912, deployment: 134217728, growth: 2147483648 };
  for (const [key, value] of Object.entries(minimum)) if (plan.resourceBudgetBytes?.[key] !== value) errors.push('resource_budget:' + key);
  if (plan.identityMode !== 'ssh-agent') errors.push('ssh_agent_identity_mode_required');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/u.test(plan.sshAlias || '')) errors.push('account_owner_ssh_alias_required');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/u.test(plan.expectedHostName || '')) errors.push('account_owner_host_name_required');
  if (!/^SHA256:[A-Za-z0-9+/]{43}=?$/u.test(plan.expectedHostKeySha256 || '')) errors.push('trusted_host_key_fingerprint_required');
  if (!/^[a-f0-9]{40}$/u.test(plan.writerRelease || '')) errors.push('isolated_candidate_writer_identity_required');
  return errors;
}
export function capacity(plan, observation) {
  const b = plan.resourceBudgetBytes;
  const projectedDisk = observation.diskAvailable - b.wal - b.temporary - b.deployment - b.growth;
  const projectedMemory = observation.memoryAvailable - b.memoryPeak;
  return { projectedDisk, projectedMemory, ready: projectedDisk >= b.diskFloor && projectedMemory >= b.memoryReserve, warning: observation.diskAvailable < b.diskWarning };
}
function checked(binary, args, input) {
  const p = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 256 * 1024 });
  if (p.status !== 0) throw new Error('staging_preflight_command_failed:' + binary + ':' + (p.status ?? 'not_settled'));
  return p.stdout;
}
function main() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--plan' && args[i + 1] && !args[i + 1].startsWith('--')) i++;
    else if (args[i] !== '--verify-read-only') throw Error('unsupported_argument');
  }
  const planPath = args.includes('--plan') ? args[args.indexOf('--plan') + 1] : defaultPlan;
  const raw = fs.readFileSync(planPath); const plan = JSON.parse(raw); const errors = validatePlan(plan);
  const report = { scope: 'Contabo staging preflight, no production operations', mode: 'DRY_RUN', planSha256: createHash('sha256').update(raw).digest('hex'), errors,
    identity: { agentSocketPresent: Boolean(process.env.SSH_AUTH_SOCK), networkSecretIsNotSSHIdentity: true }, provisioned: false, stagingAcceptance: 'NOT_RUN' };
  if (!args.includes('--verify-read-only')) { console.log(JSON.stringify(report, null, 2)); return errors.length ? 2 : 0; }
  if (errors.length || !process.env.SSH_AUTH_SOCK) { console.log(JSON.stringify({ ...report, mode: 'NOT_READY' }, null, 2)); return 2; }
  const fingerprints = checked('ssh-add', ['-l']).split('\n').filter(Boolean).map(line => line.split(/\s+/u)[1]);
  if (!fingerprints.length) throw Error('ssh_agent_has_no_identity');
  const config = checked('ssh', ['-G', plan.sshAlias]);
  const host = config.split('\n').find(x => x.startsWith('hostname '))?.slice(9);
  if (host !== plan.expectedHostName) throw Error('ssh_alias_host_mismatch');
  // Fingerprint must already be trusted locally; never ssh-keyscan/accept-new.
  const known = checked('ssh-keygen', ['-F', plan.expectedHostName]);
  const actualHostKeys = checked('ssh-keygen', ['-lf', '-'], known).split('\n').filter(Boolean).map(line => line.split(/\s+/u)[1]);
  if (!actualHostKeys.includes(plan.expectedHostKeySha256)) throw Error('trusted_host_key_mismatch');
  const observation = JSON.parse(checked('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', plan.sshAlias, 'vnext-preflight-v1']));
  if (observation.namespace !== plan.namespace || !Number.isInteger(observation.uid) || observation.uid === 0) throw Error('staging_gateway_identity_mismatch');
  const projected = capacity(plan, observation);
  console.log(JSON.stringify({ ...report, mode: 'READ_ONLY', fingerprints, observation, projected, isolationProof: 'PENDING independent service/database/queue/storage/role runtime checks' }, null, 2));
  // Host capacity never authorizes or proves isolation by itself.
  return 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
