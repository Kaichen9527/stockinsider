import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-external-gate.yml'), 'utf8');
const action = readFileSync(path.join(root, '.github/actions/prepare-source-led-external-subject/action.yml'), 'utf8');
const worker = readFileSync(path.join(root, 'scripts/opportunity-v3/protected-external-gate-worker.mjs'), 'utf8');

function jobBlock(jobId, nextJobId = null) {
  const start = workflow.indexOf(`\n  ${jobId}:\n`);
  assert.notEqual(start, -1, `${jobId} job exists`);
  const end = nextJobId === null ? workflow.length : workflow.indexOf(`\n  ${nextJobId}:\n`, start + 1);
  assert.notEqual(end, -1, `${nextJobId} follows ${jobId}`);
  return workflow.slice(start, end);
}

test('the configured protected check includes the independent model-runner envelope aggregate', () => {
  assert.equal((workflow.match(/^    name: stockinsider-v3-gate-root$/gmu) ?? []).length, 1);
  const bootstrap = jobBlock('stockinsider-v3-gate-bootstrap', 'requirements');
  assert.match(bootstrap, /^    name: stockinsider-v3-gate-bootstrap$/mu);
  assert.doesNotMatch(bootstrap, /^    name: stockinsider-v3-gate-root$/mu);
  const aggregate = jobBlock('stockinsider-v3-gate-root');
  assert.match(aggregate, /^    name: stockinsider-v3-gate-root$/mu);
  assert.match(
    aggregate,
    /^    needs: \[requirements, architecture, product-runtime-code-gate, model-runner-code-gate, exact-review\]$/mu,
  );
  assert.match(aggregate, /^    if: \$\{\{ always\(\) \}\}$/mu);
  for (const prerequisite of [
    'REQUIREMENTS_RESULT', 'ARCHITECTURE_RESULT', 'PRODUCT_RUNTIME_RESULT',
    'EXACT_REVIEW_RESULT', 'MODEL_RUNNER_RESULT',
  ]) {
    assert.match(aggregate, new RegExp(`test "\\$${prerequisite}" = success`, 'u'));
  }
  assert.match(aggregate, /protected-external-gate-worker\.mjs aggregate/u);
});

