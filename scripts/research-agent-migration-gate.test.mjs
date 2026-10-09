import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plan = fs.readFileSync(path.join(root, 'scripts/opportunity-v3/migration-plan.mjs'), 'utf8');
const reviewed = fs.readFileSync(path.join(root, 'scripts/opportunity-v3/apply-reviewed-migrations.mjs'), 'utf8');
function extension(source, name) {
  const body = source.match(new RegExp(`const ${name} = (?:Object[.]freeze[(])?\\[([\\s\\S]*?)\\][);]`, 'u'))?.[1];
  assert.ok(body, `${name} must be declared explicitly`);
  return [...body.matchAll(/['"](migrations\/[^'"]+[.]sql)['"]/gu)].map((match) => match[1]);
}

test('research schema extends the same attested operator plan and cannot use a separate raw runner', () => {
  const planned = extension(plan, 'researchAgentMigrationPaths');
  const applied = extension(reviewed, 'RESEARCH_AGENT_MIGRATIONS');
  assert.deepEqual(planned, applied);
  assert.deepEqual(extension(plan,'researchAgentPreludePaths'),extension(reviewed,'RESEARCH_AGENT_PRELUDE_MIGRATIONS'));
  assert.deepEqual(planned, [
    'migrations/20260929_candidate_dossier_outbox_v6.sql',
    'migrations/20260929_research_agent_state_v1.sql',
    'migrations/20260929_research_deep_jobs_v1.sql',
    'migrations/20261004_research_technical_identity_v2.sql',
    'migrations/20261004_research_cloud_receipts_v1.sql',
    'migrations/20261005_financial_history_admission_v1.sql',
  ]);
  assert.equal(fs.existsSync(path.join(root, 'scripts/apply-research-agent-migrations.mjs')), false);
  assert.match(reviewed, /resolveReviewedRuntimeRelease/u);
  assert.match(reviewed, /research_agent_migration_prerequisite_missing/u);
  assert.match(reviewed, /record_candidate_deep_submission_v1/u);
  assert.match(reviewed, /if\(!result[.]apply\|\|!result[.]sourceCommit\|\|!result[.]attestationCommit\)throw new Error\('invalid_arguments'\)/u);
  assert.match(reviewed, /research_agent_production_migration_authority_missing/u);
  assert.match(reviewed, /--research-agent-extension/u);
  assert.match(reviewed, /options[.]researchAgentExtension\s*\?/u);
  assert.match(reviewed, /accept_research_cloud_result_v1\(uuid,text,text,text,text,text,text\)/u);
  assert.match(reviewed, /cloud_no_direct_write/u);
  assert.match(reviewed, /cloud_immutable/u);
});

test('base chain stays fixed and explicit extension authority never replaces reviewed apply', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const result = JSON.parse(execFileSync(process.execPath,
    [path.join(root, 'scripts/opportunity-v3/migration-plan.mjs')], { cwd: root, encoding: 'utf8' }));
  assert.equal(result.migrations.at(-1).migration,
    'migrations/20260924_entry_plan_official_action_symbols.sql');
  assert.deepEqual(result.researchAgentExtension.migrations.map((row) => row.migration),
    extension(plan, 'researchAgentMigrationPaths'));
  assert.equal(result.researchAgentExtension.applyAuthorized, true);
  assert.equal(result.researchAgentExtension.preludeMigrations[0].migration,
    'migrations/20261005_release_function_ownership_bridge_v1.sql');
  assert.match(result.researchAgentExtension.dedicatedApplyCommand, /--source-commit <reviewed-commit> --attestation-commit <attestation-commit>/u);
  // Exercise the actual planner without authority in an isolated repository.
  const { tmpdir } = await import('node:os');
  const isolated = fs.mkdtempSync(path.join(tmpdir(), 'research-migration-plan-'));
  t.after(() => fs.rmSync(isolated, { recursive: true, force: true }));
  const state = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
  fs.mkdirSync(path.join(isolated, state), { recursive: true });
  fs.mkdirSync(path.join(isolated, 'scripts/opportunity-v3'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/opportunity-v3/migration-plan.mjs'),
    path.join(isolated, 'scripts/opportunity-v3/migration-plan.mjs'));
  fs.cpSync(path.join(root, 'migrations'), path.join(isolated, 'migrations'), { recursive: true });
  for (const authority of [{ v314: { productionDatabaseMigrationAuthorized: true } },
    { v314: { productionDatabaseMigrationAuthorized: true }, researchAgent: { productionDatabaseMigrationAuthorized: false } }]) {
    fs.writeFileSync(path.join(isolated, state, 'status.json'), JSON.stringify({ authority }));
    const denied = JSON.parse(execFileSync(process.execPath,
      [path.join(isolated, 'scripts/opportunity-v3/migration-plan.mjs')], { encoding: 'utf8' }));
    assert.equal(denied.researchAgentExtension.applyAuthorized, false);
    assert.equal(denied.researchAgentExtension.dedicatedApplyCommand, null);
  }
});
