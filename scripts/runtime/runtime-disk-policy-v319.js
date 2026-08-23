'use strict';

const fs = require('fs');
const path = require('path');
const { invariant } = require('./codec');

const GIB = 1024 ** 3;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}

function validateArtifactRetentionPolicy(value) {
  invariant(exactKeys(value, ['schema','sourceAuditMaxBytes','sourceAuditRetentionDays','minimumFreeBytes','warningFreeBytes']),
    'artifact retention policy shape');
  invariant(value.schema === 'stockinsider-artifact-retention-v3.19.0', 'artifact retention policy schema');
  for (const key of ['sourceAuditMaxBytes','sourceAuditRetentionDays','minimumFreeBytes','warningFreeBytes']) {
    invariant(Number.isSafeInteger(value[key]) && value[key] > 0, 'artifact retention policy bound');
  }
  invariant(value.sourceAuditRetentionDays <= 90 && value.sourceAuditMaxBytes <= 64 * GIB,
    'artifact retention policy cap');
  invariant(value.minimumFreeBytes <= value.warningFreeBytes, 'artifact retention policy free-space order');
  return Object.freeze({ ...value });
}

function treeUsage(root) {
  let bytes = 0;
  let files = 0;
  const visit = (entry) => {
    let stat;
    try { stat = fs.lstatSync(entry); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) { bytes += stat.size; files += 1; return; }
    if (!stat.isDirectory()) return;
    for (const child of fs.readdirSync(entry)) visit(path.join(entry, child));
  };
  if (typeof root === 'string' && fs.existsSync(root)) visit(root);
  return Object.freeze({ bytes, files });
}

function assessRuntimeDiskPolicy({ policy, runtimeRoot, sourceAuditRoot = null, statfs = fs.statfsSync } = {}) {
  const validated = validateArtifactRetentionPolicy(policy);
  invariant(typeof runtimeRoot === 'string' && path.isAbsolute(runtimeRoot), 'runtime root required');
  const stats = statfs(runtimeRoot);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  invariant(Number.isSafeInteger(freeBytes) && freeBytes >= 0, 'runtime disk observation unavailable');
  const audit = treeUsage(sourceAuditRoot);
  const reasons = [];
  if (freeBytes < validated.minimumFreeBytes) reasons.push('disk_capacity_low');
  if (audit.bytes > validated.sourceAuditMaxBytes) reasons.push('source_audit_capacity_exceeded');
  const status = reasons.length ? 'fail' : freeBytes < validated.warningFreeBytes ? 'warning' : 'pass';
  return Object.freeze({ schema: 'runtime-disk-health-v3.19.0', status, reasons: Object.freeze(reasons),
    freeBytes, sourceAuditBytes: audit.bytes, sourceAuditFiles: audit.files,
    retentionDays: validated.sourceAuditRetentionDays, minimumFreeBytes: validated.minimumFreeBytes,
    warningFreeBytes: validated.warningFreeBytes });
}

module.exports = { GIB, assessRuntimeDiskPolicy, treeUsage, validateArtifactRetentionPolicy };
