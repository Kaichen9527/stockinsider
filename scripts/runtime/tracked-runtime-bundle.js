'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson, invariant, sha256 } = require('./codec');

// Closed transitive source set for the production auth-source worker. The bundle
// manifest includes this file, so changing either the implementation or this list
// changes the reviewed worker identity used by the lease and installation manifest.
const TRACKED_RUNTIME_PATHS = Object.freeze([
  'scripts/runtime/action-decision.js',
  'scripts/runtime/analysis-material-change.js',
  'scripts/runtime/analysis-revision.js',
  'scripts/runtime/auth-source-worker-cli.js',
  'scripts/runtime/auth-source-worker.js',
  'scripts/runtime/bias-action-cap.js',
  'scripts/runtime/bias-technical-history.js',
  'scripts/runtime/bias-universe-manifest.js',
  'scripts/runtime/candidate-funnel.js',
  'scripts/runtime/candidate-valuation.js',
  'scripts/runtime/codec.js',
  'scripts/runtime/compact-radar-projection.js',
  'scripts/runtime/credential-resolver.js',
  'scripts/runtime/discovery-disposition.js',
  'scripts/runtime/factor-score.js',
  'scripts/runtime/factor-snapshot.js',
  'scripts/runtime/fundamental-quality.js',
  'scripts/runtime/market-analysis.js',
  'scripts/runtime/official-twse-valuation.js',
  'scripts/runtime/postgres-legacy-producer-adapter.js',
  'scripts/runtime/public-projection.js',
  'scripts/runtime/reported-pe-authority.js',
  'scripts/runtime/source-run-config.js',
  'scripts/runtime/technical-entry-geometry.js',
  'scripts/runtime/technical-plane.js',
  'scripts/runtime/technical-state.js',
  'scripts/runtime/tracked-runtime-bundle.js',
  'scripts/runtime/underreaction-score.js',
  'scripts/runtime/valuation-comparables.js',
  'scripts/runtime/valuation-evidence.js',
  'scripts/runtime/valuation-method.js',
  'scripts/runtime/valuation-operating-bridge.js',
]);

function runtimeBundleBytes(repositoryRoot) {
  invariant(typeof repositoryRoot === 'string' && path.isAbsolute(repositoryRoot), 'absolute repository root required');
  const canonicalRoot = fs.realpathSync(repositoryRoot);
  const members = TRACKED_RUNTIME_PATHS.map((repositoryPath) => {
    const absolutePath = path.resolve(canonicalRoot, repositoryPath);
    invariant(absolutePath.startsWith(`${canonicalRoot}${path.sep}`) && fs.realpathSync(absolutePath) === absolutePath,
      'runtime bundle path escapes root');
    const descriptor = fs.openSync(absolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let bytes;
    try {
      const stat = fs.fstatSync(descriptor);
      invariant(stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o022) === 0,
        'runtime bundle member must be owner-controlled regular file');
      bytes = fs.readFileSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    return [repositoryPath, bytes.length, sha256(bytes)];
  });
  return Buffer.from(canonicalJson({ schema: 'stockinsider-tracked-runtime-bundle-v1', members }));
}

function runtimeBundleSha256(repositoryRoot) { return sha256(runtimeBundleBytes(repositoryRoot)); }

module.exports = { TRACKED_RUNTIME_PATHS, runtimeBundleBytes, runtimeBundleSha256 };
