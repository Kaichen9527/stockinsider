import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePlan, capacity } from '../deployment/staging/vnext/verify.mjs';
const incomplete = JSON.parse(fs.readFileSync(new URL('../deployment/staging/vnext/plan.json', import.meta.url)));
const complete = { ...incomplete, sshAlias: 'authorized-stage', expectedHostName: 'stage.example.invalid', expectedHostKeySha256: 'SHA256:' + 'a'.repeat(43), writerRelease: 'b'.repeat(40) };
test('missing agent/host selectors are explicit gaps, HTTPS secrets are not SSH', () => {
  assert.ok(validatePlan(incomplete).includes('account_owner_ssh_alias_required')); assert.deepEqual(validatePlan(complete), []);
});
test('staging cannot reuse formal names, public ports, schedules or lower resource guards', () => {
  for (const patch of [{ storage: '/opt/stockinsider' }, { service: 'stockinsider-web-standalone.service' }, { database: 'postgres' }, { scheduledJobsEnabled: true }, { listenAddress: '0.0.0.0' }, { ports: { web: 80, rest: 3301, database: 5432 } }, { resourceBudgetBytes: { ...complete.resourceBudgetBytes, diskFloor: 1 } }]) assert.ok(validatePlan({ ...complete, ...patch }).length);
});
test('capacity deducts the full workload, preserves15GiB disk and1.5GiB memory', () => {
  assert.equal(capacity(complete, { diskAvailable: 20 * 1073741824, memoryAvailable: 3 * 1073741824 }).ready, true);
  assert.equal(capacity(complete, { diskAvailable: 16 * 1073741824, memoryAvailable: 3 * 1073741824 }).ready, false);
  assert.equal(capacity(complete, { diskAvailable: 25 * 1073741824, memoryAvailable: 2 * 1073741824 }).ready, false);
});
