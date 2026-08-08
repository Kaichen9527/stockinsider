#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const { canonicalJson } = require('./codec');
const { resolveCredentialReference } = require('./credential-resolver');
const { resolveReviewedRuntimeRelease } = require('./reviewed-runtime-release');
const { applyProductionAuthorityBootstrap, consumeBootstrapNonce, fetchOfficialRoster,
  validateBootstrapAuthority } = require('./production-authority-bootstrap');

const SHA40 = /^[0-9a-f]{40}$/u;
function fail() { throw new Error('invalid_arguments'); }
function argumentsFrom(argv) {
  const result = { sourceCommit: null, attestationCommit: null, authorityFile: null, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--apply') result.apply = true;
    else if (value === '--source-commit' && SHA40.test(argv[index + 1] ?? '')) result.sourceCommit = argv[++index];
    else if (value === '--attestation-commit' && SHA40.test(argv[index + 1] ?? '')) result.attestationCommit = argv[++index];
    else if (value === '--authority-file' && path.isAbsolute(argv[index + 1] ?? '')) result.authorityFile = argv[++index];
    else fail();
  }
  if (!result.apply || !result.sourceCommit || !result.attestationCommit || !result.authorityFile) fail();
  return Object.freeze(result);
}

function readOwnerOnlyCanonical(filename) {
  let descriptor;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new Error('production_authority_bootstrap_required');
    const text = fs.readFileSync(descriptor, 'utf8'); const value = JSON.parse(text);
    if (`${canonicalJson(value)}\n` !== text) throw new Error('production_authority_bootstrap_required');
    return value;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  const repositoryRoot = execFileSync('/usr/bin/git', ['rev-parse', '--show-toplevel'], { cwd: __dirname, encoding: 'utf8' }).trim();
  const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  if (head !== options.sourceCommit || dirty !== '') throw new Error('source_tree_dirty');
  resolveReviewedRuntimeRelease({ repositoryRoot, sourceCommit: options.sourceCommit,
    attestationCommit: options.attestationCommit });
  const authority = validateBootstrapAuthority(readOwnerOnlyCanonical(options.authorityFile), options);
  const roster = await fetchOfficialRoster();
  const runtimeRoot = process.env.STOCKINSIDER_RUNTIME_ROOT ? path.resolve(process.env.STOCKINSIDER_RUNTIME_ROOT)
    : path.join(os.homedir(), 'Library', 'Application Support', 'StockInsiderRuntime');
  consumeBootstrapNonce(runtimeRoot, authority);
  const client = new Client({ connectionString: resolveCredentialReference('keychain:stockinsider-runtime:database-url'),
    application_name: 'stockinsider-production-authority-bootstrap', statement_timeout: 120000, query_timeout: 120000 });
  await client.connect();
  try {
    const result = await applyProductionAuthorityBootstrap({ client, roster });
    process.stdout.write(`${canonicalJson(result)}\n`);
  } finally { await client.end(); }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`production authority bootstrap failed: ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
});

module.exports = { argumentsFrom, readOwnerOnlyCanonical };
