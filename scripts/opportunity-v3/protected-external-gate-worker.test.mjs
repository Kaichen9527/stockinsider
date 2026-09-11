import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { treeIdentity } from './protected-external-gate-worker.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-external-gate.yml'), 'utf8');
const diagnosticWorkflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-v3.yml'), 'utf8');
const action = readFileSync(path.join(root, '.github/actions/prepare-source-led-external-subject/action.yml'), 'utf8');
const worker = readFileSync(path.join(root, 'scripts/opportunity-v3/protected-external-gate-worker.mjs'), 'utf8');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function git(cwd, args) {
  return execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim();
}

function writeFixture(repository, schema) {
  const change = path.join(repository, '.loop-engineering/state/changes/source-led-opportunity-engine-v3');
  mkdirSync(change, { recursive: true });
  const catalog = schema === 'opportunity-active-artifact-catalog-v2'
    ? {
      activeFiles: ['active.md'],
      historicalAuditFiles: ['audit/historical.md'],
      incorporatedFiles: ['openspec/incorporated.md'],
      schema,
    }
    : { activeFiles: ['active.md'], schema };
  writeFileSync(path.join(change, 'active-artifact-catalog-v3.json'), `${JSON.stringify(catalog)}\n`);
  writeFileSync(path.join(change, 'acceptance-tests.json'), '{"scriptValueRowsSha256":"fixture","version":"fixture"}\n');
  writeFileSync(path.join(change, 'active.md'), 'active\n');
  if (schema === 'opportunity-active-artifact-catalog-v2') {
    mkdirSync(path.join(repository, 'openspec'), { recursive: true });
    mkdirSync(path.join(repository, 'audit'), { recursive: true });
    writeFileSync(path.join(repository, 'openspec/incorporated.md'), 'incorporated\n');
    writeFileSync(path.join(repository, 'audit/historical.md'), 'historical\n');
  }
  git(repository, ['add', '.']);
  git(repository, ['-c', 'user.name=StockInsider Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']);
  return { catalog, tree: git(repository, ['rev-parse', 'HEAD^{tree}']) };
}

function expectedFixtureGraph(repository, tree, catalog) {
  const change = '.loop-engineering/state/changes/source-led-opportunity-engine-v3';
  const blob = (repositoryPath) => execFileSync('/usr/bin/git', ['cat-file', 'blob', `${tree}:${repositoryPath}`], { cwd: repository });
  const row = (repositoryPath, identityPath = repositoryPath) => {
    const bytes = blob(repositoryPath);
    return [identityPath, git(repository, ['rev-parse', `${tree}:${repositoryPath}`]), bytes.length, sha256(bytes)];
  };
  const catalogBytes = blob(`${change}/active-artifact-catalog-v3.json`);
  const activeRows = catalog.activeFiles.map((file) => row(`${change}/${file}`, file));
  const graphPreimage = catalog.schema === 'opportunity-active-artifact-catalog-v1'
    ? ['opportunity-active-graph-v1', sha256(catalogBytes), activeRows]
    : [
      'opportunity-active-graph-v2',
      sha256(catalogBytes),
      activeRows,
      catalog.incorporatedFiles.map((file) => row(file)),
      catalog.historicalAuditFiles.map((file) => row(file)),
    ];
  return sha256(canonicalJson(graphPreimage));
}

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
  assert.match(model, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u);
  assert.match(model, /github\.event\.pull_request\.user\.login == github\.repository_owner/u);
  assert.match(model, /github\.actor == github\.repository_owner/u);
  assert.match(model, /github\.triggering_actor == github\.repository_owner/u);
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
  assert.match(worker, /'test:candidate-shadow-performance:runtime'/u);
  assert.match(worker, /'test:candidate-shadow-performance:contracts'/u);
  assert.match(worker, /failed: result[.]failed \+ row[.]failed/u);
  assert.match(worker, /skipped: result[.]skipped \+ row[.]skipped/u);
  assert.match(worker, /todo: result[.]todo \+ row[.]todo/u);
  assert.match(worker, /candidate financial parser dependency preparation/u);
  assert.match(worker, /3793b8b7228a8b08e273b1deb0977d681c7f4fdc8e3cb4d38a101b7c36579640/u);
  assert.doesNotMatch(worker, /'--requirement', path[.]join\(subjectRoot/u);
  assert.match(worker, /STOCKINSIDER_DOCUMENT_PARSER_PYTHON/u);
  assert.match(worker, /STOCKINSIDER_DOCUMENT_PARSER_SCRIPT/u);
  assert.match(worker, /Playwright output must contain a recognized final result/u);
  assert.match(worker, /playwrightSkipped/u);
  assert.match(worker, /modelOracleHostPinByListingSha256/u);
  assert.match(worker, /bcae305c4d7a757510eb99c2c0aeb92679a9e772aecb7270360d747144fa6eed: 'model-runner-host-pins-v3\.14'/u);
  assert.match(worker, /cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5: 'model-runner-host-pins-v3\.15'/u);
  assert.match(worker, /'46d5d7507a871942932561870b665cccabb91d28e706272710c341f5f84f0598': 'model-runner-host-pins-v3\.16'/u);
  assert.match(worker, /model runner host pin requires an exact protected listing/u);
});

