'use strict';

const { assert } = require('./artifacts');
const { canonicalJson, sha256 } = require('./canonicalJson');
const { validatePath, pathForbidden } = require('./manifest');

const PROMPT_ROOT = '.loop-engineering/state/changes/';

function selectorMatches(selector, path) {
  return selector.endsWith('/**') ? path.startsWith(selector.slice(0, -2)) : selector === path;
}

function readablePath(task, path) {
  validatePath(path, false);
  return !pathForbidden(path) && [...task.allowedPaths, ...task.inspectionPaths].some((selector) => selectorMatches(selector, path));
}

function promptPathAllowed(changeId, path) {
  if (pathForbidden(path)) return false;
  if (path === '.loop-engineering/policy.yaml' || path === 'docs/engineering/LOOP_ENGINEERING.md') return true;
  const prefix = PROMPT_ROOT + changeId + '/';
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return ['requirements.md', 'design.md', 'source-matrix.md', 'data-contract.md', 'tasks.md', 'acceptance-tests.json', 'acceptance-tests.md', 'sector-taxonomy-map-v3.json', 'model-runner-host-pins-v3.json'].includes(name)
    || /^[a-z0-9-]+-contract\.md$/.test(name);
}

function sourceViewIdentity({ viewPurpose, inputHead, sourceCommit, proposalDeltaSha256 = null, entries }) {
  assert(['make_initial', 'make_repair', 'review', 'verify'].includes(viewPurpose), 3);
  assert(Array.isArray(entries) && entries.length <= 100000, 3);
  let totalBytes = 0;
  let previous = null;
  const normalized = entries.map((entry) => {
    assert(Array.isArray(entry) && entry.length === 6, 3);
    const [path, blobOid, gitMode, materializedMode, byteLength, digest] = entry;
    validatePath(path, false);
    assert(!pathForbidden(path) && /^[0-9a-f]{40}$/.test(blobOid) && ['100644', '100755'].includes(gitMode) && materializedMode === '0444', 3);
    assert(Number.isSafeInteger(byteLength) && byteLength >= 0 && /^[0-9a-f]{64}$/.test(digest), 3);
    assert(previous === null || Buffer.compare(Buffer.from(previous), Buffer.from(path)) < 0, 3);
    previous = path;
    totalBytes += byteLength;
    return entry;
  });
  assert(totalBytes <= 536870912, 3);
  const preimage = ['model-runner-source-view-v3.5', viewPurpose, inputHead, sourceCommit, proposalDeltaSha256, normalized];
  return {
    viewPurpose,
    sourceCommit,
    proposalDeltaSha256,
    sourceViewSha256: sha256(canonicalJson(preimage)),
    entryCount: normalized.length,
    totalBytes,
  };
}

module.exports = { selectorMatches, readablePath, promptPathAllowed, sourceViewIdentity };
