'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalJson, invariant, sha256 } = require('./codec');

// Closed transitive source set for the production auth-source worker. The bundle
// manifest includes this file, so changing either the implementation or this list
// changes the reviewed worker identity used by the lease and installation manifest.
const TRACKED_RUNTIME_PATHS = Object.freeze([
  'config/runtime/approved-source-roster-v3.13.json',
  'config/runtime/artifact-retention-v3.19.json',
  'config/runtime/projection-freshness-policy.json',
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
  'scripts/runtime/decision-envelope-v314.js',
  'scripts/runtime/decision-envelope.js',
  'scripts/runtime/discovery-disposition.js',
  'scripts/runtime/factor-score.js',
  'scripts/runtime/factor-snapshot.js',
  'scripts/runtime/fundamental-quality.js',
  'scripts/runtime/market-analysis.js',
  'scripts/runtime/official-calendar-v314.js',
  'scripts/runtime/official-factor-discovery-v315.js',
  'scripts/runtime/official-market-authority-v314.js',
  'scripts/runtime/official-mops-v314.js',
  'scripts/runtime/official-source-acquisition.js',
  'scripts/runtime/official-twse-valuation.js',
  'scripts/runtime/postgres-legacy-producer-adapter.js',
  'scripts/runtime/projection-freshness.js',
  'scripts/runtime/provider-acquisition-v31621.js',
  'scripts/runtime/public-projection.js',
  'scripts/runtime/reported-pe-authority.js',
  'scripts/runtime/research-dossier-v318.js',
  'scripts/runtime/research-next-step-v317.js',
  'scripts/runtime/research-ranking-v314.js',
  'scripts/runtime/research-readiness-v319.js',
  'scripts/runtime/research-snapshot-v317.js',
  'scripts/runtime/runtime-disk-policy-v319.js',
  'scripts/runtime/safe-diagnostics.js',
  'scripts/runtime/source-run-config.js',
  'scripts/runtime/supabase-rest-legacy-producer-adapter.js',
  'scripts/runtime/technical-entry-geometry.js',
  'scripts/runtime/technical-plane.js',
  'scripts/runtime/technical-state.js',
  'scripts/runtime/tracked-runtime-bundle.js',
  'scripts/runtime/underreaction-score.js',
  'scripts/runtime/valuation-comparables.js',
  'scripts/runtime/valuation-evidence.js',
  'scripts/runtime/valuation-method-bridge.js',
  'scripts/runtime/valuation-method.js',
  'scripts/runtime/valuation-operating-bridge.js',
  'web/src/lib/opportunity-v3/release-compatibility-runtime.js',
]);

function runtimeBundleBytesForPaths(repositoryRoot, repositoryPaths) {
  invariant(typeof repositoryRoot === 'string' && path.isAbsolute(repositoryRoot), 'absolute repository root required');
  invariant(Array.isArray(repositoryPaths) && repositoryPaths.length > 0 &&
    repositoryPaths.every((repositoryPath, index) => typeof repositoryPath === 'string' &&
      TRACKED_RUNTIME_PATHS.includes(repositoryPath) && (index === 0 || repositoryPaths[index - 1] < repositoryPath)),
  'runtime bundle paths must be a sorted nonempty tracked subset');
  const canonicalRoot = fs.realpathSync(repositoryRoot);
  const members = repositoryPaths.map((repositoryPath) => {
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

function runtimeBundleBytes(repositoryRoot) {
  return runtimeBundleBytesForPaths(repositoryRoot, TRACKED_RUNTIME_PATHS);
}

function runtimeBundleSha256(repositoryRoot) { return sha256(runtimeBundleBytes(repositoryRoot)); }

// Rollback releases were sealed with the tracked member set owned by their
// reviewed commit. The current list only grows additively, so an older release
// can omit newer members. Its original canonical bundle hash remains the
// authority: omitting any member that belonged to that release changes the hash
// and fails the manifest comparison at the caller.
function runtimeBundleSha256ForPresentMembers(repositoryRoot) {
  const canonicalRoot = fs.realpathSync(repositoryRoot);
  const present = TRACKED_RUNTIME_PATHS.filter((repositoryPath) => {
    const absolutePath = path.resolve(canonicalRoot, repositoryPath);
    try {
      fs.lstatSync(absolutePath);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw error;
    }
  });
  return sha256(runtimeBundleBytesForPaths(canonicalRoot, present));
}

module.exports = { TRACKED_RUNTIME_PATHS, runtimeBundleBytes, runtimeBundleSha256,
  runtimeBundleSha256ForPresentMembers };
