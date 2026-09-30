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
  assert.deepEqual(planned, [
    'migrations/20260929_candidate_dossier_outbox_v6.sql',
    'migrations/20260929_research_agent_state_v1.sql',
    'migrations/20260929_research_deep_jobs_v1.sql',
  ]);
  assert.equal(fs.existsSync(path.join(root, 'scripts/apply-research-agent-migrations.mjs')), false);
  assert.match(reviewed, /resolveReviewedRuntimeRelease/u);
  assert.match(reviewed, /research_agent_migration_prerequisite_missing/u);
  assert.match(reviewed, /record_candidate_deep_submission_v1/u);
  assert.match(reviewed, /if\(!result[.]apply\|\|!result[.]sourceCommit\|\|!result[.]attestationCommit\)throw new Error\('invalid_arguments'\)/u);
});
