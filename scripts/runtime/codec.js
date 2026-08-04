'use strict';

const crypto = require('crypto');

const MIB = 1024 * 1024;

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : canonicalJson(value));
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function byteLength(value) {
  return Buffer.byteLength(typeof value === 'string' ? value : canonicalJson(value), 'utf8');
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function finite(value, label) {
  invariant(Number.isFinite(value), `${label} must be finite`);
  return value;
}

function closed(value, allowed, label) {
  invariant(allowed.includes(value), `${label} is not a closed value`);
  return value;
}

function bounded(value, maximum, label) {
  invariant(byteLength(value) <= maximum, `${label} exceeds ${maximum} bytes`);
  return value;
}

function sortedUnique(values, compare = (left, right) => String(left).localeCompare(String(right))) {
  const ordered = [...values].sort(compare);
  for (let index = 1; index < ordered.length; index += 1) {
    invariant(compare(ordered[index - 1], ordered[index]) !== 0, 'values must be unique');
  }
  return ordered;
}

function percentile(sorted, p) {
  invariant(sorted.length > 0, 'percentile requires values');
  invariant(p >= 0 && p <= 1, 'percentile range');
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function unavailable(reason, extra = {}) {
  return { availability: 'unavailable', reason, ...extra };
}

function immutableBundle(kind, payload, metadata = {}) {
  const canonical = canonicalJson(payload);
  const hash = sha256(canonical);
  return Object.freeze({
    kind,
    canonical,
    json: JSON.parse(canonical),
    hash,
    rowCount: Array.isArray(payload) ? payload.length : 1,
    byteLength: Buffer.byteLength(canonical),
    ...metadata,
  });
}

module.exports = {
  MIB,
  bounded,
  byteLength,
  canonicalJson,
  closed,
  finite,
  immutableBundle,
  invariant,
  percentile,
  sha256,
  sortedUnique,
  unavailable,
};
