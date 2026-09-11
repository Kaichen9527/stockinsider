import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  hostPinForModelOracleListing,
  modelOracleListing,
  modelOracleListingSha256,
  requiredModelRunnerHostPin,
  treeIdentity,
  trustedModelOracleAuthorityForListings,
} from './protected-external-gate-worker.mjs';

const v316ModelOracleListing = `100644 blob ddac241c504d7608b65ace59a9f8b47f5f4bc52b\t.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json
100644 blob 5405325e4adab71df87290c1691c1cb4cf2fa707\tscripts/loop-model-runner-v3.js
100644 blob 4d7d843c7b40b12706bb5bd34d4e3bd79ca99955\tscripts/model-runner-v3/artifacts.js
100644 blob c50e3e99a6e7567c28651ae11326310b12a4ff3a\tscripts/model-runner-v3/canonicalJson.js
100644 blob 4f941cb277d7bc5e27e9728f9063440fd3bbc9ac\tscripts/model-runner-v3/codexAdapter.js
100644 blob bdb492482782df71afe0cc796be7920e04caa690\tscripts/model-runner-v3/execution.js
100644 blob 2769ad84d1ee2b98a66c1b3b57040ffe29064637\tscripts/model-runner-v3/hostPreflight.js
100644 blob 010d84f70a4307e0374cd340b09ce7b808025656\tscripts/model-runner-v3/journalStore.js
100644 blob 9840ca2ef32e3ea6336ccd1e754ff7738214ab43\tscripts/model-runner-v3/manifest.js
100644 blob 9d7ab11dbbe0c63e590156f6e3cb49e6fc80b1a1\tscripts/model-runner-v3/model-runner-v3.test.js
100644 blob 57a6225c3f1cc1a78e84ec64ce4abe6429a4764d\tscripts/model-runner-v3/patchParser.js
100644 blob 4f7e83eb28b8c08653ddc7c7dc2c9cf865902b99\tscripts/model-runner-v3/real-model-attempt-worker.js
100644 blob fcfb8c60c66619bc7382a9f6afea307763262fdd\tscripts/model-runner-v3/real-model-attempt.js
100644 blob 5b9e800dcb7331e8cd23040c3347f621fed966ed\tscripts/model-runner-v3/resourceJournal.js
100644 blob 43e6fdbef0743e462fe84c92a6b32f8c9d127d52\tscripts/model-runner-v3/routing.js
100644 blob 688cba9048603d6d40a7022970eec67cce7e75b9\tscripts/model-runner-v3/runner.js
100644 blob 2c07bc1d3f82c2407c84c3780c4421f635d34e3e\tscripts/model-runner-v3/seal.js
100644 blob 4bbffde1044258153b038e2ca9a53a2b36c6c133\tscripts/model-runner-v3/source.js
100644 blob 3987b4452bb2da4f109e470c8150c40cf3ed4523\tscripts/model-runner-v3/sourceView.js
100644 blob 8d09a3ab8aa80c9e3b006f6fb254b9d80d8e5de4\tscripts/model-runner-v3/transactionJournal.js
100644 blob f35565fec192d2325dfb556522560ba26beb93f7\tscripts/model-runner-v3/trustedGit.js`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-external-gate.yml'), 'utf8');
const diagnosticWorkflow = readFileSync(path.join(root, '.github/workflows/source-led-opportunity-v3.yml'), 'utf8');
const action = readFileSync(path.join(root, '.github/actions/prepare-source-led-external-subject/action.yml'), 'utf8');
const worker = readFileSync(path.join(root, 'scripts/opportunity-v3/protected-external-gate-worker.mjs'), 'utf8');
const protectedV315Commit = '0b132a3898a2eb256084f587de1bf039aa95818e';

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
  assert.match(worker, /'70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115': 'model-runner-host-pins-v3\.16'/u);
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
    'evidence/source-led-opportunity-v3-requirements-c7b4776-final',
    'evidence/source-led-opportunity-v3-architecture-c7b4776-final',
    'requirements-review-v3.24.md',
    'architecture-review-v3.24.md',
    'evidence/source-led-opportunity-v3-host-pin-v316-requirements-ba3124f',
    'evidence/source-led-opportunity-v3-host-pin-v316-architecture-ba3124f',
    'requirements-review-host-pin-v3.16-final.md',
    'architecture-review-host-pin-v3.16-final.md',
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
    '10ddc6020b010a557f2ad000e11df7ebb2413432bb63351d3a4a5bdba26c46bf',
    '6193ebf24dfd5dd6c6d1f52d03e7efda09e3335003ab36cf4a59d62d9598faf4',
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

  const protectedTree = git(root, ['rev-parse', `${protectedV315Commit}^{tree}`]);
  assert.equal(
    treeIdentity(root, protectedTree).activeGraphSha256,
    'c74be1cd14439580505e05f2ec5904ea7dc9732ee7a4164c9ec1573691ebe352',
    'catalog-v1 protected pin remains byte-identical',
  );
});

test('the protected model-oracle rotation executes the exact v3.15 to v3.16 listing transition', () => {
  const baseListing = modelOracleListing(root, protectedV315Commit);
  assert.equal(
    modelOracleListingSha256(baseListing),
    'cb070b7f1b8acabd4f776e99c773693e96402c9375c2ae317b851138f73b62c5',
    'production Git listing binds the protected v3.15 base',
  );
  assert.equal(requiredModelRunnerHostPin(root, protectedV315Commit), 'model-runner-host-pins-v3.15');
  assert.equal(trustedModelOracleAuthorityForListings(baseListing, baseListing), 'protected_base');

  const successorListing = modelOracleListing(root, 'HEAD');
  assert.equal(
    successorListing,
    v316ModelOracleListing,
    'production Git emits the exact reviewed v3.16 listing bytes',
  );
  assert.equal(
    modelOracleListingSha256(successorListing),
    '70dbbd6ed3846ada9804c029321dcc5e97de60ddf4e63a75142d10f2efdde115',
    'the reviewed successor listing uses the same trimmed bytes as production Git',
  );
  assert.equal(requiredModelRunnerHostPin(root, 'HEAD'), 'model-runner-host-pins-v3.16');
  assert.equal(hostPinForModelOracleListing(successorListing), 'model-runner-host-pins-v3.16');
  assert.equal(
    trustedModelOracleAuthorityForListings(baseListing, successorListing),
    'model-runner-host-pin-amendment-v3.16',
  );
  assert.equal(trustedModelOracleAuthorityForListings(successorListing, successorListing), 'protected_base');

  const unapprovedSuccessor = v316ModelOracleListing.replace(
    'ddac241c504d7608b65ace59a9f8b47f5f4bc52b',
    'edac241c504d7608b65ace59a9f8b47f5f4bc52b',
  );
  assert.throws(
    () => trustedModelOracleAuthorityForListings(baseListing, unapprovedSuccessor),
    /model oracle successor listing must match the one reviewed digest/u,
  );
  assert.throws(
    () => trustedModelOracleAuthorityForListings(successorListing, unapprovedSuccessor),
    /model oracle successor requires protected-base approval/u,
  );
  assert.throws(
    () => hostPinForModelOracleListing(unapprovedSuccessor),
    /model runner host pin requires an exact protected listing/u,
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
  assert.match(worker, /7700f1c0940dae14034c852e5ffe9e8a9f18439834bcc1c744876dc478470159/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-requirements-aa0c08b/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-architecture-aa0c08b/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-requirements-ba3124f/u);
  assert.match(worker, /evidence\/source-led-opportunity-v3-host-pin-v316-architecture-ba3124f/u);
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
