'use strict';

const { assert } = require('./artifacts');
const { canonicalJson, sha256 } = require('./canonicalJson');

const RESULT_KEYS = ['protocol', 'operation', 'requestSha256', 'sourceViewSha256', 'status', 'patch', 'findings', 'evidence', 'summary'];
const TERMINAL_OPERATIONS = new Set(['make', 'review', 'verify']);
const HEX_256 = /^[a-f0-9]{64}$/;
const FINDING_SEVERITIES = new Set(['P0', 'P1', 'P2']);

function exactKeys(value, keys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 12, `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), 12, `${label} has invalid members`);
}

function validateFindings(findings) {
  assert(Array.isArray(findings) && findings.length <= 256, 12, 'findings must be an array');
  let previous = '';
  const seen = new Set();
  for (const finding of findings) {
    exactKeys(finding, ['id', 'severity', 'path', 'line', 'message'], 'finding');
    assert(typeof finding.id === 'string' && /^[A-Z0-9][A-Z0-9-]{0,63}$/u.test(finding.id), 12, 'finding id is required');
    assert(!seen.has(finding.id) && previous < finding.id, 12, 'finding ids must be sorted and unique');
    assert(FINDING_SEVERITIES.has(finding.severity), 12, 'finding severity is invalid');
    assert(finding.path === null || typeof finding.path === 'string' && Buffer.byteLength(finding.path) <= 1024, 12, 'finding path is invalid');
    assert(finding.line === null || Number.isSafeInteger(finding.line) && finding.line >= 1 && finding.line <= 2_147_483_647, 12, 'finding line is invalid');
    assert(typeof finding.message === 'string' && Buffer.byteLength(finding.message) >= 1 && Buffer.byteLength(finding.message) <= 4096, 12, 'finding message is required');
    seen.add(finding.id);
    previous = finding.id;
  }
}

function validateEvidence(evidence) {
  assert(Array.isArray(evidence) && evidence.length <= 256, 12, 'evidence must contain at most 256 entries');
  for (const entry of evidence) {
    exactKeys(entry, ['kind', 'ref', 'status', 'exitCode', 'sha256', 'summary'], 'evidence entry');
    assert(['command', 'artifact', 'probe'].includes(entry.kind), 12, 'evidence kind is invalid');
    assert(typeof entry.ref === 'string' && Buffer.byteLength(entry.ref) >= 1 && Buffer.byteLength(entry.ref) <= 1024, 12, 'evidence ref is required');
    assert(['pass', 'fail', 'not_run'].includes(entry.status), 12, 'evidence status is invalid');
    assert(entry.exitCode === null || Number.isInteger(entry.exitCode) && entry.exitCode >= -255 && entry.exitCode <= 255, 12, 'evidence exit is invalid');
    assert(entry.sha256 === null || HEX_256.test(entry.sha256), 12, 'evidence hash is invalid');
    assert(typeof entry.summary === 'string' && Buffer.byteLength(entry.summary) >= 1 && Buffer.byteLength(entry.summary) <= 4096, 12, 'evidence summary is required');
  }
}

function validateTerminalResult(result, expected) {
  exactKeys(result, RESULT_KEYS, 'terminal result');
  assert(result.protocol === 'loop-model-result-v3.5', 12, 'result protocol is invalid');
  assert(TERMINAL_OPERATIONS.has(result.operation) && result.operation === expected.operation, 12, 'result operation is invalid');
  assert(HEX_256.test(result.requestSha256) && result.requestSha256 === expected.requestSha256, 12, 'request seal mismatch');
  assert(HEX_256.test(result.sourceViewSha256) && result.sourceViewSha256 === expected.sourceViewSha256, 12, 'source-view seal mismatch');
  assert(typeof result.summary === 'string' && Buffer.byteLength(result.summary) >= 1 && Buffer.byteLength(result.summary) <= 16384, 12, 'result summary is required');
  validateFindings(result.findings);
  validateEvidence(result.evidence);

  if (result.status === 'task_failed') {
    assert(result.patch === null && result.findings.length === 0, 12, 'task failure cannot carry patch or findings');
    return result;
  }
  if (result.operation === 'make') {
    assert(result.status === 'proposal', 12, 'make status is invalid');
    if (result.status === 'proposal') {
      assert(typeof result.patch === 'string' && result.patch.length > 0, 12, 'make proposal needs a patch');
      assert(result.findings.length === 0 && result.evidence.length === 0, 12, 'make proposal cannot carry findings or evidence');
    }
  } else if (result.operation === 'review') {
    assert(['pass', 'changes_required'].includes(result.status) && result.patch === null, 12, 'review result is invalid');
    assert(result.evidence.length > 0, 12, 'review needs evidence');
    if (result.status === 'pass') {
      assert(result.findings.every((finding) => finding.severity === 'P2'), 12, 'review pass cannot contain P0/P1 findings');
    } else {
      assert(result.findings.some((finding) => finding.severity === 'P0' || finding.severity === 'P1'), 12, 'changes_required needs a P0/P1 finding');
    }
  } else {
    assert(['pass', 'verification_failed'].includes(result.status) && result.patch === null, 12, 'verify result is invalid');
    assert(result.evidence.length > 0, 12, 'verify needs evidence');
    if (result.status === 'pass') {
      assert(result.findings.length === 0 && result.evidence.every((entry) => entry.status === 'pass'), 12, 'verify pass requires passing evidence');
    } else {
      assert(result.findings.length > 0 && result.evidence.some((entry) => entry.status !== 'pass'), 12, 'verification failure needs findings and failed evidence');
    }
  }
  return result;
}

function sealResult(result, expected) {
  validateTerminalResult(result, expected);
  const canonical = canonicalJson(result);
  return Object.freeze({ canonical, sha256: sha256(canonical), result: Object.freeze(result) });
}

module.exports = { validateTerminalResult, sealResult };