test('public candidate detail changes trigger the protected product workflow', () => {
  for (const pathFilter of [
    "'web/src/app/api/stocks/**'",
    "'web/src/app/stock/**'",
    "'web/src/app/sources/**'",
    "'web/src/app/page.tsx'",
  ]) assert.match(diagnosticWorkflow, new RegExp(pathFilter.replaceAll('*', '[*]'), 'u'));
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
    'evidence/source-led-opportunity-v3-requirements-6ed9d39a',
    'evidence/source-led-opportunity-v3-architecture-6ed9d39a',
    'requirements-review-v3.23.md',
    'architecture-review-v3.23.md',
  ]) assert.match(worker, new RegExp(reference.replace(/[.]/gu, '\\.'), 'u'));
  for (const graph of [
    '1c32b707a2e3d36e0ca01b4e78b9c20fa5bcef5eb34dce486063d9f694a2c9fc',
    '8c4d36c50c2e4d2437429a4bf2dbc3911cfe69a59f9ae6a231dd7105a69b1c2c',
    '81dceab0d17b6c0f0c104ee3376f6d1dc5065a283040a4c1ee0ac40f574580d4',
    '4baf35c1a17cc7c7cd451e71b29e34e9b83c90ee03ca18822fcf4f7f47b19a7b',
    '13081345293dcb3306c68420270ca82ea090fa18a0ecb878ccd8da08d63e0587',
    '329de76e514164f7ebd1905708491aa15e80c9ce34eb0fb7be3eb03786cdcf64',
    '4f08c1a3a126236039247c5d8542ddf7dbdab0d2384c6e953fe22bcc151808ab',
    'c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352',
    '5f985e391799fd8332df16c2151f75cc95dfb643a087912d92df2845a435016e',
    'a4cf40d99dbfe7d23e0bdd39130f73cf6943a5535394d8313f2055de9a7d3058',
  ]) assert.match(worker, new RegExp(graph, 'u'), `${graph} graph mapping retained`);
  assert.match(worker, /evidence\/source-led-opportunity-v3-exact-review-\$\{attestation[.]subjectCommitSha\}/u);
  assert.match(worker, /function reviewSource\(check, attestation = null, identity = null\)/u);
  assert.match(worker, /function reviewSourceValues\(attestation, identity\)/u);
  assert.match(worker, /Unrelated future graph refs are deliberately not fetched/u);
  assert.doesNotMatch(worker, /Object[.]values\(graphBoundReviewSources\)/u);
  assert.match(worker, /active graph evidence source/u);
});

test('the protected root executes the closed v1 and v2 graph algorithms and rejects unknown catalogs', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-protected-graph-'));
  try {
    for (const schema of [
      'opportunity-active-artifact-catalog-v1',
      'opportunity-active-artifact-catalog-v2',
    ]) {
      const repository = path.join(directory, schema);
      mkdirSync(repository);
      git(repository, ['init']);
      const { catalog, tree } = writeFixture(repository, schema);
      assert.equal(treeIdentity(repository, tree).activeGraphSha256, expectedFixtureGraph(repository, tree, catalog));
    }

    const repository = path.join(directory, 'unknown');
    mkdirSync(repository);
    git(repository, ['init']);
    const { tree } = writeFixture(repository, 'opportunity-active-artifact-catalog-v999');
    assert.throws(() => treeIdentity(repository, tree), /unknown active artifact catalog schema/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }

  const protectedTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  assert.equal(
    treeIdentity(root, protectedTree).activeGraphSha256,
    'c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352',
    'catalog-v1 protected pin remains byte-identical',
  );
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
  assert.match(worker, /model-runner-host-pin-amendment-v3[.]16/u);
  assert.match(worker, /e933c87b33c15e55391b7de498b8e6e2cc8f9b4e9ff5cb9f7b2b0ea0bb6d0db5/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-requirements-88cc143/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-architecture-88cc143/u);
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