test('candidate execution waits for exact review and model-runner failure cannot be bypassed', () => {
  const product = jobBlock('product-runtime-code-gate', 'model-runner-code-gate');
  const model = jobBlock('model-runner-code-gate', 'exact-review');
  for (const block of [product, model]) {
    assert.match(block, /^    needs: \[stockinsider-v3-gate-bootstrap, exact-review\]$/mu);
  }
  assert.doesNotMatch(model, /continue-on-error:\s*true/u);
  assert.doesNotMatch(model, /^    if:/mu);
  assert.match(model, /^    runs-on: \[self-hosted, macOS, ARM64\]$/mu);
  for (const token of [
    'sudo apt-get install --yes postgresql',
    'postgres_bin="$(pg_config --bindir)"',
    'test -x "$postgres_bin/initdb"',
    'test -x "$postgres_bin/pg_ctl"',
    'echo "OPPORTUNITY_V3_POSTGRES_BIN=$postgres_bin" >> "$GITHUB_ENV"',
  ]) assert.ok(product.includes(token), `product prerequisite: ${token}`);
  assert.doesNotMatch(model, /(?:apt-get|postgres_bin|OPPORTUNITY_V3_POSTGRES_BIN|playwright install)/u);
  assert.match(worker, /function trustedPostgresBin\(\)/u);
  assert.ok(
    worker.includes('/^\\/usr\\/lib\\/postgresql\\/[0-9]+\\/bin$/u'),
    'worker pins a closed PostgreSQL package bin path',
  );
  assert.match(worker, /protected PostgreSQL bin is non-world-writable/u);
  assert.match(worker, /for \(const name of \['initdb', 'pg_ctl', 'psql'\]\)/u);
  assert.match(worker, /OPPORTUNITY_V3_POSTGRES_BIN: postgresBin/u);
  assert.match(worker, /PATH: `\$\{postgresBin\}\$\{path[.]delimiter\}/u);
});

test('every third-party action is pinned to an immutable commit', () => {
  const combined = `${workflow}\n${action}`;
  const uses = [...combined.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/gu)];
  assert.ok(uses.length >= 16, 'all expected action invocations discovered');
  for (const [, name, reference] of uses) {
    assert.match(reference, /^[0-9a-f]{40}$/u, `${name} immutable pin`);
  }
});

test('subject preparation pins Node from the protected base', () => {
  assert.match(action, /node-version: '22\.14\.0'/u);
  assert.doesNotMatch(action, /node-version-file:/u);
  assert.match(worker, /\['init', target\]/u);
  assert.match(worker, /\['fetch', '--no-tags', baseRoot, [.]\.\.localTargets\]/u);
  assert.match(worker, /attestation[.]baseCommitSha,/u);
  assert.match(worker, /attestation[.]registryCommitSha,/u);
  assert.match(worker, /subject checkout has no configured remote/u);
  assert.match(worker, /subject checkout has no credential-bearing Git config/u);
  assert.doesNotMatch(worker, /\['worktree', 'add'/u);
  assert.doesNotMatch(worker, /\['remote', 'remove', 'origin'\]/u);
});

test('the base worker owns validation and performs the final exclusive envelope write', () => {
  assert.doesNotMatch(worker, /candidateCompatibility/u);
  const validation = worker.lastIndexOf('validateEnvelope(produced, identity, attestation, result.check);');
  const write = worker.lastIndexOf('writeCanonical(output, produced);');
  const completion = worker.lastIndexOf('process.stdout.write(');
  assert.ok(validation >= 0 && validation < write && write < completion, 'validate, exclusively write, then report');
  assert.doesNotMatch(worker.slice(write, completion), /(?:spawnSync|execFileSync|run\()/u);
});

test('review envelopes require reviewed-parent evidence with an exact closed diff and bound attestation', () => {
  assert.match(worker, /evidence must be its reviewed commit's unique direct child/u);
  assert.match(worker, /evidence-only diff must exactly match its closed path set/u);
  assert.match(worker, /exact-review attestation canonical/u);
  assert.match(worker, /exact-review attestation evidence binding/u);
  assert.doesNotMatch(worker, /evidenceOnlyPaths\.includes\(source\.path\)/u);
});

test('the protected root selects closed graph-bound Requirements/Architecture evidence and subject-addressed exact review evidence', () => {
  for (const reference of [
    'codex/source-led-opportunity-engine-v3-v319-requirements-evidence',
    'codex/source-led-opportunity-engine-v3-v319-architecture-evidence',
    'codex/source-led-opportunity-engine-v3-v320-requirements-evidence',
    'codex/source-led-opportunity-engine-v3-v320-architecture-evidence',
    'codex/source-led-opportunity-engine-v3-v320-exact-review-evidence',
    'requirements-review-v3.19.md',
    'architecture-review-v3.19.md',
    'requirements-review-v3.20.md',
    'architecture-review-v3.20.md',
    'requirements-review-v3.21.md',
    'architecture-review-v3.21.md',
    'evidence/source-led-opportunity-v3-requirements-4b1e75f5',
    'evidence/source-led-opportunity-v3-architecture-4b1e75f5',
    'evidence/source-led-opportunity-v3-requirements-gate-bootstrap-20260906',
    'evidence/source-led-opportunity-v3-architecture-gate-bootstrap-20260906',
  ]) assert.match(worker, new RegExp(reference.replace(/[.]/gu, '\\.'), 'u'));
  assert.match(worker, /13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587/u);
  assert.match(worker, /4f08c1a3a126236039247c5d8542ddf7dbdab0d2384c6e953fe22bcc151808ab/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-exact-review-\$\{attestation[.]subjectCommitSha\}/u);
  assert.match(worker, /function reviewSource\(check, attestation = null, identity = null\)/u);
  assert.match(worker, /function reviewSourceValues\(attestation, identity\)/u);
  assert.match(worker, /Unrelated future graph refs are deliberately not fetched/u);
  assert.doesNotMatch(worker, /Object[.]values\(graphBoundReviewSources\)/u);
  assert.match(worker, /active graph evidence source/u);
});

test('each candidate command is isolated in a process group that is cleared on return', () => {
  assert.match(worker, /const detached = process\.platform !== 'win32';/u);
  assert.match(worker, /process\.kill\(-result\.pid, 'SIGKILL'\);/u);
  assert.match(worker, /error\?\.code, 'ESRCH'/u);
});

test('candidate model code receives no credential and is enclosed by a base-owned filesystem/network sandbox', () => {
  assert.match(worker, /non-credential-placeholder/u);
  assert.match(worker, /OPPORTUNITY_V3_PROTECTED_NO_LIVE_AUTH/u);
  assert.match(worker, /external-gate-candidate/u);
  assert.match(worker, /":root" = "deny"/u);
  assert.match(worker, /function trustedNodeToolchainRoot\(\)/u);
  assert.match(worker, /function trustedPinnedNodeExecutable\(\)/u);
  assert.match(worker, /protected pinned Node realpath/u);
  assert.match(worker, /`"\$\{escaped\(pinnedNodeExecutable\)\}" = "read"`/u);
  assert.match(worker, /protected npm resolves inside the setup-node toolchain root/u);
  assert.match(worker, /`"\$\{escaped\(nodeToolchainRoot\)\}" = "read"`/u);
  assert.match(worker, /function trustedAppleDeveloperToolchainRoot\(\)/u);
  assert.match(worker, /protected git resolves inside the selected Apple developer root/u);
  assert.match(worker, /`"\$\{escaped\(appleDeveloperToolchain[.]root\)\}" = "read"`/u);
  assert.match(worker, /PATH: `\$\{appleDeveloperToolchain[.]gitBin\}\$\{path[.]delimiter\}\$\{environment[.]PATH\}`/u);
  assert.match(worker, /'"\/System\/Library\/OpenSSL" = "read"'/u);
  assert.match(worker, /trustedHostModelOracle/u);
  assert.match(worker, /OPPORTUNITY_V3_PROTECTED_HOST_PREFLIGHT_SCRATCH/u);
  assert.match(worker, /content_addressed_reuse/u);
  assert.match(worker, /byte-identical model-runner inputs/u);
  assert.match(worker, /model oracle artifact digest from GitHub/u);
  assert.match(worker, /model oracle trusted runner labels/u);
  assert.match(worker, /model oracle root conclusion/u);
  assert.match(worker, /OPPORTUNITY_V3_PROTECTED_LIVE_ONLY: '1'/u);
  assert.match(worker, /modelOracleSuccessorApprovals/u);
  assert.match(worker, /model-runner-host-pin-amendment-v3[.]15/u);
  assert.match(worker, /model oracle successor requires protected-base approval/u);
  assert.match(worker, /model oracle successor listing must match the one reviewed digest/u);
  assert.match(worker, /const oracleRoot = authority === 'protected_base' \? baseRoot : subjectRoot/u);
  const webDependencies = worker.indexOf("executeCandidate('npm', ['--prefix', 'web', 'ci'");
  const browserBoundary = worker.indexOf("if (track === 'product_runtime') {", webDependencies);
  const browserInstall = worker.indexOf("executeCandidate(path.join(subjectRoot, 'web/node_modules/.bin/playwright')", browserBoundary);
  assert.ok(webDependencies >= 0 && webDependencies < browserBoundary && browserBoundary < browserInstall,
    'both tracks install Web dependencies before the product-only browser boundary');
  assert.doesNotMatch(worker, /PCR-024 is an explicit acceptance-owner probe in both partitions/u);
  assert.match(worker, /measuredResult/u);
  assert.match(worker, /measured \$\{track\} execution must close the registered partition/u);
  assert.match(worker, /passed: totals[.]passed/u);
  assert.doesNotMatch(worker, /writeFileSync\(path\.join\(codexDirectory, 'auth\.json'\), bytes/u);
  assert.match(worker, /rmSync\(scratch, \{ force: true, recursive: true \}\)/u);
});
