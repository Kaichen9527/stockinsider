import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { assertInstalledResearchSuccessorPlan } from './migration-successor-guard.mjs';

const paths = ['migrations/20261004_research_cloud_receipts_v1.sql',
  'migrations/20261005_financial_history_admission_v1.sql'].map((relativePath) => ({ relativePath }));
const client = (state) => ({ query: async () => ({ rows: [state] }) });
test('installed successors reject base replay and omitted extensions before any mutation', async () => {
  for (const state of [{ financial_history: true, cloud_receipts: false },
    { financial_history: false, cloud_receipts: true }, { financial_history: true, cloud_receipts: true }]) {
    await assert.rejects(assertInstalledResearchSuccessorPlan(client(state), {
      researchAgentExtension: false, migrations: paths }), /installed_research_successor_requires_extension/u);
    await assert.rejects(assertInstalledResearchSuccessorPlan(client(state), {
      researchAgentExtension: true, migrations: [] }), /installed_research_successor_missing_from_plan/u);
    assert.deepEqual(await assertInstalledResearchSuccessorPlan(client(state), {
      researchAgentExtension: true, migrations: paths }), state);
  }
  const source = fs.readFileSync(new URL('./apply-reviewed-migrations.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('await assertInstalledResearchSuccessorPlan(') < source.indexOf('for(const migration of plan.migrations)'));
});
test('an unextended base remains installable but unknown detection cannot authorize replay', async () => {
  const initial = { financial_history: false, cloud_receipts: false };
  assert.deepEqual(await assertInstalledResearchSuccessorPlan(client(initial), {
    researchAgentExtension: false, migrations: [] }), initial);
  await assert.rejects(assertInstalledResearchSuccessorPlan(client(undefined), {
    researchAgentExtension: true, migrations: paths }), /migration_successor_detection_failed/u);
});
